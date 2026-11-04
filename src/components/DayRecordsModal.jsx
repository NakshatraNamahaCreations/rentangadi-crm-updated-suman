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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* Reopening on another day should start at that day's list. */
  useEffect(() => {
    if (!show) return;
    setOpenId(null);
    setDetail(null);
    setError("");
  }, [show, dateLabel]);

  useEffect(() => {
    if (!openId) return;

    let cancelled = false;
    const fetchRecord = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(kind.url(openId));
        const record = kind.read(res?.data);
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
  }, [openId, variant]);

  const openedSummary = records.find(
    (r) => String(r._id || r.id) === String(openId)
  );
  const items = detail ? kind.build(detail) : [];
  const totals = detail ? kind.compute(detail, items) : null;

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
            </div>

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
