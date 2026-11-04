import React, { useState } from "react";
import { Container } from "react-bootstrap";
import { FaLayerGroup, FaTags } from "react-icons/fa";

import Category from "./Master/Category";
import SubCategory from "./Master/SubCategory";

/**
 * Master data shell.
 *
 * The page title lives here so the two tabs only carry their own filter row
 * instead of each repeating a header.
 */

const TABS = [
  { id: "category", label: "Category", icon: FaLayerGroup },
  { id: "subcategory", label: "Sub Category", icon: FaTags },
];

const Master = () => {
  const [activeTab, setActiveTab] = useState("category");

  return (
    <Container fluid className="px-0">
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Master Data</h2>
          <p className="eq-head__sub">
            Manage the product categories and sub-categories used across the
            catalogue.
          </p>
        </div>
      </div>

      <div className="rt-segment" role="tablist" aria-label="Master sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`rt-segment__btn${activeTab === tab.id ? " is-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "subcategory" ? <SubCategory /> : <Category />}
    </Container>
  );
};

export default Master;
