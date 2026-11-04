import moment from "moment";

/**
 * Readers for a client record, shared by the list and its preview.
 *
 * Kept out of the component files so neither of them exports a non-component,
 * which would break Vite's fast refresh for that module.
 *
 * The client record itself only carries a name, phone, email, address and a
 * list of executives. Everything else on this page (business, order count,
 * last interaction, status) is derived by joining the enquiry and order
 * records back onto the client, never stored on the client.
 */

/* A client counts as active when something happened in this window. */
export const ACTIVE_WITHIN_DAYS = 90;

/* The crown tile and the "high value" filter use this floor. */
export const HIGH_VALUE_AT = 100000;

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

export const compactInr = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e7) return (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return (v / 1e5).toFixed(2) + " L";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + " K";
  return inr(v);
};

export const initials = (name) => {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

/* Indian numbers arrive with and without the country code, so the last ten
   digits are the only part that reliably identifies the same person. */
export const phoneKey = (v) => {
  const digits = String(v || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
};

export const nameKey = (v) => String(v || "").trim().toLowerCase();

/* Records date themselves either with an ISO createdAt or a DD-MM-YYYY field. */
export const recordDate = (rec) => {
  const iso = rec?.createdAt ? moment(rec.createdAt) : null;
  if (iso && iso.isValid()) return iso;
  const dmy = moment(
    rec?.enquiryDate || rec?.quoteDate || rec?.orderDate,
    "DD-MM-YYYY",
    true
  );
  return dmy.isValid() ? dmy : null;
};

export const amountOf = (rec) => Number(rec?.GrandTotal ?? rec?.grandTotal) || 0;

/* When the record was raised, as opposed to when its event runs.
   enquiryDate and quoteDate are event dates and are often in the future, so
   they only stand in for a missing createdAt while they are in the past.
   Used for "last interaction" and for the status pill. */
export const interactionDate = (rec) => {
  const candidate =
    rec?.createdAt && moment(rec.createdAt).isValid()
      ? moment(rec.createdAt)
      : recordDate(rec);
  /* Nothing can have been interacted with in the future, so a forward-dated
     record is simply not an interaction yet. */
  if (!candidate || candidate.isAfter(moment(), "day")) return null;
  return candidate;
};

/* "2 days ago" style, but only down to the day: nothing here is minute-level. */
export const sinceLabel = (m) => {
  if (!m || !m.isValid()) return "";
  const days = moment().startOf("day").diff(m.clone().startOf("day"), "days");
  if (days < 0) return m.format("DD MMM YYYY");
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return days + " days ago";
  if (days < 30) {
    const w = Math.floor(days / 7);
    return w === 1 ? "1 week ago" : w + " weeks ago";
  }
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return mo === 1 ? "1 month ago" : mo + " months ago";
  }
  const y = Math.floor(days / 365);
  return y === 1 ? "1 year ago" : y + " years ago";
};

/* Status is derived from when the client last did anything, because the
   record has no status field of its own. */
export const activityTone = (lastActivity) => {
  if (!lastActivity || !lastActivity.isValid()) {
    return { key: "none", cls: "is-slate", label: "No activity" };
  }
  const days = moment().diff(lastActivity, "days");
  if (days <= ACTIVE_WITHIN_DAYS) {
    return { key: "active", cls: "is-green", label: "Active" };
  }
  return { key: "dormant", cls: "is-amber", label: "Dormant" };
};

/* Executives are the only people attached to a client, so they stand in for
   the account owner. */
export const executivesOf = (client) =>
  (client?.executives || [])
    .map((e) => ({
      name: String(e?.name || "").trim(),
      phone: String(e?.phoneNumber || e?.phone || "").trim(),
    }))
    .filter((e) => e.name || e.phone);
