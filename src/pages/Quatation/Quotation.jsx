import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Container, Form, Spinner } from "react-bootstrap";
import {
  FaTrashAlt,
  FaFileInvoiceDollar,
  FaRegClock,
  FaPaperPlane,
  FaBan,
  FaSearch,
  FaFileExport,
  FaList,
  FaRegCalendarAlt,
  FaPlus,
  FaFilePdf,
} from "react-icons/fa";
import { MdVisibility } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import moment from "moment";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import * as XLSX from "xlsx";
import { ApiURL } from "../../api";
import Pagination from "../../components/Pagination";
import QuotePeek from "./QuotePeek";
import { toast } from "react-hot-toast";

/* The record carries a single status string. "send" means the quote has gone
   to the client; anything else is still being prepared. */
const isSent = (q) => String(q?.status || "").toLowerCase() === "send";

/* Cancelling a quotation sets status to "cancelled". Without this the page
   read every non-"send" quote as pending, so a cancelled one was counted and
   filtered as if it were still waiting to go out. */
const isCancelled = (q) =>
  String(q?.status || "").toLowerCase() === "cancelled";

const amountOf = (q) => Number(q?.GrandTotal ?? q?.grandTotal) || 0;

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );


/* quoteDate is DD-MM-YYYY; createdAt is used when present. */
const whenOf = (q) =>
  q?.createdAt ? moment(q.createdAt) : moment(q?.quoteDate, "DD-MM-YYYY");

const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

