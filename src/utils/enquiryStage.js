import axios from "axios";
import { ApiURL } from "../api";

/**
 * How far an enquiry has travelled.
 *
 * The record itself only says "sent"/"not send", which tells you a quotation
 * exists but nothing about what became of it - and it over-claims: hundreds of
 * enquiries read "sent" with no quotation behind them at all. The stage
 * follows the enquiry to its quotation (quotations.enquiryId) and the
 * quotation to its order (orders.quoteId) instead, so a screen can say whether
 * the job was confirmed or called off.
 *
 * This lives in one place because the enquiry list and the enquiry calendar
 * both show it, and two copies of the rule would drift.
 *
 * The four are exclusive, so every record shows exactly one.
 */
export const STAGES = [
  { value: "pending", label: "Pending", tone: "pending" },
  { value: "sent", label: "Quotation Sent", tone: "sent" },
  { value: "confirmed", label: "Confirmed", tone: "confirmed" },
  { value: "cancelled", label: "Cancelled", tone: "cancelled" },
];

export const STAGE_LABEL = Object.fromEntries(
  STAGES.map((x) => [x.value, x.label])
);
export const STAGE_TONE = Object.fromEntries(
  STAGES.map((x) => [x.value, x.tone])
);

/**
 * quoteId -> the state of the order raised from it, lowercased.
 *
 * A confirmed order outranks a cancelled one, so a quote re-confirmed after
 * being called off reads as confirmed.
 */
export const buildOrderStateByQuote = (orders) => {
  const byQuote = new Map();
  orders.forEach((o) => {
    const k = String(o?.quoteId || "");
    if (!k) return;
    if (byQuote.get(k) === "confirm") return;
    byQuote.set(k, String(o?.orderStatus || "").toLowerCase());
  });
  return byQuote;
};

/**
 * Builds enquiryId -> stage once per data load.
 * A confirmed order outranks a cancelled one, so an enquiry re-confirmed
 * after a cancellation reads as confirmed.
 */
export const buildStageMap = (quotations, orders) => {
  const orderByQuote = buildOrderStateByQuote(orders);

  const byEnquiry = new Map();
  quotations.forEach((q) => {
    const k = String(q?.enquiryId ?? "");
    if (!k) return;
    if (!byEnquiry.has(k)) byEnquiry.set(k, []);
    byEnquiry.get(k).push(q);
  });

  const stages = new Map();
  byEnquiry.forEach((quotes, enquiryId) => {
    let stage = null;
    for (const q of quotes) {
      const os = orderByQuote.get(String(q?.quoteId || ""));
      if (os === "confirm") {
        stage = "confirmed";
        break;
      }
      if (os === "cancelled") stage = stage || "cancelled";
      if (String(q?.status || "").toLowerCase() === "cancelled") {
        stage = stage || "cancelled";
      }
    }
    /* A quotation exists but nothing was ordered from it yet. */
    stages.set(enquiryId, stage || "sent");
  });

  return stages;
};

/**
 * The stage an enquiry is at.
 *
 * The API now works this out and sends it with the row, so the usual answer
 * is simply to read it. The map is the fallback for a backend that does not
 * - the deployed one, until this ships - and for anything still joining the
 * lists itself. With neither, no quotation was ever raised against it.
 */
export const stageFromMap = (stageMap, enquiry) =>
  enquiry?.pipelineStatus ||
  stageMap.get(String(enquiry?.enquiryId ?? "")) ||
  "pending";

/**
 * Whether the rows already carry their stage, so there is nothing to join.
 *
 * Checked on the rows rather than assumed from a version number: the same
 * build of this panel is pointed at more than one backend, and one of them
 * sends the field while another does not.
 */
export const rowsCarryStage = (rows) =>
  Array.isArray(rows) && rows.length > 0 && rows.every((r) => r?.pipelineStatus);

/**
 * The same quoteId -> order state map, from quotations that already carry it.
 *
 * The API sends orderState on each quotation now, so the quotation screens
 * no longer have to download all 1,250 orders to find out whether a quote
 * marked "send" was later called off.
 */
export const orderStateFromRows = (quotations) => {
  const byQuote = new Map();
  quotations.forEach((q) => {
    if (q?.orderState) byQuote.set(String(q.quoteId || ""), String(q.orderState));
  });
  return byQuote;
};

