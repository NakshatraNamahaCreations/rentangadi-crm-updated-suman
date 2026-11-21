import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Container, Form, Spinner } from "react-bootstrap";
import {
  FaBoxOpen,
  FaCheckCircle,
  FaExclamationTriangle,
  FaTimesCircle,
  FaSearch,
  FaFileExport,
  FaPlus,
  FaTrashAlt,
  FaEdit,
} from "react-icons/fa";
import { MdVisibility } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import * as XLSX from "xlsx";
import moment from "moment";
import { ApiURL } from "../../api";
import Pagination from "../../components/Pagination";
import ProductPeek from "./ProductPeek";
import { toast } from "react-hot-toast";
import {
  stockOf,
  priceOf,
  stockTone,
  LOW_STOCK_AT,
  inr,
  distinctValues,
} from "./productFields";
import BusyButton from "../../components/BusyButton";

const ProductManagement = () => {
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [selectedRows, setSelectedRows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const navigate = useNavigate();

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${ApiURL}/product/getinventoryproducts`);
      if (response.status === 200) {
        setAllProducts(response.data.ProductsData || []);
      }
    } catch (error) {
      console.error("Error fetching products:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const categories = useMemo(
    () => distinctValues(allProducts, "ProductCategory"),
    [allProducts]
  );
  const materials = useMemo(
    () => distinctValues(allProducts, "Material"),
    [allProducts]
  );

  const stats = useMemo(() => {
    let inStock = 0;
    let low = 0;
    let out = 0;
    allProducts.forEach((p) => {
      const s = stockOf(p);
      if (s <= 0) out += 1;
      else if (s <= LOW_STOCK_AT) low += 1;
      else inStock += 1;
    });
    return { total: allProducts.length, inStock, low, out };
  }, [allProducts]);

  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const hit = (v) => String(v ?? "").toLowerCase().includes(term);

    return allProducts.filter((p) => {
      if (
        term &&
        !(
          hit(p.ProductName) ||
          hit(p.ProductCategory) ||
          hit(p.ProductSubcategory) ||
          hit(p.Material)
        )
      ) {
        return false;
      }
      if (
        categoryFilter !== "all" &&
        String(p?.ProductCategory || "").trim() !== categoryFilter
      ) {
        return false;
      }
      if (
        materialFilter !== "all" &&
        String(p?.Material || "").trim() !== materialFilter
      ) {
        return false;
      }
      if (statusFilter !== "all" && stockTone(p).key !== statusFilter) return false;
      return true;
    });
  }, [allProducts, searchQuery, categoryFilter, materialFilter, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
    setSelectedRows([]);
  }, [searchQuery, categoryFilter, materialFilter, statusFilter, itemsPerPage]);

  // Preview the first row, re-pointing it when the filters move the list.
  /* The preview no longer opens on its own: an always-open rail cost the
     table a third of its width, so columns were hidden before the user had
     asked for anything. A stale selection is still cleared. */
  useEffect(() => {
    if (!filtered.length) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId !== null && !filtered.some((p) => p._id === activeId)) {
      setActiveId(null);
    }
  }, [filtered, activeId]);

  const activeProduct = useMemo(
    () => filtered.find((p) => p._id === activeId) || null,
    [filtered, activeId]
  );

  const indexOfLastItem = currentPage * itemsPerPage;
  const currentItems = filtered.slice(indexOfLastItem - itemsPerPage, indexOfLastItem);

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await axios.delete(`${ApiURL}/product/deleteProducts/${id}`);
      setAllProducts((prev) => prev.filter((p) => p._id !== id));
      setSelectedRows((prev) => prev.filter((x) => x !== id));
      toast.success("Product deleted");
    } catch (error) {
      toast.error("Failed to delete product");
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedRows.length) return;
    if (!window.confirm(`Delete ${selectedRows.length} selected products?`)) return;
    try {
      await Promise.all(
        selectedRows.map((id) => axios.delete(`${ApiURL}/product/deleteProducts/${id}`))
      );
      setAllProducts((prev) => prev.filter((p) => !selectedRows.includes(p._id)));
      setSelectedRows([]);
      toast.success("Selected products deleted");
    } catch (error) {
      toast.error("Failed to delete some products");
    }
  };

  const handleSelectRow = (id) =>
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSelectAll = () =>
    setSelectedRows(
      selectedRows.length === currentItems.length ? [] : currentItems.map((p) => p._id)
    );

  /* Exports exactly the rows the filters currently show. */
  const handleExport = () => {
    if (!filtered.length) {
      toast.error("Nothing to export");
      return;
    }
    try {
      const rows = filtered.map((p, i) => ({
        "#": i + 1,
        Product: p?.ProductName || "",
        Category: p?.ProductCategory || "",
        "Sub Category": p?.ProductSubcategory || "",
        Stock: stockOf(p),
        "Price (₹)": priceOf(p),
        Seater: p?.seater || "",
        Material: p?.Material || "",
        Status: stockTone(p).label,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products");
      ws["!cols"] = [
        { wch: 5 }, { wch: 32 }, { wch: 16 }, { wch: 18 },
        { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 13 },
      ];
      XLSX.writeFile(wb, `products-${moment().format("YYYY-MM-DD")}.xlsx`);
    } catch (error) {
      toast.error("Could not export the list");
    }
  };

  const tiles = [
    {
      key: "total",
      label: "Total Products",
      value: stats.total,
      hint: "Across all categories",
      icon: FaBoxOpen,
      tone: "blue",
    },
    {
      key: "in",
      label: "In Stock",
      value: stats.inStock,
      hint: "Available for rent",
      icon: FaCheckCircle,
      tone: "green",
    },
    {
      key: "low",
      label: "Low Stock",
      value: stats.low,
      hint: `${LOW_STOCK_AT} or fewer left`,
      icon: FaExclamationTriangle,
      tone: "amber",
    },
    {
      key: "out",
      label: "Out of Stock",
      value: stats.out,
      hint: "Needs restocking",
      icon: FaTimesCircle,
      tone: "violet",
    },
  ];

  return (
    <Container fluid className="px-0">
      {/* ---- Header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Product Management</h2>
          <p className="eq-head__sub">
            Manage the rental catalogue, pricing and availability.
          </p>
        </div>
        <div className="eq-head__actions">
          <Button className="eq-primary" onClick={() => navigate("/add-product")}>
            <FaPlus /> Add Product
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
              placeholder="Search products by name, category or material..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search products"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Form.Select>

          <Form.Select
            className="eq-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by stock status"
          >
            <option value="all">All Stock Status</option>
            <option value="in">In Stock</option>
            <option value="low">Low Stock</option>
            <option value="out">Out of Stock</option>
          </Form.Select>

          <Form.Select
            className="eq-select"
            value={materialFilter}
            onChange={(e) => setMaterialFilter(e.target.value)}
            aria-label="Filter by material"
          >
            <option value="all">All Materials</option>
            {materials.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Form.Select>

          <div className="eq-filters__end">
            {selectedRows.length > 0 ? (
              <BusyButton
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </BusyButton>
            ) : null}
            <Button className="eq-ghost" onClick={handleExport}>
              <FaFileExport /> Export
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
                  <th>Product</th>
                  <th>Category</th>
                  <th className="text-end">Stock</th>
                  <th className="text-end">Price</th>
                  <th>Seater</th>
                  <th>Material</th>
                  <th>Status</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="text-center py-5">
                      <Spinner animation="border" size="sm" /> Loading products...
                    </td>
                  </tr>
                ) : currentItems.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-5 eq-none">
                      No products match these filters.
                    </td>
                  </tr>
                ) : (
                  currentItems.map((p) => {
                    const tone = stockTone(p);
                    return (
                      <tr
                        key={p._id}
                        className={p._id === activeId ? "is-active" : ""}
                        onClick={() => setActiveId(p._id)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedRows.includes(p._id)}
                            onChange={() => handleSelectRow(p._id)}
                            aria-label="Select product"
                          />
                        </td>

                        <td>
                          <div className="pm-prod">
                            {p.ProductIcon ? (
                              <img src={p.ProductIcon} alt="" className="pm-prod__img" />
                            ) : (
                              <span className="pm-prod__img pm-prod__img--empty">
                                <FaBoxOpen />
                              </span>
                            )}
                            <span className="pm-prod__text">
                              <span className="eq-strong">
                                {p.ProductName || "Unnamed product"}
                              </span>
                              {p.ProductSubcategory ? (
                                <span className="eq-sub">{p.ProductSubcategory}</span>
                              ) : null}
                            </span>
                          </div>
                        </td>

                        <td>
                          {p.ProductCategory ? (
                            <span className="pm-cat">{p.ProductCategory}</span>
                          ) : (
                            "—"
                          )}
                        </td>

                        <td className="text-end eq-amount">{stockOf(p)}</td>
                        <td className="text-end eq-amount">
                          &#8377;{inr(priceOf(p))}
                        </td>
                        <td>{p.seater || "N/A"}</td>
                        <td>{p.Material || "N/A"}</td>

                        <td>
                          <span className={`rt-pill ${tone.cls}`}>{tone.label}</span>
                        </td>

                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="eq-actions">
                            <button
                              type="button"
                              className="eq-act is-view"
                              title="View"
                              onClick={() => navigate(`/product-details/${p._id}`)}
                            >
                              <MdVisibility />
                            </button>
                            <button
                              type="button"
                              className="eq-act is-edit"
                              title="Edit"
                              onClick={() => navigate(`/edit-product/${p._id}`)}
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className="eq-act is-del"
                              title="Delete"
                              onClick={() => handleDelete(p._id)}
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

        <ProductPeek product={activeProduct} onClose={() => setActiveId(null)} />
      </div>
    </Container>
  );
};

export default ProductManagement;
