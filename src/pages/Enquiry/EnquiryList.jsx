import React, { useMemo, useState, useEffect } from "react";
import { Button, Card, Container, Form, Spinner } from "react-bootstrap";
import {
  FaTrashAlt,
  FaEdit,
  FaInbox,
  FaRegClock,
  FaCheckCircle,
  FaSearch,
  FaFileExport,
  FaList,
  FaRegCalendarAlt,
  FaPlus,
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
import EnquiryPeek from "./EnquiryPeek";
import { toast } from "react-hot-toast";

/**
 * How far an enquiry has travelled.
 *
 * The record itself only says "sent"/"not send", which tells you a
 * quotation exists but nothing about what became of it. The stage follows
 * the enquiry to its quotation (quotations.enquiryId) and the quotation to
 * its order (orders.quoteId), so the list can say whether the job was
 * confirmed or called off.
 *
 * The four are exclusive, so every row shows exactly one.
 */
const STAGES = [
  { value: "pending", label: "Pending", tone: "pending" },
  { value: "sent", label: "Quotation Sent", tone: "sent" },
  { value: "confirmed", label: "Confirmed", tone: "confirmed" },
  { value: "cancelled", label: "Cancelled", tone: "cancelled" },
];

const STAGE_LABEL = Object.fromEntries(STAGES.map((x) => [x.value, x.label]));
const STAGE_TONE = Object.fromEntries(STAGES.map((x) => [x.value, x.tone]));

/**
 * Builds enquiryId -> stage once per data load.
 * A confirmed order outranks a cancelled one, so an enquiry re-confirmed
 * after a cancellation reads as confirmed.
 */
const buildStageMap = (quotations, orders) => {
  const orderByQuote = new Map();
  orders.forEach((o) => {
    const k = String(o?.quoteId || "");
    if (!k) return;
    const state = String(o?.orderStatus || "").toLowerCase();
    if (orderByQuote.get(k) === "confirm") return;
    orderByQuote.set(k, state);
  });

  const byEnquiry = new Map();
  quotations.forEach((q) => {
    const k = String(q?.enquiryId ?? "");
    if (!k) return;
    if (!byEnquiry.has(k)) byEnquiry.set(k, []);
    byEnquiry.get(k).push(q);
  });

  const stages = new Map();
  byEnquiry.forEach((quotes, enquiryId) => {
    let stage = null;
    for (const q of quotes) {
      const os = orderByQuote.get(String(q?.quoteId || ""));
      if (os === "confirm") {
        stage = "confirmed";
        break;
      }
      if (os === "cancelled") stage = stage || "cancelled";
      if (String(q?.status || "").toLowerCase() === "cancelled") {
        stage = stage || "cancelled";
      }
    }
    /* A quotation exists but nothing was ordered from it yet. */
    stages.set(enquiryId, stage || "sent");
  });

  return stages;
};

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );


/* enquiryDate is DD-MM-YYYY; createdAt is used when present. */
const whenOf = (enq) =>
  enq?.createdAt ? moment(enq.createdAt) : moment(enq?.enquiryDate, "DD-MM-YYYY");

const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

