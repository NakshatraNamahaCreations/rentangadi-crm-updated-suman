import React from "react";
import { Modal } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  FaPhoneAlt,
  FaRegCalendarAlt,
  FaUserTie,
  FaArrowRight,
  FaInfoCircle,
  FaLock,
} from "react-icons/fa";

/**
 * Who is holding a product that is already committed.
 *
 * The inventory table shows a "Blocked" figure per product - stock held by
 * confirmed orders over the dates being looked at - next to "Under
 * Quotations", which opens a list of the quotations behind it. The blocked
 * figure had no such list, so it said how much was gone without saying where
 * it went. This is that list, deliberately the same shape and the same
 * markup as the quotations one so the two read alike.
 *
 * `/inventory/filter` returns the breakdown as `blockedOrders` on each stock
 * row; this component only renders it.
 *
 * One card per order slot, because a single order can hold the same product
 * over two separate date ranges.
 */

const qtyOf = (n) => Number(n) || 0;

/* Two letters from the client name for the avatar. */
const initialsOf = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/* Plenty of orders carry no orderId of their own, so the quotation they came
   from is the reference that is actually there to show. */
const refOf = (o) => {
  if (o?.orderId) return `#${o.orderId}`;
  if (o?.quoteId) return `${o.quoteId}`;
  return "—";
};

const BlockedOrdersModal = ({ show, onHide, row, startDate, endDate }) => {
  const navigate = useNavigate();

  const list = Array.isArray(row?.blockedOrders) ? row.blockedOrders : [];

  /* What the orders add up to across the whole window, and what the table's
     Blocked column says, which is the worst single day inside it. They differ
     whenever two bookings fall on different days, so both are shown rather
     than one standing in for the other. */
  const totalAcrossRange = list.reduce((sum, o) => sum + qtyOf(o.qty), 0);
  const peak = Number(row?.reservedStock) || 0;
  const spreadOut = totalAcrossRange > peak;

  /* Slots of one order are separate cards but not separate customers. */
  let lastOrder = null;

  const open = (o) => {
    if (!o?.orderDocId) return;
    onHide();
    navigate(`/orders-details/${o.orderDocId}`);
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" contentClassName="uq-modal">
      <div className="uq-head">
        <div className="uq-head__icon">
          <FaLock />
        </div>
        <div className="uq-head__text">
          <h5 className="uq-head__title">Blocked by orders</h5>
          <div className="uq-head__product">{row?.productName || "Product"}</div>
          {startDate && endDate ? (
            <span className="uq-head__range">
              <FaRegCalendarAlt size={11} />
              {startDate} &rarr; {endDate}
            </span>
          ) : null}
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
        {list.length === 0 ? (
          <div className="uq-empty">
            No confirmed orders hold this product over these dates.
          </div>
        ) : (
          <>
            <div className="uq-stats">
              <div className="uq-stat">
                <span className="uq-stat__value">{list.length}</span>
                <span className="uq-stat__label">
                  Order{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="uq-stat">
                <span className="uq-stat__value">{peak}</span>
                <span className="uq-stat__label">Blocked at once</span>
              </div>
              <div className="uq-stat">
                <span className="uq-stat__value">
                  {Number(row?.availableStock) || 0}
                </span>
                <span className="uq-stat__label">Available stock</span>
              </div>
            </div>

            {spreadOut ? (
              <div className="uq-note">
                <FaInfoCircle size={13} />
                <span>
                  These orders come to <strong>{totalAcrossRange}</strong> units
                  over the whole range, but they fall on different days, so at
                  most <strong>{peak}</strong> are ever held at the same time.
                  That is the figure in the Blocked column.
                </span>
              </div>
            ) : null}

            <div className="uq-list">
              {list.map((o, i) => {
                const id = o.orderDocId;
                const repeat = lastOrder !== null && lastOrder === id;
                lastOrder = id;

                return (
                  <div
                    className="uq-card"
                    key={`${id}-${o.quoteDate}-${i}`}
                    role={id ? "button" : undefined}
                    tabIndex={id ? 0 : undefined}
                    onClick={() => open(o)}
                    onKeyDown={(e) => {
                      if (!id) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        open(o);
                      }
                    }}
                  >
                    <div className="uq-card__avatar">
                      {initialsOf(o.clientName)}
                    </div>

                    <div className="uq-card__main">
                      <div className="uq-card__top">
                        <span className="uq-card__client">
                          {o.clientName || "Unnamed client"}
                        </span>
                        <span className="uq-card__ref">{refOf(o)}</span>
                        <span className="uq-card__status">Confirmed</span>
                        {repeat ? (
                          <span className="uq-card__repeat">
                            second date range
                          </span>
                        ) : null}
                      </div>

                      <div className="uq-card__meta">
                        {o.clientNo ? (
                          <a
                            className="uq-card__phone"
                            href={`tel:${o.clientNo}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FaPhoneAlt size={10} />
                            {o.clientNo}
                          </a>
                        ) : (
                          <span className="uq-card__muted">
                            <FaPhoneAlt size={10} />
                            no phone on record
                          </span>
                        )}
                        <span className="uq-card__muted">
                          <FaUserTie size={11} />
                          {o.executivename || "Unassigned"}
                        </span>
                        <span className="uq-card__muted">
                          <FaRegCalendarAlt size={11} />
                          {o.quoteDate || "—"} &rarr; {o.endDate || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="uq-card__qty">
                      <span className="uq-card__qty-value">{qtyOf(o.qty)}</span>
                      <span className="uq-card__qty-label">units</span>
                    </div>

                    {id ? (
                      <span className="uq-card__go" aria-hidden="true">
                        <FaArrowRight size={12} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <p className="uq-foot">
              Confirmed orders only. Stock sitting in pending quotations is
              counted separately, under Under Quotations.
            </p>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default BlockedOrdersModal;
