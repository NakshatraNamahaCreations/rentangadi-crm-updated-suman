import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import {
  FaRegCalendarAlt,
  FaHeadset,
  FaRegClock,
  FaCheckCircle,
  FaPlus,
  FaFileExport,
} from "react-icons/fa";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import moment from "moment";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import { ApiURL } from "../../api";
import RecordCalendar from "../../components/RecordCalendar";

/* The record carries one status string. "sent" means a quotation has gone
   out; anything else is still open. Only these two exist, so the calendar
   colours and the legend use exactly them. */
const isQuoted = (enq) => String(enq?.status || "").toLowerCase() === "sent";

const amountOf = (enq) => Number(enq?.GrandTotal ?? enq?.grandTotal) || 0;

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );


/* enquiryDate is DD-MM-YYYY; an enquiry sits on exactly one day. */
const datesOf = (enq) => {
  const d = moment(enq?.enquiryDate, "DD-MM-YYYY", true);
  return d.isValid() ? [d.format("YYYY-MM-DD")] : [];
};

const EnquiryCalender = () => {
  const navigate = useNavigate();

  const [enquiries, setEnquiries] = useState([]);
  const [visible, setVisible] = useState([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(() => moment().startOf("month"));

  useEffect(() => {
    const fetchEnquiry = async () => {
      try {
        setLoading(true);
        const month = cursor.format("YYYY-MM");
        const res = await axios.get(`${ApiURL}/Enquiry/getallEnquiry`, {
          params: { month },
        });
        if (res.status === 200) {
          const d = res.data;
          setEnquiries(Array.isArray(d) ? d : d?.enquiryData || d?.data || []);
        }
      } catch (error) {
        console.error("Error fetching enquiry data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchEnquiry();
  }, [cursor]);

  /* The calendar owns the filters and reports back what survived them, so the
     tiles and the export stay in step with what is on screen. */
  const handleVisibleChange = useCallback((rows) => setVisible(rows), []);

  const stats = useMemo(() => {
    const total = visible.length;
    const quoted = visible.filter(isQuoted).length;
    return {
      total,
      quoted,
      open: total - quoted,
      value: visible.reduce((s, e) => s + amountOf(e), 0),
    };
  }, [visible]);

  const handleExport = () => {
    try {
      const rows = visible.map((e, i) => ({
        "#": i + 1,
        "Enquiry Id": e?.enquiryId || "",
        Client: e?.clientName || "",
        Phone: e?.clientNo || "",
        "Event Date": e?.enquiryDate || "",
        "Time Slot": e?.enquiryTime || "",
        Executive: e?.executivename || "",
        "Grand Total": amountOf(e),
        Status: isQuoted(e) ? "Quoted" : "Open",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 13 },
        { wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Enquiries");
      XLSX.writeFile(wb, `enquiries-${cursor.format("YYYY-MM")}.xlsx`);
    } catch (error) {
      toast.error("Could not export the month");
    }
  };

  const tiles = [
    {
      key: "total",
      label: "Total Enquiries",
      value: stats.total,
      icon: FaHeadset,
      tone: "blue",
    },
    {
      key: "open",
      label: "Open",
      value: stats.open,
      icon: FaRegClock,
      tone: "amber",
    },
    {
      key: "quoted",
      label: "Quoted",
      value: stats.quoted,
      icon: FaCheckCircle,
      tone: "green",
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
          <h2 className="qc-head__title">Enquiry Calendar</h2>
          <p className="qc-head__sub">
            Every enquiry laid out by the date its event runs.
          </p>
        </div>
        <div className="qc-head__actions">
          <Button className="eq-ghost" onClick={handleExport}>
            <FaFileExport /> Export
          </Button>
          <Button
            className="eq-primary"
            onClick={() => navigate("/add-new-enquiry")}
          >
            <FaPlus /> New Enquiry
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
        records={enquiries}
        loading={loading}
        month={cursor}
        onMonthChange={setCursor}
        getDates={datesOf}
        getTitle={(e) => e.clientName || "Unnamed client"}
        getRef={(e) => e.enquiryId || ""}
        getSubtitle={(e) => e.enquiryTime || ""}
        getAmount={amountOf}
        isDone={isQuoted}
        unit="enquiries"
        unitOne="enquiry"
        cellUnit="enquiries"
        cellUnitOne="enquiry"
        doneLabel="Quoted"
        pendingLabel="Open"
        onSelect={(e) => navigate(`/enquiry-details/${e._id}`)}
        onVisibleChange={handleVisibleChange}
      />
    </div>
  );
};

export default EnquiryCalender;
