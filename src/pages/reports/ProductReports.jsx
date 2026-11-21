import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Spinner, Table , Form } from "react-bootstrap";
import {
  FaRupeeSign,
  FaTrophy,
  FaChartBar,
  FaBoxOpen,
  FaArrowUp,
  FaArrowDown,
  FaFileExport,
  FaUndo,
  FaPlay,
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
import Pagination from "../../components/Pagination";
import { toast } from "react-hot-toast";

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

const QUICK = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "d30", label: "Last 30 Days" },
  { key: "d90", label: "Last 90 Days" },
];

const rangeFor = (key) => {
  const today = moment();
  if (key === "week") return [today.clone().startOf("week"), today];
  if (key === "month") return [today.clone().startOf("month"), today];
  if (key === "d30") return [today.clone().subtract(29, "day"), today];
  return [today.clone().subtract(89, "day"), today];
};

const ProductReports = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState(null);
  // Same-length window immediately before the selected one, so the deltas
  // below are a real comparison rather than an invented figure.
  const [prevReport, setPrevReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortDesc, setSortDesc] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const fetchWindow = async (from, to) => {
    const { data } = await axios.get(`${ApiURL}/report/product-report-by-dates`, {
      params: { fromDate: from, toDate: to },
    });
    return data;
  };

  const runReport = async (f = fromDate, t = toDate) => {
    if (!f || !t) {
      toast.error("Pick both a from and a to date");
      return;
    }
    if (moment(t).isBefore(moment(f))) {
      toast.error("The to date cannot be before the from date");
      return;
    }

    setLoading(true);
    setReport(null);
    setPrevReport(null);
    try {
      const days = moment(t).diff(moment(f), "days") + 1;
      const prevTo = moment(f).subtract(1, "day");
      const prevFrom = prevTo.clone().subtract(days - 1, "day");

      const [current, previous] = await Promise.allSettled([
        fetchWindow(f, t),
        fetchWindow(prevFrom.format("YYYY-MM-DD"), prevTo.format("YYYY-MM-DD")),
      ]);

      if (current.status !== "fulfilled") throw current.reason;
      setReport(current.value);
      setPrevReport(previous.status === "fulfilled" ? previous.value : null);
    } catch (error) {
      toast.error(
        `Error fetching report: ${error?.response?.data?.message || "Unknown error"}`
      );
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const applyQuick = (key) => {
    const [a, b] = rangeFor(key);
    const f = a.format("YYYY-MM-DD");
    const t = b.format("YYYY-MM-DD");
    setFromDate(f);
    setToDate(t);
    runReport(f, t);
  };

  const reset = () => {
    setFromDate("");
    setToDate("");
    setReport(null);
    setPrevReport(null);
  };

  const products = useMemo(() => {
    const rows = Array.isArray(report?.products) ? report.products : [];
    return rows
      .slice()
      .sort((a, b) =>
        sortDesc
          ? (Number(b.totalRevenue) || 0) - (Number(a.totalRevenue) || 0)
          : (Number(a.totalRevenue) || 0) - (Number(b.totalRevenue) || 0)
      );
  }, [report, sortDesc]);

  useEffect(() => {
    setCurrentPage(1);
  }, [report, sortDesc, itemsPerPage]);

  // The rank shown is the product's place in the whole list, not the page.
  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageRows = products.slice(pageStart, pageStart + itemsPerPage);

  const totals = useMemo(() => {
    const revenue =
      Number(report?.totalRevenue) ||
      products.reduce((s, p) => s + (Number(p.totalRevenue) || 0), 0);
    const count = Number(report?.totalProducts) || products.length;
    const prevRevenue =
      Number(prevReport?.totalRevenue) ||
      (Array.isArray(prevReport?.products)
        ? prevReport.products.reduce((s, p) => s + (Number(p.totalRevenue) || 0), 0)
        : 0);
    const prevCount =
      Number(prevReport?.totalProducts) ||
      (Array.isArray(prevReport?.products) ? prevReport.products.length : 0);

    const delta = (now, before) =>
      before > 0 ? ((now - before) / before) * 100 : null;

    return {
      revenue,
      count,
      avg: count > 0 ? revenue / count : 0,
      top: products[0] || null,
      revenueDelta: delta(revenue, prevRevenue),
      countDelta: delta(count, prevCount),
      avgDelta: delta(
        count > 0 ? revenue / count : 0,
        prevCount > 0 ? prevRevenue / prevCount : 0
      ),
    };
  }, [report, prevReport, products]);

  const handleExport = () => {
    if (!products.length) {
      toast.error("Run a report first");
      return;
    }
    try {
      const rows = products.map((p, i) => ({
        "#": i + 1,
        Product: p.name || "",
        "Total Revenue": Number(p.totalRevenue) || 0,
        "Share %": totals.revenue
          ? Number((((Number(p.totalRevenue) || 0) / totals.revenue) * 100).toFixed(2))
          : 0,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "ProductReport");
      ws["!cols"] = [{ wch: 5 }, { wch: 38 }, { wch: 16 }, { wch: 10 }];
      XLSX.writeFile(wb, `product-report-${fromDate}-to-${toDate}.xlsx`);
    } catch (error) {
      toast.error("Could not export the report");
    }
  };

  const chartTop = products.slice(0, 8);
  const chartData = {
    labels: chartTop.map((p) => p.name || "—"),
    datasets: [
      {
        data: chartTop.map((p) => Number(p.totalRevenue) || 0),
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
          minRotation: 0,
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
      key: "rev",
      label: "Total Revenue",
      value: "₹ " + compactInr(totals.revenue),
      icon: FaRupeeSign,
      tone: "blue",
      delta: totals.revenueDelta,
    },
    {
      key: "top",
      label: "Top Performing Product",
      value: totals.top?.name || "—",
      sub: totals.top ? "₹" + inr(totals.top.totalRevenue) + " revenue" : "",
      icon: FaTrophy,
      tone: "amber",
      small: true,
    },
    {
      key: "avg",
      label: "Avg. Revenue / Product",
      value: "₹ " + compactInr(totals.avg),
      icon: FaChartBar,
      tone: "green",
      delta: totals.avgDelta,
    },
    {
      key: "count",
      label: "Products Reported",
      value: totals.count,
      icon: FaBoxOpen,
      tone: "violet",
      delta: totals.countDelta,
    },
  ];

  return (
    <div className="rp">
      {/* ---- Stat tiles ---- */}
      <div className="eq-stats">
        {tiles.map((t) => (
          <div className={`eq-stat is-${t.tone}`} key={t.key}>
            <span className="eq-stat__icon">
              <t.icon />
            </span>
            <div className="eq-stat__body">
              <span className="eq-stat__label">{t.label}</span>
              <span className={"eq-stat__value" + (t.small ? " is-small" : "")}>
                {t.value}
              </span>
              {t.delta !== null && t.delta !== undefined ? (
                <span
                  className={`eq-trend ${t.delta >= 0 ? "is-up" : "is-down"}`}
                  title="Compared with the same length of time just before"
                >
                  {t.delta >= 0 ? <FaArrowUp /> : <FaArrowDown />}{" "}
                  {Math.abs(t.delta).toFixed(1)}% vs previous period
                </span>
              ) : (
                <span className="eq-stat__hint">
                  {t.sub || (report ? "No prior period to compare" : "Run a report")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Date range ---- */}
      <Card className="eq-card mb-3">
        <Card.Body>
          <div className="rp-range">
            <label className="rp-field">
              <span>From Date</span>
              <input
                type="date"
                className="form-control"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </label>
            <label className="rp-field">
              <span>To Date</span>
              <input
                type="date"
                className="form-control"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
              />
            </label>

            <div className="rp-field rp-field--grow">
              <span>Quick Range</span>
              <div className="rp-quick">
                {QUICK.map((q) => (
                  <button
                    key={q.key}
                    type="button"
                    className="rp-chip"
                    onClick={() => applyQuick(q.key)}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rp-actions">
            <Button className="eq-ghost" onClick={reset}>
              <FaUndo /> Reset
            </Button>
            <Button className="eq-ghost" onClick={handleExport}>
              <FaFileExport /> Export to Excel
            </Button>
            <Button className="eq-primary" onClick={() => runReport()} disabled={loading}>
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
                <h3 className="rt-panel__title">Revenue by Product</h3>
                <p className="rt-panel__sub">
                  {products.length
                    ? `Top ${chartTop.length} of ${products.length}`
                    : "Run a report to see the breakdown"}
                </p>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            {loading ? (
              <p className="rt-empty">
                <Spinner animation="border" size="sm" /> Generating report...
              </p>
            ) : chartTop.length ? (
              <div className="rp-chart">
                <Bar data={chartData} options={chartOptions} />
              </div>
            ) : (
              <p className="rt-empty">Pick a date range and generate the report.</p>
            )}
          </Card.Body>
        </Card>

        <Card className="eq-card">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaTrophy />
              </span>
              <div>
                <h3 className="rt-panel__title">Top Products by Revenue</h3>
                <p className="rt-panel__sub">
                  {fromDate && toDate
                    ? `${moment(fromDate).format("DD MMM")} – ${moment(toDate).format("DD MMM YYYY")}`
                    : "No range selected"}
                </p>
              </div>
            </div>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="table-responsive">
              <Table className="eq-table mb-0">
                <thead>
                  <tr>
                    <th style={{ width: 48 }}>#</th>
                    <th>Product Name</th>
                    <th
                      className="text-end rp-sort"
                      onClick={() => setSortDesc((p) => !p)}
                      title="Sort by revenue"
                    >
                      Total Revenue {sortDesc ? "▼" : "▲"}
                    </th>
                    <th className="text-end">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="text-center py-5">
                        <Spinner animation="border" size="sm" /> Loading...
                      </td>
                    </tr>
                  ) : !products.length ? (
                    <tr>
                      <td colSpan="4" className="text-center py-5 eq-none">
                        No data yet. Select a date range and generate the report.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((p, i) => {
                      const rev = Number(p.totalRevenue) || 0;
                      const share = totals.revenue ? (rev / totals.revenue) * 100 : 0;
                      return (
                        <tr key={(p.name || "") + pageStart + i}>
                          <td>
                            <span className="rp-rank">{pageStart + i + 1}</span>
                          </td>
                          <td className="rt-mini__strong">{p.name || "—"}</td>
                          <td className="text-end eq-amount">&#8377;{inr(rev)}</td>
                          <td className="text-end">
                            <span className="rp-share">
                              <b>{share.toFixed(1)}%</b>
                              <span className="rp-share__track">
                                <i style={{ width: Math.max(3, share) + "%" }} />
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </div>

            {products.length > itemsPerPage ? (
              <div className="eq-foot">
                <label className="eq-perpage">
                  <span>Rows</span>
                  <Form.Select
                    value={itemsPerPage}
                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                    aria-label="Rows per page"
                  >
                    {[10, 25, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </Form.Select>
                </label>

                <Pagination
                  totalItems={products.length}
                  itemsPerPage={itemsPerPage}
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  loading={loading}
                />
              </div>
            ) : null}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
};

export default ProductReports;
