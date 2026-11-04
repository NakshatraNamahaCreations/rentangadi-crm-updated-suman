/**
 * Readers for a product record, shared by the list and its preview.
 *
 * Kept out of the component files so neither of them exports a non-component,
 * which would break Vite's fast refresh for that module.
 */

/* Anything at or below this is flagged as low stock. */
export const LOW_STOCK_AT = 5;

export const stockOf = (p) => Number(p?.ProductStock) || 0;

export const priceOf = (p) => Number(p?.ProductPrice) || 0;

export const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

/* Stock level drives the status pill: the record has no separate status field. */
export const stockTone = (p) => {
  const s = stockOf(p);
  if (s <= 0) return { key: "out", cls: "is-red", label: "Out of Stock" };
  if (s <= LOW_STOCK_AT) return { key: "low", cls: "is-amber", label: "Low Stock" };
  return { key: "in", cls: "is-green", label: "In Stock" };
};

/* Sorted unique values of a field across the list, for the filter dropdowns. */
export const distinctValues = (list, field) => {
  const set = new Set();
  (list || []).forEach((p) => {
    const v = String(p?.[field] || "").trim();
    if (v) set.add(v);
  });
  return [...set].sort((a, b) => a.localeCompare(b));
};
