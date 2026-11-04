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
  computeOrderTotals,
  fmtMoney,
} from "../utils/orderTotals";

/**
 * What a day's money is made of.
 *
 * The calendar shows one figure per day. Clicking it opens this: the orders
 * that add up to it, and then any one of their cost breakdowns - without
 * leaving the calendar, so the month being looked at is not lost.
 *
 * The order list the calendar holds carries only the grand total; the rest of
 * the breakdown lives on the full record, so it is fetched when an order is
 * actually opened rather than for every order on the day.
 */

const initialsOf = (name) => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const statusToneOf = (order) => {
  const v = String(order?.orderStatus || "").toLowerCase();
  if (v === "confirm") return { cls: "is-quoted", label: "Confirmed" };
  if (v === "cancelled") return { cls: "is-cancelled", label: "Cancelled" };
  return { cls: "is-open", label: order?.orderStatus || "—" };
};

const DayOrdersModal = ({ show, onHide, dateLabel, orders = [], total = 0 }) => {
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
    const fetchOrder = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${ApiURL}/order/getOrder/${openId}`);
        const o = res?.data?.order;
        if (cancelled) return;
        if (!o) {
          setDetail(null);
          setError("That order could not be loaded.");
          return;
        }
        setDetail(o);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setError(
            e?.response?.data?.message || "That order could not be loaded."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOrder();
    return () => {
      cancelled = true;
    };
  }, [openId]);

  const openedSummary = orders.find((o) => String(o._id || o.id) === String(openId));
  const items = detail ? buildOrderItems(detail) : [];
  const totals = detail ? computeOrderTotals(detail, items) : null;

  /* Only the rows the invoice prints, in its order. Refurbishment is folded
     into Total there and has no row of its own, so it only appears when the
     order actually carries one. */
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
        ["Additional Transportation", totals.additionalTransportation],
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
            {openId ? "Cost Breakdown" : "Orders on this date"}
          </h5>
          <div className="uq-head__product">
            {openId
              ? openedSummary?.companyName ||
                openedSummary?.clientName ||
                "Order"
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
              <FaArrowLeft /> All orders on {dateLabel}
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
            <div className="uq-stats">
              <div className="uq-stat">
                <span className="uq-stat__value">{orders.length}</span>
                <span className="uq-stat__label">
                  {orders.length === 1 ? "Order" : "Orders"}
                </span>
              </div>
              <div className="uq-stat">
                <span className="uq-stat__value">
                  &#8377;{fmtMoney(total)}
                </span>
                <span className="uq-stat__label">Day total</span>
              </div>
            </div>

            {orders.length ? (
              <div className="dom-list">
                {orders.map((o) => {
                  const tone = statusToneOf(o);
                  const id = o._id || o.id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="dom-row"
                      onClick={() => setOpenId(id)}
                    >
                      <span className="dom-row__avatar">
                        {initialsOf(o.companyName || o.clientName)}
                      </span>
                      <span className="dom-row__main">
                        <span className="dom-row__name">
                          {o.companyName || o.clientName || "Unnamed client"}
                        </span>
                        {o.Address || o.address ? (
                          <span className="dom-row__sub">
                            {o.Address || o.address}
                          </span>
                        ) : null}
                      </span>
                      <span className="dom-row__amt">
                        &#8377;{fmtMoney(o.GrandTotal ?? o.grandTotal)}
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
              <div className="uq-empty">No orders on this date.</div>
            )}
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default DayOrdersModal;
