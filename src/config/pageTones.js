/**
 * One accent per area of the app, shared by the sidebar and the page header so
 * the two always agree: clicking a terracotta sidebar item opens a terracotta
 * header. Keyed by route prefix and resolved longest-match-first, so detail
 * routes inherit their section's colour (/orders-details/:id -> Orders).
 */

export const TONES = {
  violet: ["#6D4FC4", "#4E3795"],
  blue: ["#2563C9", "#1B4A99"],
  amber: ["#C08A2B", "#95691D"],
  brand: ["#BD5525", "#8D3C16"],
  teal: ["#11867A", "#0B625A"],
  green: ["#17864F", "#0F6239"],
  pink: ["#C2418B", "#95306B"],
  red: ["#C62F2F", "#962222"],
  slate: ["#415066", "#2A3442"],
};

export const DEFAULT_TONE = "brand";

const PATH_TONES = [
  ["/dashboard", "brand"],

  ["/enquiry", "brand"],
  ["/add-new-enquiry", "brand"],
  ["/enquiries-by-date", "brand"],

  ["/quotation", "brand"],
  ["/qt-calender", "brand"],
  ["/quotations-by-date", "brand"],

  ["/orders-details", "brand"],
  ["/orders", "brand"],
  ["/order-sheet", "brand"],
  ["/invoice", "brand"],

  ["/client", "brand"],
  ["/add-client", "brand"],

  ["/product", "brand"],
  ["/add-product", "brand"],
  ["/edit-product", "brand"],
  ["/inventory", "brand"],
  ["/master", "brand"],
  ["/banner", "brand"],

  ["/damaged", "brand"],

  ["/payment-report", "brand"],
  ["/reports", "brand"],
  ["/refurb", "brand"],

  ["/terms", "brand"],
  ["/settings", "brand"],
];

// Longest prefix first, so "/add-product" beats "/product".
const SORTED = [...PATH_TONES].sort((a, b) => b[0].length - a[0].length);

export function toneForPath(pathname) {
  const path = String(pathname || "").toLowerCase();
  const hit = SORTED.find((entry) => path.startsWith(entry[0]));
  return hit ? hit[1] : DEFAULT_TONE;
}

export function accentsForPath(pathname) {
  return TONES[toneForPath(pathname)] || TONES[DEFAULT_TONE];
}
