import React, { useEffect, useMemo, useState } from "react";
import { Button, Card, Container, Form, Spinner } from "react-bootstrap";
import {
  FaFileExcel,
  FaSearch,
  FaRegCalendarAlt,
  FaBoxOpen,
} from "react-icons/fa";
import axios from "axios";
import Select from "react-select";
import DatePicker from "react-datepicker";
import { format } from "date-fns";
import { toast } from "react-hot-toast";
import Pagination from "../../components/Pagination";
import PendingQuotationsModal from "../../components/PendingQuotationsModal";
import BlockedOrdersModal from "../../components/BlockedOrdersModal";
import { ApiURL } from "../../api";
import { exportInventoryWithImages } from "../../utils/inventoryExcel";
import "react-datepicker/dist/react-datepicker.css";
import BusyButton from "../../components/BusyButton";

/**
 * Inventory availability for a date range.
 *
 * The API answers for a window, so there is nothing to show until the user
 * picks one and fetches: the table only appears afterwards.
 */

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );

const num = (v) => Number(v) || 0;

/* Availability against what is already promised. */
const stockTone = (item) => {
  if (num(item.availableStock) <= 0) {
    return { cls: "is-red", label: "Out of stock" };
  }
  if (num(item.pendingQuotationQty) > num(item.availableStock)) {
    return { cls: "is-amber", label: "Over-committed" };
  }
  return { cls: "is-green", label: "Available" };
};

/* The SheetJS export this screen used to have is gone: it could write the
   figures but not the product pictures, which is what the sheet is now for.
   utils/inventoryExcel.js does both. */

