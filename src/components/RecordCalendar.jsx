import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Form, Spinner } from "react-bootstrap";
import {
  FaChevronLeft,
  FaChevronRight,
  FaChevronRight as FaGo,
  FaSearch,
  FaRegCalendarAlt,
} from "react-icons/fa";
import moment from "moment";
import useIsMobile from "../hooks/useIsMobile";

/**
 * Month calendar shared by the quotation and the order calendars.
 *
 * The caller owns fetching, the page header and the stat tiles; this owns the
 * toolbar, the filters, the month grid, the agenda and the day rail. A record
 * can fall on several days (an order spans its slot dates), so `getDates`
 * returns a list of YYYY-MM-DD keys.
 *
 * Colours come from --route-accent, so each section keeps its own accent
 * without this component knowing the route.
 */

const KEY = "YYYY-MM-DD";

/**
 * The calendar keeps its position in the URL, so opening a record and
 * pressing Back returns to the month that was being looked at rather than
 * snapping to today. The browser does the remembering; nothing is stored.
 *
 * The names are prefixed because a page can carry its own "q" or "page" for
 * a list view, and the two must not overwrite each other.
 */
const PARAM = {
  month: "calMonth",
  day: "calDay",
  view: "calView",
  status: "calStatus",
  exec: "calExec",
  query: "calQ",
};

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

