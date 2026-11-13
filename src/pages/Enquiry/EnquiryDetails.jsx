
import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import {
  Card,
  Container,
  Row,
  Col,
  Button,
  Form,
  InputGroup,
  Table,
  Modal,
  Spinner,
  Alert,
  Dropdown,
} from "react-bootstrap";
import {
  FaEdit,
  FaTrashAlt,
  FaUser,
  FaBuilding,
  FaPhone,
  FaCalendarAlt,
  FaClock,
  FaCheck,
  FaTimes,
  FaBoxOpen,
  FaArrowLeft,
  FaMapMarkerAlt,
  FaCubes,
  FaShoppingCart,
  FaRupeeSign,
  FaWarehouse,
  FaFileInvoiceDollar,
  FaCalculator,
  FaEllipsisH,
  FaHistory,
  FaCommentDots,
  FaCubes as FaCubesAlt,
  FaPlus,
} from "react-icons/fa";
import { ApiURL } from "../../api";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import moment from "moment";
import PendingQuotationsModal from "../../components/PendingQuotationsModal";
import BusyButton from "../../components/BusyButton";

const EnquiryDetails = () => {
  const { id } = useParams();
  const [tab, setTab] = useState("products");
  const [allProducts, setAllProducts] = useState([]);
  const [confirmed, setConfirmed] = useState({});
  const [search, setSearch] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editQty, setEditQty] = useState(1);
  const [manpower, setManpower] = useState("");
  const [transport, setTransport] = useState("");
  const [discount, setDiscount] = useState("");
  const [gst, setGst] = useState("18");
  const [roundOff, setRoundOff] = useState("");
  const [enquiry, setEnquiry] = useState(null);
  const [filteredProducts, setFilteredProducts] = useState([]);

  // Add Product Modal State
  const [showAdd, setShowAdd] = useState(false);
  /* One entry per product picked in the Add Product dialog. Several can be
     added at once, each with its own quantity: { productId, product, qty } */
  const [addRows, setAddRows] = useState([]);

  const [loading, setLoading] = useState(false);
  const [addLoading, setAddLoading] = useState(false);

  const [inchargeName, setInchargeName] = useState("");
  const [inchargePhone, setInchargePhone] = useState("");

  // ✅ Inventory table states (Under Quotation)
  const [inventoryRows, setInventoryRows] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  /* The stock row whose quotation breakdown is open, or null. */
  const [underQuotationsRow, setUnderQuotationsRow] = useState(null);
  const [inventoryError, setInventoryError] = useState("");

  const gstOptions = [
    { value: "0", label: "0%" },
    { value: "18", label: "18%" },
  ];

  // ✅ Safe display helpers
  const safeText = (v) => (typeof v === "string" ? v.trim() : "");
  const isValidText = (v) => safeText(v).length > 0;

  const displayClientName = isValidText(enquiry?.clientName)
    ? enquiry.clientName
    : isValidText(enquiry?.clientId?.name)
      ? enquiry.clientId.name
      : "N/A";

  const displayExecutiveName = isValidText(enquiry?.executivename)
    ? enquiry.executivename
    : isValidText(enquiry?.clientId?.executiveName)
      ? enquiry.clientId.executiveName
      : "N/A";

  const displayClientNo = isValidText(enquiry?.clientNo)
    ? enquiry.clientNo
    : isValidText(enquiry?.clientId?.phoneNumber)
      ? enquiry.clientId.phoneNumber
      : "N/A";

  useEffect(() => {
    try {
      fetchEnquiry();
      fetchAllProducts();
    } catch (e) {
      console.error(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (enquiry) {
      fetchFilteredInventory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enquiry]);

  // ✅ Inventory filter call (also used to render Under Quotation table)
  const fetchFilteredInventory = async () => {
    try {
      setInventoryLoading(true);
      setInventoryError("");

      const response = await axios.get(`${ApiURL}/inventory/filter`, {
        params: {
          startDate: enquiry?.enquiryDate,
          endDate: enquiry?.endDate,
          products: (enquiry?.products || []).map((p) => p.productId).join(","),
        },
      });

      let stockRows = response?.data?.stock || [];

      console.log("stockRows",stockRows)

      // Preserve order as in enquiry.products
      if (enquiry?.products?.length && stockRows?.length) {
        const orderMap = enquiry.products.map((p) => String(p.productId));
        stockRows = stockRows
          .slice()
          .sort(
            (a, b) =>
              orderMap.indexOf(String(a.productId)) -
              orderMap.indexOf(String(b.productId))
          );
      }

      setFilteredProducts(stockRows); // ✅ your confirm section uses this
      setInventoryRows(stockRows); // ✅ inventory table uses this
    } catch (error) {
      console.error("Error fetching inventory:", error);
      setInventoryError(
        error?.response?.data?.message ||
        "Failed to fetch inventory. Please try again."
      );
      setFilteredProducts([]);
      setInventoryRows([]);
    } finally {
      setInventoryLoading(false);
    }
  };

  const fetchAllProducts = async () => {
    try {
      const res = await axios.get(`${ApiURL}/product/quoteproducts`);
      if (res.status === 200) {
        setAllProducts(res.data.QuoteProduct || []);
      }
    } catch (error) {
      console.error("Error fetching all products:", error);
    }
  };

  /**
   * The state of the order raised from this enquiry's quotation, read from
   * the client's own order list.
   *
   * Only used when the enquiry response does not report it, which is how a
   * cancelled job would otherwise read as merely quoted. A backend that
   * returns `orderStatus` makes this stop happening by itself.
   */
  const fetchOrderState = async (data) => {
    const quoteId = data?.quotationData?.quoteId;
    const clientId =
      data?.clientDetails?._id || data?.clientId?._id || data?.clientId;
    if (!quoteId || !clientId) return null;

    const res = await axios.get(`${ApiURL}/order/my-orders/${clientId}`);
    const rows = Array.isArray(res?.data?.orderData) ? res.data.orderData : [];
    const onThisQuote = rows.filter(
      (o) => String(o?.quoteId || "") === String(quoteId)
    );
    if (!onThisQuote.length) return null;

    /* A confirmed order outranks a cancelled one, so a quote re-confirmed
       after being called off reads as confirmed. */
    const DONE = ["confirm", "approved", "completed"];
    const confirmed = onThisQuote.find((o) =>
      DONE.includes(String(o?.orderStatus || "").toLowerCase())
    );
    return (confirmed || onThisQuote[0])?.orderStatus || null;
  };

  const fetchEnquiry = async () => {
    try {
      const res = await axios.get(`${ApiURL}/enquiry/enquiry-details/${id}`);
      if (res.status === 200) {
        const data = res.data.enrichedResponse;
        setEnquiry(data);

        if (data && data.orderStatus === undefined) {
          try {
            const orderStatus = await fetchOrderState(data);
            if (orderStatus) {
              setEnquiry((prev) => (prev ? { ...prev, orderStatus } : prev));
            }
          } catch (err) {
            /* The stage falls back to what the quotation alone can say. */
            console.error("Error fetching order state:", err);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching enquiry:", error);
    }
  };

  // ✅ Days diff for total calc
  const daysDiff = (() => {
    const start = enquiry?.enquiryDate
      ? moment(enquiry.enquiryDate, "DD-MM-YYYY", true)
      : null;
    const end = enquiry?.endDate
      ? moment(enquiry.endDate, "DD-MM-YYYY", true)
      : null;
    if (start && end && start.isValid() && end.isValid()) {
      return Math.max(1, end.diff(start, "days") + 1);
    }
    return 1;
  })();

  /* Figures for the summary tiles. Stock reuses the same lookup the products
     table uses, so the tile and the row can never disagree. */
  const stockFor = (prod) =>
    Number(
      allProducts.find((ap) => String(ap._id) === String(prod.productId))
        ?.ProductStock ?? prod.stock ?? 0
    ) || 0;

  const lineItems = enquiry?.products || [];
  const totalProducts = lineItems.length;
  const totalQty = lineItems.reduce((sum, pr) => sum + (Number(pr.qty) || 0), 0);
  const totalStock = lineItems.reduce((sum, pr) => sum + stockFor(pr), 0);
  const subTotal = lineItems.reduce(
    (sum, pr) => sum + (Number(pr.qty) || 0) * (Number(pr.price) || 0),
    0
  );

  const totalAmount = enquiry?.products?.reduce(
    (sum, p) =>
      confirmed[p.productId] ? sum + p.qty * p.price * daysDiff : sum,
    0
  );

  const discountAmt = totalAmount * (Number(discount || 0) / 100);
  const totalBeforeCharges = totalAmount - discountAmt;
  const totalAfterCharges =
    totalBeforeCharges + Number(manpower || 0) + Number(transport || 0);
  const gstAmt = totalAfterCharges * (Number(gst || 0) / 100);
  const grandTotal = Math.round(
    totalAfterCharges + gstAmt + Number(roundOff || 0)
  );

  const isAnyProductInsufficient = filteredProducts.some((p) => {
    const orderQty =
      enquiry?.products?.find((ep) => String(ep.productId) === String(p.productId))
        ?.qty || 0;
    return orderQty > Number(p.availableStock || 0);
  });

  // Edit handlers
  const handleEdit = (productId) => {
    try {
      const product = enquiry?.products?.find((p) => p.productId === productId);
      if (product) {
        setEditIdx(productId);
        setEditQty(product.qty);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditSave = (productId) => {
    try {
      let qty = Math.max(1, Number(editQty) || 1);

      const updatedProducts = enquiry.products.map((p) =>
        p.productId === productId ? { ...p, qty, total: qty * p.price } : p
      );

      setEnquiry((prev) => ({
        ...prev,
        products: updatedProducts,
      }));

      setEditIdx(null);
      setEditQty(1);
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditCancel = () => {
    setEditIdx(null);
    setEditQty(1);
  };

  // Confirm button handler
  const handleConfirm = (productId) => {
    setConfirmed((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  // Delete handler (local UI only - as your current code)
  const handleDelete = (productId) => {
    setEnquiry((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.productId !== productId),
    }));
    setConfirmed((prev) => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };

  /**
   * How far this enquiry got, in the same four words the enquiry list
   * uses, so the two screens never disagree.
   *
   * Everything needed is already on the detail response: the quotation it
   * raised, and the state of the order that quotation became.
   */
  const stage = React.useMemo(() => {
    const orderState = String(enquiry?.orderStatus || "").toLowerCase();
    /* The quotation document itself, not the enquiry's own `status`: that
       field stays "sent" after a quotation is deleted, which is why this
       page and the enquiry list disagreed. */
    const quoted = Boolean(enquiry?.quotationData);

    if (enquiry?.hasConfirmedOrder || /confirm|approved|completed/.test(orderState)) {
      return { label: "Confirmed", tone: "confirmed" };
    }
    if (orderState.includes("cancel")) {
      return { label: "Cancelled", tone: "cancelled" };
    }
    if (quoted) return { label: "Quotation Sent", tone: "sent" };
    return { label: "Pending", tone: "pending" };
  }, [enquiry]);

  // Add Product Modal handlers
  const handleShowAdd = () => {
    setShowAdd(true);
    setAddRows([]);
  };

  const handleCloseAdd = () => {
    setShowAdd(false);
    setAddRows([]);
  };

  /**
   * The dialog's product picker. Rows already set up keep their quantity,
   * so adding a fourth product does not reset the three before it.
   *
   * Stock here is the product's own figure rather than availability over a
   * date range: an enquiry has no confirmed dates to reserve against yet,
   * which is what the single-product version did too.
   */
  const handleProductsSelect = (selectedOptions) => {
    const pickedIds = (selectedOptions || []).map((o) => String(o.value));

    setAddRows((prev) => {
      const byId = {};
      prev
        .filter((r) => pickedIds.includes(String(r.productId)))
        .forEach((r) => {
          byId[String(r.productId)] = r;
        });

      return pickedIds.map(
        (id) =>
          byId[id] || {
            productId: id,
            product:
              allProducts.find((p) => String(p._id) === String(id)) || null,
            qty: 1,
          }
      );
    });
  };

  const setRowQty = (productId, value) => {
    setAddRows((prev) =>
      prev.map((r) => {
        if (String(r.productId) !== String(productId)) return r;
        const raw = String(value).replace(/^0+/, "");
        if (raw === "") return { ...r, qty: "" };
        return { ...r, qty: Math.max(1, Number(raw) || 1) };
      })
    );
  };

  const removeAddRow = (productId) =>
    setAddRows((prev) =>
      prev.filter((r) => String(r.productId) !== String(productId))
    );

  const priceOf = (row) => Number(row?.product?.ProductPrice) || 0;
  const stockOf = (row) => Number(row?.product?.ProductStock) || 0;
  const lineTotalOf = (row) => (Number(row?.qty) || 0) * priceOf(row);

  const addRowsReady =
    addRows.length > 0 && addRows.every((r) => Number(r.qty) >= 1);
  const addRowsTotal = addRows.reduce((sum, r) => sum + lineTotalOf(r), 0);

  // ✅ Modal options: filter out already-added ones
  const availableToAdd = allProducts.filter(
    (p) =>
      !(enquiry?.products || []).some(
        (ep) => String(ep.productId || ep._id) === String(p._id)
      )
  );


  const handleAddProduct = async () => {
    try {
      if (!addRows.length || !addRowsReady) return;

      /* Every picked product folded in one after another, so a product
         already on the enquiry has its quantity added to rather than being
         listed twice - which is what the single-product version did. */
      const updatedProducts = addRows.reduce((list, row) => {
        const qty = Math.max(1, Number(row.qty) || 1);
        const id = String(row.product._id);
        const at = list.findIndex((p) => String(p.productId) === id);

        if (at !== -1) {
          const existing = list[at];
          const newQty = Number(existing.qty) + qty;
          return list.map((p, i) =>
            i === at
              ? { ...p, qty: newQty, total: newQty * Number(existing.price) }
              : p
          );
        }

        return [
          ...list,
          {
            productId: row.product._id,
            name: row.product.ProductName || row.product.name || "",
            stock: row.product.ProductStock,
            qty,
            price: Number(row.product.ProductPrice),
            total: qty * Number(row.product.ProductPrice),
          },
        ];
      }, [...(enquiry?.products || [])]);

      const getId = (val) =>
        val && typeof val === "object" && val._id ? String(val._id) : String(val || "");

      const payload = {
        clientName: enquiry.clientName,
        clientId: getId(enquiry.clientId),
        executiveId: getId(enquiry.executiveId),
        executivename: enquiry.executivename || "",
        products: updatedProducts.map((p) => ({
          productId: p.productId,
          name: p.name,
          qty: p.qty,
          price: p.price,
          total: p.total,
        })),
        category: enquiry.category || "",
        discount: enquiry.discount || 0,
        GrandTotal: updatedProducts.reduce((s, p) => s + p.qty * p.price, 0),
        GST: enquiry.GST || 0,
        clientNo: enquiry.clientNo || "",
        address: enquiry.address || "",
        enquiryDate: enquiry.enquiryDate || "",
        endDate: enquiry.endDate || "",
        enquiryTime: enquiry.enquiryTime || "",
        placeaddress: enquiry.placeaddress || "",
      };

      setAddLoading(true);
      const res = await axios.put(
        `${ApiURL}/enquiry/update-enquiry/${id}`,
        payload,
        { headers: { "content-type": "application/json" } }
      );

      if (res.status === 200) {
        setEnquiry((prev) => ({ ...prev, products: updatedProducts }));
        toast.success(
          addRows.length === 1
            ? "Product added successfully"
            : `${addRows.length} products added successfully`
        );
        setShowAdd(false);
        setAddRows([]);
      } else {
        toast.error(
          addRows.length === 1
            ? "Failed to add product"
            : "Failed to add the products"
        );
      }
    } catch (e) {
      console.error(e);
      toast.error(
        e?.response?.data?.error || e?.response?.data?.message || "Failed to add product"
      );
    } finally {
      setAddLoading(false);
    }
  };

  const handleCreateQuote = async () => {
    try {
      if (!enquiry) {
        alert("Enquiry data not loaded");
        return;
      }

      const confirmedProducts = enquiry?.products?.filter(
        (product) => confirmed[product?.productId]
      );

      setLoading(true);

      const config = {
        url: "/quotations/createQuotation",
        method: "post",
        baseURL: ApiURL,
        headers: { "content-type": "application/json" },
        data: {
          enquiryObjectId: enquiry._id,
          enquiryId: enquiry.enquiryId,
          userId: enquiry.userId,
          quoteTime: enquiry.enquiryTime,
          quoteDate: enquiry.enquiryDate,
          endDate: enquiry.endDate,
          clientId: enquiry.clientId,
          executiveId: enquiry.executiveId,
          clientName: enquiry.clientName,
          executivename: enquiry.executivename,
          workerAmt: 0,
          category: enquiry.category,
          followupStatus: enquiry.followupStatus || "",
          GST: Number(gst) || 0,
          GrandTotal: Number(grandTotal) || 0,
          adjustments: Number(roundOff) || 0,
          discount: Number(discount) || 0,
          status: "pending",
          termsandCondition: enquiry.termsandCondition || [],
          clientNo: enquiry?.clientNo || "",
          address: enquiry.address,
          labourecharge: Number(manpower) || 0,
          transportcharge: Number(transport) || 0,
          inchargeName: inchargeName || "",
          inchargePhone: inchargePhone || "",
          placeaddress: enquiry.placeaddress || "",
          slots: enquiry.slots || [
            {
              slotName: enquiry.enquiryTime,
              Products: confirmedProducts?.length ? confirmedProducts : enquiry.products,
              quoteDate: enquiry.enquiryDate,
              endDate: enquiry.endDate,
            },
          ],
        },
      };

      const response = await axios(config);
      if (response.status === 200) {
        toast.success("Quotation Created Successfully");
        window.location.reload();
      }
    } catch (error) {
      console.error("Error creating quotation:", error);
      if (error.response) {
        alert(error.response.data.error || "Error creating quotation");
      } else {
        alert("An error occurred. Please try again later.");
      }
    } finally {
      setLoading(false);
    }
  };

  // ✅ helper to get icon from allProducts
  const getProductIconById = (productId) => {
    const prod = allProducts.find((p) => String(p._id) === String(productId));
    return prod?.ProductIcon || "";
  };

  const getProductNameById = (productId, fallbackName = "") => {
    const prod = allProducts.find((p) => String(p._id) === String(productId));
    return prod?.ProductName || fallbackName || "N/A";
  };

  return (
    <Container
      fluid
      className="py-4"
      style={{ background: "#f6f8fa", minHeight: "100vh" }}
    >
      {/* ---- Record header ---- */}
      <div className="enq-hero">
        <div className="enq-hero__text">
          <span className="enq-hero__id">
            {enquiry?.enquiryId ? `#${enquiry.enquiryId}` : "Enquiry"}
          </span>
          <span className="enq-hero__meta">
            {displayClientName}
            {enquiry?.createdAt
              ? " · raised " + moment(enquiry.createdAt).format("DD MMM YYYY")
              : ""}
          </span>
        </div>
        {enquiry ? (
          <span className={`enq-chip is-${stage.tone}`}>{stage.label}</span>
        ) : null}

        <Dropdown className="enq-hero__menu">
          <Dropdown.Toggle variant="" id="enq-more">
            More Actions
          </Dropdown.Toggle>
          <Dropdown.Menu align="end">
            <Dropdown.Item as={Link} to={`/edit-enquiry/${enquiry?._id || id}`}>
              <FaEdit className="me-2" /> Edit enquiry
            </Dropdown.Item>
            {displayClientNo && displayClientNo !== "N/A" ? (
              <Dropdown.Item href={`tel:${displayClientNo}`}>
                <FaPhone className="me-2" /> Call client
              </Dropdown.Item>
            ) : null}
            <Dropdown.Divider />
            <Dropdown.Item onClick={() => setTab("inventory")}>
              <FaWarehouse className="me-2" /> Check inventory
            </Dropdown.Item>
            {enquiry?.status === "sent" ? (
              <Dropdown.Item onClick={() => setTab("quotation")}>
                <FaFileInvoiceDollar className="me-2" /> View quotation
              </Dropdown.Item>
            ) : null}
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* ---- Stat tiles ---- */}
      <div className="enq-stats">
        <div className="enq-stat" style={{ "--stat": "#6D4FC4" }}>
          <span className="enq-stat__icon"><FaBoxOpen /></span>
          <span className="enq-stat__body">
            <span className="enq-stat__label">Total Products</span>
            <span className="enq-stat__value">{totalProducts}</span>
            <span className="enq-stat__hint">In this enquiry</span>
          </span>
        </div>
        <div className="enq-stat" style={{ "--stat": "#17864F" }}>
          <span className="enq-stat__icon"><FaWarehouse /></span>
          <span className="enq-stat__body">
            <span className="enq-stat__label">Total Stock</span>
            <span className="enq-stat__value">{totalStock}</span>
            <span className="enq-stat__hint">Units in stock</span>
          </span>
        </div>
        <div className="enq-stat" style={{ "--stat": "#2563C9" }}>
          <span className="enq-stat__icon"><FaShoppingCart /></span>
          <span className="enq-stat__body">
            <span className="enq-stat__label">Total Qty</span>
            <span className="enq-stat__value">{totalQty}</span>
            <span className="enq-stat__hint">Units requested</span>
          </span>
        </div>
        <div className="enq-stat" style={{ "--stat": "#7C3AED" }}>
          <span className="enq-stat__icon"><FaRupeeSign /></span>
          <span className="enq-stat__body">
            <span className="enq-stat__label">Sub Total</span>
            <span className="enq-stat__value">
              &#8377;{subTotal.toLocaleString("en-IN")}
            </span>
            <span className="enq-stat__hint">Qty &times; price</span>
          </span>
        </div>
      </div>

      <Row>
        {/* Left: Enquiry Details */}
        <Col md={5} lg={4}>
          <Card className="mb-4 shadow-sm" style={{ borderRadius: 16, fontSize: 13 }}>
            <Card.Body>
              <div className="enq-client">
                <span className="enq-client__avatar" aria-hidden="true">
                  <FaBuilding />
                </span>
                <div className="enq-client__main">
                  <h5 className="enq-client__name">{displayClientName}</h5>
                  {enquiry?.category ? (
                    <span className="enq-tag">{enquiry.category}</span>
                  ) : null}
                </div>
              </div>
              <hr className="enq-rule" />
              <div className="mb-2 d-flex align-items-center">
                <FaUser className="me-2" />
                <span style={{ fontWeight: 600 }}>Executive:</span>
                <span className="ms-2">{displayExecutiveName}</span>
              </div>
              <div className="mb-2 d-flex align-items-center">
                <FaPhone className="me-2" />
                <span style={{ fontWeight: 600 }}>Contact:</span>
                <span className="ms-2">{displayClientNo}</span>
              </div>
              <div className="mb-2 d-flex align-items-center">
                <FaCalendarAlt className="me-2" />
                <span style={{ fontWeight: 600 }}>Enquiry Date:</span>
                <span className="ms-2">
                  {moment(enquiry?.createdAt).format("DD-MM-YYYY")}
                </span>
              </div>
              <div className="mb-2 d-flex align-items-center">
                <FaCalendarAlt className="me-2" />
                <span style={{ fontWeight: 600 }}>Delivery Date:</span>
                <span className="ms-2">{enquiry?.enquiryDate}</span>
              </div>
              <div className="mb-2 d-flex align-items-center">
                <FaCalendarAlt className="me-2" />
                <span style={{ fontWeight: 600 }}>Dismantle Date:</span>
                <span className="ms-2">{enquiry?.endDate}</span>
              </div>
              <div className="mb-2 d-flex align-items-center">
                <FaClock className="me-2" />
                <span style={{ fontWeight: 600 }}>Slot:</span>
                <span className="ms-2">{enquiry?.enquiryTime}</span>
              </div>
              <div className="mb-2 d-flex">
                <FaMapMarkerAlt className="me-2 mt-1 flex-shrink-0" />
                <div>
                  <span style={{ fontWeight: 600 }}>Address:</span>
                  <div style={{ fontSize: 12, color: "#555" }}>
                    {enquiry?.address || enquiry?.placeaddress || "N/A"}
                  </div>
                </div>
              </div>

              <div className="enq-actions">
                <Link
                  to={`/edit-enquiry/${enquiry?._id || id}`}
                  className="enq-action"
                >
                  <FaEdit /> Edit
                </Link>
                {displayClientNo && displayClientNo !== "N/A" ? (
                  <a href={`tel:${displayClientNo}`} className="enq-action">
                    <FaPhone /> Call
                  </a>
                ) : null}
              </div>
            </Card.Body>
          </Card>

        </Col>

        {/* Right: Product Details */}
        <Col md={7} lg={8}>
          <div className="enq-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "products"}
              className={`enq-tab${tab === "products" ? " is-active" : ""}`}
              onClick={() => setTab("products")}
            >
              <FaBoxOpen /> Products ({totalProducts})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "inventory"}
              className={`enq-tab${tab === "inventory" ? " is-active" : ""}`}
              onClick={() => setTab("inventory")}
            >
              <FaWarehouse /> Inventory
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "quotation"}
              className={`enq-tab${tab === "quotation" ? " is-active" : ""}`}
              onClick={() => setTab("quotation")}
            >
              <FaFileInvoiceDollar /> Quotation
            </button>
          </div>

          <div style={{ display: tab === "products" ? "block" : "none" }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h4 style={{ fontWeight: 700, marginBottom: 0 }}>Products</h4>
            {enquiry?.status === "not send" && (
              <Button className="eq-primary" onClick={handleShowAdd}>
                <FaPlus /> Add Product
              </Button>
            )}
          </div>

          <Table
            bordered
            hover
            responsive
            size="sm"
            style={{ background: "#fff", fontSize: 13, marginTop: "20px" }}
          >
            <thead className="table-light">
              <tr>
                <th>#</th>
                <th>Product Name</th>
                <th>Stock</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
             
                {enquiry?.status === "not send" && <th>Action</th>}
              </tr>
            </thead>
            <tbody>
              {enquiry?.products?.map((p, idx) => {
                const stock =
                  allProducts.find((ap) => String(ap._id) === String(p.productId))
                    ?.ProductStock || p.stock;

                return (
                  <tr key={p._id || `${p.productId}-${idx}`}>
                    <td>{idx + 1}</td>
                    <td>
                      <div className="enq-prod">
                        {/* ProductIcon already holds the whole address of
                            the picture. Hanging it off the API host as
                            /productImage/<icon> built a URL with two
                            addresses in it, so every row showed a broken
                            image. Every other screen uses it as it comes
                            and this one now does too. */}
                        {getProductIconById(p.productId) ? (
                          <img
                            src={getProductIconById(p.productId)}
                            alt=""
                            className="enq-prod__img"
                            /* A picture that will not load is hidden, so
                               the row reads as one without a picture
                               rather than showing a broken one. */
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <span className="enq-prod__img enq-prod__img--empty">
                            <FaBoxOpen />
                          </span>
                        )}
                        <span className="enq-prod__name">
                          {p.name || p.productName || getProductNameById(p.productId)}
                        </span>
                      </div>
                    </td>
                    <td>{stock}</td>
                    <td>
                      {editIdx === p.productId ? (
                        <Form.Control
                          type="number"
                          min={1}
                          value={editQty}
                          onChange={(e) => {
                            let val = e.target.value.replace(/^0+/, "");
                            setEditQty(val === "" ? "" : Math.max(1, Number(val)));
                          }}
                          style={{ width: 70, padding: "2px 6px", fontSize: 13 }}
                          autoFocus
                        />
                      ) : (
                        p.qty
                      )}
                    </td>
                    <td>₹{p.price}</td>
                    <td>₹{p.qty * p.price}</td>
              

                    {enquiry?.status === "not send" && (
                      <td>
                        {editIdx === p.productId ? (
                          <>
                            <Button
                              variant="success"
                              size="sm"
                              style={{ padding: "2px 6px", marginRight: 4 }}
                              onClick={() => handleEditSave(p.productId)}
                              disabled={confirmed[p.productId]}
                            >
                              <FaCheck />
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              style={{ padding: "2px 6px" }}
                              onClick={handleEditCancel}
                              disabled={confirmed[p.productId]}
                            >
                              <FaTimes />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="link"
                              size="sm"
                              style={{ color: "#157347", padding: 0 }}
                              onClick={() => handleEdit(p.productId)}
                              disabled={confirmed[p.productId]}
                            >
                              <FaEdit />
                            </Button>
                            <Button
                              variant="link"
                              size="sm"
                              style={{ color: "#d00", padding: 0, marginLeft: 8 }}
                              onClick={() => handleDelete(p.productId)}
                              disabled={confirmed[p.productId]}
                            >
                              <FaTrashAlt />
                            </Button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Table>

          {/* Confirm Products Section */}
          <Card className="shadow-sm mb-4" style={{ borderRadius: 14 }}>
            <Card.Body>
              <div className="mb-3" style={{ maxWidth: 320 }}>
                <InputGroup>
                  <Form.Control
                    type="text"
                    placeholder="Search product to confirm..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </InputGroup>
              </div>

              <Table
                bordered
                hover
                responsive
                size="sm"
                style={{ background: "#f9f9f9", fontSize: 13 }}
              >
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product Name</th>
                    <th>Order Qty</th>
                    <th>Available</th>
                    <th>Status</th>
                    {enquiry?.status === "not send" && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts?.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted">
                        No products found.
                      </td>
                    </tr>
                  )}

                  {filteredProducts?.map((p, idx) => {
                    const orderQty =
                      enquiry?.products?.find(
                        (ap) => String(ap.productId) === String(p.productId)
                      )?.qty || 0;

                    const canConfirm =
                      Number(p.availableStock || 0) > 0 &&
                      orderQty <= Number(p.availableStock || 0);

                    return (
                      <tr key={p.productId}>
                        <td>{idx + 1}</td>
                        <td>{p.productName}</td>
                        <td>{orderQty}</td>
                        <td>{p.availableStock}</td>
                        <td>
                          {enquiry?.status === "not send" ? (
                            confirmed[p.productId] ? (
                              <span style={{ color: "#28a745", fontWeight: 600 }}>
                                Confirmed
                              </span>
                            ) : (
                              <span style={{ color: canConfirm ? "#007bff" : "#d00" }}>
                                {canConfirm ? "Pending" : "Insufficient"}
                              </span>
                            )
                          ) : (
                            <span style={{ color: "#6c757d", fontStyle: "italic" }}>
                              Sent
                            </span>
                          )}
                        </td>

                        {enquiry?.status === "not send" && (
                          <td>
                            <Button
                              variant={confirmed[p.productId] ? "success" : "outline-success"}
                              size="sm"
                              onClick={() => handleConfirm(p.productId)}
                              disabled={!canConfirm}
                            >
                              {confirmed[p.productId] ? "Confirmed" : "Confirm"}
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card.Body>
          </Card>

          </div>

          <div style={{ display: tab === "inventory" ? "block" : "none" }}>
          {/* ✅ Inventory Table (Under Quotation) */}
          <Card className="shadow-sm mb-4" style={{ borderRadius: 14 }}>
            <Card.Body>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
                  <FaBoxOpen />
                  <h5 style={{ margin: 0, fontWeight: 800 }}>Inventory </h5>
                </div>

                <BusyButton
                  size="sm"
                  variant="outline-secondary"
                  onClick={fetchFilteredInventory}
                  disabled={inventoryLoading}
                >
                  {inventoryLoading ? "Refreshing..." : "Refresh"}
                </BusyButton>
              </div>

              {inventoryError ? (
                <Alert variant="danger" className="mb-2">
                  {inventoryError}
                </Alert>
              ) : null}

              {inventoryLoading ? (
                <div className="py-4 text-center">
                  <Spinner animation="border" size="sm" />{" "}
                  <span className="ms-2">Loading inventory...</span>
                </div>
              ) : (
                <Table
                  bordered
                  hover
                  responsive
                  size="sm"
                  style={{ background: "#fff", fontSize: 13 }}
                >
                  <thead className="table-light">
                    <tr>
                      <th style={{ width: 70 }}>#</th>
                      <th>Product</th>
                      <th style={{ width: 90 }}>Icon</th>
                      <th style={{ width: 160 }}>Available Stock</th>
                      <th style={{ width: 160 }}>Under Quotations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRows?.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted">
                          No inventory data found.
                        </td>
                      </tr>
                    ) : (
                      inventoryRows.map((row, idx) => {
                        const iconFile = getProductIconById(row.productId);
                        const iconUrl = iconFile ? `${iconFile}` : "";
                        const name = getProductNameById(row.productId, row.productName);

                        return (
                          <tr key={`${row.productId}-${idx}`}>
                            <td>{idx + 1}</td>

                            <td style={{ fontWeight: 600 }}>{name}</td>
                            <td>
                              {iconUrl ? (
                                <img
                                  src={iconUrl}
                                  alt={name}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    objectFit: "cover",
                                    border: "1px solid #eee",
                                    background: "#fafafa",
                                  }}
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    background: "#f1f3f5",
                                    border: "1px solid #eee",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: 800,
                                    color: "#666",
                                  }}
                                  title="No Icon"
                                >
                                  {String(name || "P").slice(0, 1).toUpperCase()}
                                </div>
                              )}
                            </td>
                            <td>
                              <span>
                                {row.availableStock}
                              </span>
                            </td>
                            <td
                              style={
                                row.availableStock < row.pendingQuotationQty
                                  ? { color: "#D97706", fontWeight: 700 }
                                  : {}
                              }
                            >
                              {Number(row.pendingQuotationQty) > 0 ? (
                                <button
                                  type="button"
                                  className={
                                    "uq-link" +
                                    (row.availableStock < row.pendingQuotationQty
                                      ? " is-over"
                                      : "")
                                  }
                                  title="See which quotations hold this product"
                                  onClick={() => setUnderQuotationsRow(row)}
                                >
                                  {row.pendingQuotationQty}
                                </button>
                              ) : (
                                <span className="uq-plain">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
          </div>

          <div style={{ display: tab === "quotation" ? "block" : "none" }}>
            <Card className="shadow-sm mb-4" style={{ borderRadius: 14 }}>
              <Card.Body>
                <div className="enq-summary__head">
                  <FaFileInvoiceDollar />
                  <h5>Quotation</h5>
                </div>
                {enquiry?.status === "sent" && enquiry?.quotationData ? (
                  <ul className="enq-summary__list">
                    <li>
                      <span>Discount</span>
                      <b>{enquiry.quotationData.discount || 0}%</b>
                    </li>
                    <li>
                      <span>GST</span>
                      <b>{enquiry.quotationData.GST || 0}%</b>
                    </li>
                    <li>
                      <span>Transport charge</span>
                      <b>&#8377;{enquiry.quotationData.transportcharge || 0}</b>
                    </li>
                    <li>
                      <span>Labour charge</span>
                      <b>&#8377;{enquiry.quotationData.labourecharge || 0}</b>
                    </li>
                    <li>
                      <span>Incharge</span>
                      <b>{enquiry.quotationData.inchargeName || "N/A"}</b>
                    </li>
                    <li>
                      <span>Incharge phone</span>
                      <b>{enquiry.quotationData.inchargePhone || "N/A"}</b>
                    </li>
                    <li>
                      <span>Grand total</span>
                      <b>&#8377;{enquiry.quotationData.GrandTotal || 0}</b>
                    </li>
                  </ul>
                ) : (
                  <p className="rt-empty">
                    No quotation has been created for this enquiry yet.
                  </p>
                )}
              </Card.Body>
            </Card>
          </div>
        </Col>
      </Row>

      {/* ---- Summary + status: full width, so a short tab panel above
           does not leave a tall empty column ---- */}
      <Row>
        <Col md={6}>
        {/* ---- Summary ---- */}
        <Card className="mb-4 shadow-sm enq-summary">
          <Card.Body>
            <div className="enq-summary__head">
              <FaCalculator />
              <h5>Summary</h5>
            </div>
            <ul className="enq-summary__list">
              <li>
                <span>Total Products</span>
                <b>{totalProducts}</b>
              </li>
              <li>
                <span>Total Quantity</span>
                <b>{totalQty}</b>
              </li>
              <li>
                <span>Sub Total</span>
                <b>&#8377;{subTotal.toLocaleString("en-IN")}</b>
              </li>
            </ul>
            <div className="enq-summary__total">
              <span>Total Confirmed Amount</span>
              <b>
                &#8377;{" "}
                {enquiry?.status === "sent"
                  ? enquiry?.quotationData?.GrandTotal
                  : grandTotal}
              </b>
            </div>
          </Card.Body>
        </Card>
        </Col>
        <Col md={6}>
        {/* ---- Status ----
             Built from the states this record actually has: the enquiry
             exists, a quotation has been generated, and the quotation has
             been confirmed. No stages are shown that the data cannot back. */}
        <Card className="mb-4 shadow-sm">
          <Card.Body>
            <div className="enq-summary__head">
              <FaHistory />
              <h5>Status</h5>
            </div>
            <ol className="enq-steps">
              {[
                {
                  key: "raised",
                  label: "Enquiry raised",
                  done: true,
                  when: enquiry?.createdAt
                    ? moment(enquiry.createdAt).format("DD-MM-YYYY")
                    : "",
                },
                {
                  key: "quoted",
                  label: "Quotation created",
                  done: Boolean(enquiry?.quotationData),
                  when: enquiry?.quotationData?.createdAt
                    ? moment(enquiry.quotationData.createdAt).format("DD-MM-YYYY")
                    : "",
                },
                {
                  key: "confirmed",
                  label: "Order confirmed",
                  done: stage.label === "Confirmed",
                  when: "",
                },
              ].map((step) => (
                <li
                  key={step.key}
                  className={`enq-step${step.done ? " is-done" : ""}`}
                >
                  <span className="enq-step__dot">
                    {step.done ? <FaCheck /> : null}
                  </span>
                  <span className="enq-step__body">
                    <span className="enq-step__label">{step.label}</span>
                    {step.when ? (
                      <span className="enq-step__when">{step.when}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </Card.Body>
        </Card>
        </Col>
      </Row>

      {/* Add Product Modal */}
      <Modal show={showAdd} onHide={handleCloseAdd} centered size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Add Product</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3" controlId="addProductSelect">
              <Form.Label>Product Name</Form.Label>
              <Select
                isMulti
                options={availableToAdd?.map((p) => ({
                  value: String(p._id),
                  label: p.ProductName,
                }))}
                value={addRows.map((r) => ({
                  value: String(r.productId),
                  label: r.product?.ProductName || r.productId,
                }))}
                onChange={handleProductsSelect}
                isClearable
                closeMenuOnSelect={false}
                placeholder="Search products..."
                menuPortalTarget={
                  typeof document !== "undefined" ? document.body : null
                }
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 2000 }),
                }}
              />
              <Form.Text muted>
                Pick as many as you need; each one gets its own quantity
                below.
              </Form.Text>
            </Form.Group>

            {addRows.length ? (
              <div className="qa-picked">
                <div className="qa-picked__head">
                  <span>Product</span>
                  <span className="text-center">Stock</span>
                  <span className="text-center">Qty</span>
                  <span className="text-end">Price</span>
                  <span className="text-end">Total</span>
                  <span />
                </div>

                {addRows.map((row) => {
                  const stock = stockOf(row);
                  const over = Number(row.qty) > stock && stock > 0;

                  return (
                    <div key={row.productId} className="qa-picked__row">
                      <span className="qa-picked__name">
                        {row.product?.ProductName || "Product"}
                        {over ? (
                          <span className="qa-picked__warn">
                            More than the {stock} in stock
                          </span>
                        ) : null}
                      </span>

                      <span className="text-center">{stock}</span>

                      <span className="text-center">
                        <Form.Control
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) =>
                            setRowQty(row.productId, e.target.value)
                          }
                          size="sm"
                          className="qa-picked__qty"
                        />
                      </span>

                      <span className="text-end">&#8377;{priceOf(row)}</span>
                      <span className="text-end qa-picked__total">
                        &#8377;{lineTotalOf(row)}
                      </span>

                      <span className="text-end">
                        <button
                          type="button"
                          className="qa-picked__x"
                          onClick={() => removeAddRow(row.productId)}
                          aria-label={`Remove ${
                            row.product?.ProductName || "product"
                          }`}
                        >
                          &times;
                        </button>
                      </span>
                    </div>
                  );
                })}

                <div className="qa-picked__foot">
                  <span>
                    {addRows.length} {addRows.length === 1 ? "product" : "products"} selected
                  </span>
                  <span className="qa-picked__sum">
                    &#8377;{addRowsTotal}
                  </span>
                </div>
              </div>
            ) : null}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <BusyButton
            variant="primary"
            size="sm"
            disabled={!addRowsReady || addLoading}
            onClick={handleAddProduct}
          >
            {addLoading
              ? "Adding..."
              : addRows.length > 1
                ? `Add ${addRows.length} products`
                : "Add"}
          </BusyButton>
          <Button variant="secondary" size="sm" onClick={handleCloseAdd}>
            Close
          </Button>        </Modal.Footer>
      </Modal>

      {/* Charges section */}
      <div
        style={{
          background: "#fff",
          borderTop: "1px solid #eee",
          zIndex: 100,
          padding: "12px 0",
          marginBottom: "60px",
        }}
      >
        <Container className="px-5">
          <Form>
            <Row className="align-items-end mb-2">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Manpower Cost/Labour Charge</Form.Label>
                  <Form.Control
                    type="number"
                    value={enquiry?.status === "sent" ? enquiry?.quotationData?.labourecharge : manpower}
                    onChange={(e) => setManpower(e.target.value)}
                    disabled={enquiry?.status === "sent"}
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label>Transport Charge</Form.Label>
                  <Form.Control
                    type="number"
                    value={enquiry?.status === "sent" ? enquiry?.quotationData?.transportcharge : transport}
                    onChange={(e) => setTransport(e.target.value)}
                    disabled={enquiry?.status === "sent"}
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label>Discount (%)</Form.Label>
                  <Form.Control
                    type="number"
                    value={enquiry?.status === "sent" ? enquiry?.quotationData?.discount : discount}
                    placeholder="Discount in percentage"
                    disabled={enquiry?.status === "sent"}
                    min={0}
                    onChange={(e) => {
                      const computedValue = Math.min(100, Number(e.target.value || 0));
                      setDiscount(computedValue);
                    }}
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label>GST</Form.Label>
                  <Select
                    options={gstOptions}
                    value={
                      gstOptions.find(
                        (opt) =>
                          String(opt.value) ===
                          String(enquiry?.status === "sent" ? enquiry?.quotationData?.GST : gst)
                      ) || null
                    }
                    onChange={(opt) => setGst(opt ? opt.value : "")}
                    placeholder="Select GST"
                    isDisabled={true}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Row className="align-items-end">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>
                    Grand Total <span style={{ color: "red" }}>*</span>
                  </Form.Label>
                  <Form.Control
                    type="text"
                    value={enquiry?.status === "sent" ? enquiry?.quotationData?.GrandTotal : grandTotal}
                    readOnly
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label>Incharge Name</Form.Label>
                  <Form.Control
                    type="text"
                    value={enquiry?.status === "sent" ? enquiry?.quotationData?.inchargeName : inchargeName}
                    onChange={(e) => setInchargeName(e.target.value)}
                    disabled={enquiry?.status === "sent"}
                  />
                </Form.Group>
              </Col>

              <Col md={3}>
                <Form.Group>
                  <Form.Label>Rent Angadi Point of Contact</Form.Label>
                  <Form.Control
                    type="number"
                    value={enquiry?.status === "sent" ? enquiry?.quotationData?.inchargePhone : inchargePhone}
                    onChange={(e) => setInchargePhone(e.target.value)}
                    disabled={enquiry?.status === "sent"}
                  />
                </Form.Group>
              </Col>
            </Row>
          </Form>
        </Container>
      </div>

      {/* Fixed bottom create quote bar. Pinned to the content column, not
          to a percentage of the viewport: the rail is a fixed 248px, so a
          20% offset drifted under the sidebar on small screens and left a
          gap on large ones. */}
      <div className="enq-quotebar">
        <div className="enq-quotebar__inner">
          <span className="enq-quotebar__total">
            Total Confirmed Amount:{" "}
            <b>
              &#8377;{" "}
              {enquiry?.status === "sent"
                ? enquiry?.quotationData?.GrandTotal
                : grandTotal}
            </b>
          </span>

          {enquiry?.status === "not send" && (
            <Button
              className="eq-primary"
              disabled={totalAmount === 0 || isAnyProductInsufficient || loading}
              onClick={handleCreateQuote}
            >
              {loading ? "Creating Quotation..." : "Create Quotation"}
            </Button>
          )}
        </div>
      </div>
      <PendingQuotationsModal
        show={!!underQuotationsRow}
        onHide={() => setUnderQuotationsRow(null)}
        row={underQuotationsRow}
        startDate={enquiry?.enquiryDate}
        endDate={enquiry?.endDate}
      />
    </Container>
  );
};

export default EnquiryDetails;
