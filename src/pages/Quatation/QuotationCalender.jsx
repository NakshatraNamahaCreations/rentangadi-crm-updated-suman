import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import {
  FaRegCalendarAlt,
  FaFileInvoiceDollar,
  FaRegClock,
  FaCheckCircle,
  FaPlus,
  FaFileExport,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import moment from "moment";
import * as XLSX from "xlsx";
import { ApiURL } from "../../api";
import RecordCalendar from "../../components/RecordCalendar";
import DayRecordsModal from "../../components/DayRecordsModal";
import { toast } from "react-hot-toast";

/* The record carries one status string. "send" means it has gone to the
   client; anything else is still pending. Only these two exist, so the
   calendar colours and the legend use exactly them. */
const isSent = (q) => String(q?.status || "").toLowerCase() === "send";

/* A cancelled quote is neither sent nor still pending. */
const isCancelled = (q) =>
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
  /* The day whose quotations are being looked at, or null. */
  const [dayBreakdown, setDayBreakdown] = useState(null);

  useEffect(() => {
    const fetchQuotations = async () => {
      try {
        setLoading(true);
        const month = cursor.format("YYYY-MM");
        /* No month filter exists on the API, so the cached full list is
           fetched and the calendar narrows it in memory. */
        const res = await axios.get(`${ApiURL}/quotations/getallquotations`);
        if (res.status === 200) {
          const d = res.data;
          setQuotations(Array.isArray(d) ? d : d?.quoteData || d?.data || []);
        }
      } catch (error) {
        console.error("Error fetching quotation data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchQuotations();
  }, [cursor]);

  /* The calendar owns the filters and reports back what survived them, so the
     tiles and the export stay in step with what is on screen. */
  const handleVisibleChange = useCallback((rows) => setVisible(rows), []);

  const stats = useMemo(() => {
    const total = visible.length;
    const sent = visible.filter(isSent).length;
    return {
      total,
      sent,
      pending: total - sent,
      value: visible.reduce((s, q) => s + amountOf(q), 0),
    };
  }, [visible]);

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
    { key: "total", label: "Total Quotes", value: stats.total, icon: FaFileInvoiceDollar, tone: "amber" },
    { key: "pending", label: "Pending", value: stats.pending, icon: FaRegClock, tone: "blue" },
    { key: "sent", label: "Confirmed", value: stats.sent, icon: FaCheckCircle, tone: "green" },
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
              <span className="eq-stat__value">{t.value}</span>
              <span className="eq-stat__hint">{cursor.format("MMMM YYYY")}</span>
            </div>
          </div>
        ))}
      </div>

      <RecordCalendar
        records={quotations}
        loading={loading}
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
