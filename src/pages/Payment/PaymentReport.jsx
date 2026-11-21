import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Container, Form, Modal, Spinner } from "react-bootstrap";
import {
  FaRupeeSign,
  FaRegClock,
  FaCheckCircle,
  FaChartBar,
  FaSearch,
  FaFileExport,
  FaFilePdf,
  FaUndo,
  FaRegCalendarAlt,
  FaReceipt,
  FaTrashAlt,
} from "react-icons/fa";
import axios from "axios";
import moment from "moment";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { ApiURL } from "../../api";
import Pagination from "../../components/Pagination";
import PaymentPeek from "./PaymentPeek";
import {
  quoteRefOf,
  totalOf,
  advanceOf,
  balanceOf,
  toneOf,
  whenOf,
  inr,
  compactInr,
} from "./paymentFields";
import { toast } from "react-hot-toast";
import BusyButton from "../../components/BusyButton";

const PaymentReport = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showSlipModal, setShowSlipModal] = useState(false);

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${ApiURL}/payment/`);
        const d = res?.data;
        setPayments(Array.isArray(d) ? d : d?.payments || d?.data || []);
      } catch (error) {
        console.error("Error fetching payments:", error);
      }
      setLoading(false);
    };
    fetchPayments();
  }, []);

  const idOf = (p) => p?._id || p?.id;

  const modes = useMemo(() => {
    const set = new Set();
    payments.forEach((p) => {
      const m = String(p?.paymentMode || "").trim();
      if (m) set.add(m);
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const statuses = useMemo(() => {
    const set = new Set();
    payments.forEach((p) => set.add(toneOf(p).label));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [payments]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const hit = (v) => String(v ?? "").toLowerCase().includes(term);
    const from = fromDate ? moment(fromDate, "YYYY-MM-DD").startOf("day") : null;
    const to = toDate ? moment(toDate, "YYYY-MM-DD").endOf("day") : null;

    return payments
      .filter((p) => {
        if (
          term &&
          !(
            hit(quoteRefOf(p)) ||
            hit(p?.companyName) ||
            hit(p?.paymentMode) ||
            hit(p?.paymentRemarks)
          )
        ) {
          return false;
        }
        if (modeFilter !== "all" && String(p?.paymentMode || "").trim() !== modeFilter) {
          return false;
        }
        if (statusFilter !== "all" && toneOf(p).label !== statusFilter) return false;

        const d = whenOf(p);
        if (!d.isValid()) return !from && !to;
        if (from && d.isBefore(from)) return false;
        if (to && d.isAfter(to)) return false;
        return true;
      })
      .sort((a, b) => (whenOf(b).valueOf() || 0) - (whenOf(a).valueOf() || 0));
  }, [payments, searchQuery, modeFilter, statusFilter, fromDate, toDate]);

  const stats = useMemo(() => {
    const collected = filtered.reduce((s, p) => s + advanceOf(p), 0);
    const outstanding = filtered.reduce((s, p) => s + balanceOf(p), 0);
    const settled = filtered.filter((p) => toneOf(p).label === "Completed");
    const monthStart = moment().startOf("month");
    const thisMonth = filtered
      .filter((p) => {
        const d = whenOf(p);
        return d.isValid() && d.isSameOrAfter(monthStart);
      })
      .reduce((s, p) => s + advanceOf(p), 0);
    return {
      collected,
      outstanding,
      settledValue: settled.reduce((s, p) => s + advanceOf(p), 0),
      settledCount: settled.length,
      thisMonth,
    };
  }, [filtered]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows([]);
  }, [searchQuery, modeFilter, statusFilter, fromDate, toDate, itemsPerPage]);

  /* The preview no longer opens on its own: an always-open rail cost the
     table a third of its width, so columns were hidden before the user had
     asked for anything. A stale selection is still cleared. */
  useEffect(() => {
    if (!filtered.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId !== null && !filtered.some((p) => idOf(p) === activeId)) {
      setActiveId(null);
    }
  }, [filtered, activeId]);

  const activePayment = useMemo(
    () => filtered.find((p) => idOf(p) === activeId) || null,
    [filtered, activeId]
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const currentItems = filtered.slice(indexOfLastItem - itemsPerPage, indexOfLastItem);

  const resetFilters = () => {
    setSearchQuery("");
    setModeFilter("all");
    setStatusFilter("all");
    setFromDate("");
    setToDate("");
  };

  const handleSelectRow = (id) =>
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSelectAll = () =>
    setSelectedRows(
      selectedRows.length === currentItems.length ? [] : currentItems.map(idOf)
    );

  const handleDeleteSelected = async () => {
    if (!selectedRows.length) return;
    if (!window.confirm(`Delete ${selectedRows.length} selected payments?`)) return;
    try {
      await Promise.all(selectedRows.map((id) => axios.delete(`${ApiURL}/payment/${id}`)));
      setPayments((prev) => prev.filter((p) => !selectedRows.includes(idOf(p))));
      setSelectedRows([]);
      toast.success("Selected payments deleted");
    } catch (error) {
      toast.error("Failed to delete some payments");
    }
  };

  const openSlip = (payment) => {
    setSelectedPayment(payment);
    setShowSlipModal(true);
  };

  /* Both exports cover exactly the rows the filters currently show. */
  const exportRows = () =>
    filtered.map((p, i) => ({
      "#": i + 1,
      "Payment Date": whenOf(p).isValid() ? whenOf(p).format("DD/MM/YYYY hh:mm A") : "",
      Company: p?.companyName || "",
      "Quotation ID": quoteRefOf(p) || "",
      "Grand Total": totalOf(p),
      Advance: advanceOf(p),
      Balance: balanceOf(p),
      Mode: p?.paymentMode || "",
      Status: toneOf(p).label,
    }));

  const handleDownloadExcel = () => {
    if (!filtered.length) {
      toast.error("Nothing to export");
      return;
    }
    try {
      const ws = XLSX.utils.json_to_sheet(exportRows());
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payments");
      ws["!cols"] = [
        { wch: 5 }, { wch: 20 }, { wch: 26 }, { wch: 14 },
        { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 14 }, { wch: 12 },
      ];
      XLSX.writeFile(wb, `payment-report-${moment().format("YYYY-MM-DD")}.xlsx`);
    } catch (error) {
      toast.error("Could not export to Excel");
    }
  };

  const handleExportPdf = () => {
    if (!filtered.length) {
      toast.error("Nothing to export");
      return;
    }
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Payment Report", 14, 14);
      doc.setFontSize(9);
      doc.text(
        `Generated ${moment().format("DD MMM YYYY, hh:mm A")} · ${filtered.length} rows`,
        14,
        20
      );
      const rows = exportRows();
      autoTable(doc, {
        startY: 25,
        head: [Object.keys(rows[0])],
        body: rows.map((r) => Object.values(r)),
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [194, 65, 139] },
      });
      doc.save(`payment-report-${moment().format("YYYY-MM-DD")}.pdf`);
    } catch (error) {
      toast.error("Could not export to PDF");
    }
  };

  const tiles = [
    {
      key: "collected",
      label: "Total Collections",
      value: "₹ " + compactInr(stats.collected),
      hint: "Advance received",
      icon: FaRupeeSign,
      tone: "green",
    },
    {
      key: "pending",
      label: "Pending Payments",
      value: "₹ " + compactInr(stats.outstanding),
      hint: "Yet to be collected",
      icon: FaRegClock,
      tone: "amber",
    },
    {
      key: "settled",
      label: "Completed Payments",
      value: "₹ " + compactInr(stats.settledValue),
      hint: `${stats.settledCount} fully settled`,
      icon: FaCheckCircle,
      tone: "blue",
    },
    {
      key: "month",
      label: "This Month",
      value: "₹ " + compactInr(stats.thisMonth),
      hint: `From ${moment().startOf("month").format("DD MMM")}`,
      icon: FaChartBar,
      tone: "violet",
    },
  ];

  return (
    <Container fluid className="px-0">
      {/* ---- Header ---- */}
      <div className="qc-head">
        <span className="qc-head__icon">
          <FaChartBar />
        </span>
        <div className="qc-head__text">
          <h2 className="qc-head__title">Payment Report</h2>
          <p className="qc-head__sub">
            Track collections, advances, payment modes and status.
          </p>
        </div>
        <span className="rt-hello__date">
          <FaRegCalendarAlt />
          {moment().format("ddd, DD MMM YYYY")}
        </span>
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
              placeholder="Search quotation id, company, payment mode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search payments"
            />
          </div>

          <div className="pr-range">
            <input
              type="date"
              className="form-control"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              aria-label="From date"
            />
            <span>to</span>
            <input
              type="date"
              className="form-control"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              aria-label="To date"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            aria-label="Filter by payment mode"
          >
            <option value="all">All Modes</option>
            {modes.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Form.Select>

          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All Status</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Form.Select>

          <div className="eq-filters__end">
            <Button className="eq-ghost" onClick={resetFilters}>
              <FaUndo /> Reset
            </Button>
            {selectedRows.length > 0 ? (
              <BusyButton
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </BusyButton>
            ) : null}
            <Button className="eq-ghost" onClick={handleDownloadExcel}>
              <FaFileExport /> Excel
            </Button>
            <Button className="eq-primary" onClick={handleExportPdf}>
              <FaFilePdf /> Export PDF
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ---- Table + preview ---- */}
      <div className="eq-split">
        <Card className="eq-card eq-split__list">
          <div className="table-responsive">
            <table className="table eq-table">
              <thead>
                <tr>
                  <th style={{ width: 42 }}>
                    <input
                      type="checkbox"
                      checked={
                        currentItems.length > 0 &&
                        selectedRows.length === currentItems.length
                      }
                      onChange={handleSelectAll}
                      aria-label="Select all on this page"
                    />
                  </th>
                  <th>Payment Date</th>
                  <th>Company</th>
                  <th>Quotation</th>
                  <th className="text-end">Grand Total</th>
                  <th className="text-end">Advance</th>
                  <th className="text-end">Balance</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="text-center py-5">
                      <Spinner animation="border" size="sm" /> Loading payments...
                    </td>
                  </tr>
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="text-center py-5 eq-none">
                      No payments match these filters.
                    </td>
                  </tr>
                ) : (
                  currentItems.map((p) => {
                    const id = idOf(p);
                    const tone = toneOf(p);
                    const d = whenOf(p);
                    return (
                      <tr
                        key={id}
                        className={id === activeId ? "is-active" : ""}
                        onClick={() => setActiveId(id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(id)}
                            onChange={() => handleSelectRow(id)}
                            aria-label="Select payment"
                          />
                        </td>

                        <td>
                          <span className="eq-strong">
                            {d.isValid() ? d.format("DD/MM/YYYY") : "—"}
                          </span>
                          {d.isValid() ? (
                            <span className="eq-sub">{d.format("hh:mm A")}</span>
                          ) : null}
                        </td>

                        <td>
                          <span className="eq-strong">
                            {p?.companyName || "Unnamed company"}
                          </span>
                        </td>

                        <td>
                          <span className="eq-id">
                            {quoteRefOf(p) || "—"}
                          </span>
                        </td>

                        <td className="text-end eq-amount">
                          &#8377;{inr(totalOf(p))}
                        </td>
                        <td className="text-end eq-amount">
                          &#8377;{inr(advanceOf(p))}
                        </td>
                        <td className="text-end">
                          <span
                            className={
                              balanceOf(p) > 0 ? "pr-due" : "pr-clear"
                            }
                          >
                            &#8377;{inr(balanceOf(p))}
                          </span>
                        </td>

                        <td>{p?.paymentMode || "—"}</td>

                        <td>
                          <span className={`rt-pill ${tone.cls}`}>{tone.label}</span>
                        </td>

                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="eq-actions">
                            <button
                              type="button"
                              className="eq-act is-view"
                              title="Payment slip"
                              onClick={() => openSlip(p)}
                            >
                              <FaReceipt />
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
                {[10, 25, 50].map((n) => (
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

        <PaymentPeek
          payment={activePayment}
          onClose={() => setActiveId(null)}
          onSlip={openSlip}
        />
      </div>

      {/* ---- Payment slip (kept from the previous page) ---- */}
      <Modal show={showSlipModal} onHide={() => setShowSlipModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Payment Slip</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedPayment && (
            <div className="pr-slip">
              <p>
                <strong>Date:</strong>{" "}
                {whenOf(selectedPayment).isValid()
                  ? whenOf(selectedPayment).format("DD/MM/YYYY hh:mm A")
                  : "N/A"}
              </p>
              <p>
                <strong>Company:</strong> {selectedPayment.companyName || "N/A"}
              </p>
              <p>
                <strong>Quotation ID:</strong> {quoteRefOf(selectedPayment) || "N/A"}
              </p>
              <p>
                <strong>Total Amount:</strong> &#8377;{inr(totalOf(selectedPayment))}
              </p>
              <p>
                <strong>Advance Paid:</strong> &#8377;{inr(advanceOf(selectedPayment))}
              </p>
              <p>
                <strong>Balance:</strong> &#8377;{inr(balanceOf(selectedPayment))}
              </p>
              <p>
                <strong>Payment Mode:</strong> {selectedPayment.paymentMode || "N/A"}
              </p>
              <p>
                <strong>Remarks:</strong> {selectedPayment.paymentRemarks || "N/A"}
              </p>
              <p>
                <strong>Comment:</strong> {selectedPayment.comment || "N/A"}
              </p>
              <p>
                <strong>Status:</strong> {toneOf(selectedPayment).label}
              </p>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSlipModal(false)}>
            Close
          </Button>
          <Button className="eq-primary" onClick={() => window.print()}>
            Print
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default PaymentReport;
