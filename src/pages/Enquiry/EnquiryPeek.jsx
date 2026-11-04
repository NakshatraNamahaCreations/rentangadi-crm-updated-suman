import React from "react";
import { Link } from "react-router-dom";
import {
  FaTimes,
  FaPhoneAlt,
  FaWhatsapp,
  FaEnvelope,
  FaMapMarkerAlt,
  FaExternalLinkAlt,
  FaBoxOpen,
  FaTag,
} from "react-icons/fa";
import moment from "moment";

/**
 * Right-hand preview for the enquiry inbox.
 *
 * Shows only fields the enquiry record actually carries. Several panels in the
 * reference design (channel, priority, last message, follow-up reminder, tags,
 * timeline/notes/files) have no backing field or endpoint yet, so they are
 * omitted rather than rendered with placeholder values.
 */

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

const initials = (name) =>
  String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase() || "?";

// Strip spaces/dashes so tel: and wa.me links are dialable.
const digits = (v) => String(v || "").replace(/[^\d+]/g, "");

const Row = ({ label, value }) =>
  value ? (
    <div className="eqp-cell">
      <span className="eqp-cell__label">{label}</span>
      <span className="eqp-cell__value">{value}</span>
    </div>
  ) : null;

const EnquiryPeek = ({ enquiry, onClose }) => {
  if (!enquiry) {
    return (
      <aside className="eqp eqp--empty">
        <p>Select an enquiry to see its details here.</p>
      </aside>
    );
  }

  const quoted = String(enquiry?.status || "").toLowerCase() === "sent";
  const phone = digits(enquiry?.clientNo);
  const email = enquiry?.email || enquiry?.clientEmail || "";
  const place = enquiry?.address || enquiry?.placeaddress || "";
  const products = Array.isArray(enquiry?.products) ? enquiry.products : [];
  const raised = enquiry?.createdAt ? moment(enquiry.createdAt) : null;

  return (
    <aside className="eqp">
      <div className="eqp__head">
        <span className="eqp__id">#{enquiry?.enquiryId || "Enquiry"}</span>
        <span className={`eq-pill ${quoted ? "is-quoted" : "is-open"}`}>
          {quoted ? "Quoted" : "Open"}
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
        {/* ---- Client ---- */}
        <h3 className="eqp__client">{enquiry?.clientName || "Unnamed client"}</h3>

        <ul className="eqp__contact">
          {place ? (
            <li>
              <FaMapMarkerAlt />
              <span>{place}</span>
            </li>
          ) : null}
          {enquiry?.clientNo ? (
            <li>
              <FaPhoneAlt />
              <span>{enquiry.clientNo}</span>
            </li>
          ) : null}
          {email ? (
            <li>
              <FaEnvelope />
              <span>{email}</span>
            </li>
          ) : null}
        </ul>

        {/* ---- Actions that work without a new endpoint ---- */}
        <div className="eqp__actions">
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
          {email ? (
            <a className="eqp-act is-mail" href={`mailto:${email}`}>
              <FaEnvelope />
              <span>Email</span>
            </a>
          ) : null}
        </div>

        {/* ---- Details ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">Details</span>
          <div className="eqp__grid">
            <Row
              label="Enquiry date"
              value={
                enquiry?.enquiryDate ||
                (raised && raised.isValid() ? raised.format("DD-MM-YYYY") : "")
              }
            />
            <Row label="Dismantle date" value={enquiry?.endDate} />
            <Row label="Slot" value={enquiry?.enquiryTime} />
            <Row
              label="Enquiry amount"
              value={
                enquiry?.GrandTotal != null ? (
                  <>&#8377;{inr(enquiry.GrandTotal)}</>
                ) : null
              }
            />
            <Row
              label="Raised"
              value={raised && raised.isValid() ? raised.format("DD MMM YYYY") : ""}
            />
          </div>
        </div>

        {/* ---- Category, the one tag the record carries ---- */}
        {enquiry?.category ? (
          <div className="eqp__section">
            <span className="eqp__section-title">Category</span>
            <span className="eqp-tag">
              <FaTag /> {enquiry.category}
            </span>
          </div>
        ) : null}

        {/* ---- Assigned executive ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">Assigned executive</span>
          {enquiry?.executivename ? (
            <span className="eqp__person">
              <span className="eq-avatar">{initials(enquiry.executivename)}</span>
              {enquiry.executivename}
            </span>
          ) : (
            <span className="eqp__none">Unassigned</span>
          )}
        </div>

        {/* ---- Products ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">
            Products {products.length ? `(${products.length})` : ""}
          </span>
          {products.length ? (
            <ul className="eqp__items">
              {products.slice(0, 5).map((p, i) => (
                <li key={p?._id || p?.productId || i}>
                  <span className="eqp__item-icon">
                    <FaBoxOpen />
                  </span>
                  <span className="eqp__item-main">
                    <span className="eqp__item-name">
                      {p?.name || p?.productName || "Product"}
                    </span>
                    <span className="eqp__item-sub">
                      {(Number(p?.qty) || 0) + " × ₹" + inr(p?.price)}
                    </span>
                  </span>
                  <span className="eqp__item-total">
                    &#8377;{inr((Number(p?.qty) || 0) * (Number(p?.price) || 0))}
                  </span>
                </li>
              ))}
              {products.length > 5 ? (
                <li className="eqp__more">
                  +{products.length - 5} more
                </li>
              ) : null}
            </ul>
          ) : (
            <span className="eqp__none">No products added yet.</span>
          )}
        </div>
      </div>

      <div className="eqp__foot">
        <Link to={`/enquiry-details/${enquiry?._id}`} className="eqp__open">
          Open full enquiry <FaExternalLinkAlt />
        </Link>
      </div>
    </aside>
  );
};

export default EnquiryPeek;
