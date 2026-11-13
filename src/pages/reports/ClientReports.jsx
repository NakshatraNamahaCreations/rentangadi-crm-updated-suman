import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Form, Spinner, Table } from "react-bootstrap";
import Select from "react-select";
import {
  FaUsers,
  FaFileExport,
  FaUndo,
  FaPlay,
  FaChartBar,
  FaChevronDown,
  FaChevronRight,
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
import BusyButton from "../../components/BusyButton";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const BLUE = "#BD5525";

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

/* react-select needs to sit above the cards below it. */
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

/**
 * One order line. It opens that order's detail page, which is the sheet the
 * office actually works from - the report is where a figure gets noticed,
 * and the order is where it gets checked.
 */
const OrderRow = ({ id, number, date, meta, amount }) => {
  const body = (
    <>
      <span className="rp-inv__no">#{number || "\u2014"}</span>
      <span className="rp-inv__meta">
        {date
          ? moment(date).isValid()
            ? moment(date).format("DD MMM YYYY")
            : date
          : "\u2014"}
        {meta}
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

const ClientReports = () => {
  const [clients, setClients] = useState([]);
  const [clientMap, setClientMap] = useState({});
  /* The screen opens on every client for the current year rather than an
     empty form, so there is something to read before anything is picked. */
  const [selectedClients, setSelectedClients] = useState(["ALL_CLIENTS"]);
  const [selectedYear, setSelectedYear] = useState(() => String(moment().year()));
  /* The current month, not the whole year: a year of orders is a ten-second
     read off Atlas, which is no way to open a screen. Whole year is one
     click away in the Month control. */
  const [selectedMonth, setSelectedMonth] = useState(() => moment().format("MM"));
  /* An explicit range. When both ends are set it wins over year and month,
     which are then disabled so the precedence is visible rather than
     something to find out by experiment. */
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [sortDesc, setSortDesc] = useState(true);

  const years = useMemo(
    () => Array.from({ length: 10 }, (_, i) => String(moment().year() - i)),
    []
  );

  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res = await axios.get(`${ApiURL}/client/getallClients`);
        const list = res?.data?.Client || [];
        const options = list.map((c) => ({
          value: c._id,
          label: c.clientName || c.name,
        }));
        const nameMap = {};
        list.forEach((c) => {
          nameMap[c._id] = c.clientName || c.name;
        });
        setClientMap(nameMap);
        setClients([{ value: "ALL_CLIENTS", label: "All Clients" }, ...options]);
      } catch (err) {
        setClients([]);
      }
    };
    fetchClients();
  }, []);

  /* Fold the order rows the API returns into one row per client, keeping each
     client's invoices for the expandable detail. */
  const transformResponse = (responseData) => {
    const orders = responseData?.orders;
    if (!Array.isArray(orders) || !orders.length) return [];

    const byClient = {};
    orders.forEach((order) => {
      const clientId = order.clientId;
      if (!byClient[clientId]) {
        byClient[clientId] = {
          _id: clientId,
          allProductsTotal: 0,
          totalDiscount: 0,
          totalRoundOff: 0,
          totalPayments: 0,
          invoices: [],
        };
      }
      const row = byClient[clientId];
      row.allProductsTotal += Number(order.allProductsTotal) || 0;
      row.totalDiscount += Number(order.discountAmount) || 0;
      row.totalRoundOff += Number(order.roundOff) || 0;
      row.totalPayments += Number(order.totalPaid) || 0;
      row.invoices.push({
        _id: order.orderId,
        invoiceDate: order.orderDate,
        invoiceNumber: order.orderId,
        executiveName: order.executiveName,
        Address: order.Address,
        orderTotal: order.totalAmount,
        amount: order.allProductsTotal,
        payments: order.totalPaid || 0,
        paymentsList: order.payments || [],
      });
    });

    return Object.values(byClient);
  };

  const handleClientChange = (selectedOptions) => {
    const opts = selectedOptions || [];
    const isAll = opts.some((o) => o.value === "ALL_CLIENTS");
    if (isAll) {
      setSelectedClients(["ALL_CLIENTS"]);
      return;
    }
    setSelectedClients(opts.filter((o) => o.value !== "ALL_CLIENTS").map((o) => o.value));
  };

  /* Both ends of the range, as the API writes dates everywhere else. */
  const rangeIsSet = !!(fromDate && toDate);

  const runReport = async () => {
    if (!selectedClients.length) {
      toast.error("Pick at least one client, or All clients");
      return;
    }
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
          /* A range replaces year and month; the API reads whichever it gets. */
          ...(rangeIsSet
            ? {
                startDate: moment(fromDate).format("DD-MM-YYYY"),
                endDate: moment(toDate).format("DD-MM-YYYY"),
              }
            : { year: selectedYear, month: selectedMonth }),
          clientIds: selectedClients.includes("ALL_CLIENTS") ? [] : selectedClients,
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

  /* Back to how the screen opens - every client, this year - rather than to
     an empty form that shows nothing. */
  const reset = () => {
    setSelectedClients(["ALL_CLIENTS"]);
    setSelectedYear(String(moment().year()));
    setSelectedMonth(moment().format("MM"));
    setFromDate(null);
    setToDate(null);
    setExpandedRows(new Set());
  };

  /* Opens with a report rather than an empty page, and follows the period
     controls after that. The client picker is deliberately not a trigger: a
     multi-select is edited in several steps, and refetching between each one
     would fire a request per tick - that stays on Generate Report. */
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

  const nameOf = (row) => clientMap[row._id] || row.clientName || "Unnamed client";

  const rows = useMemo(() => {
    const net = (r) =>
      (Number(r.allProductsTotal) || 0) -
      (Number(r.totalDiscount) || 0) +
      (Number(r.totalRoundOff) || 0);
    return reportData
      .slice()
      .sort((a, b) => (sortDesc ? net(b) - net(a) : net(a) - net(b)));
  }, [reportData, sortDesc]);

  const netOf = (r) =>
    (Number(r.allProductsTotal) || 0) -
    (Number(r.totalDiscount) || 0) +
    (Number(r.totalRoundOff) || 0);

  /* Only what the tiles show. The order value and the balance per client are
     in the table below, worked out there from each row. */
  const totals = useMemo(() => ({ clients: rows.length }), [rows]);

  const handleExport = () => {
    if (!rows.length) {
      toast.error("Run a report first");
      return;
    }
    try {
      const flat = rows.map((r, i) => ({
        "#": i + 1,
        Client: nameOf(r),
        "Order Value": Number(r.allProductsTotal) || 0,
        Discount: Number(r.totalDiscount) || 0,
        "Round Off": Number(r.totalRoundOff) || 0,
        "Net Value": netOf(r),
        Balance: Math.max(0, netOf(r) - (Number(r.totalPayments) || 0)),
        Invoices: r.invoices?.length || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(flat);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ClientReport");
      ws["!cols"] = [
        { wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 12 },
        { wch: 11 }, { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 10 },
      ];
      const label = selectedMonth
        ? `${selectedYear}-${selectedMonth}`
        : selectedYear || "all";
      XLSX.writeFile(wb, `client-report-${label}.xlsx`);
    } catch (error) {
      toast.error("Could not export the report");
    }
  };

  const chartTop = rows.slice(0, 8);
  const chartData = {
    labels: chartTop.map((r) => nameOf(r)),
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

  /* Order value and outstanding are not shown as tiles; the per-client
     figures below carry them, which is where they are actually read. */
  const tiles = [
    {
      key: "clients",
      label: "Clients Reported",
      value: totals.clients,
      hint: rangeIsSet
        ? moment(fromDate).format("DD MMM") +
          " - " +
          moment(toDate).format("DD MMM YYYY")
        : selectedMonth
          ? moment(selectedMonth, "MM").format("MMMM") + " " + selectedYear
          : selectedYear,
      icon: FaUsers,
      tone: "violet",
    },
  ];

  const selectValue = clients.filter((c) => selectedClients.includes(c.value));

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
              <span>Clients</span>
              <Select
                isMulti
                options={clients}
                value={selectValue}
                onChange={handleClientChange}
                placeholder="Select clients..."
                styles={SELECT_STYLES}
                menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                closeMenuOnSelect={false}
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

          <p className="rp-hint">
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
            <BusyButton className="eq-primary" onClick={runReport} disabled={loading}>
              <FaPlay /> {loading ? "Generating..." : "Generate Report"}
            </BusyButton>
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
                <h3 className="rt-panel__title">Value by Client</h3>
                <p className="rt-panel__sub">
                  {rows.length
                    ? `Top ${chartTop.length} of ${rows.length}`
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
              <p className="rt-empty">No orders in this period.</p>
            )}
          </Card.Body>
        </Card>

        <Card className="eq-card">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaUsers />
              </span>
              <div>
                <h3 className="rt-panel__title">Client Breakdown</h3>
                <p className="rt-panel__sub">
                  Tap a row to see its invoices
                </p>
              </div>
            </div>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table className="eq-table mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} />
                    <th>Client</th>
                    <th
                      className="text-end rp-sort"
                      onClick={() => setSortDesc((p) => !p)}
                      title="Sort by value"
                    >
                      Net Value {sortDesc ? "▼" : "▲"}
                    </th>
                    <th className="text-end">Balance</th>
                    <th className="text-end">Invoices</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="text-center py-5">
                        <Spinner animation="border" size="sm" /> Loading...
                      </td>
                    </tr>
                  ) : !rows.length ? (
                    <tr>
                      <td colSpan="6" className="text-center py-5 eq-none">
                        No orders for the clients and period selected.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const net = netOf(r);
                      const paid = Number(r.totalPayments) || 0;
                      const due = Math.max(0, net - paid);
                      const open = expandedRows.has(r._id);
                      return (
                        <React.Fragment key={r._id}>
                          <tr
                            className={open ? "is-active" : ""}
                            onClick={() => toggleRow(r._id)}
                          >
                            <td>
                              <span className="rp-caret">
                                {open ? <FaChevronDown /> : <FaChevronRight />}
                              </span>
                            </td>
                            <td className="rt-mini__strong">{nameOf(r)}</td>
                            <td className="text-end eq-amount">&#8377;{inr(net)}</td>
                            <td className="text-end">
                              <span className={due > 0 ? "pr-due" : "pr-clear"}>
                                &#8377;{inr(due)}
                              </span>
                            </td>
                            <td className="text-end">
                              <span className="rp-rank">{r.invoices?.length || 0}</span>
                            </td>
                          </tr>

                          {open ? (
                            <tr className="rp-detail">
                              <td colSpan="6">
                                <div className="rp-inv">
                                  <span className="rp-inv__title">
                                    Invoices ({r.invoices?.length || 0})
                                  </span>
                                  {r.invoices?.length ? (
                                    <ul className="rp-inv__list">
                                      {r.invoices.map((inv, i) => (
                                        <li key={(inv._id || "") + i}>
                                          <OrderRow
                                            id={inv._id}
                                            number={inv.invoiceNumber}
                                            date={inv.invoiceDate}
                                            meta={
                                              inv.executiveName
                                                ? " · " + inv.executiveName
                                                : ""
                                            }
                                            amount={inv.orderTotal ?? inv.amount}
                                          />
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="rt-empty">No invoices in this period.</p>
                                  )}
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

export default ClientReports;
