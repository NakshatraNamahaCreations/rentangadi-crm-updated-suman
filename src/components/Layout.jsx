import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { accentsForPath } from "../config/pageTones";
import Sidebars from "./Sidebars";
import Header from "./Header";

function Layout({ children, handleLogout, roles }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  /* Published as CSS variables so the sidebar's active pill and each page's
     primary controls pick up the current section's colour without every
     component needing to know the route. */
  const [accent, accentDeep] = accentsForPath(location.pathname);

  // Convert roles object to array of kebab-case keys
  const userAccess = Object.entries(roles || {}).reduce((acc, [key, value]) => {
    if (value) {
      const kebabKey = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
      acc.push(kebabKey);
    }
    return acc;
  }, []);

  // Close the drawer after navigating on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // The drawer only exists below lg; drop it if the viewport grows past that
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 992) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Keep the page behind the drawer from scrolling
  /* Modals and other portalled content mount outside .app-shell, so the
     accent is published on the document root as well. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--route-accent", accent);
    root.style.setProperty("--route-accent-2", accentDeep);
  }, [accent, accentDeep]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  return (
    <>
      <div
        className="d-flex hide-scrollbar app-shell"
        style={{ "--route-accent": accent, "--route-accent-2": accentDeep }}
      >
        <Sidebars isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        {sidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <div className="app-content">
          <Header onMenuClick={() => setSidebarOpen((prev) => !prev)} />
          <div className="px-4 app-page">{children}</div>
        </div>
      </div>
    </>
  );
};

export default Layout;
