import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Container, Form, Modal, Spinner } from "react-bootstrap";
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrashAlt,
  FaPhoneAlt,
  FaUsers,
  FaUserCheck,
  FaCrown,
  FaRupeeSign,
  FaFileExport,
} from "react-icons/fa";
import { MdVisibility } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import moment from "moment";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import Pagination from "../../components/Pagination";
import ClientPeek from "./ClientPeek";
import {
  ACTIVE_WITHIN_DAYS,
  HIGH_VALUE_AT,
  inr,
  compactInr,
  initials,
  phoneKey,
  nameKey,
  interactionDate,
  amountOf,
  sinceLabel,
  activityTone,
  executivesOf,
} from "./clientFields";
import { ApiURL } from "../../api";

/**
 * Client directory.
 *
 * The client record holds only a name, phone, email, address and executives.
 * The business figures, the last interaction and the status pill are derived
 * here by joining the enquiry and order lists back onto each client, matched
 * on the last ten digits of the phone number and falling back to an exact
 * name match. Nothing on this page is stored on the client itself.
 */

/* Groups records under both keys a client may be found by. */
const indexByClient = (rows) => {
  const byPhone = new Map();
  const byName = new Map();
  rows.forEach((r) => {
    const p = phoneKey(r?.clientNo ?? r?.clientNumber ?? r?.phoneNumber);
    if (p) {
      if (!byPhone.has(p)) byPhone.set(p, []);
      byPhone.get(p).push(r);
    }
    const n = nameKey(r?.clientName);
    if (n) {
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n).push(r);
    }
  });
  return { byPhone, byName };
};

const lookup = (index, client) => {
  const p = phoneKey(client.contactPersonNumber);
  if (p && index.byPhone.has(p)) return index.byPhone.get(p);
  const n = nameKey(client.companyName);
  if (n && index.byName.has(n)) return index.byName.get(n);
  return [];
};

const latestOf = (rows) => {
  let best = null;
  rows.forEach((r) => {
    const d = interactionDate(r);
    if (d && (!best || d.isAfter(best))) best = d;
  });
  return best;
};