const Quotation = () => {
  const [quotations, setQuotations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [executiveFilter, setExecutiveFilter] = useState("all");
  /* Filtered on the date the table shows - the event date - not on when the
     record was raised, so the dates picked match the column being read. */
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [sortBy, setSortBy] = useState("newest");
  const [selectedRows, setSelectedRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchQuotations = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${ApiURL}/quotations/getallquotations`);
        if (res.status === 200) {
          const d = res.data;
          setQuotations(
            Array.isArray(d) ? d : d?.quoteData || d?.data || []
          );
        }
      } catch (error) {
        console.error("Error fetching quotations:", error);
      }
      setLoading(false);
    };
    fetchQuotations();
  }, []);

  const stats = useMemo(() => {
    const total = quotations.length;
    const sent = quotations.filter(isSent).length;
    const cancelled = quotations.filter(isCancelled).length;
    const pending = total - sent - cancelled;
    const value = quotations.reduce((s, q) => s + amountOf(q), 0);

    // Two most recent COMPLETE months, so a part-way month is never compared
    // against a full one.
    const lastMonth = moment().subtract(1, "month");
    const prevMonth = moment().subtract(2, "month");
    const inMonth = (m) =>
      quotations.filter((q) => {
        const d = whenOf(q);
        return d.isValid() && d.isSame(m, "month");
      }).length;
    const a = inMonth(lastMonth);
    const b = inMonth(prevMonth);
    const trend =
      b > 0
        ? {
            pct: ((a - b) / b) * 100,
            up: a >= b,
            label: lastMonth.format("MMM") + " vs " + prevMonth.format("MMM"),
          }
        : null;

    return { total, sent, pending, cancelled, value, trend };
  }, [quotations]);

  const executives = useMemo(() => {
    const set = new Set();
    quotations.forEach((q) => {
      const n = String(q?.executivename || "").trim();
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [quotations]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const hit = (v) => String(v ?? "").toLowerCase().includes(term);

    let rows = quotations.filter((q) => {
      if (
        term &&
        !(hit(q.quoteId) || hit(q.clientName) || hit(q.executivename) || hit(q.quoteDate))
      ) {
        return false;
      }
      if (statusFilter === "sent" && !isSent(q)) return false;
      if (statusFilter === "cancelled" && !isCancelled(q)) return false;
      if (statusFilter === "pending" && (isSent(q) || isCancelled(q)))
        return false;
      if (
        executiveFilter !== "all" &&
        String(q?.executivename || "").trim() !== executiveFilter
      ) {
        return false;
      }

      /* The event date, inclusive at both ends. Most records write it as
         DD-MM-YYYY and some older ones as YYYY-MM-DD, so both are read; a
         date that parses as neither cannot sit inside a range, so it is left
         out while one is set. */
      if (fromDate || toDate) {
        const on = moment(q?.quoteDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
        if (!on.isValid()) return false;
        if (fromDate && on.isBefore(moment(fromDate), "day")) return false;
        if (toDate && on.isAfter(moment(toDate), "day")) return false;
      }

      return true;
    });

    rows = rows.slice().sort((a, b) => {
      if (sortBy === "amount") return amountOf(b) - amountOf(a);
      const da = whenOf(a).valueOf() || 0;
      const db = whenOf(b).valueOf() || 0;
      return sortBy === "oldest" ? da - db : db - da;
    });

    return rows;
  }, [quotations, searchQuery, statusFilter, executiveFilter, fromDate, toDate, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows([]);
  }, [searchQuery, statusFilter, executiveFilter, fromDate, toDate, sortBy, itemsPerPage]);

  // Preview the first row, and re-point it when filters move the list.
  /* The preview no longer opens on its own: an always-open rail cost the
     table a third of its width, so columns were hidden before the user had
     asked for anything. A stale selection is still cleared. */
  useEffect(() => {
    if (!filtered.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId !== null && !filtered.some((q) => q._id === activeId)) {
      setActiveId(null);
    }
  }, [filtered, activeId]);

  const activeQuote = useMemo(
    () => filtered.find((q) => q._id === activeId) || null,
    [filtered, activeId]
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const currentItems = filtered.slice(indexOfLastItem - itemsPerPage, indexOfLastItem);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this quotation?")) return;
    try {
      await axios.delete(`${ApiURL}/quotations/deletequotation/${id}`);
      setQuotations((prev) => prev.filter((q) => q._id !== id));
      setSelectedRows((prev) => prev.filter((x) => x !== id));
      toast.success("Quotation deleted");
    } catch (error) {
      toast.error("Failed to delete quotation");
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedRows.length) return;
    if (!window.confirm(`Delete ${selectedRows.length} selected quotations?`)) return;
    try {
      await Promise.all(
        selectedRows.map((id) =>
          axios.delete(`${ApiURL}/quotations/deletequotation/${id}`)
        )
      );
      setQuotations((prev) => prev.filter((q) => !selectedRows.includes(q._id)));
      setSelectedRows([]);
      toast.success("Selected quotations deleted");
    } catch (error) {
      toast.error("Failed to delete some quotations");
    }
  };

  const handleSelectRow = (id) =>
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSelectAll = () =>
    setSelectedRows(
      selectedRows.length === currentItems.length ? [] : currentItems.map((q) => q._id)
    );

  /* Exports exactly the rows the filters currently show. */
  const handleExport = () => {
    try {
      const rows = filtered.map((q, i) => ({
        "#": i + 1,
        "Quote Id": q?.quoteId || "",
        Client: q?.clientName || "",
        "Event Date": q?.quoteDate || "",
        "Time Slot": q?.quoteTime || "",
        Executive: q?.executivename || "",
        "GST %": q?.GST ?? "",
        "Grand Total": amountOf(q),
        Status: isCancelled(q) ? "Cancelled" : isSent(q) ? "Confirmed" : "Pending",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Quotations");
      worksheet["!cols"] = [
        { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 13 },
        { wch: 22 }, { wch: 18 }, { wch: 8 }, { wch: 14 }, { wch: 10 },
      ];
      XLSX.writeFile(workbook, `quotations-${moment().format("YYYY-MM-DD")}.xlsx`);
    } catch (error) {
      toast.error("Could not export the list");
    }
  };

  const tiles = [
    {
      key: "total",
      label: "Total Quotes",
      value: stats.total,
      hint: "All time",
      icon: FaFileInvoiceDollar,
      tone: "amber",
      trend: stats.trend,
    },
    {
      key: "pending",
      label: "Pending",
      value: stats.pending,
      hint: "Not confirmed yet",
      icon: FaRegClock,
      tone: "blue",
    },
    {
      key: "sent",
      label: "Confirmed",
      value: stats.sent,
      hint: "Confirmed by client",
      icon: FaPaperPlane,
      tone: "green",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: stats.cancelled,
      hint: "Called off",
      icon: FaBan,
      tone: "grey",
    },
  ];

  return (
    <Container fluid className="px-0">
      {/* ---- Page header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Quotation</h2>
          <p className="eq-head__sub">
            Every quote raised, with its value and where it stands.
          </p>
        </div>
        <div className="eq-head__actions">
          <div className="eq-views" role="tablist" aria-label="View">
            <button type="button" className="eq-view is-active" aria-selected="true">
              <FaList /> List
            </button>
            <button
              type="button"
              className="eq-view"
              aria-selected="false"
              onClick={() => navigate("/qt-calender")}
            >
              <FaRegCalendarAlt /> Calendar
            </button>
          </div>
          {/* Quotes are raised from an enquiry, so this goes to the inbox. */}
          <Button className="eq-primary" onClick={() => navigate("/enquiry-list")}>
            <FaPlus /> New Quote
          </Button>
        </div>
      </div>

      {/* ---- Stat tiles ---- */}
      <div className="eq-stats">
        {tiles.map((t) => (
          <div className={`eq-stat is-${t.tone}`} key={t.key}>
            <span className="eq-stat__icon">
              <t.icon />
            </span>
            <div className="eq-stat__body">
              <span className="eq-stat__label">{t.label}</span>
              <span className="eq-stat__value">{t.value}</span>
              {t.trend ? (
                <span
                  className={`eq-trend ${t.trend.up ? "is-up" : "is-down"}`}
                  title={`${t.trend.label} (complete months)`}
                >
                  {t.trend.up ? "↑" : "↓"}{" "}
                  {Math.abs(t.trend.pct).toFixed(1)}% {t.trend.label}
                </span>
              ) : (
                <span className="eq-stat__hint">{t.hint}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---- Filters ---- */}
      <Card className="eq-card mb-3">
        <Card.Body className="eq-filters">
          <div className="eq-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search quotes, clients, executives..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search quotations"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            {/* The stored value stays "sent"; only the wording changes. */}
            <option value="sent">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </Form.Select>

          <Form.Select
            className="eq-select"
            value={executiveFilter}
            onChange={(e) => setExecutiveFilter(e.target.value)}
            aria-label="Filter by executive"
          >
            <option value="all">All Executives</option>
            {executives.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Form.Select>

          <div className="eq-daterange">
            <DatePicker
              selected={fromDate}
              onChange={setFromDate}
              placeholderText="From date"
              className="form-control eq-dateinput"
              dateFormat="dd-MM-yyyy"
              isClearable
              selectsStart
              startDate={fromDate}
              endDate={toDate}
              popperClassName="eq-datepicker-popper"
              popperPlacement="bottom-start"
            />
            <DatePicker
              selected={toDate}
              onChange={setToDate}
              placeholderText="To date"
              className="form-control eq-dateinput"
              dateFormat="dd-MM-yyyy"
              isClearable
              selectsEnd
              startDate={fromDate}
              endDate={toDate}
              minDate={fromDate || undefined}
              popperClassName="eq-datepicker-popper"
              popperPlacement="bottom-start"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="amount">Highest Value</option>
          </Form.Select>

          <div className="eq-filters__end">
            {selectedRows.length > 0 ? (
              <Button
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </Button>
            ) : null}
            <Button className="eq-ghost" onClick={handleExport}>
              <FaFileExport /> Export
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ---- Table + preview ---- */}
      <div className="eq-split">
        <Card className="eq-card eq-split__list">
          <div className="table-responsive">
            <table className="table eq-table">
              <thead>
                <tr>
                  <th style={{ width: 42 }}>
                    <input
                      type="checkbox"
                      checked={
                        currentItems.length > 0 &&
                        selectedRows.length === currentItems.length
                      }
                      onChange={handleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th>Quote</th>
                  <th>Client</th>
                  <th>Event Date</th>
                  <th>Executive</th>
                  <th className="text-end">GST</th>
                  <th className="text-end">Grand Total</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="text-center py-5">
                      <Spinner animation="border" size="sm" /> Loading quotations...
                    </td>
                  </tr>
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-5 eq-none">
                      No quotations match these filters.
                    </td>
                  </tr>
                ) : (
                  currentItems.map((q) => {
                    const sent = isSent(q);
                    const cancelled = isCancelled(q);
                    const day = moment(q?.quoteDate, "DD-MM-YYYY");
                    return (
                      <tr
                        key={q._id}
                        className={q._id === activeId ? "is-active" : ""}
                        onClick={() => setActiveId(q._id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(q._id)}
                            onChange={() => handleSelectRow(q._id)}
                            aria-label={`Select ${q.quoteId || "quotation"}`}
                          />
                        </td>

                        <td>
                          <span className="eq-id">#{q.quoteId || "—"}</span>
                          {q.quoteTime ? (
                            <span className="eq-sub">{q.quoteTime}</span>
                          ) : null}
                        </td>

                        <td>
                          <span className="eq-strong">
                            {q.clientName || "Unnamed client"}
                          </span>
                          {q.clientNo ? (
                            <span className="eq-sub">{q.clientNo}</span>
                          ) : null}
                        </td>

                        <td>
                          <span className="eq-strong">{q.quoteDate || "—"}</span>
                          {day.isValid() ? (
                            <span className="eq-sub">{day.format("ddd")}</span>
                          ) : null}
                        </td>

                        <td>
                          {q.executivename ? (
                            <span className="eq-person">
                              <span className="eq-avatar">
                                {initials(q.executivename)}
                              </span>
                              {q.executivename}
                            </span>
                          ) : (
                            <span className="eq-sub">Unassigned</span>
                          )}
                        </td>

                        <td className="text-end">
                          {q.GST != null && q.GST !== "" ? `${q.GST}%` : "—"}
                        </td>

                        <td className="text-end eq-amount">
                          &#8377;{inr(amountOf(q))}
                        </td>

                        <td>
                          <span
                            className={`eq-pill ${
                              cancelled
                                ? "is-cancelled"
                                : sent
                                  ? "is-quoted"
                                  : "is-open"
                            }`}
                          >
                            {cancelled ? "Cancelled" : sent ? "Confirmed" : "Pending"}
                          </span>
                        </td>

                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="eq-actions">
                            <button
                              type="button"
                              className="eq-act is-view"
                              title="View quotation"
                              onClick={() => navigate(`/quotation-details/${q._id}`)}
                            >
                              <MdVisibility />
                            </button>
                            <button
                              type="button"
                              className="eq-act is-edit"
                              title="Open invoice"
                              onClick={() => navigate(`/quotation/invoice/${q._id}`)}
                            >
                              <FaFilePdf />
                            </button>
                            <button
                              type="button"
                              className="eq-act is-del"
                              title="Delete"
                              onClick={() => handleDelete(q._id)}
                            >
                              <FaTrashAlt />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="eq-foot">
            <label className="eq-perpage">
              <span>Rows</span>
              <Form.Select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Form.Select>
            </label>

            <Pagination
              totalItems={filtered.length}
              itemsPerPage={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </Card>

        <QuotePeek quote={activeQuote} onClose={() => setActiveId(null)} />
      </div>
    </Container>
  );
};

export default Quotation;
