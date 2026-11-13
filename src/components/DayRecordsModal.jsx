import React, { useEffect, useState } from "react";
import { Modal, Spinner } from "react-bootstrap";
import axios from "axios";
import {
  FaRegCalendarAlt,
  FaArrowLeft,
  FaChevronRight,
  FaReceipt,
} from "react-icons/fa";
import { ApiURL } from "../api";
import {
  buildOrderItems,
  buildQuoteItems,
  computeOrderTotals,
  computeQuoteTotals,
  fmtMoney,
} from "../utils/orderTotals";

/**
 * What a day on a calendar is made of.
 *
 * Clicking the day's date opens this: the records that fall on it, and then
 * any one of their cost breakdowns - without leaving the calendar, so the
 * month being looked at is not lost.
 *
 * The list the calendar holds carries only the grand total; the rest of the
 * breakdown lives on the full record, so it is fetched when one is actually
 * opened rather than for every record on the day.
 */

/* Orders and quotations differ in where they are read from, what their lines
   are called and how their status reads. Everything else - the arithmetic
   included - is the same, so it is written once below. */
const KINDS = {
  order: {
    one: "Order",
    many: "Orders",
    title: "Orders on this date",
    empty: "No orders on this date.",
    backTo: "All orders on",
    missing: "That order could not be loaded.",
    url: (id) => `${ApiURL}/order/getOrder/${id}`,
    read: (data) => data?.order,
    build: buildOrderItems,
    compute: computeOrderTotals,
    /* An order can carry a second transport charge; a quotation cannot, so
       the row would only ever read zero there. */
    showAdditional: true,
    toneOf: (o) => {
      const v = String(o?.orderStatus || "").toLowerCase();
      if (v === "confirm") return { cls: "is-quoted", label: "Confirmed" };
      if (v === "cancelled") return { cls: "is-cancelled", label: "Cancelled" };
      return { cls: "is-open", label: o?.orderStatus || "—" };
    },
  },
  quotation: {
    one: "Quotation",
    many: "Quotations",
    title: "Quotations on this date",
    empty: "No quotations on this date.",
    backTo: "All quotations on",
    missing: "That quotation could not be loaded.",
    url: (id) => `${ApiURL}/quotations/getquotation/${id}`,
    read: (data) => data?.quoteData,
    build: buildQuoteItems,
    compute: computeQuoteTotals,
    /* "send" means it went to the client, which the calendar calls Confirmed;
       anything else is still pending. */
    toneOf: (q) => {
      const v = String(q?.status || "").toLowerCase();
      if (v === "send") return { cls: "is-quoted", label: "Confirmed" };
      if (v === "cancelled") return { cls: "is-cancelled", label: "Cancelled" };
      return { cls: "is-open", label: "Pending" };
    },
  },
};


/* The day's records added together, component by component. The parts a
   single record reports as percentages - discount and GST - are summed as
   amounts here, since each record carries its own rate. */