const initial = (name) => String(name || "?").trim().charAt(0).toUpperCase() || "?";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RecordCalendar = ({
  records = [],
  loading = false,
  month,
  onMonthChange,
  getDates,
  getId = (r) => r?._id,
  getTitle = (r) => r?.clientName || "Unnamed",
  getRef = () => "",
  getSubtitle = () => "",
  getAmount = () => 0,
  /* Optional. Given one, the selected day's date becomes a button and this
     is called with that day and its records - the enquiry and quotation
     calendars pass nothing and leave the date as a heading. */
  onAmountClick = null,
  getExecutive = (r) => r?.executivename || "",
  isDone = () => false,
  /* Optional third state. Quotations and orders can be called off, and a
     cancelled one is neither done nor still pending; without this it would
     be counted and filtered as pending. Callers that have no such state
     leave it out and the control keeps its two options. */
  isCancelled,
  /* Optional. A caller whose records move through more states than done,
     pending and cancelled passes them here as [{ value, label, tone }]
     with a stageOf that names one per record; the counts, the filter, the
     legend, the day tallies and the row pills then all follow those. */
  stages = null,
  stageOf = null,
  /* False while the caller is still reading whatever stageOf needs. The
     grid, the rows and the totals are all drawn from the records, which
     are already in hand - only the stage is missing, so only the stage
     waits. Days show how many they hold, the pills say they are still
     being worked out, and filtering by status opens when it can be
     trusted. Nothing on screen names a stage it cannot know. */
  stagesReady = true,
  getStatusLabel,
  unit = "records",
  unitOne,
  cellUnit,
  cellUnitOne,
  doneLabel = "Done",
  pendingLabel = "Pending",
  cancelledLabel = "Cancelled",
  /* The next few dated records, under the selected day. Three pages share
     this calendar, so whether the panel earns its place is the caller's
     call rather than this component's: the quotation calendar turns it off.
     It stays on where nothing has been said, so no page changes by
     accident. */
  showUpcoming = true,
  onSelect,
  onVisibleChange,
}) => {
  const isMobile = useIsMobile();

  /* The accessors are read through a ref, so a caller passing inline arrows
     cannot invalidate the memos below on every render. */
  const api = useRef(null);
  api.current = {
    getDates,
    getId,
    getTitle,
    getRef,
    getSubtitle,
    getAmount,
    getExecutive,
    isDone,
    isCancelled,
    /* Without a caller's own, the trio these props have always described. */
    stageOf:
      stageOf ||
      ((r) =>
        isCancelled && isCancelled(r)
          ? "cancelled"
          : isDone(r)
            ? "done"
            : "pending"),
    getStatusLabel,
    onSelect,
    onVisibleChange,
  };

  /* The states every tally is built from. The legend and the filter have
     always read pending first and the tallies done first, so the trio is
     given in both orders; a caller's own states keep one order
     throughout. */
  const stageList = useMemo(() => {
    if (stages?.length) return stages;
    const trio = [
      { value: "done", label: doneLabel, tone: "sent", pill: "is-quoted" },
      { value: "pending", label: pendingLabel, tone: "pending", pill: "is-pending" },
    ];
    if (isCancelled) {
      trio.push({
        value: "cancelled",
        label: cancelledLabel,
        tone: "cancelled",
        pill: "is-cancelled",
      });
    }
    return trio;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages, doneLabel, pendingLabel, cancelledLabel, isCancelled]);

  const filterStages = useMemo(() => {
    if (stages?.length) return stages;
    return stageList.slice().sort((a, b) => {
      const rank = { pending: 0, done: 1, cancelled: 2 };
      return rank[a.value] - rank[b.value];
    });
  }, [stages, stageList]);

  /* A tally per state, in the order they were given, leaving out the ones
     this set does not contain. */
  const partsOf = (list) => {
    const a = api.current;
    /* No stage to tally by yet, so the day reports its size and makes no
       claim about what is in it. */
    if (!stagesReady) {
      return list.length
        ? [
            {
              n: list.length,
              label: list.length === 1 ? cellOne : cellMany,
              cls: "is-waiting",
            },
          ]
        : [];
    }
    const seen = new Map();
    list.forEach((r) => {
      const k = a.stageOf(r);
      seen.set(k, (seen.get(k) || 0) + 1);
    });
    return stageList
      .map((x) => ({
        n: seen.get(x.value) || 0,
        label: x.label,
        cls: `is-${x.tone}`,
      }))
      .filter((p) => p.n > 0);
  };

  const one = unitOne || unit.replace(/s$/, "");
  /* The grid cells are narrow, so they may use a shorter word. */
  const cellMany = cellUnit || unit;
  const cellOne = cellUnitOne || (cellUnit ? cellUnit.replace(/s$/, "") : one);
  const cursor = useMemo(() => moment(month).startOf("month"), [month]);

  const [searchParams, setSearchParams] = useSearchParams();

  /* Each piece starts from the URL when it is there, so a reload or a Back
     lands exactly where the person left off. */
  const [selected, setSelected] = useState(
    () => searchParams.get(PARAM.day) || moment().format(KEY)
  );
  const [view, setView] = useState(() =>
    searchParams.get(PARAM.view) === "agenda" ? "agenda" : "month"
  );
  const [statusFilter, setStatusFilter] = useState(
    () => searchParams.get(PARAM.status) || "all"
  );
  const [executiveFilter, setExecutiveFilter] = useState(
    () => searchParams.get(PARAM.exec) || "all"
  );
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get(PARAM.query) || ""
  );

  const executives = useMemo(() => {
    const set = new Set();
    records.forEach((r) => {
      const n = String(api.current.getExecutive(r) || "").trim();
      if (n) set.add(n);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [records]);

  /* Filters apply to the grid, the agenda and the rail alike. */
  const visible = useMemo(() => {
    const a = api.current;
    const term = searchQuery.trim().toLowerCase();
    const hit = (v) => String(v ?? "").toLowerCase().includes(term);
    return records.filter((r) => {
      if (
        term &&
        !(hit(a.getTitle(r)) || hit(a.getRef(r)) || hit(a.getExecutive(r)))
      ) {
        return false;
      }
      if (statusFilter !== "all" && a.stageOf(r) !== statusFilter) {
        return false;
      }
      if (
        executiveFilter !== "all" &&
        String(a.getExecutive(r) || "").trim() !== executiveFilter
      ) {
        return false;
      }
      return true;
    });
  }, [records, searchQuery, statusFilter, executiveFilter, stageOf]);

  /* The month belongs to the caller, which fetches by it, so on mount the
     one from the URL is handed up rather than set here. */
  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const asked = searchParams.get(PARAM.month);
    if (!asked || !moment(asked, "YYYY-MM", true).isValid()) return;

    const target = moment(asked, "YYYY-MM").startOf("month");
    /* Called directly rather than through the accessor ref: that ref carries
       the data readers, not this callback. */
    if (!target.isSame(cursor, "month")) onMonthChange?.(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Write the position back. `replace` rather than push, so paging through
     months does not fill the history - Back should leave the calendar, not
     walk through every month that was looked at. The first run is skipped so
     a freshly read URL is not immediately overwritten with today. */
  const firstSyncRef = useRef(true);
  useEffect(() => {
    if (firstSyncRef.current) {
      firstSyncRef.current = false;
      return;
    }

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const put = (key, value, fallback) => {
          if (value && value !== fallback) next.set(key, value);
          else next.delete(key);
        };
        put(PARAM.month, cursor.format("YYYY-MM"));
        put(PARAM.day, selected);
        put(PARAM.view, view, "month");
        put(PARAM.status, statusFilter, "all");
        put(PARAM.exec, executiveFilter, "all");
        put(PARAM.query, searchQuery.trim());
        return next;
      },
      { replace: true }
    );
  }, [
    cursor,
    selected,
    view,
    statusFilter,
    executiveFilter,
    searchQuery,
    setSearchParams,
  ]);

  /* The caller drives its stat tiles and its export off the same filtered set. */
  useEffect(() => {
    api.current.onVisibleChange?.(visible);
  }, [visible]);

  const byDate = useMemo(() => {
    const a = api.current;
    const map = {};
    visible.forEach((r) => {
      (a.getDates(r) || []).forEach((key) => {
        if (!key) return;
        (map[key] = map[key] || []).push(r);
      });
    });
    return map;
  }, [visible]);

  /* value -> how many of the visible records are at it. */
  const counts = useMemo(() => {
    const a = api.current;
    const out = new Map();
    visible.forEach((r) => {
      const k = a.stageOf(r);
      out.set(k, (out.get(k) || 0) + 1);
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stageList, stageOf]);

  /* Six-week grid starting on the Sunday of the week the 1st falls in. */
  const weeks = useMemo(() => {
    const start = cursor.clone().startOf("month").startOf("week");
    const out = [];
    for (let w = 0; w < 6; w += 1) {
      for (let d = 0; d < 7; d += 1) out.push(start.clone().add(w * 7 + d, "day"));
    }
    return out;
  }, [cursor]);

  const selectedList = byDate[selected] || [];
  const selectedMoment = moment(selected, KEY);

  /* Whether the caller has somewhere to take this day. */
  const dayOpens =
    Boolean(onAmountClick) && selectedList.length > 0 && selectedMoment.isValid();

  /* Dated today or later, nearest first, each record listed only once.

     Cancelled records are left out: this list answers "what is coming up",
     and something called off is not. They stay in the grid and the counts,
     where the Cancelled filter is there to find them. */
  const upcoming = useMemo(() => {
    /* Nothing to work out for a panel that is not drawn - this walks every
       day in the month and every record on it. */
    if (!showUpcoming) return [];
    const a = api.current;
    const today = moment().startOf("day");
    const seen = new Set();
    const out = [];
    Object.keys(byDate)
      .sort()
      .forEach((key) => {
        const d = moment(key, KEY);
        if (!d.isSameOrAfter(today)) return;
        byDate[key].forEach((r) => {
          if (a.stageOf(r) === "cancelled") return;
          const id = a.getId(r);
          if (seen.has(id)) return;
          seen.add(id);
          out.push({ r, d });
        });
      });
    return out.slice(0, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, stageOf, showUpcoming]);

  /* How the selected day splits across the states this caller uses. */
  const selectedBreakdown = useMemo(
    () => partsOf(selectedList),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedList, stageList, stageOf, stagesReady]
  );

  const step = (delta) => {
    const next = cursor.clone().add(delta, "month");
    onMonthChange?.(next);
    setSelected(next.clone().startOf("month").format(KEY));
  };

  const goToday = () => {
    onMonthChange?.(moment().startOf("month"));
    setSelected(moment().format(KEY));
  };

  const renderRow = (r, i) => {
    const a = api.current;
    const ref = a.getRef(r);
    const sub = a.getSubtitle(r);
    const at = stagesReady ? a.stageOf(r) : null;
    const stage = stageList.find((x) => x.value === at);
    return (
      <li key={String(a.getId(r)) + "-" + i}>
        <button type="button" className="qc-row" onClick={() => a.onSelect?.(r)}>
          <span className="qc-row__avatar">{initial(a.getTitle(r))}</span>
          <span className="qc-row__main">
            <span className="qc-row__name">{a.getTitle(r)}</span>
            <span className="qc-row__meta">
              {ref ? "#" + ref : ""}
              {sub ? (ref ? " · " : "") + sub : ""}
            </span>
          </span>
          <span className="qc-row__amount">&#8377;{inr(a.getAmount(r))}</span>
          {/* A record may carry its own wording; the tone follows its state. */}
          {stagesReady ? (
            <span
              className={`eq-pill ${stage?.pill || `is-${stage?.tone || "pending"}`}`}
            >
              {a.getStatusLabel?.(r) || stage?.label || pendingLabel}
            </span>
          ) : (
            <span
              className="eq-pill is-waiting"
              title="Working out where this stands"
            >
              &hellip;
            </span>
          )}
          <FaGo className="qc-row__go" />
        </button>
      </li>
    );
  };

  return (
    <div className="qc-split">
      {/* ---- Calendar ---- */}
      <div className="qc-main">
        <div className="qc-bar">
          <div className="qc-nav">
            <button
              type="button"
              className="qc-nav__btn"
              onClick={() => step(-1)}
              aria-label="Previous month"
            >
              <FaChevronLeft />
            </button>
            <span className="qc-nav__label">{cursor.format("MMMM YYYY")}</span>
            <button
              type="button"
              className="qc-nav__btn"
              onClick={() => step(1)}
              aria-label="Next month"
            >
              <FaChevronRight />
            </button>
          </div>

          <div className="qc-bar__end">
            <button type="button" className="eq-view" onClick={goToday}>
              Today
            </button>
            <div className="eq-views" role="tablist" aria-label="View">
              <button
                type="button"
                role="tab"
                aria-selected={view === "month"}
                className={`eq-view${view === "month" ? " is-active" : ""}`}
                onClick={() => setView("month")}
              >
                Month
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "agenda"}
                className={`eq-view${view === "agenda" ? " is-active" : ""}`}
                onClick={() => setView("agenda")}
              >
                Agenda
              </button>
            </div>
          </div>
        </div>

        <div className="qc-filters">
          <div className="eq-search">
            <FaSearch />
            <input
              type="text"
              placeholder={`Search ${unit}, client name...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={`Search ${unit}`}
            />
          </div>
          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            disabled={!stagesReady}
            title={
              stagesReady ? undefined : "Reading where each one stands"
            }
          >
            <option value="all">All Status</option>
            {filterStages.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Form.Select>
          <Form.Select
            className="eq-select"
            value={executiveFilter}
            onChange={(e) => setExecutiveFilter(e.target.value)}
            aria-label="Filter by executive"
          >
            <option value="all">All Executives</option>
            {executives.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Form.Select>
        </div>

        <div className="qc-legend">
          {filterStages.map((x) => (
            <span key={x.value}>
              <i className={`is-${x.tone}`} /> {x.label}{" "}
              {stagesReady ? counts.get(x.value) || 0 : "—"}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="qc-loading">
            <Spinner animation="border" size="sm" /> Loading {cursor.format("MMMM")}...
          </div>
        ) : view === "month" ? (
          <div className="qc-grid" role="grid">
            {DOW.map((d) => (
              <div className="qc-grid__dow" key={d}>
                {isMobile ? d.charAt(0) : d.toUpperCase()}
              </div>
            ))}

            {weeks.map((day) => {
              const key = day.format(KEY);
              const rows = byDate[key] || [];
              const outside = day.month() !== cursor.month();
              /* The day's own tally, in the caller's wording. Only the states
                 that actually occur on the day are listed, so a day of one
                 kind still reads as a single line. */
              const parts = partsOf(rows);

              /* A day of one state takes that state's tint; a mixed day
                 reads as pending. */
              const tone = parts.length === 1 ? parts[0].cls : rows.length ? "is-pending" : "";
              return (
                <button
                  type="button"
                  key={key}
                  className={
                    "qc-cell" +
                    (outside ? " is-outside" : "") +
                    (key === selected ? " is-selected" : "") +
                    (key === moment().format(KEY) ? " is-today" : "") +
                    (rows.length ? " has-items " + tone : "")
                  }
                  onClick={() => setSelected(key)}
                  title={
                    parts.length
                      ? parts.map((p) => `${p.n} ${p.label}`).join(", ")
                      : undefined
                  }
                  aria-label={
                    `${day.format("DD MMM")}, ${rows.length} ${unit}` +
                    (parts.length
                      ? ": " + parts.map((p) => `${p.n} ${p.label}`).join(", ")
                      : "")
                  }
                >
                  <span className="qc-cell__num">{day.format("D")}</span>

                  {rows.length ? (
                    isMobile ? (
                      /* A phone cell fits a number and a dot per state, no more. */
                      <span className="qc-cell__dots">
                        {parts.map((p) => (
                          <span key={p.label} className={`qc-cell__dot ${p.cls}`}>
                            {p.n}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="qc-cell__stack">
                        {parts.map((p) => (
                          <span
                            key={p.label}
                            className={`qc-cell__badge ${p.cls}`}
                          >
                            <i />
                            <span className="qc-cell__count">{p.n}</span>
                            <span className="qc-cell__label">{p.label}</span>
                          </span>
                        ))}
                      </span>
                    )
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="qc-agenda">
            {Object.keys(byDate).length ? (
              Object.keys(byDate)
                .sort()
                .map((key) => (
                  <div className="qc-agenda__day" key={key}>
                    <span className="qc-agenda__date">
                      {moment(key, KEY).format("ddd, DD MMM")}
                    </span>
                    <ul className="qc-list">{byDate[key].map(renderRow)}</ul>
                  </div>
                ))
            ) : (
              <p className="qc-empty">No {unit} this month.</p>
            )}
          </div>
        )}
      </div>

      {/* ---- Right rail (desktop) / stacked below (mobile) ---- */}
      <aside className="qc-side">
        <div className="qc-panel">
          <div className="qc-day__head">
            <div>
              {dayOpens ? (
                <button
                  type="button"
                  className="qc-day__date is-clickable"
                  onClick={() =>
                    onAmountClick({
                      date: selectedMoment,
                      records: selectedList,
                    })
                  }
                  title={`See this day's ${
                    selectedList.length === 1 ? one : unit
                  } and what they are made of`}
                >
                  {selectedMoment.format("DD MMM YYYY")}
                </button>
              ) : (
                <span className="qc-day__date">
                  {selectedMoment.isValid()
                    ? selectedMoment.format("DD MMM YYYY")
                    : "—"}
                </span>
              )}
              <span className="qc-day__count">
                {selectedList.length} {selectedList.length === 1 ? one : unit}
              </span>

              {/* The day broken down by state. A narrow grid cell can only
                  carry the counts, so the wording lives here where there is
                  room for it. */}
              {selectedBreakdown.length ? (
                <span className="qc-day__states">
                  {selectedBreakdown.map((p) => (
                    <span key={p.label} className={`qc-state ${p.cls}`}>
                      {p.n} {p.label}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>

          {selectedList.length ? (
            <ul className="qc-list">{selectedList.map(renderRow)}</ul>
          ) : (
            <p className="qc-empty">No {unit} on this date.</p>
          )}
        </div>

        {showUpcoming ? (
        <div className="qc-panel">
          <span className="qc-panel__title">Upcoming</span>
          {upcoming.length ? (
            <ul className="qc-up">
              {upcoming.map(({ r, d }, i) => {
                const a = api.current;
                const ref = a.getRef(r);
                return (
                  <li key={String(a.getId(r)) + "-up-" + i}>
                    <button
                      type="button"
                      className="qc-up__row"
                      onClick={() => a.onSelect?.(r)}
                    >
                      <span className="qc-up__icon">
                        <FaRegCalendarAlt />
                      </span>
                      <span className="qc-up__main">
                        <span className="qc-up__name">
                          {ref ? "#" + ref : a.getTitle(r)}
                        </span>
                        {/* Without a reference the name is already the title,
                            so the second line falls back to the detail. */}
                        <span className="qc-up__meta">
                          {ref
                            ? a.getTitle(r)
                            : a.getSubtitle(r) || d.format("ddd, DD MMM")}
                        </span>
                      </span>
                      <span className="qc-up__when">
                        {d.isSame(moment(), "day")
                          ? "Today"
                          : d.isSame(moment().add(1, "day"), "day")
                            ? "Tomorrow"
                            : d.format("DD MMM")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="qc-empty">Nothing upcoming this month.</p>
          )}
        </div>
        ) : null}
      </aside>
    </div>
  );
};

export default RecordCalendar;
