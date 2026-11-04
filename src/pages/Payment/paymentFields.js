import moment from "moment";

/**
 * Readers for a payment record.
 *
 * Older and newer rows disagree on field names (totalAmount vs grandTotal,
 * advancedAmount vs advanceAmount, paymentStatus vs status, quotationId as a
 * string or a populated object), so every read goes through one of these.
 *
 * Kept in its own module so the page and its preview can share them without
 * a component file exporting non-components, which breaks fast refresh.
 */

export const quoteRefOf = (p) => p?.quotationId?.quoteId || p?.quotationId || "";

export const totalOf = (p) => Number(p?.totalAmount ?? p?.grandTotal) || 0;

export const advanceOf = (p) => Number(p?.advancedAmount ?? p?.advanceAmount) || 0;

export const balanceOf = (p) => Math.max(0, totalOf(p) - advanceOf(p));

export const statusOf = (p) =>
  String(p?.paymentStatus || p?.status || "").trim() || "Pending";

export const whenOf = (p) => moment(p?.createdAt || p?.paymentDate);

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

/* The stored status wins; where it is missing or vague, the balance decides.
   Nothing left to collect reads as completed. */
export const toneOf = (p) => {
  const s = statusOf(p).toLowerCase();
  if (s.includes("complete") || s.includes("confirm") || s.includes("paid")) {
    return { cls: "is-green", label: "Completed" };
  }
  if (s.includes("partial")) return { cls: "is-amber", label: "Partial" };
  if (s.includes("cancel") || s.includes("fail")) {
    return { cls: "is-red", label: statusOf(p) };
  }
  if (balanceOf(p) === 0 && totalOf(p) > 0) {
    return { cls: "is-green", label: "Completed" };
  }
  if (advanceOf(p) > 0) return { cls: "is-amber", label: "Partial" };
  return { cls: "is-blue", label: statusOf(p) };
};