const EnquiryList = () => {
  const [enquiries, setEnquiries] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quotations, setQuotations] = useState([]);
  const [orders, setOrders] = useState([]);
  const [executiveFilter, setExecutiveFilter] = useState("all");
  /* Filtered on the date the table shows - the event date - not on when the
     record was raised, so the dates picked match the column being read. */
  const [fromDate, setFromDate] = useState(null);
  const [toDate, setToDate] = useState(null);
  const [sortBy, setSortBy] = useState("newest");
  const [selectedEnquiries, setSelectedEnquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Row shown in the right-hand preview.
  const [activeId, setActiveId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  /**
   * The quotation and order lists, with the two fields that link them back
   * to an enquiry.
   *
   * The plain list call is cached server side and cheap, but its projection
   * leaves out quotations.enquiryId and orders.quoteId. Asking for "full"
   * returns whole documents, which do carry them, at about 2MB and four
   * seconds a list - so the cheap call is tried first and the heavy one only
   * when the keys really are missing. A backend that projects them makes the
   * second call stop happening on its own.
   */
  const fetchLinked = async (path, arrayKey, linkField) => {
    const read = async (url) => {
      const res = await axios.get(url);
      const rows = res?.data?.[arrayKey];
      return Array.isArray(rows) ? rows : [];
    };

    const rows = await read(`${ApiURL}${path}`);
    if (rows.some((r) => r?.[linkField] != null)) return rows;

    /* Nothing came back carrying the link, so the projection is the older
       one. An empty list is left alone - there is nothing to re-ask for. */
    if (!rows.length) return rows;
    return read(`${ApiURL}${path}?full=1`);
  };

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);

      const [enqRes, quoteRes, orderRes] = await Promise.allSettled([
        axios.get(`${ApiURL}/Enquiry/getallEnquiry`),
        fetchLinked("/quotations/getallquotations", "quoteData", "enquiryId"),
        fetchLinked("/order/getallorder", "orderData", "quoteId"),
      ]);

      if (enqRes.status === "fulfilled" && enqRes.value?.status === 200) {
        const d = enqRes.value.data;
        setEnquiries(Array.isArray(d) ? d : d?.data || []);
      } else {
        console.error("Error fetching enquiries:", enqRes.reason);
      }

      /* A missing quotation or order list only costs the stage column; the
         enquiries themselves still list. */
      if (quoteRes.status === "fulfilled") setQuotations(quoteRes.value);
      else console.error("Error fetching quotations:", quoteRes.reason);

      if (orderRes.status === "fulfilled") setOrders(orderRes.value);
      else console.error("Error fetching orders:", orderRes.reason);

      setLoading(false);
    };
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const stageMap = useMemo(
    () => buildStageMap(quotations, orders),
    [quotations, orders]
  );

  /* No quotation was ever raised for this enquiry. */
  const stageOf = React.useCallback(
    (enq) => stageMap.get(String(enq?.enquiryId ?? "")) || "pending",
    [stageMap]
  );

  /* ---- Stat tiles, all computed from the fetched list ---- */
  const stats = useMemo(() => {
    const total = enquiries.length;
    const quoted = enquiries.filter((e) => stageOf(e) === "confirmed").length;
    const open = total - quoted;
    const value = enquiries.reduce((s, e) => s + (Number(e?.GrandTotal) || 0), 0);

    // Month-over-month on the two most recent COMPLETE months, so a part-way
    // month is not compared against a full one.
    const lastMonth = moment().subtract(1, "month");
    const prevMonth = moment().subtract(2, "month");
    const inMonth = (m) =>
      enquiries.filter((e) => {
        const d = whenOf(e);
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

    return { total, quoted, open, value, trend };
  }, [enquiries, stageOf]);

  const executives = useMemo(() => {
    const set = new Set();
    enquiries.forEach((e) => {
      const n = String(e?.executivename || "").trim();
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [enquiries]);

  /* ---- Filter + sort ---- */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hit = (v) => String(v ?? "").toLowerCase().includes(q);

    let rows = enquiries.filter((e) => {
      if (q && !(hit(e.enquiryId) || hit(e.clientName) || hit(e.executivename) || hit(e.clientNo) || hit(e.enquiryDate))) {
        return false;
      }
      /* "all" means every stage; otherwise it names one exactly. */
      if (statusFilter !== "all" && stageOf(e) !== statusFilter) return false;
      if (executiveFilter !== "all" && String(e?.executivename || "").trim() !== executiveFilter) {
        return false;
      }

      /* The event date, inclusive at both ends. Most records write it as
         DD-MM-YYYY and some older ones as YYYY-MM-DD, so both are read; a
         date that parses as neither cannot sit inside a range, so it is left
         out while one is set. */
      if (fromDate || toDate) {
        const on = moment(e?.enquiryDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
        if (!on.isValid()) return false;
        if (fromDate && on.isBefore(moment(fromDate), "day")) return false;
        if (toDate && on.isAfter(moment(toDate), "day")) return false;
      }

      return true;
    });

    rows = rows.slice().sort((a, b) => {
      if (sortBy === "amount") {
        return (Number(b?.GrandTotal) || 0) - (Number(a?.GrandTotal) || 0);
      }
      const da = whenOf(a).valueOf() || 0;
      const db = whenOf(b).valueOf() || 0;
      return sortBy === "oldest" ? da - db : db - da;
    });

    return rows;
  }, [enquiries, searchQuery, statusFilter, executiveFilter, fromDate, toDate, sortBy, stageOf]);

  // Any filter change invalidates the current page.
  useEffect(() => {
    setCurrentPage(1);
    setSelectedEnquiries([]);
  }, [searchQuery, statusFilter, executiveFilter, fromDate, toDate, sortBy, itemsPerPage]);

  useEffect(() => {
    if (!filtered.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    const stillThere = filtered.some((e) => e._id === activeId);
    if (!stillThere) setActiveId(filtered[0]._id);
  }, [filtered, activeId]);

  const activeEnquiry = useMemo(
    () => filtered.find((e) => e._id === activeId) || null,
    [filtered, activeId]
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const currentItems = filtered.slice(indexOfLastItem - itemsPerPage, indexOfLastItem);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete?")) return;
    try {
      const response = await axios.delete(`${ApiURL}/Enquiry/deleteEnquiry/${id}`);
      if (response.status === 200) {
        setEnquiries((prev) => prev.filter((e) => e._id !== id));
        setSelectedEnquiries((prev) => prev.filter((x) => x !== id));
        toast.success("Enquiry deleted");
      }
    } catch (error) {
      toast.error("Failed to delete enquiry");
    }
  };

  const handleSelectRow = (id) =>
    setSelectedEnquiries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSelectAll = () =>
    setSelectedEnquiries(
      selectedEnquiries.length === currentItems.length
        ? []
        : currentItems.map((e) => e._id)
    );

  const handleDeleteSelected = async () => {
    if (!selectedEnquiries.length) return;
    if (!window.confirm(`Delete ${selectedEnquiries.length} selected enquiries?`)) return;
    try {
      await Promise.all(
        selectedEnquiries.map((id) =>
          axios.delete(`${ApiURL}/Enquiry/deleteEnquiry/${id}`)
        )
      );
      setEnquiries((prev) => prev.filter((e) => !selectedEnquiries.includes(e._id)));
      setSelectedEnquiries([]);
      toast.success("Selected enquiries deleted");
    } catch (error) {
      toast.error("Failed to delete some enquiries");
    }
  };

  /* Exports exactly the rows the filters currently show. */
  const handleExport = () => {
    try {
      const rows = filtered.map((e, i) => ({
        "#": i + 1,
        "Enquiry Id": e?.enquiryId || "",
        Date: e?.enquiryDate || "",
        Time: e?.enquiryTime || "",
        Client: e?.clientName || "",
        Contact: e?.clientNo || "",
        Executive: e?.executivename || "",
        Amount: Number(e?.GrandTotal) || 0,
        Status: STAGE_LABEL[stageOf(e)] || "Pending",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Enquiries");
      worksheet["!cols"] = [
        { wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 22 },
        { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 10 },
      ];
      XLSX.writeFile(workbook, `enquiries-${moment().format("YYYY-MM-DD")}.xlsx`);
    } catch (error) {
      toast.error("Could not export the list");
    }
  };

  const tiles = [
    {
      key: "total",
      label: "Total Enquiries",
      value: stats.total,
      hint: "All time",
      icon: FaInbox,
      tone: "blue",
      trend: stats.trend,
    },
    {
      key: "open",
      label: "Not Confirmed",
      value: stats.open,
      hint: "Pending, quoted or cancelled",
      icon: FaRegClock,
      tone: "amber",
    },
    {
      key: "quoted",
      label: "Confirmed",
      value: stats.quoted,
      hint: "Became a confirmed order",
      icon: FaCheckCircle,
      tone: "green",
    },
  ];

  return (
    <Container fluid className="px-0">
      {/* ---- Page header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Enquiry Inbox</h2>
          <p className="eq-head__sub">
            Track, manage and convert enquiries into happy customers.
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
              onClick={() => navigate("/enquiry-calender")}
            >
              <FaRegCalendarAlt /> Calendar
            </button>
          </div>
          <Button className="eq-primary" onClick={() => navigate("/add-new-enquiry")}>
            <FaPlus /> Create Enquiry
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
              placeholder="Search by name, phone, enquiry id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search enquiries"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            {STAGES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
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
            <option value="amount">Highest Amount</option>
          </Form.Select>

          <div className="eq-filters__end">
            {selectedEnquiries.length > 0 ? (
              <Button
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedEnquiries.length}
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
                      selectedEnquiries.length === currentItems.length
                    }
                    onChange={handleSelectAll}
                    aria-label="Select all on this page"
                  />
                </th>
                <th>Enquiry</th>
                <th>Client</th>
                <th>Executive</th>
                <th className="text-end">Amount</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="text-center py-5">
                    <Spinner animation="border" size="sm" /> Loading enquiries...
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-5 eq-none">
                    No enquiries match these filters.
                  </td>
                </tr>
              ) : (
                currentItems.map((enq) => {
                  const stage = stageOf(enq);
                  return (
                    <tr
                      key={enq._id}
                      className={enq._id === activeId ? "is-active" : ""}
                      onClick={() => setActiveId(enq._id)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedEnquiries.includes(enq._id)}
                          onChange={() => handleSelectRow(enq._id)}
                          aria-label={`Select ${enq.enquiryId || "enquiry"}`}
                        />
                      </td>

                      <td>
                        <span className="eq-id">#{enq.enquiryId || "—"}</span>
                      </td>

                      <td>
                        <span className="eq-strong">
                          {enq.clientName || "Unnamed client"}
                        </span>
                        {enq.clientNo ? (
                          <span className="eq-sub">{enq.clientNo}</span>
                        ) : null}
                      </td>

                      <td>
                        {enq.executivename ? (
                          <span className="eq-person">
                            <span className="eq-avatar">
                              {initials(enq.executivename)}
                            </span>
                            {enq.executivename}
                          </span>
                        ) : (
                          <span className="eq-sub">Unassigned</span>
                        )}
                      </td>

                      <td className="text-end eq-amount">
                        &#8377;{inr(enq.GrandTotal)}
                      </td>

                      <td>
                        <span
                          className={`eq-pill is-${STAGE_TONE[stage] || "pending"}`}
                        >
                          {STAGE_LABEL[stage] || "Pending"}
                        </span>
                      </td>

                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="eq-actions">
                          <button
                            type="button"
                            className="eq-act is-view"
                            title="View"
                            onClick={() => navigate(`/enquiry-details/${enq._id}`)}
                          >
                            <MdVisibility />
                          </button>
                          <button
                            type="button"
                            className="eq-act is-edit"
                            title="Edit"
                            onClick={() => navigate(`/edit-enquiry/${enq._id}`)}
                          >
                            <FaEdit />
                          </button>
                          <button
                            type="button"
                            className="eq-act is-del"
                            title="Delete"
                            onClick={() => handleDelete(enq._id)}
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

      <EnquiryPeek
        enquiry={activeEnquiry}
        stageLabel={activeEnquiry ? STAGE_LABEL[stageOf(activeEnquiry)] : null}
        stageTone={activeEnquiry ? STAGE_TONE[stageOf(activeEnquiry)] : null}
        onClose={() => setActiveId(null)}
      />
      </div>
    </Container>
  );
};

export default EnquiryList;