const InventoryProduct = () => {
  const [deliveryDate, setDeliveryDate] = useState("");
  const [dismantleDate, setDismantleDate] = useState("");
  const [products, setProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchedRange, setFetchedRange] = useState(null);
  /* The stock row whose quotation breakdown is open, or null. */
  const [underQuotationsRow, setUnderQuotationsRow] = useState(null);
  /* Same idea for the Blocked column: the figure alone does not say whose
     orders are holding the stock. */
  const [blockedOrdersRow, setBlockedOrdersRow] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Fetch products from the API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        // Use /quoteproducts which returns every product (no server-side
        // pagination). /getProducts caps at a default limit and would
        // silently hide later products from the dropdown.
        const response = await axios.get(`${ApiURL}/product/quoteproducts`);
        const allProducts = response.data.QuoteProduct || [];
        const productOptions = allProducts.map((product) => ({
          value: product._id,
          label: product.ProductName,
          image: product.ProductIcon,
        }));
        setProducts([
          { value: "ALL_PRODUCTS", label: "All Products" },
          ...productOptions,
        ]);
      } catch (error) {
        console.error("Error fetching products:", error);
        toast.error("Could not load the product list");
      }
    };

    fetchProducts();
  }, []);

  // Handle product selection
  const handleProductSelect = (selectedOptions) => {
    if (!selectedOptions) {
      setSelectedProducts([]);
      return;
    }
    // If "All Products" is selected, select all except "All Products"
    const isAllSelected = selectedOptions.some(
      (opt) => opt.value === "ALL_PRODUCTS"
    );
    if (isAllSelected) {
      setSelectedProducts(
        products
          .filter((opt) => opt.value !== "ALL_PRODUCTS")
          .map((opt) => opt.value)
      );
    } else {
      setSelectedProducts(selectedOptions.map((option) => option.value));
    }
  };

  // Handle fetching inventory based on selected products and dates
  const handleFetchInventory = async () => {
    if (!deliveryDate || !dismantleDate) {
      toast.error("Please select both Start Date and End Date.");
      return;
    }

    if (deliveryDate > dismantleDate) {
      setDeliveryDate("");
      setDismantleDate("");
      toast.error("End Date should be after Start Date.");
      return;
    }

    // If the user hasn't picked any product, treat it as "all products"
    const productIdsToShow =
      selectedProducts.length > 0
        ? selectedProducts
        : products
            .filter((opt) => opt.value !== "ALL_PRODUCTS")
            .map((opt) => opt.value);

    try {
      setLoading(true);
      const startDate = format(deliveryDate, "dd-MM-yyyy");
      const endDate = format(dismantleDate, "dd-MM-yyyy");
      const response = await axios.get(`${ApiURL}/inventory/filter/`, {
        params: {
          startDate,
          endDate,
          products: productIdsToShow.join(","),
        },
      });

      const stockData = response.data.stock || [];

      // Ensure every selected product appears in the table, even if the API
      // didn't return inventory for it (otherwise products silently disappear).
      const mergedInventory = productIdsToShow.map((productId) => {
        const stockItem = stockData.find((s) => s.productId === productId);
        if (stockItem) return stockItem;

        const productOption = products.find((p) => p.value === productId);
        return {
          productId,
          productName: productOption?.label || "Unknown",
          productSubcategory: "",
          availableStock: 0,
          reservedStock: 0,
          pendingQuotationQty: 0,
          pendingQuotations: [],
          totalStock: 0,
          price: 0,
        };
      });

      setInventory(mergedInventory);
      setFetchedRange({ startDate, endDate });
      setCurrentPage(1);
      setLoading(false);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      toast.error("Could not fetch inventory for that range");
      setLoading(false);
    }
  };

  /* Fetching the pictures takes a moment, so the button says so rather than
     looking like it did nothing. */
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!inventory.length) {
      toast.error("Fetch an inventory range first");
      return;
    }

    setExporting(true);

    const filename = fetchedRange
      ? `inventory-${fetchedRange.startDate}-to-${fetchedRange.endDate}.xlsx`
      : "InventoryData.xlsx";

    try {
      await exportInventoryWithImages({
        rows: filtered.map((item) => ({
          ...item,
          statusLabel: stockTone(item).label,
        })),
        /* The picture is on the product list the dropdown is built from,
           not on the inventory row, so it is looked up by id. */
        imageOf: (item) =>
          products.find((p) => p.value === item.productId)?.image || "",
        filename,
      });
    } catch (error) {
      console.error("Excel export failed:", error);
      toast.error("Could not build the Excel file");
    } finally {
      setExporting(false);
    }
  };

  /* ---- Search / status filter over the fetched rows ---- */
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inventory.filter((item) => {
      /* The subcategory is on the row now, so it is searchable too - typing
         "Chair" should find the chairs whether or not the word is in each
         product's own name. */
      if (q) {
        const haystack = `${item.productName || ""} ${
          item.productSubcategory || ""
        }`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (statusFilter === "all") return true;
      if (statusFilter === "out") return num(item.availableStock) <= 0;
      if (statusFilter === "over") {
        return (
          num(item.availableStock) > 0 &&
          num(item.pendingQuotationQty) > num(item.availableStock)
        );
      }
      return (
        num(item.availableStock) > 0 &&
        num(item.pendingQuotationQty) <= num(item.availableStock)
      );
    });
  }, [inventory, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, itemsPerPage]);

  const pageStart = (currentPage - 1) * itemsPerPage;
  const pageRows = filtered.slice(pageStart, pageStart + itemsPerPage);

  /* The strip of four tiles that used to sit here - Products Checked,
     Available Units, Blocked Units, Over-committed - is gone. Totalling
     units across different products said little: eighteen chairs and thirty
     tables make "48 available", a number that answers no question anyone
     asks of this screen. The per-product figures in the table below are
     where the answer actually is. */

  const selectStyles = {
    valueContainer: (base) => ({
      ...base,
      maxHeight: 80,
      overflowY: "auto",
      flexWrap: "wrap",
    }),
    menu: (base) => ({ ...base, zIndex: 9999 }),
    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
    control: (base, state) => ({
      ...base,
      minHeight: 42,
      borderRadius: 10,
      borderColor: state.isFocused ? "var(--route-accent, #BD5525)" : "#DCE3EC",
      boxShadow: "none",
      ":hover": { borderColor: "var(--route-accent, #BD5525)" },
    }),
  };

  return (
    <Container fluid className="px-0 inv">
      {/* ---- Header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Inventory Availability</h2>
          <p className="eq-head__sub">
            Check what is free, blocked and already quoted for a date range.
          </p>
        </div>
        <div className="eq-head__actions">
          <Button
            className="eq-ghost"
            onClick={handleExport}
            disabled={!inventory.length || exporting}
            title={
              inventory.length
                ? "Export the rows below to Excel, with a picture of each product"
                : "Fetch an inventory range first"
            }
          >
            {exporting ? (
              <>
                <Spinner animation="border" size="sm" /> Building the file…
              </>
            ) : (
              <>
                <FaFileExcel /> Download Excel
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ---- Range picker ---- */}
      <Card className="eq-card mb-3 inv-filter">
        <Card.Body>
          <span className="od-pane__title">
            <FaRegCalendarAlt /> Filter Inventory
          </span>

          <div className="inv-fields">
            <Form.Group controlId="deliveryDate" className="inv-field">
              <Form.Label>Start Date</Form.Label>
              <DatePicker
                selected={deliveryDate}
                onChange={(date) => setDeliveryDate(date)}
                dateFormat="dd/MM/yyyy"
                className="form-control"
                placeholderText="DD/MM/YYYY"
                popperClassName="inv-datepicker-popper"
                popperPlacement="bottom-start"
              />
            </Form.Group>

            <Form.Group controlId="dismantleDate" className="inv-field">
              <Form.Label>End Date</Form.Label>
              <DatePicker
                selected={dismantleDate}
                onChange={(date) => setDismantleDate(date)}
                minDate={deliveryDate}
                dateFormat="dd/MM/yyyy"
                className="form-control"
                placeholderText="DD/MM/YYYY"
                popperClassName="inv-datepicker-popper"
                popperPlacement="bottom-start"
              />
            </Form.Group>

            <Form.Group className="inv-field inv-field--wide">
              <Form.Label>
                Select Products{" "}
                <span className="inv-hint">(leave empty for all)</span>
              </Form.Label>
              <Select
                isMulti
                options={products}
                value={
                  selectedProducts.length === products.length - 1 &&
                  products.length > 1
                    ? products
                    : products.filter((product) =>
                        selectedProducts.includes(product.value)
                      )
                }
                onChange={handleProductSelect}
                placeholder="Select products"
                getOptionLabel={(e) => e.label}
                getOptionValue={(e) => e.value}
                styles={selectStyles}
                menuPortalTarget={
                  typeof document !== "undefined" ? document.body : null
                }
                menuPosition="fixed"
              />
            </Form.Group>

            <div className="inv-field inv-field--action">
              <BusyButton
                className="eq-primary"
                onClick={handleFetchInventory}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Spinner animation="border" size="sm" /> Fetching
                  </>
                ) : (
                  <>
                    <FaSearch /> Fetch Inventory
                  </>
                )}
              </BusyButton>
            </div>
          </div>
        </Card.Body>
      </Card>

      {/* ---- Results ---- */}
      {loading ? (
        <Card className="eq-card">
          <Card.Body className="text-center py-5">
            <Spinner animation="border" size="sm" /> Checking availability...
          </Card.Body>
        </Card>
      ) : !inventory.length ? (
        <Card className="eq-card">
          <Card.Body className="inv-empty">
            <span className="inv-empty__icon">
              <FaBoxOpen />
            </span>
            <h3>No range checked yet</h3>
            <p>
              Pick a start and end date above, then fetch to see what stock is
              free for that window.
            </p>
          </Card.Body>
        </Card>
      ) : (
        <>
          <Card className="eq-card mb-3">
            <Card.Body className="eq-filters">
              <div className="eq-search">
                <FaSearch />
                <input
                  type="text"
                  placeholder="Search product or subcategory..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search products"
                />
              </div>

              <Form.Select
                className="eq-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by availability"
              >
                <option value="all">All Availability</option>
                <option value="available">Available</option>
                <option value="over">Over-committed</option>
                <option value="out">Out of stock</option>
              </Form.Select>

              {fetchedRange ? (
                <div className="eq-filters__end">
                  <span className="inv-range">
                    <FaRegCalendarAlt /> {fetchedRange.startDate} &rarr;{" "}
                    {fetchedRange.endDate}
                  </span>
                </div>
              ) : null}
            </Card.Body>
          </Card>

          <Card className="eq-card">
            <div className="table-responsive">
              <table className="table eq-table inv-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Subcategory</th>
                    <th className="text-end">Available</th>
                    <th className="text-end">Blocked</th>
                    <th className="text-end">Under Quotations</th>
                    <th className="text-end">Total Stock</th>
                    <th className="text-end">Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="text-center py-5 eq-none">
                        No products match this filter.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((item) => {
                      const productOption = products.find(
                        (p) => p.value === item.productId
                      );
                      const icon = productOption?.image;
                      const tone = stockTone(item);
                      const over =
                        num(item.pendingQuotationQty) > num(item.availableStock);

                      return (
                        <tr key={item.productId}>
                          <td>
                            <div className="pm-prod">
                              {icon ? (
                                <img
                                  src={`${icon}`}
                                  alt=""
                                  className="pm-prod__img"
                                />
                              ) : (
                                <span className="pm-prod__img pm-prod__img--empty">
                                  <FaBoxOpen />
                                </span>
                              )}
                              <span className="pm-prod__text">
                                <span className="eq-strong">
                                  {item.productName}
                                </span>
                              </span>
                            </div>
                          </td>
                          {/* A product with no subcategory on it shows a dash
                              rather than an empty cell, so the column reads
                              as "none recorded" and not as a rendering gap. */}
                          <td className="inv-subcat">
                            {item.productSubcategory || "—"}
                          </td>
                          <td className="text-end eq-amount">
                            {num(item.availableStock)}
                          </td>
                          <td className="text-end">
                            {num(item.reservedStock) > 0 ? (
                              <button
                                type="button"
                                className="uq-link"
                                title="See which orders are holding this product"
                                onClick={() => setBlockedOrdersRow(item)}
                              >
                                {num(item.reservedStock)}
                              </button>
                            ) : (
                              <span className="uq-plain">0</span>
                            )}
                          </td>
                          <td
                            className={
                              "text-end" + (over ? " inv-over" : "")
                            }
                          >
                            {num(item.pendingQuotationQty) > 0 ? (
                              <button
                                type="button"
                                className={"uq-link" + (over ? " is-over" : "")}
                                title="See which quotations hold this product"
                                onClick={() => setUnderQuotationsRow(item)}
                              >
                                {num(item.pendingQuotationQty)}
                              </button>
                            ) : (
                              <span className="uq-plain">0</span>
                            )}
                          </td>
                          <td className="text-end">{num(item.totalStock)}</td>
                          <td className="text-end eq-amount">
                            &#8377;{inr(item.price)}
                          </td>
                          <td>
                            <span className={`rt-pill ${tone.cls}`}>
                              {tone.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {filtered.length > itemsPerPage ? (
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
            ) : null}
          </Card>
        </>
      )}
      <PendingQuotationsModal
        show={!!underQuotationsRow}
        onHide={() => setUnderQuotationsRow(null)}
        row={underQuotationsRow}
        startDate={fetchedRange?.startDate}
        endDate={fetchedRange?.endDate}
      />
      <BlockedOrdersModal
        show={!!blockedOrdersRow}
        onHide={() => setBlockedOrdersRow(null)}
        row={blockedOrdersRow}
        startDate={fetchedRange?.startDate}
        endDate={fetchedRange?.endDate}
      />
    </Container>
  );
};

export default InventoryProduct;