const Client = () => {
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [executiveFilter, setExecutiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState("activity");

  const [selectedRows, setSelectedRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [editClient, setEditClient] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  // Debounce search and reset to page 1 on query change
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchClients = async () => {
    const res = await axios.get(`${ApiURL}/client/getallClients`, {
      headers: { Authorization: `Bearer ${sessionStorage.getItem("token")}` },
    });
    if (res.status === 200 && Array.isArray(res.data.Client)) {
      setClients(
        res.data.Client.map((c) => ({
          companyName: c.name || "N/A",
          contactPersonNumber: c.phoneNumber || "N/A",
          email: c.email || "N/A",
          address: c.address || "N/A",
          executives: c.executives || [],
          /* Only present if the API sends it; the "new this month" tile
             quietly swaps to another metric when it does not. */
          createdAt: c.createdAt || null,
          _id: c._id,
        }))
      );
    }
  };

  /* Enquiries and orders are what make the business columns possible; if
     either call fails the page still lists the clients. */
  const fetchAll = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetchClients(),
      axios.get(`${ApiURL}/Enquiry/getallEnquiry`),
      axios.get(`${ApiURL}/order/getallorder`),
    ]);

    if (results[0].status === "rejected") {
      console.error("Error fetching clients:", results[0].reason);
      toast.error("Could not load the client list");
    }
    if (results[1].status === "fulfilled") {
      const d = results[1].value.data;
      setEnquiries(Array.isArray(d) ? d : d?.enquiryData || d?.data || []);
    }
    if (results[2].status === "fulfilled") {
      const d = results[2].value.data;
      setOrders(Array.isArray(d) ? d : d?.orderData || d?.data || []);
    }
    setLoading(false);
  };

  /* ---- Join the activity onto each client ---- */
  const enriched = useMemo(() => {
    const enqIndex = indexByClient(enquiries);
    const ordIndex = indexByClient(orders);
    return clients.map((c) => {
      const cEnq = lookup(enqIndex, c);
      const cOrd = lookup(ordIndex, c);
      const business = cOrd.reduce((s, o) => s + amountOf(o), 0);
      const lastOrder = latestOf(cOrd);
      const lastEnq = latestOf(cEnq);
      let lastActivity = null;
      let lastKind = "";
      if (lastOrder && (!lastEnq || lastOrder.isAfter(lastEnq))) {
        lastActivity = lastOrder;
        lastKind = "Order";
      } else if (lastEnq) {
        lastActivity = lastEnq;
        lastKind = "Enquiry";
      }
      return {
        ...c,
        enquiries: cEnq,
        orders: cOrd,
        business,
        lastActivity,
        lastKind,
      };
    });
  }, [clients, enquiries, orders]);

  const executives = useMemo(() => {
    const set = new Set();
    clients.forEach((c) =>
      executivesOf(c).forEach((e) => e.name && set.add(e.name))
    );
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [clients]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    const rows = enriched.filter((c) => {
      if (
        q &&
        ![c.companyName, c.contactPersonNumber, c.email, c.address].some((v) =>
          String(v || "").toLowerCase().includes(q)
        )
      ) {
        return false;
      }
      if (statusFilter !== "all") {
        if (statusFilter === "highvalue") {
          if (c.business < HIGH_VALUE_AT) return false;
        } else if (activityTone(c.lastActivity).key !== statusFilter) {
          return false;
        }
      }
      if (
        executiveFilter !== "all" &&
        !executivesOf(c).some((e) => e.name === executiveFilter)
      ) {
        return false;
      }
      return true;
    });

    const sorted = [...rows];
    if (sortBy === "activity") {
      sorted.sort((a, b) => {
        if (!a.lastActivity && !b.lastActivity) return 0;
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.valueOf() - a.lastActivity.valueOf();
      });
    } else if (sortBy === "business") {
      sorted.sort((a, b) => b.business - a.business);
    } else {
      sorted.sort((a, b) => a.companyName.localeCompare(b.companyName));
    }
    return sorted;
  }, [enriched, debouncedSearch, statusFilter, executiveFilter, sortBy]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows([]);
  }, [statusFilter, executiveFilter, sortBy, itemsPerPage]);

  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageRows = filtered.slice(pageStart, pageStart + itemsPerPage);

  // Clamp the page if the filtered list shrinks below the current page.
  useEffect(() => {
    const pages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
    if (currentPage > pages) setCurrentPage(pages);
  }, [filtered.length, itemsPerPage, currentPage]);

  /* ---- Tiles ---- */
  const stats = useMemo(() => {
    const active = enriched.filter(
      (c) => activityTone(c.lastActivity).key === "active"
    ).length;
    const highValue = enriched.filter((c) => c.business >= HIGH_VALUE_AT).length;

    /* Only meaningful when the API returns a created date. */
    const dated = enriched.filter((c) => c.createdAt && moment(c.createdAt).isValid());
    const newThisMonth = dated.filter((c) =>
      moment(c.createdAt).isSame(moment(), "month")
    ).length;

    const withOrders = enriched.filter((c) => c.orders.length > 0).length;

    return {
      total: enriched.length,
      active,
      highValue,
      hasCreatedAt: dated.length > 0,
      newThisMonth,
      withOrders,
      business: enriched.reduce((s, c) => s + c.business, 0),
    };
  }, [enriched]);

  const tiles = [
    {
      key: "total",
      label: "Total Clients",
      value: stats.total,
      hint: "In the directory",
      icon: FaUsers,
      tone: "blue",
    },
    {
      key: "active",
      label: "Active Clients",
      value: stats.active,
      hint: `Activity in ${ACTIVE_WITHIN_DAYS} days`,
      icon: FaUserCheck,
      tone: "green",
    },
    stats.hasCreatedAt
      ? {
          key: "new",
          label: "New This Month",
          value: stats.newThisMonth,
          hint: moment().format("MMMM YYYY"),
          icon: FaPlus,
          tone: "violet",
        }
      : {
          key: "ordering",
          label: "Clients With Orders",
          value: stats.withOrders,
          hint: "Have placed at least one",
          icon: FaRupeeSign,
          tone: "violet",
        },
    {
      key: "high",
      label: "High Value Accounts",
      value: stats.highValue,
      hint: `₹${compactInr(HIGH_VALUE_AT)}+ business`,
      icon: FaCrown,
      tone: "amber",
    },
  ];

  /* ---- Handlers ---- */
  const handleSelectRow = (id) =>
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSelectAll = () => {
    const ids = pageRows.map((c) => c._id);
    const allOn = ids.length > 0 && ids.every((id) => selectedRows.includes(id));
    setSelectedRows(allOn ? [] : ids);
  };

  const deleteOne = async (id) => {
    const token = sessionStorage.getItem("token");
    await axios.delete(`${ApiURL}/client/deleteClient/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const handleDeleteClient = async (id) => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this client?")) return;
    try {
      await deleteOne(id);
      if (activeId === id) setActiveId(null);
      setSelectedRows((prev) => prev.filter((x) => x !== id));
      await fetchAll();
      toast.success("Client deleted");
    } catch (error) {
      console.error("Error deleting client:", error);
      toast.error("Could not delete the client");
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedRows.length) return;
    if (
      !window.confirm(
        `Are you sure you want to delete ${selectedRows.length} selected client(s)?`
      )
    ) {
      return;
    }
    let failed = 0;
    for (const id of selectedRows) {
      try {
        await deleteOne(id);
      } catch (error) {
        failed += 1;
        console.error("Error deleting client:", error);
      }
    }
    setSelectedRows([]);
    setActiveId(null);
    await fetchAll();
    if (failed) toast.error(`${failed} client(s) could not be deleted`);
    else toast.success("Selected clients deleted");
  };

  const handleEditClient = (client) => {
    setEditClient({ ...client });
    setNewPassword("");
    setConfirmPassword("");
    setShowEditModal(true);
  };

  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!editClient || !editClient._id) return;
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setSaving(true);
    try {
      const token = sessionStorage.getItem("token");
      await axios.put(`${ApiURL}/client/editClient/${editClient._id}`, {
        headers: { Authorization: `Bearer ${token}` },
        name: editClient.companyName,
        phoneNumber: editClient.contactPersonNumber,
        email: editClient.email,
        address: editClient.address,
        password: newPassword,
      });
      setShowEditModal(false);
      await fetchAll();
      toast.success("Client updated");
    } catch (error) {
      console.error("Error updating client:", error);
      toast.error(
        "Could not update the client. " +
          (error.response?.data?.error || "Please try again.")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    try {
      const rows = filtered.map((c, i) => ({
        "#": i + 1,
        "Company Name": c.companyName,
        Phone: c.contactPersonNumber,
        Email: c.email,
        Address: c.address,
        Executives: executivesOf(c)
          .map((e) => e.name)
          .join(", "),
        Enquiries: c.enquiries.length,
        Orders: c.orders.length,
        "Total Business": c.business,
        "Last Interaction": c.lastActivity
          ? c.lastActivity.format("DD-MM-YYYY")
          : "",
        Status: activityTone(c.lastActivity).label,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 28 }, { wch: 34 },
        { wch: 24 }, { wch: 11 }, { wch: 9 }, { wch: 15 }, { wch: 16 },
        { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Clients");
      XLSX.writeFile(wb, `clients-${moment().format("YYYY-MM-DD")}.xlsx`);
    } catch (error) {
      toast.error("Could not export the client list");
    }
  };

  const activeClient = filtered.find((c) => c._id === activeId) || null;
  const allOnPage =
    pageRows.length > 0 && pageRows.every((c) => selectedRows.includes(c._id));

  return (
    <Container fluid className="px-0">
      {/* ---- Header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Clients</h2>
          <p className="eq-head__sub">
            Manage client accounts, contacts, and relationship history.
          </p>
        </div>
        <div className="eq-head__actions">
          <Button className="eq-ghost" onClick={handleExport}>
            <FaFileExport /> Export
          </Button>
          <Button className="eq-primary" onClick={() => navigate("/add-client")}>
            <FaPlus /> Add Client
          </Button>
        </div>
      </div>

      {/* ---- Stat tiles ---- */}
      <div className="eq-stats">
        {tiles.map((t) => (
          <div className={`eq-stat is-${t.tone}`} key={t.key}>
            <span className="eq-stat__icon">
              <t.icon />
            </span>
            <div className="eq-stat__body">
              <span className="eq-stat__label">{t.label}</span>
              <span className="eq-stat__value">{t.value}</span>
              <span className="eq-stat__hint">{t.hint}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ---- Filters ---- */}
      <Card className="eq-card mb-3">
        <Card.Body className="eq-filters">
          <div className="eq-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search clients by name, phone, email or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search clients"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="dormant">Dormant</option>
            <option value="none">No activity</option>
            <option value="highvalue">High value</option>
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

          <Form.Select
            className="eq-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort clients"
          >
            <option value="activity">Recent activity</option>
            <option value="business">Highest business</option>
            <option value="name">Name A – Z</option>
          </Form.Select>

          <div className="eq-filters__end">
            {selectedRows.length > 0 ? (
              <Button
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </Button>
            ) : null}
          </div>
        </Card.Body>
      </Card>

      {/* ---- List + preview ---- */}
      <div className="eq-split">
        <Card className="eq-card eq-split__list">
          {selectedRows.length > 0 ? (
            <div className="cl-selbar">
              <span>
                <strong>{selectedRows.length}</strong>{" "}
                {selectedRows.length === 1 ? "client" : "clients"} selected
              </span>
              <button type="button" onClick={() => setSelectedRows([])}>
                Clear
              </button>
            </div>
          ) : null}

          <div className="table-responsive">
            <table className="table eq-table">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={handleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th>Company Name</th>
                  <th>Phone Number</th>
                  <th>Address</th>
                  <th>Last Interaction</th>
                  <th className="text-end">Total Business</th>
                  <th>Executives</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="text-center py-5">
                      <Spinner animation="border" size="sm" /> Loading clients...
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-5 eq-none">
                      No clients found.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((c) => {
                    const tone = activityTone(c.lastActivity);
                    const execs = executivesOf(c);
                    return (
                      <tr
                        key={c._id}
                        className={c._id === activeId ? "is-active" : ""}
                        onClick={() => setActiveId(c._id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(c._id)}
                            onChange={() => handleSelectRow(c._id)}
                            aria-label="Select client"
                          />
                        </td>

                        <td>
                          <div className="cl-co">
                            <span className="cl-co__avatar">
                              {initials(c.companyName)}
                            </span>
                            <span className="cl-co__text">
                              <span className="eq-strong">{c.companyName}</span>
                              {c.email && c.email !== "N/A" ? (
                                <span className="eq-sub">{c.email}</span>
                              ) : null}
                            </span>
                          </div>
                        </td>

                        <td>
                          {c.contactPersonNumber &&
                          c.contactPersonNumber !== "N/A" ? (
                            <a
                              className="cl-link"
                              href={`tel:${c.contactPersonNumber.replace(/\D/g, "")}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {c.contactPersonNumber}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="cl-addr">
                          <span className="cl-addr__text" title={c.address}>
                            {c.address && c.address !== "N/A" ? c.address : "—"}
                          </span>
                        </td>

                        <td>
                          {c.lastActivity ? (
                            <span className="cl-last">
                              <span className="cl-last__when">
                                {sinceLabel(c.lastActivity)}
                              </span>
                              <span className="eq-sub">{c.lastKind}</span>
                            </span>
                          ) : (
                            <span className="eq-sub">None yet</span>
                          )}
                        </td>

                        <td className="text-end eq-amount">
                          &#8377;{inr(c.business)}
                        </td>

                        <td>
                          {execs.length ? (
                            <span className="cl-own">
                              <span className="cl-own__avatar">
                                {initials(execs[0].name)}
                              </span>
                              <span className="cl-own__text">
                                <span>{execs[0].name || "Unnamed"}</span>
                                {execs.length > 1 ? (
                                  <span className="eq-sub">
                                    +{execs.length - 1} more
                                  </span>
                                ) : null}
                              </span>
                            </span>
                          ) : (
                            <span className="eq-sub">Unassigned</span>
                          )}
                        </td>

                        <td>
                          <span className={`rt-pill ${tone.cls}`}>{tone.label}</span>
                        </td>

                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="eq-actions">
                            <button
                              type="button"
                              className="eq-act is-view"
                              title="View"
                              onClick={() => setActiveId(c._id)}
                            >
                              <MdVisibility />
                            </button>
                            {c.contactPersonNumber &&
                            c.contactPersonNumber !== "N/A" ? (
                              <a
                                className="eq-act is-call"
                                title="Call"
                                href={`tel:${c.contactPersonNumber.replace(/\D/g, "")}`}
                              >
                                <FaPhoneAlt />
                              </a>
                            ) : null}
                            <button
                              type="button"
                              className="eq-act is-edit"
                              title="Edit"
                              onClick={() => handleEditClient(c)}
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className="eq-act is-del"
                              title="Delete"
                              onClick={() => handleDeleteClient(c._id)}
                            >
                              <FaTrashAlt />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="eq-foot">
            <label className="eq-perpage">
              <span>Rows</span>
              <Form.Select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Form.Select>
            </label>

            <Pagination
              totalItems={filtered.length}
              itemsPerPage={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </Card>

        <ClientPeek
          client={activeClient}
          onClose={() => setActiveId(null)}
          onEdit={handleEditClient}
        />
      </div>

      {/* ---- Edit modal ---- */}
      <Modal
        show={showEditModal}
        onHide={() => setShowEditModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>Edit Client Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {editClient && (
            <Form onSubmit={handleUpdateClient}>
              <Form.Group className="mb-3">
                <Form.Label>Company Name</Form.Label>
                <Form.Control
                  type="text"
                  value={editClient.companyName}
                  onChange={(e) =>
                    setEditClient({ ...editClient, companyName: e.target.value })
                  }
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Contact Person Number</Form.Label>
                <Form.Control
                  type="tel"
                  value={editClient.contactPersonNumber}
                  onChange={(e) =>
                    setEditClient({
                      ...editClient,
                      contactPersonNumber: e.target.value,
                    })
                  }
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Email</Form.Label>
                <Form.Control
                  type="email"
                  value={editClient.email}
                  onChange={(e) =>
                    setEditClient({ ...editClient, email: e.target.value })
                  }
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Address</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  value={editClient.address}
                  onChange={(e) =>
                    setEditClient({ ...editClient, address: e.target.value })
                  }
                  required
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>New Password</Form.Label>
                <Form.Control
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep the current password"
                />
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Confirm Password</Form.Label>
                <Form.Control
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                />
              </Form.Group>

              <Modal.Footer>
                <Button
                  variant="secondary"
                  onClick={() => setShowEditModal(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button className="eq-primary" type="submit" disabled={saving}>
                  {saving ? "Updating..." : "Update Client"}
                </Button>
              </Modal.Footer>
            </Form>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default Client;
