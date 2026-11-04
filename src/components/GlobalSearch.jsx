import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaSearch, FaSpinner } from "react-icons/fa";
import axios from "axios";
import { ApiURL } from "../api";

/**
 * Global search across the records the API already exposes: clients, orders,
 * enquiries and quotations. The lists are fetched once on first focus and
 * filtered in the browser, so typing stays instant without adding a
 * search endpoint on the server.
 */

const GROUPS = [
  { key: "enquiries", label: "Enquiries" },
  { key: "orders", label: "Orders" },
  { key: "quotations", label: "Quotations" },
  { key: "clients", label: "Clients" },
];

const pickList = (payload) => {
  if (Array.isArray(payload)) return payload;
  return (
    payload?.orderData ||
    payload?.Client ||
    payload?.quoteData ||
    payload?.data ||
    []
  );
};

const norm = (v) => String(v ?? "").toLowerCase();

const GlobalSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({
    enquiries: [],
    orders: [],
    quotations: [],
    clients: [],
  });
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  // Ctrl/Cmd+K still focuses the field; the badge that advertised it is gone.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const load = async () => {
    if (loaded || loading) return;
    setLoading(true);
    const reqs = [
      axios.get(ApiURL + "/Enquiry/getallEnquiry"),
      axios.get(ApiURL + "/order/getallorder"),
      axios.get(ApiURL + "/quotations/getallquotations"),
      axios.get(ApiURL + "/client/getallClients"),
    ];
    const res = await Promise.allSettled(reqs);
    const get = (i) => (res[i].status === "fulfilled" ? pickList(res[i].value?.data) : []);
    setData({
      enquiries: get(0),
      orders: get(1),
      quotations: get(2),
      clients: get(3),
    });
    setLoaded(true);
    setLoading(false);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const hits = [];

    data.enquiries.forEach((e) => {
      if (
        norm(e.clientName).includes(q) ||
        norm(e.enquiryId).includes(q) ||
        norm(e.executivename).includes(q)
      ) {
        hits.push({
          group: "enquiries",
          id: e._id,
          title: e.clientName || "Unnamed client",
          meta: e.enquiryId ? "#" + e.enquiryId : e.enquiryDate || "",
          to: "/enquiry-details/" + e._id,
        });
      }
    });

    data.orders.forEach((o) => {
      if (norm(o.clientName).includes(q) || norm(o.executivename).includes(q)) {
        hits.push({
          group: "orders",
          id: o._id,
          title: o.clientName || "Unnamed client",
          meta: o.GrandTotal ? "₹" + o.GrandTotal : "",
          to: "/orders-details/" + o._id,
        });
      }
    });

    data.quotations.forEach((q2) => {
      if (norm(q2.clientName).includes(q) || norm(q2.executivename).includes(q)) {
        hits.push({
          group: "quotations",
          id: q2._id,
          title: q2.clientName || "Unnamed client",
          meta: q2.GrandTotal ? "₹" + q2.GrandTotal : "",
          to: "/quotation-details/" + q2._id,
        });
      }
    });

    data.clients.forEach((c) => {
      if (norm(c.name).includes(q) || norm(c.phoneNumber).includes(q) || norm(c.email).includes(q)) {
        hits.push({
          group: "clients",
          id: c._id,
          title: c.name || "Unnamed client",
          meta: c.phoneNumber || c.email || "",
          to: "/client",
        });
      }
    });

    // Cap each group so one record type cannot crowd out the rest.
    return GROUPS.flatMap((g) => {
      const rows = hits.filter((h) => h.group === g.key).slice(0, 4);
      return rows.length ? [{ header: g.label }, ...rows] : [];
    }).slice(0, 18);
  }, [query, data]);

  const go = (to) => {
    setOpen(false);
    setQuery("");
    navigate(to);
  };

  const showPanel = open && query.trim().length >= 2;

  return (
    <div className="gsearch" ref={boxRef}>
      <span className="gsearch__icon">
        {loading ? <FaSpinner className="gsearch__spin" /> : <FaSearch />}
      </span>
      <input
        ref={inputRef}
        type="text"
        className="gsearch__input"
        placeholder="Search enquiries, clients, orders, quotations..."
        value={query}
        onFocus={() => {
          setOpen(true);
          load();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        aria-label="Search records"
      />

      {showPanel ? (
        <div className="gsearch__panel" role="listbox">
          {results.length ? (
            results.map((row, i) =>
              row.header ? (
                <div className="gsearch__group" key={"h" + i}>
                  {row.header}
                </div>
              ) : (
                <button
                  type="button"
                  key={row.group + row.id + i}
                  className="gsearch__row"
                  onClick={() => go(row.to)}
                >
                  <span className="gsearch__title">{row.title}</span>
                  {row.meta ? (
                    <span className="gsearch__meta">{row.meta}</span>
                  ) : null}
                </button>
              )
            )
          ) : (
            <p className="gsearch__empty">
              {loading ? "Loading records..." : "No matches for “" + query.trim() + "”"}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default GlobalSearch;
