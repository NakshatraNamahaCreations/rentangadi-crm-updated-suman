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
  sinceLabel,
  activityTone,
  executivesOf,
} from "./clientFields";
import { ApiURL } from "../../api";
import BusyButton from "../../components/BusyButton";

/**
 * Client directory.
 *
 * The client record holds only a name, phone, email, address and executives.
 * The business figures, the last interaction and the status pill are derived
 * here by joining the enquiry and order lists back onto each client, matched
 * on the last ten digits of the phone number and falling back to an exact
 * name match. Nothing on this page is stored on the client itself.
 */

/* indexByClient, lookup and latestOf used to live here: they matched every
   enquiry and order onto a client by phone, falling back to name. The server
   does that match now - see controller/clientActivity.js - so the page is
   handed the figures instead of both collections. */

const Client = () => {
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  /* clientId -> { enquiries, orders, business, lastActivity, lastKind },
     as the server works them out. */
  const [activity, setActivity] = useState({});
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [executiveFilter, setExecutiveFilter] = useState("all");
  const [sortBy, setSortBy] = useState("activity");

  const [selectedRows, setSelectedRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  /* The open client's own records, fetched when the panel opens. */
  const [history, setHistory] = useState({ enquiries: [], orders: [] });
  const [historyLoading, setHistoryLoading] = useState(false);
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

  /**
   * The business columns, worked out by the server.
   *
   * This page used to download every enquiry and every order - 909KB between
   * them - to end up with five numbers per client. It now asks for those
   * numbers, which is about 50KB, and the join behind them is the same
   * phone-then-name match this file used to do, moved rather than changed.
   *
   * If that call fails the page still lists the clients, with the business
   * columns empty - the same as before, when either list could fail.
   */
  const fetchAll = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      fetchClients(),
      axios.get(`${ApiURL}/client/activity`),
    ]);

    if (results[0].status === "rejected") {
      console.error("Error fetching clients:", results[0].reason);
      toast.error("Could not load the client list");
    }
    if (results[1].status === "fulfilled") {
      setActivity(results[1].value?.data?.activity || {});
    } else {
      console.error("Error fetching client activity:", results[1].reason);
    }
    setLoading(false);
  };

  /* ---- Put the server's figures onto each client ---- */
  const enriched = useMemo(
    () =>
      clients.map((c) => {
        /* A client with nothing recorded against it is not in the answer at
           all, so an absent entry is read as nothing rather than as missing
           data. */
        const a = activity[String(c._id)] || {};
        const last = a.lastActivity ? moment(a.lastActivity) : null;
        return {
          ...c,
          enquiryCount: a.enquiries || 0,
          orderCount: a.orders || 0,
          business: a.business || 0,
          lastActivity: last && last.isValid() ? last : null,
          lastKind: a.lastKind || "",
        };
      }),
    [clients, activity]
  );

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

    const withOrders = enriched.filter((c) => c.orderCount > 0).length;

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
        Enquiries: c.enquiryCount,
        Orders: c.orderCount,
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

  /**
   * The open client's own enquiries and orders.
   *
   * The panel lists them, so it needs the records themselves. Fetching them
   * when it opens costs one small call for the one client being looked at,
   * where the page used to download both whole collections on load in case
   * someone clicked a row.
   */
  useEffect(() => {
    if (!activeId) {
      setHistory({ enquiries: [], orders: [] });
      return;
    }

    let alive = true;
    setHistoryLoading(true);

    axios
      .get(`${ApiURL}/client/${activeId}/history`)
      .then((res) => {
        if (!alive) return;
        setHistory({
          enquiries: res?.data?.enquiries || [],
          orders: res?.data?.orders || [],
        });
      })
      .catch((error) => {
        if (!alive) return;
        console.error("Error fetching client history:", error);
        /* The panel then shows its own "nothing yet" copy, which is wrong
           but not misleading in the way a stale list would be. */
        setHistory({ enquiries: [], orders: [] });
      })
      .finally(() => {
        if (alive) setHistoryLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [activeId]);

  const activeRow = filtered.find((c) => c._id === activeId) || null;

  /* The panel reads client.enquiries and client.orders as arrays, so the
     fetched records are put where it already looks for them. */
  const activeClient = activeRow
    ? { ...activeRow, enquiries: history.enquiries, orders: history.orders }
    : null;
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
              loading={loading}
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
                <BusyButton
              busy={saving} className="eq-primary" type="submit" disabled={saving}>
                  {saving ? "Updating..." : "Update Client"}
                </BusyButton>
              </Modal.Footer>
            </Form>
          )}
        </Modal.Body>
      </Modal>
    </Container>
  );
};

export default Client;