/**
 * Whether the rows carry it. The field is null where no order was raised, so
 * the test is that the key is present, not that it has a value - otherwise
 * every list with one un-ordered quote in it would read as not carrying it.
 */
export const rowsCarryOrderState = (rows) =>
  Array.isArray(rows) &&
  rows.length > 0 &&
  rows.every((r) => r && Object.prototype.hasOwnProperty.call(r, "orderState"));

/* ---------------------------------------------------------------------------
   Getting hold of those two lists

   The stage needs two keys the hosted backend does not send: a quotation's
   enquiryId and an order's quoteId. Its plain list call is cached and quick -
   half a megabyte, about a second - but projects them away, and the only way
   to ask for them is ?full=1, which returns whole documents: two megabytes
   and around thirty seconds a list, measured. Thirty seconds is not a wait
   anyone should sit through to find out whether a job was confirmed.

   So the keys are learned once and remembered. A quotation's enquiryId and an
   order's quoteId are written when the record is created and never change, so
   a link learned today is still true tomorrow. It is the status beside it
   that moves, and that comes fresh from the quick list on every visit - which
   is why only the links are kept, never the statuses.

   What is left to fetch is only the records raised since this browser last
   looked, and since every list is newest first those sit on the first page:
   one ?full=1&limit=200 call, about two seconds.

   The first visit on a new browser has nothing remembered and reads every
   page. That costs about what the old single call did, but it arrives in
   pieces and is remembered, so it happens once rather than every time.

   A backend that projects the keys skips all of this - the plain list already
   carries them and nothing past the first check ever runs.
--------------------------------------------------------------------------- */

const SOURCES = {
  quotations: {
    path: "/quotations/getallquotations",
    arrayKey: "quoteData",
    link: "enquiryId",
    slot: "q",
  },
  orders: {
    path: "/order/getallorder",
    arrayKey: "orderData",
    link: "quoteId",
    slot: "o",
  },
};

/* Big enough that a browser which looked recently needs one call, small
   enough that the call is seconds rather than half a minute. */
const PAGE = 200;

const STORE = "rentangadi.stage-links.v1";

/* What this browser has already learned: record id -> what it points at,
   or 0 for a record that was read and turned out to point at nothing. The
   difference matters: a record never looked at has to be fetched, one
   known to have no link never does.

   Unreadable storage counts as nothing learned, never as an error: the
   lists are then read in full, which is slower and still right.

   There is one copy, held here, because the two lists are read side by
   side. Reading a copy each and writing it back meant whichever finished
   last wrote its own copy over the other's - so one of the two always
   started the next visit knowing nothing, and read every page again. */
let links = null;

const allLinks = () => {
  if (links) return links;
  try {
    const raw = window.localStorage.getItem(STORE);
    const held = raw ? JSON.parse(raw) : null;
    links = { q: (held && held.q) || {}, o: (held && held.o) || {} };
  } catch (err) {
    links = { q: {}, o: {} };
  }
  return links;
};

const writeLinks = () => {
  try {
    window.localStorage.setItem(STORE, JSON.stringify(allLinks()));
  } catch (err) {
    /* A full or blocked store costs speed on the next visit, nothing else. */
  }
};

const read = async (url, arrayKey) => {
  const res = await axios.get(url);
  const rows = res?.data?.[arrayKey];
  return Array.isArray(rows) ? rows : [];
};

/* The rows as they came back, with the remembered link filled in wherever
   the response left it out. A remembered 0 means there is nothing to fill
   in, so the row is left as it came. */
const withLinks = (rows, spec, store) =>
  rows.map((r) => {
    if (r?.[spec.link] != null) return r;
    const held = store[r?._id];
    return held ? { ...r, [spec.link]: held } : r;
  });

/* Never looked at, so still worth fetching. A row that was looked at and
   had no link is not - otherwise one such record would drag every page
   back into every visit. */
const unseen = (row, spec, store) =>
  row?.[spec.link] == null && store[row?._id] === undefined;

/**
 * One list, with its link field, reported as it becomes known.
 *
 * onRows(rows, settled) runs as soon as the quick list is in - already
 * settled if this browser has seen these records before - and again after
 * each page of newly learned links. settled means the links are now as
 * complete as they are going to get.
 */
