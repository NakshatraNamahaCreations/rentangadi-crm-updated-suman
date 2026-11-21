import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  buildOrderStateByQuote,
  loadOrderSources,
  orderStateFromRows,
  rowsCarryOrderState,
} from "../../utils/enquiryStage";
import { toast } from "react-hot-toast";
import BusyButton from "../../components/BusyButton";
import ConfirmPasswordModal from "../../components/ConfirmPasswordModal";

/* The record's own word for itself. It is not the whole story: an order
   raised from a quote can be called off afterwards, and the quote then
   still says "send" - so the page reads both, below. */
const quoteSaysCancelled = (q) =>
  String(q?.status || "").toLowerCase() === "cancelled";

const quoteSaysSent = (q) =>
  String(q?.status || "").toLowerCase() === "send";

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
  /* quoteId -> what became of the order raised from it. */
  const [orderState, setOrderState] = useState(() => new Map());
  /* False until that is known. Until then a cancelled job would read as
     confirmed, and a figure that corrects itself a few seconds later is
     worse than one that waits. */
  const [ordersReady, setOrdersReady] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const navigate = useNavigate();

  /**
   * One read of the list.
   *
   * This used to read it twice at once: the copy the server keeps, which
   * drew the table in about a second, and a paginated read that skipped that
   * copy, cost up to seven seconds and quietly replaced it - because the
   * cached copy could be two minutes behind and a quote raised since would
   * read as it was.
   *
   * The cache is now dropped whenever a quotation or an order is written, so
   * the copy it serves is current and the second read bought nothing but the
   * seven seconds.
   */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const rowsOf = (d) =>
      Array.isArray(d) ? d : d?.quoteData || d?.data || [];

    axios
      .get(`${ApiURL}/quotations/getallquotations`)
      .then((res) => {
        if (!alive || res.status !== 200) return;
        setQuotations(rowsOf(res.data));
      })
      .catch((error) => console.error("Error fetching quotations:", error))
      .finally(() => {
        /* Even on failure the page must stop saying it is loading. */
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  /* Whether the rows already say what became of their order. */
  const carriesOrderState = useMemo(
    () => rowsCarryOrderState(quotations),
    [quotations]
  );

  /**
   * An order called off leaves its quotation saying "send", so the two have
   * to be read together. The API sends that with the row now, which is the
   * usual path; the orders list is still read for a backend that does not.
   */
  useEffect(() => {
    /* Nothing to decide until the quotations are in. */
    if (loading) return undefined;

    if (carriesOrderState || !quotations.length) {
      setOrderState(orderStateFromRows(quotations));
      setOrdersReady(true);
      return undefined;
    }

    let alive = true;
    loadOrderSources((rows, settled) => {
      if (!alive) return;
      setOrderState(buildOrderStateByQuote(rows));
      /* Settled even on failure: the page then reads the quotes' own word,
         which is the best it can do, rather than waiting for ever. */
      if (settled) setOrdersReady(true);
    });
    return () => {
      alive = false;
    };
  }, [loading, carriesOrderState, quotations]);

  /* The table is made of the quotations, so it waits for those alone.
     Where each one stands needs the orders list as well, and against a
     backend that does not project quoteId that is a two-megabyte read -
     waiting for it held every row back for half a minute. So the rows
     show as soon as they arrive and the Status column fills in when the
     answer does; nothing claims a stage it cannot yet know. */
  const busy = loading;
  const statusKnown = ordersReady;

  /* Cancelled covers both: the quote withdrawn, and the order raised from
     it called off. */
  const isCancelled = useCallback(
    (q) =>
      orderState.get(String(q?.quoteId || "")) === "cancelled" ||
      quoteSaysCancelled(q),
    [orderState]
  );

  const isSent = useCallback(
    (q) => !isCancelled(q) && quoteSaysSent(q),
    [isCancelled]
  );

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
  }, [quotations, isSent, isCancelled]);

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
      if (statusFilter === "confirmed" && !isSent(q)) return false;
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
  }, [quotations, searchQuery, statusFilter, executiveFilter, fromDate, toDate, sortBy, isSent, isCancelled]);

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

  /**
   * Deleting asks for the admin password - the same gate the enquiry and
   * order lists use. A quotation is the price a client was given; one click
   * from a screen left open should not take it away.
   */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const askToDelete = (ids) => {
    setDeleteError("");
    setPendingDelete(ids);
  };

  const handleDelete = (id) => askToDelete([id]);

  const handleDeleteSelected = () => {
    if (!selectedRows.length) return;
    askToDelete([...selectedRows]);
  };

  const runDelete = async (password) => {
    const ids = pendingDelete || [];
    setDeleting(true);
    setDeleteError("");

    try {
      /* One at a time, so a rejected password is reported once rather than
         as a row of identical failures. */
      for (const id of ids) {
        await axios.delete(`${ApiURL}/quotations/deletequotation/${id}`, {
          data: { password },
        });
      }

      setQuotations((prev) => prev.filter((q) => !ids.includes(q._id)));
      setSelectedRows((prev) => prev.filter((x) => !ids.includes(x)));
      setPendingDelete(null);
      toast.success(
        ids.length === 1
          ? "Quotation deleted"
          : `${ids.length} quotations deleted`
      );
    } catch (error) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error;

      if (status === 400 || status === 401 || status === 403) {
        setDeleteError(message || "Password is not correct");
      } else {
        setPendingDelete(null);
        toast.error(message || "Failed to delete");
      }
    } finally {
      setDeleting(false);
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
      /* null, not 0: none counted yet is not the same as none. */
      value: statusKnown ? stats.pending : null,
      hint: "Not confirmed yet",
      icon: FaRegClock,
      tone: "blue",
    },
    {
      key: "sent",
      label: "Confirmed",
      value: statusKnown ? stats.sent : null,
      hint: "Confirmed by client",
      icon: FaPaperPlane,
      tone: "green",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: statusKnown ? stats.cancelled : null,
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
              <span className="eq-stat__value">
                {busy || t.value == null ? "—" : t.value}
              </span>
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

          {/* Filtering by something not yet known would hide the wrong
              rows, so it opens a second or two after the table does. */}
          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            disabled={!statusKnown}
            title={
              statusKnown ? undefined : "Reading where each quote stands"
            }
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            {/* The stored value stays "sent"; only the wording changes. */}
            <option value="confirmed">Confirmed</option>
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
              <BusyButton
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </BusyButton>
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
                {busy ? (
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
                          {statusKnown ? (
                            <span
                              className={`eq-pill ${
                                cancelled
                                  ? "is-cancelled"
                                  : sent
                                    ? "is-quoted"
                                    : "is-open"
                              }`}
                            >
                              {cancelled
                                ? "Cancelled"
                                : sent
                                  ? "Confirmed"
                                  : "Pending"}
                            </span>
                          ) : (
                            /* Still reading the orders; a word here would be
                               a guess, and the wrong one half the time. */
                            <span
                              className="eq-pill is-waiting"
                              title="Working out where this quote stands"
                            >
                              &hellip;
                            </span>
                          )}
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
              loading={loading}
            />
          </div>
        </Card>

        <QuotePeek quote={activeQuote} onClose={() => setActiveId(null)} />
      </div>

      <ConfirmPasswordModal
        show={Boolean(pendingDelete)}
        onHide={() => setPendingDelete(null)}
        onConfirm={runDelete}
        busy={deleting}
        error={deleteError}
        title={
          (pendingDelete || []).length > 1
            ? `Delete ${pendingDelete.length} quotations?`
            : "Delete this quotation?"
        }
        message={
          (pendingDelete || []).length > 1
            ? `${pendingDelete.length} quotations and the prices on them will be removed.`
            : "The quotation and the prices on it will be removed."
        }
        confirmLabel={
          (pendingDelete || []).length > 1
            ? `Delete ${pendingDelete.length}`
            : "Delete quotation"
        }
      />
    </Container>
  );
};

export default Quotation;
