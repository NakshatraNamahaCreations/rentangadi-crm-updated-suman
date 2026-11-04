import React from "react";
import { Modal } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import {
  FaPhoneAlt,
  FaRegCalendarAlt,
  FaUserTie,
  FaArrowRight,
  FaExclamationTriangle,
  FaLayerGroup,
} from "react-icons/fa";

/**
 * Who is holding a product.
 *
 * The inventory tables show an "Under Quotations" figure per product, which is
 * the total quantity sitting in pending quotations over the dates being looked
 * at. The figure alone does not say whose quotations those are, so this lists
 * them: one card per quotation slot, because a single quotation can hold the
 * same product over two separate date ranges.
 *
 * `/inventory/filter` returns the breakdown as `pendingQuotations` on each
 * stock row; this component only renders it. Cards rather than a table, so the
 * same markup reads properly on a phone without sideways scrolling.
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

const PendingQuotationsModal = ({ show, onHide, row, startDate, endDate }) => {
  const navigate = useNavigate();

  const list = Array.isArray(row?.pendingQuotations) ? row.pendingQuotations : [];
  const held = list.reduce((sum, q) => sum + qtyOf(q.qty), 0);
  const available = Number(row?.availableStock) || 0;
  const isOver = held > available;

  /* Slots of one quotation are separate cards but not separate customers, so a
     repeat of the same quotation is marked instead of restating everything. */
  let lastQuote = null;

  return (
    <Modal show={show} onHide={onHide} centered size="lg" contentClassName="uq-modal">
      <div className="uq-head">
        <div className="uq-head__icon">
          <FaLayerGroup />
        </div>
        <div className="uq-head__text">
          <h5 className="uq-head__title">Under Quotations</h5>
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
            No pending quotations hold this product over these dates.
          </div>
        ) : (
          <>
            <div className="uq-stats">
              <div className="uq-stat">
                <span className="uq-stat__value">{list.length}</span>
                <span className="uq-stat__label">
                  Quotation{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className={"uq-stat" + (isOver ? " is-over" : "")}>
                <span className="uq-stat__value">{held}</span>
                <span className="uq-stat__label">Held quantity</span>
              </div>
              <div className="uq-stat">
                <span className="uq-stat__value">{available}</span>
                <span className="uq-stat__label">Available stock</span>
              </div>
            </div>

            {isOver ? (
              <div className="uq-warn">
                <FaExclamationTriangle size={13} />
                <span>
                  Quoted beyond stock by <strong>{held - available}</strong> unit
                  {held - available === 1 ? "" : "s"}. Confirming all of these
                  would leave the last one short.
                </span>
              </div>
            ) : null}

            <div className="uq-list">
              {list.map((q, i) => {
                const repeat = lastQuote === q.quoteId;
                lastQuote = q.quoteId;

                return (
                  <div
                    className="uq-card"
                    key={`${q.quotationId}-${q.quoteDate}-${i}`}
                    role={q.quotationId ? "button" : undefined}
                    tabIndex={q.quotationId ? 0 : undefined}
                    onClick={() => {
                      if (!q.quotationId) return;
                      onHide();
                      navigate(`/quotation-details/${q.quotationId}`);
                    }}
                    onKeyDown={(e) => {
                      if (!q.quotationId) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onHide();
                        navigate(`/quotation-details/${q.quotationId}`);
                      }
                    }}
                  >
                    <div className="uq-card__avatar">
                      {initialsOf(q.clientName)}
                    </div>

                    <div className="uq-card__main">
                      <div className="uq-card__top">
                        <span className="uq-card__client">
                          {q.clientName || "Unnamed client"}
                        </span>
                        <span className="uq-card__ref">{q.quoteId || "—"}</span>
                        {q.status ? (
                          <span className="uq-card__status">{q.status}</span>
                        ) : null}
                        {repeat ? (
                          <span className="uq-card__repeat">
                            second date range
                          </span>
                        ) : null}
                      </div>

                      <div className="uq-card__meta">
                        {q.clientNo ? (
                          <a
                            className="uq-card__phone"
                            href={`tel:${q.clientNo}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <FaPhoneAlt size={10} />
                            {q.clientNo}
                          </a>
                        ) : (
                          <span className="uq-card__muted">
                            <FaPhoneAlt size={10} />
                            no phone on record
                          </span>
                        )}
                        <span className="uq-card__muted">
                          <FaUserTie size={11} />
                          {q.executivename || "Unassigned"}
                        </span>
                        <span className="uq-card__muted">
                          <FaRegCalendarAlt size={11} />
                          {q.quoteDate || "—"} &rarr; {q.endDate || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="uq-card__qty">
                      <span className="uq-card__qty-value">{qtyOf(q.qty)}</span>
                      <span className="uq-card__qty-label">units</span>
                    </div>

                    {q.quotationId ? (
                      <span className="uq-card__go" aria-hidden="true">
                        <FaArrowRight size={12} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <p className="uq-foot">
              Pending quotations only. Confirmed orders are already taken off
              the available stock.
            </p>
          </>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default PendingQuotationsModal;
