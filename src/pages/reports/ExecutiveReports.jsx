import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Form, Spinner, Table } from "react-bootstrap";
import Select from "react-select";
import {
  FaUserTie,
  FaFileExport,
  FaUndo,
  FaPlay,
  FaChartBar,
  FaChevronDown,
  FaChevronRight,
  FaClipboardList,
  FaTrophy,
  FaArrowRight,
} from "react-icons/fa";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from "chart.js";
import axios from "axios";
import moment from "moment";
import * as XLSX from "xlsx";
import { ApiURL } from "../../api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "react-hot-toast";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const BLUE = "#BD5525";

/* Orders raised before the executive panel existed carry no executive at all,
   and they are the majority. They get their own row rather than being dropped,
   so the totals here still reconcile with the Client Reports tab. */
const UNASSIGNED = "__unassigned__";

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

const compactInr = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(2) + " L";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + " K";
  return inr(v);
};

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const SELECT_STYLES = {
  control: (base, state) => ({
    ...base,
    minHeight: 40,
    borderRadius: 10,
    borderColor: state.isFocused ? BLUE : "#E8EDF4",
    boxShadow: state.isFocused ? "0 0 0 3px rgba(189, 85, 37,0.16)" : "none",
    fontSize: "0.8438rem",
    ":hover": { borderColor: state.isFocused ? BLUE : "#CBD5E1" },
  }),
  menu: (base) => ({ ...base, zIndex: 30, borderRadius: 10, overflow: "hidden" }),
  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
};

/* The report API writes the executive as a plain name, and several of those
   names carry a trailing space in the records. Without trimming, "Ananya" and
   "Ananya " would read as two different people. */
const execKeyOf = (order) => String(order?.executiveName || "").trim();

/**
 * One order line. It opens that order's detail page, which is the sheet the
 * office actually works from - the report is where a figure gets noticed,
 * and the order is where it gets checked.
 */
const OrderRow = ({ id, number, date, amount }) => {
  const body = (
    <>
      <span className="rp-inv__no">#{number || "\u2014"}</span>
      <span className="rp-inv__meta">
        {date
          ? moment(date).isValid()
            ? moment(date).format("DD MMM YYYY")
            : date
          : "\u2014"}
      </span>
      <span className="rp-inv__amt">&#8377;{inr(amount)}</span>
    </>
  );

  /* An order with no id cannot be opened, so it stays a plain row rather
     than a link that goes nowhere. */
  if (!id) return <span className="rp-inv__row">{body}</span>;

  return (
    <Link
      className="rp-inv__row"
      to={`/order-pdf/${id}`}
      title="Open this order"
    >
      {body}
      <span className="rp-inv__go" aria-hidden="true">
        <FaArrowRight />
      </span>
    </Link>
  );
};

