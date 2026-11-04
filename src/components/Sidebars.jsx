
import { Link, useLocation } from "react-router-dom";
import {
  FaClipboardList,
  FaTags,
  FaBoxOpen,
  FaUserFriends,
  FaShoppingBag,
  FaCalendarAlt,
  FaFileInvoiceDollar,
  FaFileContract,
  FaChartBar,
  FaChartLine,
  FaCog,
  FaTimes,
  FaExclamationTriangle
} from "react-icons/fa";
import { MdDashboard, MdInventory, MdOutlineSupportAgent } from "react-icons/md";
// The logo PNGs are all white-on-transparent full lockups, so the sidebar
// badge is rendered typographically from the brand monogram instead.
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ApiURL } from "../api";
import { toneForPath } from "../config/pageTones";

const Sidebars = ({ isOpen = false, onClose = () => {} }) => {
  const [userAccess, setUserAccess] = useState({});
  const location = useLocation();
  const token = sessionStorage.getItem("token");

  const menuItems = useMemo(
    () => [
      { key: "dashboard", name: "Dashboard", path: "/dashboard", icon: MdDashboard, group: "" },

      { key: "enquiryList", name: "Enquiry List", path: "/enquiry-list", icon: MdOutlineSupportAgent, group: "Sales" },
      { key: "enquiryCalendar", name: "Enquiry Calendar", path: "/enquiry-calender", icon: FaCalendarAlt, group: "Sales" },
      { key: "quotation", name: "Quotation", path: "/quotation", icon: FaFileInvoiceDollar, group: "Sales" },

      // ✅ Quotation Calendar should depend on quotation permission
      { key: "quotation", name: "Quotation Calendar", path: "/qt-calender", icon: FaCalendarAlt, group: "Sales" },

      { key: "orders", name: "Orders", path: "/orders", icon: FaShoppingBag, group: "Sales" },
      { key: "clients", name: "Clients", path: "/client", icon: FaUserFriends, group: "Sales" },

      { key: "productManagement", name: "Product Management", path: "/product-management", icon: FaBoxOpen, group: "Catalogue" },
      { key: "inventoryProductList", name: "Inventory Product List", path: "/inventory-product-list", icon: MdInventory, group: "Catalogue" },
      { key: "master", name: "Master", path: "/master", icon: FaClipboardList, group: "Catalogue" },
      { key: "banner", name: "Banner", path: "/banner", icon: FaTags, group: "Catalogue" },
      { key: "damagedAndLost", name: "Damaged/Lost", path: "/damaged-products", icon: FaExclamationTriangle, group: "Catalogue" },

      { key: "paymentReport", name: "Payment Report", path: "/payment-report", icon: FaChartBar, group: "Reports" },
      { key: "reports", name: "Reports", path: "/reports", icon: FaChartLine, group: "Reports" },

      { key: "termsAndConditions", name: "Terms & Conditions", path: "/terms-conditions", icon: FaFileContract, group: "Settings" },
      { key: "settings", name: "Settings", path: "/settings", icon: FaCog, group: "Settings" },
    ],
    []
  );

  const safeParsePermissions = () => {
    try {
      const stored = sessionStorage.getItem("permissions");
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      const perms = parsed?.data && typeof parsed.data === "object" ? parsed.data : parsed;

      return perms && typeof perms === "object" ? perms : null;
    } catch (err) {
      console.error("safeParsePermissions error:", err);
      return null;
    }
  };

  useEffect(() => {
    const fetchAdminPermissions = async () => {
      try {
        // ✅ 1) read from session first
        const cached = safeParsePermissions();
        if (cached) {
          setUserAccess(cached);
          return;
        }

        // ✅ 2) fallback fetch from API
        const res = await axios.get(`${ApiURL}/admins/permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const perms = res?.data?.admin?.permissions || {};

        sessionStorage.setItem(
          "permissions",
          JSON.stringify({
            data: perms,
          })
        );

        setUserAccess(perms);
      } catch (error) {
        console.error("fetchAdminPermissions error:", error);
      }
    };

    fetchAdminPermissions();
  }, [token]);

  // ✅ filter menu items by permissions
  const filtered = useMemo(() => {
    try {
      const perms = userAccess && typeof userAccess === "object" ? userAccess : {};
      return menuItems.filter((item) => Boolean(perms?.[item.key]));
    } catch (err) {
      console.error("menu filter error:", err);
      return [];
    }
  }, [menuItems, userAccess]);

  // Keep the declared group order, dropping sections left empty by permissions.
  const sections = useMemo(() => {
    const order = [];
    const bucket = {};
    filtered.forEach((item) => {
      const g = item.group || "";
      if (!bucket[g]) {
        bucket[g] = [];
        order.push(g);
      }
      bucket[g].push(item);
    });
    return order.map((g) => ({ label: g, items: bucket[g] }));
  }, [filtered]);

  const isActiveLink = (path) => {
    try {
      return location.pathname.includes(path);
    } catch (err) {
      return false;
    }
  };

  return (
    <div
      className={`flex-column flex-shrink-0 vh-100 position-fixed sidebar-scroll app-sidebar ${
        isOpen ? "is-open" : ""
      }`}
      style={{ overflowY: "auto", overflowX: "hidden" }}
    >
      <div className="sidebar-brand">
        <Link
          to="/dashboard"
          onClick={onClose}
          className="sidebar-brand__link"
          aria-label="Rent Angadi dashboard"
        >
          <span className="sidebar-brand__mark" aria-hidden="true">RA</span>
          <span className="sidebar-brand__text">
            <span className="sidebar-brand__name">Rent Angadi</span>
            <span className="sidebar-brand__sub">Admin CRM</span>
          </span>
        </Link>
        <button
          type="button"
          className="btn btn-sm sidebar-close d-lg-none"
          onClick={onClose}
          aria-label="Close menu"
        >
          <FaTimes />
        </button>
      </div>

      <nav className="sidebar-nav">
        {sections.map((section) => (
          <div
            key={section.label}
            className="sidebar-group"
            data-group={section.label}
          >
            {section.label ? (
              <div className="sidebar-section-label">{section.label}</div>
            ) : null}
            <ul className="nav flex-column">
              {section.items.map((item, index) => (
                <li
                  key={`${item.path}-${index}`}
                  className="nav-item"
                  data-tone={toneForPath(item.path)}
                >
                  <Link
                    to={item.path}
                    onClick={onClose}
                    className={`${isActiveLink(item.path) ? "custom-bg" : ""} nav-link`}
                  >
                    <span className="rt-navicon">
                      <item.icon />
                    </span>
                    <span>{item.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

    </div>
  );
};

export default Sidebars;
