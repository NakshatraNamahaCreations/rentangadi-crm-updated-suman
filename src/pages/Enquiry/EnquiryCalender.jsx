import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "react-bootstrap";
import {
  FaRegCalendarAlt,
  FaHeadset,
  FaRegClock,
  FaCheckCircle,
  FaTimesCircle,
  FaFileInvoiceDollar,
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
import {
  STAGES,
  STAGE_LABEL,
  buildStageMap,
  stageFromMap,
  loadStageSources,
} from "../../utils/enquiryStage";

/* The same four stages the enquiry list shows, in the calendar's own two
   palettes: `tone` names the dot and the day badge, where green is called
   "sent" for historical reasons, and `pill` names the badge on a row, where
   it is called "confirmed". */
const CALENDAR_TONE = {
  pending: "pending",
  sent: "quoted",
  confirmed: "confirmed",
  cancelled: "cancelled",
};

const CALENDAR_STAGES = STAGES.map((stage) => ({
  value: stage.value,
  label: stage.label,
  tone: CALENDAR_TONE[stage.value],
  pill: `is-${stage.tone}`,
}));

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
  const [quotations, setQuotations] = useState([]);
  const [orders, setOrders] = useState([]);
  /* False until the two lists the stage is read from are in hand. */
  const [stagesReady, setStagesReady] = useState(false);

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

  /* How far each enquiry got lives in its quotation and in the order raised
     from that quotation, so both lists are read once - they do not change
     with the month on screen. A list that fails costs the stage column and
     nothing else; the calendar still draws. */
  useEffect(() => {
    let alive = true;
    loadStageSources((quotes, orders, settled) => {
      if (!alive) return;
      setQuotations(quotes);
      setOrders(orders);
      /* Settled even when a list failed: the stage then falls back to
         Pending, which is the honest answer when there is nothing to
         read, and the page must not wait for ever. */
      if (settled) setStagesReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const stageMap = useMemo(
    () => buildStageMap(quotations, orders),
    [quotations, orders]
  );

  const stageOf = useCallback(
    (enq) => stageFromMap(stageMap, enq),
    [stageMap]
  );

  /* The calendar owns the filters and reports back what survived them, so the
     tiles and the export stay in step with what is on screen. */
  const handleVisibleChange = useCallback((rows) => setVisible(rows), []);

  const stats = useMemo(() => {
    const at = (value) => visible.filter((e) => stageOf(e) === value).length;
    return {
      total: visible.length,
      pending: at("pending"),
      sent: at("sent"),
      confirmed: at("confirmed"),
      cancelled: at("cancelled"),
      value: visible.reduce((s, e) => s + amountOf(e), 0),
    };
  }, [visible, stageOf]);

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
        Status: STAGE_LABEL[stageOf(e)] || STAGE_LABEL.pending,
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
      key: "pending",
      label: STAGE_LABEL.pending,
      /* A tally of stages, so it waits for them. */
      value: stagesReady ? stats.pending : null,
      icon: FaRegClock,
      tone: "amber",
    },
    {
      key: "sent",
      label: STAGE_LABEL.sent,
      /* A tally of stages, so it waits for them. */
      value: stagesReady ? stats.sent : null,
      icon: FaFileInvoiceDollar,
      tone: "violet",
    },
    {
      key: "confirmed",
      label: STAGE_LABEL.confirmed,
      /* A tally of stages, so it waits for them. */
      value: stagesReady ? stats.confirmed : null,
      icon: FaCheckCircle,
      tone: "green",
    },
    {
      key: "cancelled",
      label: STAGE_LABEL.cancelled,
      /* A tally of stages, so it waits for them. */
      value: stagesReady ? stats.cancelled : null,
      icon: FaTimesCircle,
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

      {/* The month's enquiries are one quick call away and the calendar is
          made of them, so it is drawn as soon as they land. How far each
          one got needs the quotation and order lists as well, which are
          megabytes against a backend that does not project the keys - so
          the page no longer waits on them. stagesReady carries that down:
          the days show their size, the pills say they are still being
          worked out, and no status is shown before it is known. */}
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
        stages={CALENDAR_STAGES}
        stageOf={stageOf}
        stagesReady={stagesReady}
        unit="enquiries"
        unitOne="enquiry"
        cellUnit="enquiries"
        cellUnitOne="enquiry"
        onSelect={(e) => navigate(`/enquiry-details/${e._id}`)}
        onVisibleChange={handleVisibleChange}
      />
    </div>
  );
};

export default EnquiryCalender;