const sumTotals = (list) =>
  list.reduce(
    (acc, t) => ({
      productsTotal: acc.productsTotal + t.productsTotal,
      discountAmount: acc.discountAmount + t.discountAmount,
      totalBeforeCharges: acc.totalBeforeCharges + t.totalBeforeCharges,
      labour: acc.labour + t.labour,
      transport: acc.transport + t.transport,
      refurb: acc.refurb + t.refurb,
      additionalTransportation:
        acc.additionalTransportation + t.additionalTransportation,
      totalAfterCharges: acc.totalAfterCharges + t.totalAfterCharges,
      gstAmount: acc.gstAmount + t.gstAmount,
      grandTotalToShow: acc.grandTotalToShow + t.grandTotalToShow,
    }),
    {
      productsTotal: 0,
      discountAmount: 0,
      totalBeforeCharges: 0,
      labour: 0,
      transport: 0,
      refurb: 0,
      additionalTransportation: 0,
      totalAfterCharges: 0,
      gstAmount: 0,
      grandTotalToShow: 0,
    }
  );

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const DayRecordsModal = ({
  show,
  onHide,
  dateLabel,
  records = [],
  variant = "order",
}) => {
  const kind = KINDS[variant] || KINDS.order;

  /* null while the day's list is showing; an id once one is opened. */
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);
  /* One entry per record the day's breakdown could be read for. */
  const [dayDetails, setDayDetails] = useState([]);
  const [missingCount, setMissingCount] = useState(0);
  const [dayLoading, setDayLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Reopening on another day should start at that day's list. */
  useEffect(() => {
    if (!show) return;
    setOpenId(null);
    setDetail(null);
    setDayDetails([]);
    setMissingCount(0);
    setDayLoading(false);
    setError("");
  }, [show, dateLabel]);

  const readOne = async (id) => {
    const res = await axios.get(kind.url(id));
    return kind.read(res?.data);
  };

  /* What the day comes to is only on the full records - the list the
     calendar holds carries the grand total and nothing else - so every one
     of them is read when the day opens. One that cannot be read is left out
     and counted, rather than quietly making the day look smaller. */
  useEffect(() => {
    if (!show || !records.length) return;

    let cancelled = false;

    const fetchDay = async () => {
      setDayLoading(true);
      const settled = await Promise.allSettled(
        records.map((r) => readOne(r._id || r.id))
      );
      if (cancelled) return;

      const got = [];
      settled.forEach((x, i) => {
        const record = x.status === "fulfilled" ? x.value : null;
        if (record) got.push({ record, summary: records[i] });
      });

      setDayDetails(got);
      setMissingCount(records.length - got.length);
      setDayLoading(false);
    };

    fetchDay();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, dateLabel, variant, records]);

  useEffect(() => {
    if (!openId) return;

    let cancelled = false;

    const fetchRecord = async () => {
      setLoading(true);
      setError("");
      try {
        const record = await readOne(openId);
        if (cancelled) return;
        if (!record) {
          setDetail(null);
          setError(kind.missing);
          return;
        }
        setDetail(record);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setError(e?.response?.data?.message || kind.missing);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchRecord();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, variant]);

  const openedSummary = records.find(
    (r) => String(r._id || r.id) === String(openId)
  );
  const items = detail ? kind.build(detail) : [];
  const totals = detail ? kind.compute(detail, items) : null;

  /* The day as the sum of its records' own breakdowns. */
  const dayTotals = dayDetails.length
    ? sumTotals(
        dayDetails.map(({ record }) => kind.compute(record, kind.build(record)))
      )
    : null;

  /* The day in the parts the business reads it in. Transportation carries
     both charges where a record has two; Total is what would be billed,
     GST included, so the tax is named under it rather than left implied. */
  const dayBoxes = [
    {
      label: "Total",
      value: dayTotals?.grandTotalToShow,
      hint: dayTotals
        ? `incl. GST \u20B9${fmtMoney(dayTotals.gstAmount)}`
        : "",
    },
    { label: "Discounts", value: dayTotals?.discountAmount },
    { label: "Sub total / Rental", value: dayTotals?.productsTotal },
    {
      label: "Transportation",
      value: dayTotals
        ? dayTotals.transport + dayTotals.additionalTransportation
        : null,
    },
    { label: "Labour", value: dayTotals?.labour },
    { label: "Reupholstery", value: dayTotals?.refurb },
  ];

  /* Only the rows the invoice prints, in its order. Refurbishment is folded
     into Total there and has no row of its own, so it only appears when the
     record actually carries one. */
  const rows = totals
    ? [
        ["Sub total", totals.productsTotal],
        ...(totals.discountPercent > 0
          ? [
              [`Discount (${totals.discountPercent}%)`, -totals.discountAmount],
              ["After Discount", totals.totalBeforeCharges],
            ]
          : []),
        ["Man power", totals.labour],
        ["Transport", totals.transport],
        ...(kind.showAdditional
          ? [["Additional Transportation", totals.additionalTransportation]]
          : []),
        ...(totals.refurb > 0 ? [["Refurbishment", totals.refurb]] : []),
        ["Total", totals.totalAfterCharges],
        [`GST (${totals.gstPercent}%)`, totals.gstAmount],
      ]
    : [];

  return (
    <Modal show={show} onHide={onHide} centered size="lg" scrollable>
      <div className="uq-head">
        <div className="uq-head__icon">
          {openId ? <FaReceipt /> : <FaRegCalendarAlt />}
        </div>
        <div className="uq-head__text">
          <h5 className="uq-head__title">
            {openId ? "Cost Breakdown" : kind.title}
          </h5>
          <div className="uq-head__product">
            {openId
              ? openedSummary?.companyName ||
                openedSummary?.clientName ||
                kind.one
              : dateLabel || "—"}
          </div>
        </div>
        <button
          type="button"
          className="uq-head__close"
          onClick={onHide}
          aria-label="Close"
        >
          &times;
        </button>
      </div>

      <Modal.Body className="uq-body">
        {openId ? (
          <>
            <button
              type="button"
              className="dom-back"
              onClick={() => {
                setOpenId(null);
                setDetail(null);
                setError("");
              }}
            >
              <FaArrowLeft /> {kind.backTo} {dateLabel}
            </button>

            {loading ? (
              <div className="uq-empty">
                <Spinner animation="border" size="sm" /> Loading the breakdown...
              </div>
            ) : error ? (
              <div className="uq-empty">{error}</div>
            ) : totals ? (
              <>
                {items.length ? (
                  <div className="dom-items">
                    <span className="dom-items__title">
                      Items ({items.length})
                    </span>
                    <ul className="dom-items__list">
                      {items.map((it, i) => (
                        <li key={(it.productId || "") + i}>
                          <span className="dom-items__name">
                            {it.productName || "Item"}
                          </span>
                          <span className="dom-items__qty">
                            {it.quantity} &times; {it.days}{" "}
                            {it.days === 1 ? "day" : "days"}
                          </span>
                          <span className="dom-items__amt">
                            &#8377;{fmtMoney(it.amount)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="dom-sum">
                  <span className="dom-sum__title">Cost Summary</span>
                  <dl className="dom-sum__rows">
                    {rows.map(([label, value]) => (
                      <div key={label} className="dom-sum__row">
                        <dt>{label}</dt>
                        <dd>
                          {value < 0 ? "- " : ""}&#8377;
                          {fmtMoney(Math.abs(value))}
                        </dd>
                      </div>
                    ))}
                    <div className="dom-sum__row is-grand">
                      <dt>Grand Total</dt>
                      <dd>&#8377;{fmtMoney(totals.grandTotalToShow)}</dd>
                    </div>
                  </dl>
                </div>
              </>
            ) : null}

          </>
        ) : (
          <>
            <div className="uq-stats dom-stats">
              <div className="uq-stat">
                <span className="uq-stat__value">{records.length}</span>
                <span className="uq-stat__label">
                  {records.length === 1 ? kind.one : kind.many}
                </span>
              </div>

              {/* What the day comes to, in the parts it is read in. */}
              {dayBoxes.map((box) => (
                <div className="uq-stat" key={box.label}>
                  <span className="uq-stat__value">
                    {box.value == null ? (
                      "—"
                    ) : (
                      <>
                        &#8377;
                        {fmtMoney(box.value)}
                      </>
                    )}
                  </span>
                  <span className="uq-stat__label">{box.label}</span>
                  {box.hint ? (
                    <span className="dom-stat__hint">{box.hint}</span>
                  ) : null}
                </div>
              ))}
            </div>

            {dayLoading ? (
              <div className="dom-note is-quiet">
                <Spinner animation="border" size="sm" /> Adding up the day...
              </div>
            ) : missingCount ? (
              <div className="dom-note">
                {missingCount} of these could not be read, so{" "}
                {missingCount === 1 ? "it is" : "they are"} not in the figures
                above.
              </div>
            ) : null}

            {records.length ? (
              <div className="dom-list">
                {records.map((r) => {
                  const tone = kind.toneOf(r);
                  const id = r._id || r.id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="dom-row"
                      onClick={() => setOpenId(id)}
                    >
                      <span className="dom-row__avatar">
                        {initialsOf(r.companyName || r.clientName)}
                      </span>
                      <span className="dom-row__main">
                        <span className="dom-row__name">
                          {r.companyName || r.clientName || "Unnamed client"}
                        </span>
                        {r.Address || r.address ? (
                          <span className="dom-row__sub">
                            {r.Address || r.address}
                          </span>
                        ) : null}
                      </span>
                      <span className="dom-row__amt">
                        &#8377;{fmtMoney(r.GrandTotal ?? r.grandTotal)}
                      </span>
                      <span className={`eq-pill ${tone.cls}`}>{tone.label}</span>
                      <span className="dom-row__go" aria-hidden="true">
                        <FaChevronRight />
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="uq-empty">{kind.empty}</div>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default DayRecordsModal;
