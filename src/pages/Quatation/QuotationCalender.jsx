import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import {
  FaRegCalendarAlt,
  FaFileInvoiceDollar,
  FaRegClock,
  FaCheckCircle,
  FaPlus,
  FaFileExport,
  FaBan,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import moment from "moment";
import * as XLSX from "xlsx";
import { ApiURL } from "../../api";
import RecordCalendar from "../../components/RecordCalendar";
import DayRecordsModal from "../../components/DayRecordsModal";
import {
  buildOrderStateByQuote,
  loadOrderSources,
} from "../../utils/enquiryStage";
import { toast } from "react-hot-toast";

/* The record's own word for itself. An order raised from a quote can be
   called off afterwards, and the quote then still says "send" - so the page
   reads both, below. */
const quoteSaysSent = (q) =>
  String(q?.status || "").toLowerCase() === "send";

const quoteSaysCancelled = (q) =>
  String(q?.status || "").toLowerCase() === "cancelled";

const amountOf = (q) => Number(q?.GrandTotal ?? q?.grandTotal) || 0;

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );


/* quoteDate is DD-MM-YYYY; a quotation sits on exactly one day. */
const datesOf = (q) => {
  const d = moment(q?.quoteDate, "DD-MM-YYYY", true);
  return d.isValid() ? [d.format("YYYY-MM-DD")] : [];
};

const QuotationCalendar = () => {
  const navigate = useNavigate();

  const [quotations, setQuotations] = useState([]);
  const [visible, setVisible] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => moment().startOf("month"));
  /* quoteId -> what became of the order raised from it. */
  const [orderState, setOrderState] = useState(() => new Map());
  /* False until that is known - see the note in the list. */
  const [ordersReady, setOrdersReady] = useState(false);

  /* Read once: the orders do not change with the month on screen. A failure
     costs only the cancelled wording; the calendar still draws. */
  useEffect(() => {
    let alive = true;
    loadOrderSources((rows, settled) => {
      if (!alive) return;
      setOrderState(buildOrderStateByQuote(rows));
      if (settled) setOrdersReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

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
  /* The day whose quotations are being looked at, or null. */
  const [dayBreakdown, setDayBreakdown] = useState(null);

  /* No month filter exists on the API, so the whole list is fetched and the
     calendar narrows it in memory - and it is fetched twice, started
     together, for the reason given in the list: the copy the server keeps
     answers in about a second and draws the grid, while the uncached read
     costs seven and quietly replaces it, so a quote raised in the last
     couple of minutes still turns up. */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const rowsOf = (d) =>
      Array.isArray(d) ? d : d?.quoteData || d?.data || [];

    const held = axios
      .get(`${ApiURL}/quotations/getallquotations`)
      .then((res) => {
        if (!alive || res.status !== 200) return;
        /* Only if the fresher read has not already answered. */
        setQuotations((have) => (have.length ? have : rowsOf(res.data)));
        setLoading(false);
      })
      .catch((error) => console.error("Error fetching quotation data:", error));

    const fresh = axios
      .get(`${ApiURL}/quotations/getallquotations?limit=100000&page=1`)
      .then((res) => {
        if (!alive || res.status !== 200) return;
        setQuotations(rowsOf(res.data));
      })
      .catch((error) =>
        console.error("Error refreshing quotation data:", error)
      );

    /* Even if both failed, the calendar must stop saying it is loading. */
    Promise.allSettled([held, fresh]).then(() => {
      if (alive) setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [cursor]);

  /* The calendar owns the filters and reports back what survived them, so the
     tiles and the export stay in step with what is on screen. */
  const handleVisibleChange = useCallback((rows) => setVisible(rows), []);

  const stats = useMemo(() => {
    const total = visible.length;
    const sent = visible.filter(isSent).length;
    const cancelled = visible.filter(isCancelled).length;
    return {
      total,
      sent,
      cancelled,
      pending: total - sent - cancelled,
      value: visible.reduce((s, q) => s + amountOf(q), 0),
    };
  }, [visible, isSent, isCancelled]);

  const handleExport = () => {
    try {
      const rows = visible.map((q, i) => ({
        "#": i + 1,
        "Quote Id": q?.quoteId || "",
        Client: q?.clientName || "",
        "Event Date": q?.quoteDate || "",
        "Time Slot": q?.quoteTime || "",
        Executive: q?.executivename || "",
        "Grand Total": amountOf(q),
        Status: isSent(q) ? "Confirmed" : "Pending",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quotations");
      ws["!cols"] = [
        { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 13 },
        { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 10 },
      ];
      XLSX.writeFile(wb, `quotations-${cursor.format("YYYY-MM")}.xlsx`);
    } catch (error) {
      toast.error("Could not export the month");
    }
  };

  const tiles = [
    {
      key: "total",
      label: "Total Quotes",
      value: stats.total,
      icon: FaFileInvoiceDollar,
      tone: "amber",
    },
    /* Stage tallies, so null until the orders are read - none counted is
       not the same as none. */
    {
      key: "pending",
      label: "Pending",
      value: ordersReady ? stats.pending : null,
      icon: FaRegClock,
      tone: "blue",
    },
    {
      key: "sent",
      label: "Confirmed",
      value: ordersReady ? stats.sent : null,
      icon: FaCheckCircle,
      tone: "green",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: ordersReady ? stats.cancelled : null,
      icon: FaBan,
      tone: "grey",
    },
  ];

  return (
    <div className="qc">
      {/* ---- Header ---- */}
      <div className="qc-head">
        <span className="qc-head__icon">
          <FaRegCalendarAlt />
        </span>
        <div className="qc-head__text">
          <h2 className="qc-head__title">Quotation Calendar</h2>
          <p className="qc-head__sub">Plan and manage all raised quotations by date.</p>
        </div>
        <div className="qc-head__actions">
          <Button className="eq-ghost" onClick={handleExport}>
            <FaFileExport /> Export
          </Button>
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
                {loading || t.value == null ? "—" : t.value}
              </span>
              <span className="eq-stat__hint">{cursor.format("MMMM YYYY")}</span>
            </div>
          </div>
        ))}
      </div>

      <RecordCalendar
        records={quotations}
        loading={loading}
        /* The grid draws from the quotations; only the status waits. */
        stagesReady={ordersReady}
        month={cursor}
        onMonthChange={setCursor}
        getDates={datesOf}
        getTitle={(q) => q.clientName || "Unnamed client"}
        getRef={(q) => q.quoteId || ""}
        getSubtitle={(q) => q.quoteTime || ""}
        getAmount={amountOf}
        isDone={isSent}
        isCancelled={isCancelled}
        unit="quotations"
        unitOne="quotation"
        cellUnit="quotes"
        doneLabel="Confirmed"
        pendingLabel="Pending"
        onAmountClick={({ date, records }) =>
          setDayBreakdown({
            dateLabel: date?.isValid?.() ? date.format("DD MMM YYYY") : "",
            quotations: records,
          })
        }
        onSelect={(q) => navigate(`/quotation-details/${q._id}`)}
        onVisibleChange={handleVisibleChange}
      />

      <DayRecordsModal
        show={Boolean(dayBreakdown)}
        onHide={() => setDayBreakdown(null)}
        dateLabel={dayBreakdown?.dateLabel}
        records={dayBreakdown?.quotations || []}
        variant="quotation"
      />
    </div>
  );
};

export default QuotationCalendar;
