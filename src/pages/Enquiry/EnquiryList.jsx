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

/* An enquiry is "Quoted" once a quotation has been generated for it; anything
   else is still open. These are the only two states the record carries. */
const isQuoted = (enq) => String(enq?.status || "").toLowerCase() === "sent";

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

  useEffect(() => {
    const fetchEnquiries = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${ApiURL}/Enquiry/getallEnquiry`);
        if (res.status === 200) {
          setEnquiries(Array.isArray(res.data) ? res.data : res.data?.data || []);
        }
      } catch (error) {
        console.error("Error fetching enquiries:", error);
      }
      setLoading(false);
    };
    fetchEnquiries();
  }, []);

  /* ---- Stat tiles, all computed from the fetched list ---- */
  const stats = useMemo(() => {
    const total = enquiries.length;
    const quoted = enquiries.filter(isQuoted).length;
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
  }, [enquiries]);

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
      if (statusFilter === "open" && isQuoted(e)) return false;
      if (statusFilter === "quoted" && !isQuoted(e)) return false;
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
  }, [enquiries, searchQuery, statusFilter, executiveFilter, fromDate, toDate, sortBy]);

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
        Status: isQuoted(e) ? "Quoted" : "Open",
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
      label: "Open",
      value: stats.open,
      hint: "No quotation yet",
      icon: FaRegClock,
      tone: "amber",
    },
    {
      key: "quoted",
      label: "Quoted",
      value: stats.quoted,
      hint: "Quotation created",
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
            <option value="open">Open</option>
            <option value="quoted">Quoted</option>
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
                  const quoted = isQuoted(enq);
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
                        <span className={`eq-pill ${quoted ? "is-quoted" : "is-open"}`}>
                          {quoted ? "Quoted" : "Open"}
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

      <EnquiryPeek enquiry={activeEnquiry} onClose={() => setActiveId(null)} />
      </div>
    </Container>
  );
};

export default EnquiryList;
