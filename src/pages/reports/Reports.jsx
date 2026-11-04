import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FaChartBar, FaHome, FaChevronRight } from "react-icons/fa";
import ProductReports from "./ProductReports";
import ClientReports from "./ClientReports";
import ExecutiveReports from "./ExecutiveReports";

const TABS = [
  { key: "product", label: "Product Reports" },
  { key: "client", label: "Client Reports" },
  { key: "executive", label: "Executive Reports" },
];

const Reports = () => {
  const [key, setKey] = useState("product");

  return (
    <div className="rp-page">
      {/* ---- Header ---- */}
      <div className="qc-head">
        <span className="qc-head__icon">
          <FaChartBar />
        </span>
        <div className="qc-head__text">
          <h2 className="qc-head__title">Reports</h2>
          <p className="qc-head__sub">
            Analyse product, client and executive performance across date
            ranges.
          </p>
        </div>
        <nav className="qd-crumbs" aria-label="Breadcrumb">
          <Link to="/dashboard" aria-label="Dashboard">
            <FaHome />
          </Link>
          <FaChevronRight />
          <span>Operations</span>
          <FaChevronRight />
          <span>Reports</span>
        </nav>
      </div>

      {/* ---- Tabs ---- */}
      <div className="eq-segment" role="tablist" aria-label="Report type">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={key === t.key}
            className={`eq-segment__btn${key === t.key ? " is-active" : ""}`}
            onClick={() => setKey(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {key === "product" ? (
        <ProductReports />
      ) : key === "client" ? (
        <ClientReports />
      ) : (
        <ExecutiveReports />
      )}
    </div>
  );
};

export default Reports;
