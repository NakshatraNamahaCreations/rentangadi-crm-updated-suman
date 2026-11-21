import React, { useState, useEffect } from "react";
import {
  FaTimes,
  FaPhoneAlt,
  FaWhatsapp,
  FaEnvelope,
  FaMapMarkerAlt,
  FaUserTie,
  FaEdit,
  FaFileInvoiceDollar,
  FaClipboardList,
} from "react-icons/fa";
import {
  initials,
  inr,
  sinceLabel,
  activityTone,
  executivesOf,
  recordDate,
  amountOf,
} from "./clientFields";

/**
 * Right-hand preview for the client list.
 *
 * The reference design also carries tags, free-text notes, a separate
 * contacts book and a "change account owner" control. The client record has
 * none of those fields and there is no endpoint behind them, so those panels
 * are left out rather than shown empty. Orders and Enquiries are real: they
 * are the records joined onto this client by phone number.
 */

const Cell = ({ icon, label, value, href }) =>
  value ? (
    <div className="eqp-cell">
      <span className="eqp-cell__label">
        {icon} {label}
      </span>
      {href ? (
        <a className="eqp-cell__value cl-link" href={href}>
          {value}
        </a>
      ) : (
        <span className="eqp-cell__value">{value}</span>
      )}
    </div>
  ) : null;

const ClientPeek = ({ client, onClose, onEdit }) => {
  const [tab, setTab] = useState("overview");

  /* On a narrow screen this is a drawer over the list rather than a rail
     beside it, so there has to be a way out that is not hunting for the
     close button. Harmless at any width. */
  useEffect(() => {
    if (!client) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose && onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, onClose]);

  if (!client) {
    return (
      <aside className="eqp eqp--empty">
        <p>Select a client to see their details here.</p>
      </aside>
    );
  }

  const tone = activityTone(client.lastActivity);
  const execs = executivesOf(client);
  const phone = client.contactPersonNumber;
  const hasPhone = phone && phone !== "N/A";
  const email = client.email && client.email !== "N/A" ? client.email : "";
  const digits = String(phone || "").replace(/\D/g, "");

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "orders", label: `Orders (${client.orders.length})` },
    { key: "enquiries", label: `Enquiries (${client.enquiries.length})` },
  ];

  const History = ({ rows, empty, idOf }) =>
    rows.length ? (
      <ul className="cl-hist">
        {rows.map((r, i) => {
          const d = recordDate(r);
          return (
            <li key={(r._id || "") + i}>
              <span className="cl-hist__main">
                <span className="cl-hist__id">{idOf(r) || "—"}</span>
                <span className="cl-hist__when">
                  {d ? d.format("DD MMM YYYY") : "No date"}
                </span>
              </span>
              <span className="cl-hist__amount">&#8377;{inr(amountOf(r))}</span>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="qc-empty">{empty}</p>
    );

  return (
    <aside className="eqp">
      <div className="eqp__head">
        <span className="eqp__id">Client</span>
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
        {/* ---- Identity ---- */}
        <div className="cl-id">
          <span className="cl-id__avatar">{initials(client.companyName)}</span>
          <div className="cl-id__text">
            <h3 className="eqp__client">{client.companyName}</h3>
            {client.lastActivity ? (
              <p className="cl-id__sub">
                Last interaction: {sinceLabel(client.lastActivity)}
              </p>
            ) : (
              <p className="cl-id__sub">No enquiries or orders yet</p>
            )}
          </div>
        </div>

        {/* ---- Quick actions ---- */}
        <div className="eqp__actions">
          {hasPhone ? (
            <>
              <a className="eqp-act is-call" href={`tel:${digits}`}>
                <FaPhoneAlt /> Call
              </a>
              <a
                className="eqp-act is-wa"
                href={`https://wa.me/${digits.length === 10 ? "91" + digits : digits}`}
                target="_blank"
                rel="noreferrer"
              >
                <FaWhatsapp /> WhatsApp
              </a>
            </>
          ) : null}
          {email ? (
            <a className="eqp-act is-mail" href={`mailto:${email}`}>
              <FaEnvelope /> Email
            </a>
          ) : null}
        </div>

        {/* ---- Business ---- */}
        <div className="eqp__money">
          <div>
            <span className="eqp__money-label">Total Business</span>
            <span className="eqp__money-value">
              &#8377;{inr(client.business)}
            </span>
          </div>
          <div>
            <span className="eqp__money-label">Total Orders</span>
            <span className="eqp__money-value">{client.orders.length}</span>
          </div>
        </div>

        {/* ---- Tabs ---- */}
        <div className="eq-views cl-tabs" role="tablist" aria-label="Client detail">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`eq-view${tab === t.key ? " is-active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" ? (
          <>
            <div className="eqp__section">
              <span className="eqp__section-title">Basic Information</span>
              <div className="eqp__grid">
                <Cell
                  icon={<FaPhoneAlt />}
                  label="Phone"
                  value={hasPhone ? phone : ""}
                  href={hasPhone ? `tel:${digits}` : ""}
                />
                <Cell
                  icon={<FaEnvelope />}
                  label="Email"
                  value={email}
                  href={email ? `mailto:${email}` : ""}
                />
                <Cell
                  icon={<FaMapMarkerAlt />}
                  label="Address"
                  value={
                    client.address && client.address !== "N/A"
                      ? client.address
                      : ""
                  }
                />
              </div>
            </div>

            <div className="eqp__section">
              <span className="eqp__section-title">
                Executives{execs.length ? ` (${execs.length})` : ""}
              </span>
              {execs.length ? (
                <ul className="cl-execs">
                  {execs.map((e, i) => (
                    <li key={e.name + i}>
                      <span className="cl-execs__avatar">
                        {initials(e.name) || <FaUserTie />}
                      </span>
                      <span className="cl-execs__text">
                        <span className="cl-execs__name">
                          {e.name || "Unnamed"}
                        </span>
                        {e.phone ? (
                          <a
                            className="cl-execs__phone"
                            href={`tel:${e.phone.replace(/\D/g, "")}`}
                          >
                            {e.phone}
                          </a>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="qc-empty">No executives on this client.</p>
              )}
            </div>
          </>
        ) : null}

        {tab === "orders" ? (
          <div className="eqp__section">
            <span className="eqp__section-title">
              <FaClipboardList /> Orders
            </span>
            <History
              rows={client.orders}
              empty="No orders for this client yet."
              idOf={(o) => o.orderId || o.clientName}
            />
          </div>
        ) : null}

        {tab === "enquiries" ? (
          <div className="eqp__section">
            <span className="eqp__section-title">
              <FaFileInvoiceDollar /> Enquiries
            </span>
            <History
              rows={client.enquiries}
              empty="No enquiries for this client yet."
              idOf={(e) => (e.enquiryId ? "#" + e.enquiryId : e.clientName)}
            />
          </div>
        ) : null}
      </div>

      <div className="eqp__foot">
        <button type="button" className="eqp__open" onClick={() => onEdit(client)}>
          <FaEdit /> Edit Client
        </button>
      </div>
    </aside>
  );
};

export default ClientPeek;
