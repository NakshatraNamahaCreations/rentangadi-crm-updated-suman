import React, { useMemo } from "react";
import { FaChevronLeft, FaChevronRight, FaChevronRight as FaGo } from "react-icons/fa";
import moment from "moment";

/**
 * Mobile stand-in for the react-big-calendar month grid.
 *
 * A 7-column month grid at phone width leaves each day about 45px wide, which
 * cannot hold a readable "Enquiries: 12" pill. This renders the same month as
 * a scrollable list of day cards instead, keeping month navigation and the
 * tap-through to a day's records.
 *
 * `items` is [{ dateKey: "YYYY-MM-DD", count, payload }], already filtered to
 * the month the caller is showing.
 */
/** "enquiries" -> "enquiry", "orders" -> "order". */
const singular = (word) => {
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
};

const MonthEventList = ({
  date,
  onNavigate,
  items = [],
  onSelect,
  unitLabel = "records",
  accent = "var(--rt-brand)",
}) => {
  const current = moment(date);

  const rows = useMemo(
    () =>
      items
        .filter((it) => it?.dateKey && moment(it.dateKey, "YYYY-MM-DD").isValid())
        .slice()
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey)),
    [items]
  );

  const total = rows.reduce((sum, r) => sum + (Number(r.count) || 0), 0);
  const today = moment().format("YYYY-MM-DD");

  const step = (delta) => {
    const next = moment(date).add(delta, "month").toDate();
    onNavigate?.(next);
  };

  return (
    <div className="rt-mlist" style={{ "--mlist-accent": accent }}>
      <div className="rt-mlist__bar">
        <button
          type="button"
          className="rt-mlist__nav"
          onClick={() => step(-1)}
          aria-label="Previous month"
        >
          <FaChevronLeft />
        </button>

        <div className="rt-mlist__title">
          <span className="rt-mlist__month">{current.format("MMMM YYYY")}</span>
          <span className="rt-mlist__count">
            {total} {unitLabel}
          </span>
        </div>

        <button
          type="button"
          className="rt-mlist__nav"
          onClick={() => step(1)}
          aria-label="Next month"
        >
          <FaChevronRight />
        </button>
      </div>

      {rows.length ? (
        <ul className="rt-mlist__items">
          {rows.map((row) => {
            const d = moment(row.dateKey, "YYYY-MM-DD");
            const isToday = row.dateKey === today;
            return (
              <li key={row.dateKey}>
                <button
                  type="button"
                  className={`rt-mlist__row${isToday ? " is-today" : ""}`}
                  onClick={() => onSelect?.(row)}
                >
                  <span className="rt-mlist__date">
                    <span className="rt-mlist__day">{d.format("DD")}</span>
                    <span className="rt-mlist__dow">{d.format("ddd")}</span>
                  </span>

                  <span className="rt-mlist__body">
                    <span className="rt-mlist__label">
                      {row.count}{" "}
                      {Number(row.count) === 1 ? singular(unitLabel) : unitLabel}
                    </span>
                    <span className="rt-mlist__sub">
                      {d.format("DD MMM YYYY")}
                      {isToday ? " · Today" : ""}
                    </span>
                  </span>

                  <span className="rt-mlist__pill">{row.count}</span>
                  <FaGo className="rt-mlist__go" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rt-mlist__empty">
          No {unitLabel} in {current.format("MMMM YYYY")}.
        </p>
      )}
    </div>
  );
};

export default MonthEventList;
