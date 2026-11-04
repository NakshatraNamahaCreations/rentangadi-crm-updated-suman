import React from "react";
import {
  FaTimes,
  FaReceipt,
  FaBuilding,
  FaRegCalendarAlt,
  FaWallet,
} from "react-icons/fa";
import {
  quoteRefOf,
  totalOf,
  advanceOf,
  balanceOf,
  toneOf,
  whenOf,
  inr,
} from "./paymentFields";

/**
 * Right-hand preview for the payment report.
 *
 * The reference design also carries a transaction timeline and "Send Receipt"
 * action. There is no event log on a payment record and no send endpoint, so
 * those are left out; the slip modal below is the real receipt view.
 */

const Cell = ({ label, value, strong }) =>
  value || value === 0 ? (
    <div className="eqp-cell">
      <span className="eqp-cell__label">{label}</span>
      <span className={"eqp-cell__value" + (strong ? " is-strong" : "")}>{value}</span>
    </div>
  ) : null;

const PaymentPeek = ({ payment, onClose, onSlip }) => {
  if (!payment) {
    return (
      <aside className="eqp eqp--empty">
        <p>Select a payment to see its details here.</p>
      </aside>
    );
  }

  const tone = toneOf(payment);
  const when = whenOf(payment);
  const balance = balanceOf(payment);

  return (
    <aside className="eqp">
      <div className="eqp__head">
        <span className="eqp__id">{quoteRefOf(payment) || "Payment"}</span>
        <span className={`rt-pill ${tone.cls}`}>{tone.label}</span>
        <button
          type="button"
          className="eqp__close"
          onClick={onClose}
          aria-label="Close preview"
        >
          <FaTimes />
        </button>
      </div>

      <div className="eqp__body">
        <h3 className="eqp__client">{payment?.companyName || "Unnamed company"}</h3>

        {/* ---- Money ---- */}
        <div className="eqp__money">
          <div>
            <span className="eqp__money-label">Grand Total</span>
            <span className="eqp__money-value">&#8377;{inr(totalOf(payment))}</span>
          </div>
          <div>
            <span className="eqp__money-label">Advance</span>
            <span className="eqp__money-value">&#8377;{inr(advanceOf(payment))}</span>
          </div>
        </div>

        <div className={"pr-balance" + (balance > 0 ? " is-due" : " is-clear")}>
          <span>
            <FaWallet /> {balance > 0 ? "Balance due" : "Fully settled"}
          </span>
          <b>&#8377;{inr(balance)}</b>
        </div>

        {/* ---- Details ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">Payment</span>
          <div className="eqp__grid">
            <Cell
              label={
                <>
                  <FaRegCalendarAlt /> Date
                </>
              }
              value={when.isValid() ? when.format("DD MMM YYYY") : ""}
            />
            <Cell
              label="Time"
              value={when.isValid() ? when.format("hh:mm A") : ""}
            />
            <Cell label="Mode" value={payment?.paymentMode} />
            <Cell
              label={
                <>
                  <FaBuilding /> Quotation
                </>
              }
              value={quoteRefOf(payment)}
            />
          </div>
        </div>

        {/* ---- Notes the record carries ---- */}
        {payment?.paymentRemarks || payment?.comment ? (
          <div className="eqp__section">
            <span className="eqp__section-title">Notes</span>
            {payment?.paymentRemarks ? (
              <p className="pr-note">{payment.paymentRemarks}</p>
            ) : null}
            {payment?.comment ? <p className="pr-note">{payment.comment}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="eqp__foot">
        <button
          type="button"
          className="eqp__open"
          onClick={() => onSlip?.(payment)}
        >
          <FaReceipt /> View payment slip
        </button>
      </div>
    </aside>
  );
};

export default PaymentPeek;