const ExecutiveReports = () => {
  const [selectedYear, setSelectedYear] = useState(() => String(moment().year()));
  const [selectedMonth, setSelectedMonth] = useState(() => moment().format("MM"));
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  /* Which executives to keep. The report API narrows by client and date only,
     so this one is applied here, on the rows already fetched. */
  const [selectedExecs, setSelectedExecs] = useState([]);
  const [includeUnassigned, setIncludeUnassigned] = useState(true);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortDesc, setSortDesc] = useState(true);

  const years = useMemo(
    () => Array.from({ length: 10 }, (_, i) => String(moment().year() - i)),
    []
  );

  /* Fold the order rows the API returns into one row per executive. */
  const transformResponse = (responseData) => {
    const orders = responseData?.orders;
    if (!Array.isArray(orders) || !orders.length) return [];

    const byExec = {};
    orders.forEach((order) => {
      const name = execKeyOf(order);
      const key = name || UNASSIGNED;

      if (!byExec[key]) {
        byExec[key] = {
          _id: key,
          name: name || "Unassigned",
          isUnassigned: !name,
          allProductsTotal: 0,
          totalDiscount: 0,
          totalRoundOff: 0,
          clientIds: new Set(),
          orders: [],
        };
      }

      const row = byExec[key];
      row.allProductsTotal += Number(order.allProductsTotal) || 0;
      row.totalDiscount += Number(order.discountAmount) || 0;
      row.totalRoundOff += Number(order.roundOff) || 0;
      if (order.clientId) row.clientIds.add(String(order.clientId));
      row.orders.push({
        _id: order.orderId,
        orderDate: order.orderDate,
        orderNumber: order.orderId,
        clientId: order.clientId,
        Address: order.Address,
        orderTotal: order.totalAmount,
        amount: order.allProductsTotal,
      });
    });

    return Object.values(byExec);
  };

  const rangeIsSet = !!(fromDate && toDate);

  const runReport = async () => {
    if (!rangeIsSet && !selectedYear) {
      toast.error("Pick a year, or a start and end date");
      return;
    }
    if (rangeIsSet && moment(fromDate).isAfter(toDate, "day")) {
      toast.error("The start date is after the end date");
      return;
    }

    setLoading(true);
    try {
      const token = sessionStorage.getItem("token");
      const response = await axios.post(
        `${ApiURL}/report/clientReportByMonth`,
        {
          ...(rangeIsSet
            ? {
                startDate: moment(fromDate).format("DD-MM-YYYY"),
                endDate: moment(toDate).format("DD-MM-YYYY"),
              }
            : { year: selectedYear, month: selectedMonth }),
          /* Every client; this tab slices the same orders by executive. */
          clientIds: [],
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setExpandedRows(new Set());
      setReportData(transformResponse(response.data));
    } catch (error) {
      toast.error(
        `Error fetching report: ${error?.response?.data?.message || "Unknown error"}`
      );
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedYear(String(moment().year()));
    setSelectedMonth(moment().format("MM"));
    setFromDate(null);
    setToDate(null);
    setSelectedExecs([]);
    setIncludeUnassigned(true);
    setExpandedRows(new Set());
  };

  /* Opens with a report rather than an empty page, and follows the period
     controls after that. The executive picker filters rows already in hand,
     so it needs no refetch. */
  useEffect(() => {
    if (rangeIsSet || selectedYear) runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedMonth, fromDate, toDate]);

  const toggleRow = (id) =>
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const netOf = (r) =>
    (Number(r.allProductsTotal) || 0) -
    (Number(r.totalDiscount) || 0) +
    (Number(r.totalRoundOff) || 0);

  /* Only the executives who actually appear in the period, so the dropdown
     never offers a name that cannot match anything. */
  const execOptions = useMemo(
    () =>
      reportData
        .filter((r) => !r.isUnassigned)
        .map((r) => ({ value: r._id, label: r.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [reportData]
  );

  const rows = useMemo(() => {
    const picked = new Set(selectedExecs);
    return reportData
      .filter((r) => {
        /* Asking for named executives is a narrower question than "who
           sold what", so the orders with nobody on them drop out as soon
           as a name is picked. */
        if (r.isUnassigned) return includeUnassigned && !picked.size;
        return picked.size ? picked.has(r._id) : true;
      })
      .sort((a, b) => (sortDesc ? netOf(b) - netOf(a) : netOf(a) - netOf(b)));
  }, [reportData, selectedExecs, includeUnassigned, sortDesc]);

  /* The chart is about people, so the unassigned pile stays out of it - it is
     the largest bar by far and would flatten every real executive. */
  const namedRows = useMemo(() => rows.filter((r) => !r.isUnassigned), [rows]);

  const stats = useMemo(() => {
    const attributed = reportData
      .filter((r) => !r.isUnassigned)
      .reduce((n, r) => n + r.orders.length, 0);
    const unattributed = reportData
      .filter((r) => r.isUnassigned)
      .reduce((n, r) => n + r.orders.length, 0);
    const best = namedRows.length
      ? namedRows.reduce((a, b) => (netOf(b) > netOf(a) ? b : a))
      : null;

    return {
      executives: namedRows.length,
      attributed,
      total: attributed + unattributed,
      best,
    };
  }, [reportData, namedRows]);

  const periodLabel = rangeIsSet
    ? moment(fromDate).format("DD MMM") + " - " + moment(toDate).format("DD MMM YYYY")
    : selectedMonth
      ? moment(selectedMonth, "MM").format("MMMM") + " " + selectedYear
      : selectedYear;

  const handleExport = () => {
    if (!rows.length) {
      toast.error("Run a report first");
      return;
    }
    try {
      const flat = rows.map((r, i) => ({
        "#": i + 1,
        Executive: r.name,
        "Order Value": Number(r.allProductsTotal) || 0,
        Discount: Number(r.totalDiscount) || 0,
        "Round Off": Number(r.totalRoundOff) || 0,
        "Net Value": netOf(r),
        Orders: r.orders?.length || 0,
        Clients: r.clientIds?.size || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(flat);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ExecutiveReport");
      ws["!cols"] = [
        { wch: 5 }, { wch: 26 }, { wch: 14 }, { wch: 12 },
        { wch: 11 }, { wch: 14 }, { wch: 9 }, { wch: 9 },
      ];
      const label = rangeIsSet
        ? `${moment(fromDate).format("DD-MM-YYYY")}_${moment(toDate).format("DD-MM-YYYY")}`
        : selectedMonth
          ? `${selectedYear}-${selectedMonth}`
          : selectedYear || "all";
      XLSX.writeFile(wb, `executive-report-${label}.xlsx`);
    } catch (error) {
      toast.error("Could not export the report");
    }
  };

  const chartTop = namedRows.slice(0, 8);
  const chartData = {
    labels: chartTop.map((r) => r.name),
    datasets: [
      {
        data: chartTop.map((r) => netOf(r)),
        backgroundColor: BLUE,
        hoverBackgroundColor: "#8D3C16",
        borderRadius: 6,
        borderSkipped: false,
        maxBarThickness: 34,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#111827",
        padding: 10,
        cornerRadius: 8,
        displayColors: false,
        callbacks: { label: (ctx) => " ₹" + inr(ctx.raw) },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          color: "#94A3B8",
          font: { family: "Poppins", size: 11 },
          callback: (v) => "₹" + compactInr(v),
        },
        grid: { color: "#EEF2F7", drawTicks: false },
        border: { display: false },
      },
      x: {
        ticks: {
          color: "#94A3B8",
          font: { family: "Poppins", size: 10 },
          maxRotation: 30,
          callback(value) {
            const l = this.getLabelForValue(value);
            return l.length > 14 ? l.slice(0, 13) + "…" : l;
          },
        },
        grid: { display: false },
        border: { color: "#E5E8EC" },
      },
    },
  };

  const tiles = [
    {
      key: "executives",
      label: "Executives Reported",
      value: stats.executives,
      hint: periodLabel,
      icon: FaUserTie,
      tone: "violet",
    },
    {
      key: "attributed",
      label: "Orders by an Executive",
      value: stats.total
        ? `${stats.attributed} of ${stats.total}`
        : stats.attributed,
      hint: stats.total
        ? `${Math.round((stats.attributed / stats.total) * 100)}% carry an executive`
        : "No orders in this period",
      icon: FaClipboardList,
      tone: "blue",
    },
    {
      key: "best",
      label: "Top Executive",
      value: stats.best ? stats.best.name : "—",
      hint: stats.best
        ? `₹${inr(netOf(stats.best))} across ${stats.best.orders.length} ${
            stats.best.orders.length === 1 ? "order" : "orders"
          }`
        : "Nothing to rank yet",
      icon: FaTrophy,
      tone: "amber",
    },
  ];

  const execSelectValue = execOptions.filter((o) => selectedExecs.includes(o.value));

  return (
    <div className="rp">
      {/* ---- Stat tiles ---- */}
      <div className="eq-stats eq-stats--fit">
        {tiles.map((t) => (
          <div className={`eq-stat is-${t.tone}`} key={t.key}>
            <span className="eq-stat__icon">
              <t.icon />
            </span>
            <div className="eq-stat__body">
              <span className="eq-stat__label">{t.label}</span>
              <span className="eq-stat__value">{t.value}</span>
              <span className="eq-stat__hint">{t.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Filters ---- */}
      <Card className="eq-card mb-3 rp-filters">
        <Card.Body>
          <div className="rp-range">
            <label className="rp-field rp-field--grow">
              <span>Executives</span>
              <Select
                isMulti
                options={execOptions}
                value={execSelectValue}
                onChange={(opts) =>
                  setSelectedExecs((opts || []).map((o) => o.value))
                }
                placeholder="All executives"
                styles={SELECT_STYLES}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                closeMenuOnSelect={false}
                noOptionsMessage={() => "No executive on any order in this period"}
              />
            </label>

            <label className="rp-field">
              <span>From date</span>
              <DatePicker
                selected={fromDate}
                onChange={setFromDate}
                placeholderText="Any"
                className="form-control"
                dateFormat="dd-MM-yyyy"
                isClearable
                selectsStart
                startDate={fromDate}
                endDate={toDate}
                popperClassName="rp-datepicker-popper"
                popperPlacement="bottom-start"
              />
            </label>

            <label className="rp-field">
              <span>To date</span>
              <DatePicker
                selected={toDate}
                onChange={setToDate}
                placeholderText="Any"
                className="form-control"
                dateFormat="dd-MM-yyyy"
                isClearable
                selectsEnd
                startDate={fromDate}
                endDate={toDate}
                minDate={fromDate || undefined}
                popperClassName="rp-datepicker-popper"
                popperPlacement="bottom-start"
              />
            </label>

            <label className="rp-field">
              <span>Year</span>
              <Form.Select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                disabled={rangeIsSet}
              >
                <option value="">Select year</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Form.Select>
            </label>

            <label className="rp-field">
              <span>Month (optional)</span>
              <Form.Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                disabled={rangeIsSet}
              >
                <option value="">Whole year</option>
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Form.Select>
            </label>
          </div>

          <div className="rp-toggle">
            <Form.Check
              type="switch"
              id="exec-include-unassigned"
              label="Show orders with no executive"
              checked={includeUnassigned && !selectedExecs.length}
              onChange={(e) => setIncludeUnassigned(e.target.checked)}
              disabled={!!selectedExecs.length}
            />
          </div>

          <p className="rp-hint">
            {selectedExecs.length
              ? `Showing ${selectedExecs.length} selected ${
                  selectedExecs.length === 1 ? "executive" : "executives"
                }. Clear the picker to see everyone, including orders with no executive. `
              : ""}
            {rangeIsSet
              ? `Showing ${moment(fromDate).format("DD-MM-YYYY")} to ${moment(
                  toDate
                ).format("DD-MM-YYYY")}. Clear the dates to go back to year and month.`
              : selectedMonth
                ? `Showing ${
                    MONTHS.find((m) => m.value === selectedMonth)?.label
                  } ${selectedYear}. Set both dates for an exact range.`
                : `Showing the whole of ${selectedYear}. Set both dates for an exact range.`}
          </p>

          <div className="rp-actions">
            <Button className="eq-ghost" onClick={reset}>
              <FaUndo /> Reset
            </Button>
            <Button className="eq-ghost" onClick={handleExport}>
              <FaFileExport /> Export to Excel
            </Button>
            <Button className="eq-primary" onClick={runReport} disabled={loading}>
              <FaPlay /> {loading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ---- Chart + table ---- */}
      <div className="rp-grid">
        <Card className="eq-card">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaChartBar />
              </span>
              <div>
                <h3 className="rt-panel__title">Value by Executive</h3>
                <p className="rt-panel__sub">
                  {namedRows.length
                    ? `Top ${chartTop.length} of ${namedRows.length}`
                    : "Run a report to see the breakdown"}
                </p>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <div className="rt-empty">
                <Spinner animation="border" size="sm" /> Generating report...
              </div>
            ) : chartTop.length ? (
              <div className="rp-chart">
                <Bar data={chartData} options={chartOptions} />
              </div>
            ) : (
              <p className="rt-empty">
                No order in this period carries an executive.
              </p>
            )}
          </Card.Body>
        </Card>

        <Card className="eq-card">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaUserTie />
              </span>
              <div>
                <h3 className="rt-panel__title">Executive Breakdown</h3>
                <p className="rt-panel__sub">Tap a row to see its orders</p>
              </div>
            </div>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table className="eq-table mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Executive</th>
                    <th
                      className="text-end rp-sort"
                      onClick={() => setSortDesc((p) => !p)}
                      title="Sort by value"
                    >
                      Net Value {sortDesc ? "▼" : "▲"}
                    </th>
                    <th className="text-end">Orders</th>
                    <th className="text-end">Clients</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="5" className="text-center py-5">
                        <Spinner animation="border" size="sm" /> Loading...
                      </td>
                    </tr>
                  ) : !rows.length ? (
                    <tr>
                      <td colSpan="5" className="text-center py-5 eq-none">
                        No orders for the executives and period selected.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const open = expandedRows.has(r._id);
                      return (
                        <React.Fragment key={r._id}>
                          <tr
                            className={`${open ? "is-active" : ""}${
                              r.isUnassigned ? " rp-row--muted" : ""
                            }`}
                            onClick={() => toggleRow(r._id)}
                          >
                            <td>
                              <span className="rp-caret">
                                {open ? <FaChevronDown /> : <FaChevronRight />}
                              </span>
                            </td>
                            <td className="rt-mini__strong">
                              {r.name}
                              {r.isUnassigned ? (
                                <span className="eq-pill is-grey ms-2">
                                  no executive
                                </span>
                              ) : null}
                            </td>
                            <td className="text-end eq-amount">
                              &#8377;{inr(netOf(r))}
                            </td>
                            <td className="text-end">
                              <span className="rp-rank">{r.orders?.length || 0}</span>
                            </td>
                            <td className="text-end">
                              <span className="rp-rank">{r.clientIds?.size || 0}</span>
                            </td>
                          </tr>

                          {open ? (
                            <tr className="rp-detail">
                              <td colSpan="5">
                                <div className="rp-inv">
                                  <span className="rp-inv__title">
                                    Orders ({r.orders?.length || 0})
                                  </span>
                                  {r.orders?.length ? (
                                    <ul className="rp-inv__list">
                                      {r.orders.slice(0, 50).map((o, i) => (
                                        <li key={(o._id || "") + i}>
                                          <OrderRow
                                            id={o._id}
                                            number={o.orderNumber}
                                            date={o.orderDate}
                                            amount={o.orderTotal ?? o.amount}
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="rt-empty">No orders in this period.</p>
                                  )}
                                  {r.orders?.length > 50 ? (
                                    <p className="rp-inv__more">
                                      Showing the first 50 of {r.orders.length}. Export
                                      to Excel for the full list.
                                    </p>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
};

export default ExecutiveReports;