const loadSource = async (spec, onRows) => {
  const store = allLinks()[spec.slot];

  const rows = await read(`${ApiURL}${spec.path}`, spec.arrayKey);

  /* A backend that projects the key: there is nothing to learn. */
  if (!rows.length || rows.some((r) => r?.[spec.link] != null)) {
    onRows(rows, true);
    return rows;
  }

  let merged = withLinks(rows, spec, store);

  /* The list is newest first and so are the pages, so the furthest unknown
     row decides how far back this has to read. A browser that looked an hour
     ago is only missing what has been raised since, which is page one. */
  let last = -1;
  rows.forEach((r, i) => {
    if (unseen(r, spec, store)) last = i;
  });

  onRows(merged, last < 0);
  if (last < 0) return merged;

  const pages = [];
  for (let p = 1; p <= Math.ceil((last + 1) / PAGE); p += 1) pages.push(p);

  let outstanding = pages.length;
  await Promise.all(
    pages.map(async (page) => {
      try {
        const full = await read(
          `${ApiURL}${spec.path}?full=1&limit=${PAGE}&page=${page}`,
          spec.arrayKey
        );
        full.forEach((r) => {
          if (!r?._id) return;
          /* 0 records that the row was read and points at nothing. */
          store[r._id] = r[spec.link] != null ? r[spec.link] : 0;
        });
        /* Kept as each page lands, so a visit cut short still leaves this
           browser better off than it started. */
        writeLinks();
      } catch (err) {
        console.error(`Could not read ${spec.path} page ${page}:`, err);
      }
      outstanding -= 1;
      merged = withLinks(rows, spec, store);
      onRows(merged, outstanding === 0);
    })
  );

  /* Records deleted since would otherwise be remembered for ever. Only safe
     once the whole list has been read. */
  const alive = new Set(rows.map((r) => String(r?._id)));
  Object.keys(store).forEach((id) => {
    if (!alive.has(id)) delete store[id];
  });
  writeLinks();

  return merged;
};

/* The finished lists, held briefly so a second screen in the same visit does
   not read them again, and so two screens opening together ask once. */
const CACHE_MS = 2 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

const source = (spec, onRows) => {
  const held = cache.get(spec.path);
  if (held && Date.now() - held.at < CACHE_MS) {
    onRows(held.rows, true);
    return Promise.resolve(held.rows);
  }

  const already = inFlight.get(spec.path);
  if (already) {
    /* Already being read for another screen: this one waits for that answer
       rather than asking for it a second time. */
    return already.then((rows) => {
      onRows(rows, true);
      return rows;
    });
  }

  const work = loadSource(spec, onRows).then((rows) => {
    cache.set(spec.path, { rows, at: Date.now() });
    return rows;
  });

  inFlight.set(spec.path, work);
  return work.finally(() => inFlight.delete(spec.path));
};

/** After a write, so the next read is not the copy from before it. */
export const forgetStageLists = () => {
  cache.clear();
};

/**
 * Both lists the enquiry stage is built from.
 * onUpdate(quotations, orders, settled) runs whenever either improves.
 */
export const loadStageSources = async (onUpdate) => {
  let quotations = [];
  let orders = [];
  let quotesSettled = false;
  let ordersSettled = false;
  const tell = () =>
    onUpdate(quotations, orders, quotesSettled && ordersSettled);

  await Promise.all([
    source(SOURCES.quotations, (rows, settled) => {
      quotations = rows;
      quotesSettled = settled;
      tell();
    }).catch((err) => {
      console.error("Error fetching quotations:", err);
      quotesSettled = true;
    }),
    source(SOURCES.orders, (rows, settled) => {
      orders = rows;
      ordersSettled = settled;
      tell();
    }).catch((err) => {
      console.error("Error fetching orders:", err);
      ordersSettled = true;
    }),
  ]);

  /* Even if a list failed outright the screen has to stop waiting: the stage
     then rests on whatever the other list can say, which is the honest answer
     when there is nothing further to read. */
  quotesSettled = true;
  ordersSettled = true;
  tell();
};

/** Just the orders, for the screens that only need what became of a quote. */
export const loadOrderSources = async (onUpdate) => {
  try {
    await source(SOURCES.orders, onUpdate);
  } catch (err) {
    console.error("Error fetching orders:", err);
    onUpdate([], true);
  }
};
