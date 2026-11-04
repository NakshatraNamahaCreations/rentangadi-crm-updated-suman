import React from "react";
import { Link } from "react-router-dom";
import {
  FaTimes,
  FaPhoneAlt,
  FaWhatsapp,
  FaFilePdf,
  FaExternalLinkAlt,
  FaRegCalendarAlt,
  FaRegClock,
} from "react-icons/fa";
import moment from "moment";

/**
 * Right-hand preview for the quotation list.
 *
 * Shows only what the quotation record carries. The reference design also has
 * a "Send Quote" action, a validity countdown and a recent-activity feed;
 * there is no send endpoint, no validity field and no activity log behind
 * them yet, so those are left out instead of being faked.
 */

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

const amountOf = (q) => Number(q?.GrandTotal ?? q?.grandTotal) || 0;

const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

const digits = (v) => String(v || "").replace(/[^\d+]/g, "");

const Cell = ({ label, value }) =>
  value || value === 0 ? (
    <div className="eqp-cell">
      <span className="eqp-cell__label">{label}</span>
      <span className="eqp-cell__value">{value}</span>
    </div>
  ) : null;

const QuotePeek = ({ quote, onClose }) => {
  if (!quote) {
    return (
      <aside className="eqp eqp--empty">
        <p>Select a quotation to see its details here.</p>
      </aside>
    );
  }

  const sent = String(quote?.status || "").toLowerCase() === "send";
  const phone = digits(quote?.clientNo);
  const created = quote?.createdAt ? moment(quote.createdAt) : null;
  const gstPct = Number(quote?.GST) || 0;
  const total = amountOf(quote);
  // The stored total already includes GST, so the tax share is derived.
  const gstAmount = gstPct ? total - total / (1 + gstPct / 100) : 0;

  return (
    <aside className="eqp">
      <div className="eqp__head">
        <span className="eqp__id">#{quote?.quoteId || "Quotation"}</span>
        <span className={`eq-pill ${sent ? "is-quoted" : "is-open"}`}>
          {sent ? "Confirmed" : "Pending"}
        </span>
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
        <h3 className="eqp__client">{quote?.clientName || "Unnamed client"}</h3>

        {/* ---- Money ---- */}
        <div className="eqp__money">
          <div>
            <span className="eqp__money-label">Grand Total</span>
            <span className="eqp__money-value">&#8377;{inr(total)}</span>
          </div>
          <div>
            <span className="eqp__money-label">
              GST{gstPct ? ` (${gstPct}%)` : ""}
            </span>
            <span className="eqp__money-value is-muted">
              &#8377;{inr(gstAmount)}
            </span>
          </div>
        </div>

        {/* ---- Schedule ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">Schedule</span>
          <div className="eqp__grid">
            <Cell
              label={
                <>
                  <FaRegCalendarAlt /> Event date
                </>
              }
              value={quote?.quoteDate}
            />
            <Cell
              label={
                <>
                  <FaRegClock /> Time slot
                </>
              }
              value={quote?.quoteTime}
            />
            <Cell
              label="Created"
              value={created && created.isValid() ? created.format("DD MMM YYYY") : ""}
            />
          </div>
        </div>

        {/* ---- Charges, when the record carries them ---- */}
        {quote?.discount || quote?.transportcharge || quote?.labourecharge ? (
          <div className="eqp__section">
            <span className="eqp__section-title">Charges</span>
            <div className="eqp__grid">
              <Cell
                label="Discount"
                value={quote?.discount ? `${quote.discount}%` : null}
              />
              <Cell
                label="Transport"
                value={
                  quote?.transportcharge ? (
                    <>&#8377;{inr(quote.transportcharge)}</>
                  ) : null
                }
              />
              <Cell
                label="Labour"
                value={
                  quote?.labourecharge ? (
                    <>&#8377;{inr(quote.labourecharge)}</>
                  ) : null
                }
              />
            </div>
          </div>
        ) : null}

        {/* ---- Executive ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">Assigned executive</span>
          {quote?.executivename ? (
            <span className="eqp__person">
              <span className="eq-avatar">{initials(quote.executivename)}</span>
              {quote.executivename}
            </span>
          ) : (
            <span className="eqp__none">Unassigned</span>
          )}
        </div>

        {/* ---- Client contact ---- */}
        {quote?.clientNo || quote?.inchargeName ? (
          <div className="eqp__section">
            <span className="eqp__section-title">Client contact</span>
            {quote?.inchargeName ? (
              <span className="eqp-cell__value d-block mb-2">
                {quote.inchargeName}
              </span>
            ) : null}
            {quote?.clientNo ? (
              <span className="eqp__none d-block mb-2">{quote.clientNo}</span>
            ) : null}
            <div className="eqp__actions eqp__actions--tight">
              {phone ? (
                <a className="eqp-act is-call" href={`tel:${phone}`}>
                  <FaPhoneAlt />
                  <span>Call</span>
                </a>
              ) : null}
              {phone ? (
                <a
                  className="eqp-act is-wa"
                  href={`https://wa.me/${phone.replace(/^\+/, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FaWhatsapp />
                  <span>WhatsApp</span>
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="eqp__foot eqp__foot--split">
        <Link to={`/quotation/invoice/${quote?._id}`} className="eqp__ghost">
          <FaFilePdf /> Invoice
        </Link>
        <Link to={`/quotation-details/${quote?._id}`} className="eqp__open">
          Open quote <FaExternalLinkAlt />
        </Link>
      </div>
    </aside>
  );
};

export default QuotePeek;
