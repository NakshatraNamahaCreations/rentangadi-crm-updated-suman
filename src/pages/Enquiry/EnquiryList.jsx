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
import {
  STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  buildStageMap,
  stageFromMap,
  rowsCarryStage,
  loadStageSources,
} from "../../utils/enquiryStage";
import Pagination from "../../components/Pagination";
import { toast } from "react-hot-toast";
import BusyButton from "../../components/BusyButton";
import ConfirmPasswordModal from "../../components/ConfirmPasswordModal";

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );


/**
 * The three dates an enquiry carries, and which field each one is in.
 *
 * enquiryDate is NOT when the enquiry came in - it is the delivery date. The
 * enquiry form fills it from the "Delivery date" picker and endDate from
 * "Dismantle date", and the detail screen labels them that way. When the
 * enquiry was raised is createdAt, which every one of the 1,894 rows has.
 *
 * Most rows write the two event dates DD-MM-YYYY and eighteen write
 * YYYY-MM-DD, so both are read; anything else shows as a dash rather than as
 * "Invalid date".
 */
const showEventDate = (value) => {
  const on = moment(value, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
  return on.isValid() ? on.format("DD-MM-YYYY") : "—";
};

const showRaised = (enq) => {
  const on = enq?.createdAt ? moment(enq.createdAt) : null;
  return on && on.isValid() ? on.format("DD-MM-YYYY") : "—";
};

/**
 * What an enquiry is worth.
 *
 * Not its stored GrandTotal, which is a single day of hire: not one of the
 * 1,909 enquiries carries the rental days in that figure, so on the 410 that
 * run longer than a day the list understated the job - enquiry 2283 showed
 * 57,000 against a 32 day booking worth 1,824,000.
 *
 * Once a quotation has been raised, that quotation's total is the number
 * everyone else works from, and it is what the enquiry's own detail screen
 * shows, so the list shows it too and the two stop disagreeing. The backend
 * sends it as quotedTotal.
 *
 * Before any quotation there is nothing to defer to, so the enquiry's own
 * figure is used and the days are applied to it. GST on an enquiry is a
 * rupee amount sitting inside GrandTotal, so it is taken out, the lines are
 * multiplied by the days, and it goes back on at the same rate.
 */
const enquiryValue = (enq) => {
  const quoted = Number(enq?.quotedTotal) || 0;
  if (quoted > 0) return quoted;

  const stored = Number(enq?.GrandTotal) || 0;
  const gst = Number(enq?.GST) || 0;
  const lines = stored - gst;

  if (lines <= 0) return stored;

  const start = moment(enq?.enquiryDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
  const end = moment(enq?.endDate, ["DD-MM-YYYY", "YYYY-MM-DD"], true);
  const days =
    start.isValid() && end.isValid()
      ? Math.max(1, end.diff(start, "days") + 1)
      : 1;

  if (days === 1) return stored;

  const gstRate = gst / lines;
  return Math.round(lines * days * (1 + gstRate));
};

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
  /* False until the two lists the stage is read from are in hand. */
  const [stagesReady, setStagesReady] = useState(false);
  const navigate = useNavigate();

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  /* The enquiries themselves, which is what the table is made of. */
  useEffect(() => {
    const fetchEnquiries = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${ApiURL}/Enquiry/getallEnquiry`);
        if (res?.status === 200) {
          const d = res.data;
          setEnquiries(Array.isArray(d) ? d : d?.data || []);
        }
      } catch (error) {
        console.error("Error fetching enquiries:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEnquiries();
  }, []);

  /* The rows carry their own stage when the API is new enough to send it. */
  const carriesStage = useMemo(() => rowsCarryStage(enquiries), [enquiries]);

  /**
   * How far each enquiry got.
   *
   * The API sends this with the row now, so the usual path is to notice that
   * and do nothing: no second and third list, no join in the browser, and no
   * window where the status filters read zero because only one of three
   * downloads had finished.
   *
   * The join is kept for a backend that does not send it - the same build of
   * this panel is pointed at more than one - and reports in as its lists
   * improve. A list that fails costs the stage and nothing else.
   */
  useEffect(() => {
    /* Nothing to decide until the enquiries are in: with no rows yet, "do
       they carry a stage?" is always no, and the join would start before the
       answer could be known - which is how both lists were still being
       downloaded after this was supposed to have made them unnecessary. */
    if (loading) return undefined;

    if (carriesStage || !enquiries.length) {
      setStagesReady(true);
      return undefined;
    }

    let alive = true;
    loadStageSources((quotes, orders, settled) => {
      if (!alive) return;
      setQuotations(quotes);
      setOrders(orders);
      /* Settled even when a list failed: the stage then falls back to
         Pending, which is the honest answer when there is nothing left to
         read, and the screen must not wait for ever. */
      if (settled) setStagesReady(true);
    });
    return () => {
      alive = false;
    };
  }, [loading, carriesStage, enquiries.length]);
  const stageMap = useMemo(
    () => buildStageMap(quotations, orders),
    [quotations, orders]
  );

  const stageOf = React.useCallback(
    (enq) => stageFromMap(stageMap, enq),
    [stageMap]
  );

  /* ---- Stat tiles, all computed from the fetched list ---- */
  const stats = useMemo(() => {
    const total = enquiries.length;
    const quoted = enquiries.filter((e) => stageOf(e) === "confirmed").length;
    const open = total - quoted;
    const value = enquiries.reduce((s, e) => s + enquiryValue(e), 0);

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
        return enquiryValue(b) - enquiryValue(a);
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

  const indexOfLastItem = currentPage * itemsPerPage;
  const currentItems = filtered.slice(indexOfLastItem - itemsPerPage, indexOfLastItem);

  /**
   * Deleting asks for the admin password.
   *
   * The window.confirm it replaces was one click, from a screen that may
   * have been left open - and an enquiry carries a client's history and the
   * money quoted against it. The password is checked on the server
   * (middleware/confirmPassword.js); this only collects it.
   */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const askToDelete = (ids) => {
    setDeleteError("");
    setPendingDelete(ids);
  };

  const handleDelete = (id) => askToDelete([id]);

  const runDelete = async (password) => {
    const ids = pendingDelete || [];
    setDeleting(true);
    setDeleteError("");

    try {
      /* One at a time, so a wrong password is reported once rather than as
         a row of identical failures. */
      for (const id of ids) {
        await axios.delete(`${ApiURL}/Enquiry/deleteEnquiry/${id}`, {
          data: { password },
        });
      }

      setEnquiries((prev) => prev.filter((e) => !ids.includes(e._id)));
      setSelectedEnquiries((prev) => prev.filter((x) => !ids.includes(x)));
      setPendingDelete(null);
      toast.success(
        ids.length === 1 ? "Enquiry deleted" : `${ids.length} enquiries deleted`
      );
    } catch (error) {
      const status = error?.response?.status;
      const message = error?.response?.data?.error;

      /* A rejected password keeps the dialog open to be retyped; anything
         else is a real failure and is reported as one. */
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
    setSelectedEnquiries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSelectAll = () =>
    setSelectedEnquiries(
      selectedEnquiries.length === currentItems.length
        ? []
        : currentItems.map((e) => e._id)
    );

  const handleDeleteSelected = () => {
    if (!selectedEnquiries.length) return;
    askToDelete([...selectedEnquiries]);
  };

  /* Exports exactly the rows the filters currently show. */
  const handleExport = () => {
    try {
      const rows = filtered.map((e, i) => ({
        "#": i + 1,
        "Enquiry Id": e?.enquiryId || "",
        /* The old sheet had one column called "Date" holding enquiryDate,
           which is the delivery date - named that way it read as the day the
           enquiry came in. All three are now named for what they are. */
        "Enquiry Date": showRaised(e),
        "Delivery Date": showEventDate(e?.enquiryDate),
        "Dismantle Date": showEventDate(e?.endDate),
        Slot: e?.enquiryTime || "",
        Client: e?.clientName || "",
        Contact: e?.clientNo || "",
        Executive: e?.executivename || "",
        Amount: enquiryValue(e),
        Status: STAGE_LABEL[stageOf(e)] || "Pending",
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Enquiries");
      worksheet["!cols"] = [
        { wch: 5 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
        { wch: 22 }, { wch: 28 }, { wch: 14 }, { wch: 18 }, { wch: 12 },
        { wch: 10 },
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
      /* A tally of stages, so it holds until they are known. Counted
         early it would read as every enquiry, which is a guess. */
      value: stagesReady ? stats.open : null,
      hint: "Pending, quoted or cancelled",
      icon: FaRegClock,
      tone: "amber",
    },
    {
      key: "quoted",
      label: "Confirmed",
      value: stagesReady ? stats.quoted : null,
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
              <span className="eq-stat__value">
                {t.value == null ? "—" : t.value}
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
              placeholder="Search by name, phone, enquiry id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search enquiries"
            />
          </div>

          {/* Opens a moment after the table, once the stage behind each
              row is known; filtering on a guess would hide the wrong
              enquiries. */}
          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            disabled={!stagesReady}
            title={
              stagesReady ? undefined : "Reading where each enquiry stands"
            }
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
              <BusyButton
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedEnquiries.length}
              </BusyButton>
            ) : null}
            <Button className="eq-ghost" onClick={handleExport}>
              <FaFileExport /> Export
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ---- Table ---- */}
      <Card className="eq-card">
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
                <th className="eq-date-col">Enquiry Date</th>
                <th className="eq-date-col">Delivery</th>
                <th className="eq-date-col">Dismantle</th>
                <th>Executive</th>
                <th className="text-end">Amount</th>
                <th>Status</th>
                <th className="text-end">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="10" className="text-center py-5">
                    <Spinner animation="border" size="sm" /> Loading enquiries...
                  </td>
                </tr>
              ) : currentItems.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-5 eq-none">
                    No enquiries match these filters.
                  </td>
                </tr>
              ) : (
                currentItems.map((enq) => {
                  const stage = stageOf(enq);
                  return (
                    <tr key={enq._id}>
                      <td>
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

                      <td className="eq-date-col">{showRaised(enq)}</td>

                      <td className="eq-date-col">
                        {showEventDate(enq.enquiryDate)}
                      </td>

                      <td className="eq-date-col">
                        {showEventDate(enq.endDate)}
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
                        &#8377;{inr(enquiryValue(enq))}
                      </td>

                      <td>
                        {stagesReady ? (
                          <span
                            className={`eq-pill is-${STAGE_TONE[stage] || "pending"}`}
                          >
                            {STAGE_LABEL[stage] || "Pending"}
                          </span>
                        ) : (
                          /* Reading it still; a word here would be a guess. */
                          <span className="eq-pill is-waiting" title="Working out where this enquiry stands">
                            &hellip;
                          </span>
                        )}
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
            loading={loading}
          />
        </div>
      </Card>

      <ConfirmPasswordModal
        show={Boolean(pendingDelete)}
        onHide={() => setPendingDelete(null)}
        onConfirm={runDelete}
        busy={deleting}
        error={deleteError}
        title={
          (pendingDelete || []).length > 1
            ? `Delete ${pendingDelete.length} enquiries?`
            : "Delete this enquiry?"
        }
        message={
          (pendingDelete || []).length > 1
            ? `${pendingDelete.length} enquiries and everything recorded against them will be removed.`
            : "The enquiry and everything recorded against it will be removed."
        }
        confirmLabel={
          (pendingDelete || []).length > 1
            ? `Delete ${pendingDelete.length}`
            : "Delete enquiry"
        }
      />
    </Container>
  );
};

export default EnquiryList;
