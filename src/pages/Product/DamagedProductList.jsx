
import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Form,
  Modal,
  Container,
  Row,
  Col,
  Spinner,
} from "react-bootstrap";
import {
  FaPlus,
  FaSearch,
  FaDownload,
  FaBoxOpen,
  FaTools,
  FaExclamationTriangle,
  FaUndo,
} from "react-icons/fa";
import axios from "axios";
import { ApiURL } from "../../api";
import { toast } from "react-hot-toast";
import Pagination from "../../components/Pagination";
import Select from "react-select";

// ✅ NEW: Excel export
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import BusyButton from "../../components/BusyButton";


const DamagedProductList = () => {
  const [damagedProducts, setDamagedProducts] = useState([]);
  const [loadingList, setLoadingList] = useState(false);

  const [products, setProducts] = useState([]);
  const [availableToAdd, setAvailableToAdd] = useState([]);
  const [selectedAddProduct, setSelectedAddProduct] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [damagedCount, setDamagedCount] = useState(0);
  const [lostCount, setLostCount] = useState(0);
  const [repairDescription, setRepairDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  useEffect(() => {
    (async () => {
      await fetchDamagedProducts();
      await fetchQuoteProducts();
    })();
  }, []);

  const fetchDamagedProducts = async () => {
    try {
      setLoadingList(true);
      const res = await axios.get(`${ApiURL}/product/damaged-products`);
      setDamagedProducts(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      console.error("Error fetching damaged products:", err);
      toast.error("Failed to fetch damaged products");
    } finally {
      setLoadingList(false);
    }
  };

  const fetchQuoteProducts = async () => {
    try {
      const response = await axios.get(`${ApiURL}/product/quoteproducts`);
      const list = response.data?.QuoteProduct || [];
      setProducts(list);
      setAvailableToAdd(list);
    } catch (error) {
      console.error("Error fetching products:", error);
      toast.error("Failed to fetch products");
    }
  };

  const handleProductSelect = (selected) => {
    if (selected) {
      const product = availableToAdd.find((p) => p._id === selected.value);
      setSelectedAddProduct(product);
      setDamagedCount(Number(product?.repairCount || 0));
      setLostCount(Number(product?.lostCount || 0));
      setRepairDescription(product?.repairDescription || "");
    } else {
      setSelectedAddProduct(null);
      setDamagedCount(0);
      setLostCount(0);
      setRepairDescription("");
    }
  };

  const handleAddDamaged = async () => {
    try {
      if (!selectedAddProduct) {
        toast.error("Please select a product");
        return;
      }

      const repair = Math.max(0, Number(damagedCount) || 0);
      const lost = Math.max(0, Number(lostCount) || 0);

      setSaving(true);

      const response = await axios.post(`${ApiURL}/product/damaged-products`, {
        productId: selectedAddProduct._id,
        repairCount: repair,
        lostCount: lost,
        repairDescription: repairDescription?.trim() || "",
      });

      if (response.status === 200) {
        toast.success("Damaged/Lost product saved successfully");
        setShowAddModal(false);
        handleCloseAdd();
        await fetchDamagedProducts();
      }
    } catch (error) {
      console.error("Error adding damaged product:", error);
      toast.error(error?.response?.data?.error || "Failed to save damaged/lost product");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Putting units back.
   *
   * The add dialog takes the totals, so returning two of five repaired units
   * meant working out and typing 3. This asks how many came back instead and
   * does that subtraction itself.
   *
   * It posts the same endpoint: ProductStock is derived there as
   * total - repair - lost, so lowering a count is what puts the units back
   * into Product Management and into inventory availability.
   */
  const [returnFor, setReturnFor] = useState(null);
  const [repairedBack, setRepairedBack] = useState(0);
  const [foundBack, setFoundBack] = useState(0);
  const [returning, setReturning] = useState(false);

  const openReturn = (product) => {
    setReturnFor(product);
    setRepairedBack(safeNum(product.repairCount) > 0 ? 1 : 0);
    setFoundBack(0);
  };

  const closeReturn = () => {
    setReturnFor(null);
    setRepairedBack(0);
    setFoundBack(0);
  };

  const handleReturn = async () => {
    if (!returnFor) return;

    const currentRepair = safeNum(returnFor.repairCount);
    const currentLost = safeNum(returnFor.lostCount);
    const backRepair = Math.max(0, Number(repairedBack) || 0);
    const backLost = Math.max(0, Number(foundBack) || 0);

    if (backRepair + backLost < 1) {
      toast.error("Enter how many units came back");
      return;
    }
    if (backRepair > currentRepair) {
      toast.error(`Only ${currentRepair} unit(s) are away for repair`);
      return;
    }
    if (backLost > currentLost) {
      toast.error(`Only ${currentLost} unit(s) are written off`);
      return;
    }

    try {
      setReturning(true);
      const response = await axios.post(`${ApiURL}/product/damaged-products`, {
        productId: returnFor._id,
        repairCount: currentRepair - backRepair,
        lostCount: currentLost - backLost,
        repairDescription: returnFor.repairDescription || "",
      });

      if (response.status === 200) {
        toast.success(
          `${backRepair + backLost} unit(s) back in stock for ${returnFor.ProductName}`
        );
        closeReturn();
        await fetchDamagedProducts();
      }
    } catch (error) {
      toast.error(
        error?.response?.data?.error || "Could not put the units back"
      );
    } finally {
      setReturning(false);
    }
  };

  const handleCloseAdd = () => {
    setShowAddModal(false);
    setSelectedAddProduct(null);
    setDamagedCount(0);
    setLostCount(0);
    setRepairDescription("");
  };

  const filteredDamaged = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();

    return damagedProducts.filter((p) => {
      if (q) {
        const name = (p.ProductName || "").toLowerCase();
        const cat = (p.ProductCategory || "").toLowerCase();
        const sub = (p.ProductSubcategory || "").toLowerCase();
        if (!(name.includes(q) || cat.includes(q) || sub.includes(q))) {
          return false;
        }
      }

      if (statusFilter !== "all") {
        const lost = Number(p.lostCount) || 0;
        const repair = Number(p.repairCount) || 0;
        if (statusFilter === "lost" && !(lost > 0 && repair === 0)) return false;
        if (statusFilter === "repair" && !(repair > 0 && lost === 0)) return false;
        if (statusFilter === "both" && !(lost > 0 && repair > 0)) return false;
      }

      return true;
    });
  }, [damagedProducts, searchTerm, statusFilter]);

  const totalItems = filteredDamaged.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentPageItems = filteredDamaged.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => setCurrentPage(1), [searchTerm, statusFilter, itemsPerPage]);

  const handlePageChange = (pageNumber) => setCurrentPage(pageNumber);

  const safeNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // ✅ NEW: Download full data as Excel
  const handleDownloadExcel = () => {
    try {
      if (!damagedProducts || damagedProducts.length === 0) {
        toast.error("No data to download");
        return;
      }

      const rows = damagedProducts.map((p, i) => ({
        "S.No": i + 1,
        "Product Name": p.ProductName || "",
        "Stock": safeNum(p.ProductStock),
        // "Stock Available": safeNum(p.StockAvailable),
        "Lost": safeNum(p.lostCount),
        "To Repair": safeNum(p.repairCount),
        "Price": safeNum(p.ProductPrice),
        "Description": p.repairDescription || "",
        // "Category": p.ProductCategory || "",
        // "Sub Category": p.ProductSubcategory || "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "DamagedProducts");

      // ✅ Make columns readable width
      worksheet["!cols"] = [
        { wch: 6 },
        { wch: 40 },
        { wch: 14 },
        // { wch: 16 },
        { wch: 8 },
        { wch: 10 },
        { wch: 10 },
        { wch: 40 },
        // { wch: 18 },
        // { wch: 18 },
      ];

      const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
      const blob = new Blob([excelBuffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const fileName = `Damaged_Lost_Products_${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;

      saveAs(blob, fileName);
      toast.success("Excel downloaded");
    } catch (e) {
      console.error(e);
      toast.error("Failed to download excel");
    }
  };

  /* Every figure below is summed from the fetched rows. */
  const stats = useMemo(() => {
    let repair = 0;
    let lost = 0;
    let value = 0;
    damagedProducts.forEach((p) => {
      const r = safeNum(p.repairCount);
      const l = safeNum(p.lostCount);
      repair += r;
      lost += l;
      value += (r + l) * safeNum(p.ProductPrice);
    });
    return { items: damagedProducts.length, repair, lost, value };
  }, [damagedProducts]);

  const tiles = [
    {
      key: "items",
      label: "Products Affected",
      value: stats.items,
      hint: "Have a loss or repair",
      icon: FaBoxOpen,
      tone: "blue",
    },
    {
      key: "repair",
      label: "Units To Repair",
      value: stats.repair,
      hint: "Awaiting refurbishment",
      icon: FaTools,
      tone: "amber",
    },
    {
      key: "lost",
      label: "Units Lost",
      value: stats.lost,
      hint: "Written off",
      icon: FaExclamationTriangle,
      tone: "violet",
    },
  ];

  const rowTone = (p) => {
    const lost = safeNum(p.lostCount);
    const repair = safeNum(p.repairCount);
    if (lost > 0 && repair > 0) {
      return { cls: "is-red", label: "Lost & repair" };
    }
    if (lost > 0) return { cls: "is-red", label: "Lost" };
    if (repair > 0) return { cls: "is-amber", label: "To repair" };
    return { cls: "is-green", label: "Clear" };
  };

  return (
    <Container fluid className="px-0 dmg">
      {/* ---- Header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Damaged &amp; Lost</h2>
          <p className="eq-head__sub">
            Units out of circulation because they need repair or are written off.
          </p>
        </div>
        <div className="eq-head__actions">
          <Button
            className="eq-ghost"
            onClick={handleDownloadExcel}
            disabled={loadingList || damagedProducts.length === 0}
            title={
              damagedProducts.length
                ? "Export every row to Excel"
                : "Nothing to export yet"
            }
          >
            <FaDownload /> Download Sheet
          </Button>
          <Button className="eq-primary" onClick={() => setShowAddModal(true)}>
            <FaPlus /> Add Damaged/Lost
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by product, category or sub-category..."
              aria-label="Search damaged products"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by condition"
          >
            <option value="all">All Conditions</option>
            <option value="repair">To repair</option>
            <option value="lost">Lost</option>
            <option value="both">Lost &amp; repair</option>
          </Form.Select>
        </Card.Body>
      </Card>

      {/* ---- Table ---- */}
      <Card className="eq-card">
        <div className="table-responsive">
          <table className="table eq-table dmg-table">
            <thead>
              <tr>
                <th style={{ width: "56px" }}>#</th>
                <th>Product</th>
                <th className="text-end">Stock</th>
                <th className="text-end">Lost</th>
                <th className="text-end">To Repair</th>
                <th className="text-end">Price</th>
                <th>Condition</th>
                <th>Description</th>
                <th style={{ width: 110 }} className="text-end">
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {loadingList ? (
                <tr>
                  <td colSpan={9} className="text-center py-5">
                    <Spinner animation="border" size="sm" /> Loading...
                  </td>
                </tr>
              ) : currentPageItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-5 eq-none">
                    {searchTerm || statusFilter !== "all"
                      ? "No products match this filter."
                      : "No damaged or lost products recorded."}
                  </td>
                </tr>
              ) : (
                currentPageItems.map((p, idx) => {
                  const tone = rowTone(p);
                  const lost = safeNum(p.lostCount);
                  const repair = safeNum(p.repairCount);
                  return (
                    <tr key={p._id}>
                      <td className="dmg-num">{startIndex + idx + 1}</td>

                      <td>
                        <div className="pm-prod__text">
                          <span className="eq-strong">{p.ProductName}</span>
                          {p.ProductCategory || p.ProductSubcategory ? (
                            <span className="eq-sub">
                              {[p.ProductCategory, p.ProductSubcategory]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td className="text-end">{safeNum(p.ProductStock)}</td>
                      <td className={"text-end" + (lost > 0 ? " dmg-lost" : "")}>
                        {lost}
                      </td>
                      <td
                        className={"text-end" + (repair > 0 ? " dmg-repair" : "")}
                      >
                        {repair}
                      </td>
                      <td className="text-end eq-amount">
                        &#8377;{safeNum(p.ProductPrice)}
                      </td>

                      <td>
                        <span className={`rt-pill ${tone.cls}`}>{tone.label}</span>
                      </td>

                      <td className="dmg-desc">
                        <span
                          className="dmg-desc__text"
                          title={p.repairDescription || ""}
                        >
                          {p.repairDescription || "—"}
                        </span>
                      </td>

                      <td className="text-end">
                        <button
                          type="button"
                          className="dmg-return"
                          onClick={() => openReturn(p)}
                          disabled={lost + repair < 1}
                          title={
                            lost + repair < 1
                              ? "Nothing away to bring back"
                              : "Put repaired or found units back in stock"
                          }
                        >
                          <FaUndo />
                          <span>Return</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalItems > itemsPerPage ? (
          <div className="eq-foot">
            <label className="eq-perpage">
              <span>Rows</span>
              <Form.Select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {[15, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Form.Select>
            </label>

            <Pagination
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={handlePageChange}
            />
          </div>
        ) : null}
      </Card>

      {/* ---- Add modal ---- */}
      <Modal show={showAddModal} onHide={handleCloseAdd} centered backdrop="static">
        <Modal.Header closeButton>
          <Modal.Title>Add Damaged/Lost Product</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Form>
            <Form.Group className="mb-3" controlId="addProductSelect">
              <Form.Label>Product Name</Form.Label>
              <Select
                options={availableToAdd.map((p) => ({
                  value: p._id,
                  label: p.ProductName,
                }))}
                value={
                  selectedAddProduct
                    ? {
                        value: selectedAddProduct._id,
                        label: selectedAddProduct.ProductName,
                      }
                    : null
                }
                onChange={handleProductSelect}
                isClearable
                placeholder="Search product..."
                /* The menu would otherwise be clipped by the modal body. */
                menuPortalTarget={
                  typeof document !== "undefined" ? document.body : null
                }
                menuPosition="fixed"
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                  control: (base, state) => ({
                    ...base,
                    minHeight: 42,
                    borderRadius: 10,
                    borderColor: state.isFocused
                      ? "var(--route-accent, #BD5525)"
                      : "#DCE3EC",
                    boxShadow: "none",
                  }),
                }}
              />
            </Form.Group>

            {selectedAddProduct && (
              <>
                <Row>
                  <Col xs={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Category</Form.Label>
                      <Form.Control
                        type="text"
                        value={selectedAddProduct.ProductCategory || ""}
                        disabled
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Total Qty</Form.Label>
                      <Form.Control
                        type="text"
                        value={selectedAddProduct.qty || ""}
                        disabled
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col xs={12}>
                    <Form.Group className="mb-3">
                      <Form.Label>Description</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        value={repairDescription}
                        onChange={(e) => setRepairDescription(e.target.value)}
                        placeholder="Enter repair/damage description..."
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <Row>
                  <Col xs={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Damaged Count (To Repair)</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={damagedCount}
                        onChange={(e) =>
                          setDamagedCount(Math.max(0, Number(e.target.value) || 0))
                        }
                      />
                      <Form.Text className="text-muted">
                        Current repair count: {selectedAddProduct.repairCount || 0}
                      </Form.Text>
                    </Form.Group>
                  </Col>

                  <Col xs={6}>
                    <Form.Group className="mb-3">
                      <Form.Label>Lost Count</Form.Label>
                      <Form.Control
                        type="number"
                        min={0}
                        value={lostCount}
                        onChange={(e) =>
                          setLostCount(Math.max(0, Number(e.target.value) || 0))
                        }
                      />
                      <Form.Text className="text-muted">
                        Current lost count: {selectedAddProduct.lostCount || 0}
                      </Form.Text>
                    </Form.Group>
                  </Col>
                </Row>
              </>
            )}
          </Form>
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={handleCloseAdd}
            disabled={saving}
          >
            Close
          </Button>

          <BusyButton
            className="eq-primary"
            onClick={handleAddDamaged}
            disabled={!selectedAddProduct || saving}
          >
            {saving ? "Saving..." : "Save"}
          </BusyButton>
        </Modal.Footer>
      </Modal>

      {/* Units coming back into service. */}
      <Modal show={!!returnFor} onHide={closeReturn} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 18, fontWeight: 700 }}>
            Return to stock
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {returnFor ? (
            <>
              <p className="mb-3" style={{ fontSize: 14 }}>
                <strong>{returnFor.ProductName}</strong>{" "}
                <span className="text-muted">
                  &middot; {safeNum(returnFor.ProductStock)} in stock now
                </span>
              </p>

              <Row className="g-3">
                <Col xs={12} md={6}>
                  <Form.Label className="eq-label">
                    Repaired and back
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    max={safeNum(returnFor.repairCount)}
                    value={repairedBack}
                    onChange={(e) => setRepairedBack(e.target.value)}
                    disabled={safeNum(returnFor.repairCount) < 1}
                  />
                  <Form.Text className="text-muted">
                    {safeNum(returnFor.repairCount)} away for repair
                  </Form.Text>
                </Col>

                <Col xs={12} md={6}>
                  <Form.Label className="eq-label">Found again</Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    max={safeNum(returnFor.lostCount)}
                    value={foundBack}
                    onChange={(e) => setFoundBack(e.target.value)}
                    disabled={safeNum(returnFor.lostCount) < 1}
                  />
                  <Form.Text className="text-muted">
                    {safeNum(returnFor.lostCount)} written off
                  </Form.Text>
                </Col>
              </Row>

              <p className="mt-3 mb-0" style={{ fontSize: 13, color: "#6B7280" }}>
                Stock becomes{" "}
                <strong>
                  {Math.max(
                    0,
                    safeNum(returnFor.qty) -
                      Math.max(
                        0,
                        safeNum(returnFor.repairCount) -
                          (Number(repairedBack) || 0)
                      ) -
                      Math.max(
                        0,
                        safeNum(returnFor.lostCount) - (Number(foundBack) || 0)
                      )
                  )}
                </strong>
                , in Product Management and in inventory availability.
              </p>
            </>
          ) : null}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" onClick={closeReturn} disabled={returning}>
            Cancel
          </Button>
          <BusyButton className="eq-primary" onClick={handleReturn} disabled={returning}>
            {returning ? "Saving..." : "Return to stock"}
          </BusyButton>
        </Modal.Footer>
      </Modal>
    </Container>
  );
};

export default DamagedProductList;
