import React, { useState, useEffect } from "react";
import {
  Button,
  Col,
  Card,
  Container,
  Row,
  Form,
  Table,
  Modal,
  Spinner,
} from "react-bootstrap";
import logo from "../../assets/RentangadiLogo.jpg";
import { useParams , Link } from "react-router-dom";
import axios from "axios";
import { ApiURL, ImageApiURL } from "../../api";
import Select from "react-select";
import PendingQuotationsModal from "../../components/PendingQuotationsModal";
import moment from "moment";
import {
  FaEdit,
  FaTrashAlt,
  FaUser,
  FaBuilding,
  FaPhone,
  FaMapMarkerAlt,
  FaCalendarAlt,
  FaClock,
  FaCheck,
  FaTimes,
  FaHome,
  FaChevronRight,
  FaPhoneAlt,
  FaFilePdf,
  FaFileInvoiceDollar,
  FaShoppingBag,
  FaFlagCheckered,
  FaBookmark,
  FaGripVertical,
  FaBoxOpen,
} from "react-icons/fa";
import { toast } from "react-hot-toast";
import { computeQuoteTotals, quoteLinePrice } from "../../utils/orderTotals";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import DatePicker from "react-datepicker";
import { useLocation, useNavigate } from "react-router-dom";
import { parseDate } from "../../utils/parseDates";
import BusyButton from "../../components/BusyButton";
// import RelatedEnquiries from "../Enquiry/RelatedEnquiries"

const formatDateToDDMMYYYY = (date) => {
  if (!date) return null; // If date is null or undefined, return null.
  if (!(date instanceof Date) || isNaN(date)) {
    // console.log("formatDateToDDMMYYYY date:", date)
    return null;
  }
  const day = String(date.getDate()).padStart(2, "0"); // Add leading zero if needed
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Add leading zero if needed
  const year = date.getFullYear();

  return `${day}-${month}-${year}`; // Return in dd-mm-yyyy format
};

const QuotationDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [quotation, setQuotation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    status: "Online",
    amount: 0,
    mode: "",
    comments: "",
    date: new Date().toLocaleDateString("en-GB").split("/").join("-"),
  });
  const [showAdd, setShowAdd] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  /* One entry per product picked in the Add Product dialog. Several can be
     added at once, and each carries its own availability and quantity:
     { productId, product, availableStock, qty, loading } */
  const [addRows, setAddRows] = useState([]);
  const [addLoading, setAddLoading] = useState(false);
  const [getPayment, setGetPayment] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editQty, setEditQty] = useState(1);
  /* The price while a row is being edited. It belongs to this quotation
     alone - the product's own price in the catalogue is never touched. */
  const [editPrice, setEditPrice] = useState(0);
  const [productDates, setProductDates] = useState({});
  const [items, setItems] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [editDiscount, setEditDiscount] = useState(false);
  const [editManPower, setEditManPower] = useState(false);
  const [editTransport, setEditTransport] = useState(false);
  const [refurbishment, setRefurbishment] = useState(0);
  const originalQuotationRef = React.useRef(null);
  const [editDraft, setEditDraft] = useState({});
  const [tempDraft, setTempDraft] = useState({});

  /* Row being dragged and the row it is hovering over, as positions in
     `items`; plus a flag while the new order is being saved. */
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  /* Set just before a reorder updates `quotation`, so the effect that
     refetches the inventory skips that one change. Reordering rows cannot
     move a stock figure - the dates are untouched - so the refetch would
     only make the Inventory card blink for nothing. */
  const skipInventoryRefetch = React.useRef(false);

  const [inventoryRows, setInventoryRows] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  /* The dates the inventory figures were fetched for, shown in the
     breakdown so it is clear which window the numbers cover. */
  const [inventoryRange, setInventoryRange] = useState({ startDate: "", endDate: "" });
  /* What became of the order raised from this quote, if there is one. The
     quote's own status says "send" for ever once an order exists, even
     after that order is called off - which is why this page read Confirmed
     while the list beside it read Cancelled. */
  const [orderState, setOrderState] = useState(null);
  /* The stock row whose quotation breakdown is open, or null. */
  const [underQuotationsRow, setUnderQuotationsRow] = useState(null);

  const [productIcons, setProductIcons] = useState([]);

  // const [grandTotal, setGrandTotal] = useState(0)

  const fetchAllProducts = async () => {
    try {
      const res = await axios.get(`${ApiURL}/product/quoteproducts`);
      // console.log("fetch prods: ", res.data)
      if (res.status === 200) {
        setAllProducts(res.data.QuoteProduct || []);
      }
    } catch (error) {
      console.error("Error fetching all products:", error);
    }
  };


  /**
   * Reads this client's orders and keeps the state of the ones raised from
   * this quote. A client's own list is small and already served; the whole
   * order list would be megabytes for two fields.
   */
  const fetchOrderState = async (quoteData) => {
    const quoteId = quoteData?.quoteId;
    const clientId = quoteData?.clientId?._id || quoteData?.clientId;
    if (!quoteId || !clientId) return;

    try {
      const res = await axios.get(`${ApiURL}/order/my-orders/${clientId}`);
      const rows = Array.isArray(res?.data?.orderData) ? res.data.orderData : [];
      const mine = rows.filter(
        (o) => String(o?.quoteId || "") === String(quoteId)
      );
      if (!mine.length) return;

      /* A confirmed order outranks a cancelled one, so a quote re-confirmed
         after being called off reads as confirmed. */
      const DONE = ["confirm", "approved", "completed"];
      const confirmed = mine.find((o) =>
        DONE.includes(String(o?.orderStatus || "").toLowerCase())
      );
      setOrderState(
        String((confirmed || mine[0])?.orderStatus || "").toLowerCase()
      );
    } catch (err) {
      /* The page falls back to what the quote itself says. */
      console.error("Error fetching the order's state:", err);
    }
  };

  const getInventoryFilterPayloadFromQuote = (quoteData) => {
    try {
      const slots = Array.isArray(quoteData?.slots) ? quoteData.slots : [];
      const slot0 = slots[0]; // if you want first slot only

      const startDate = slot0?.quoteDate || quoteData?.quoteDate || "";
      const endDate = slot0?.endDate || quoteData?.endDate || "";

      const productIds = (slot0?.Products || [])
        .map((p) => String(p?.productId || ""))
        .filter(Boolean);

      return { startDate, endDate, productIds };
    } catch (e) {
      return { startDate: "", endDate: "", productIds: [] };
    }
  };

  const fetchInventoryFromQuoteData = async (quoteData) => {
    try {
      setInventoryLoading(true);
      setInventoryError("");

      const { startDate, endDate, productIds } =
        getInventoryFilterPayloadFromQuote(quoteData);

      if (!startDate || !endDate || productIds.length === 0) {
        setInventoryRows([]);
        setInventoryError("Missing start/end date or products for inventory filter");
        return [];
      }

      const res = await axios.get(`${ApiURL}/inventory/filter`, {
        params: {
          startDate,
          endDate,
          products: productIds.join(","),
        },
      });

      const stock = Array.isArray(res?.data?.stock) ? res.data.stock : [];
      setInventoryRows(stock);
      setInventoryRange({ startDate, endDate });
      return stock;
    } catch (err) {
      console.error("fetchInventoryFromQuoteData error:", err);
      setInventoryError(err?.response?.data?.message || "Failed to fetch inventory");
      setInventoryRows([]);
      return [];
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    fetchAllProducts();
  }, []);

  useEffect(() => {
    if (skipInventoryRefetch.current) {
      skipInventoryRefetch.current = false;
      return;
    }
    if (quotation) fetchInventoryFromQuoteData(quotation);
  }, [quotation]);

  /* Only the quote id and the client matter here, so this does not re-run
     as the person edits rows. */
  useEffect(() => {
    if (quotation) fetchOrderState(quotation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotation?.quoteId, quotation?.clientId]);

  useEffect(() => {
    const fetchQuotation = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${ApiURL}/quotations/getquotation/${id}`);
        console.log("getquotation/ quoteData: ", res.data.quoteData);
        console.log("getquotation/ quoteData products: ", res.data.quoteData.slots[0].Products);
        // console.log("quoteData slots", res.data.quoteData.slots)
        setQuotation(res.data.quoteData);
        setTempDraft(res.data.quoteData)
        originalQuotationRef.current = JSON.parse(JSON.stringify(res.data.quoteData || {}));
      } catch (error) {
        setQuotation(null);
      }
      setLoading(false);
    };
    fetchQuotation();
  }, [id]);

  useEffect(() => {
    if (quotation) {
      console.log("quotain for isnide: ", quotation.slots[0].Products)
      if (quotation?.slots) {
        const initialProductDates = {};

        // Populate productDates for each product in each slot
        quotation.slots.forEach((slot) => {
          slot.Products.forEach((product) => {
            // console.log("slots product:", product)
            // console.log("formatDateToDDMMYYYY(product.productQuoteDate): ", formatDateToDDMMYYYY(product.productQuoteDate))
            // initialProductDates[product.productId] = {
            //   productQuoteDate: formatDateToDDMMYYYY(product.productQuoteDate), // Use slot's quoteDate
            //   productEndDate: formatDateToDDMMYYYY(product.productEndDate), // Use slot's endDate
            //   productSlot: product.productSlot, // Use slot's quoteTime
            // };
          });
        });

        // console.log("initialProductDates: ", initialProductDates)

        // setProductDates(initialProductDates);
      }

      const resolveName = (prod) => {
        // Prefer the freshest name from the product master (handles legacy
        // quotations that were saved with productName missing / "Unnamed Product").
        const fromMaster = allProducts.find(
          (p) => String(p._id) === String(prod.productId)
        )?.ProductName;
        const stored = prod.productName;
        if (stored && stored.trim() && stored !== "Unnamed Product") return stored;
        return fromMaster || stored || "—";
      };

      // Prefer the live availability from /inventory/filter (fetched into
      // inventoryRows for the quotation's current date range) over the
      // stored snapshot on the product record. The snapshot is written
      // when the product is first added and never refreshes if the
      // quotation dates change afterwards, which caused the "92 vs 100"
      // stale-count bug.
      const liveStockById = new Map(
        (inventoryRows || []).map((row) => [String(row.productId), row.availableStock])
      );

      const updatedItems =
        quotation?.slots && Array.isArray(quotation.slots)
          ? quotation.slots.flatMap((slot, slotIndex) =>
            (slot.Products || []).map((prod, productIndex) => {
              let days = 1;
              const quoteDate = prod.productQuoteDate || slot.quoteDate;
              const endDate = prod.productEndDate || slot.endDate;

              if (quoteDate && endDate) {
                const start = quoteDate instanceof Date ? quoteDate : parseDate(quoteDate);
                const end = endDate instanceof Date ? endDate : parseDate(endDate);
                days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
                if (isNaN(days) || days < 1) days = 1;
              }

              const liveAvailable = liveStockById.get(String(prod.productId));
              const resolvedAvailable =
                liveAvailable !== undefined && liveAvailable !== null
                  ? Number(liveAvailable)
                  : (Number(prod.availableStock) > 0 ? Number(prod.availableStock) : 0);

              return {
                /* Where this row lives in quotation.slots, so dragging it
                   can be written back to the right place. */
                slotIndex,
                productIndex,
                sNo: prod.sNo || "",
                productId: prod.productId,
                productName: resolveName(prod),
                image: prod.ProductIcon,
                units: prod.quantity || prod.qty,
                days,
                pricePerUnit: quoteLinePrice(prod),
                amount: Number(prod.total) || 0,
                available: resolvedAvailable,
                quoteDate,
                endDate,
                quantity: prod.quantity || prod.qty,
                total: prod.total,
                productSlot: prod.productSlot
              };
            })
          )
          : [];

      console.log("setting items again: ")
      setItems(updatedItems);

    }
  }, [quotation, allProducts, inventoryRows]);

  /**
   * Moves a product row and saves the new order.
   *
   * The stored shape is quotation.slots[].Products, so the flat table order
   * is translated back into positions within one slot. Only moves inside the
   * same slot are allowed: dropping a row into another slot would change its
   * dates, which is not what dragging a row is asking for.
   *
   * quotation.slots is the single source of truth here - `items` is rebuilt
   * from it by an effect - so the reorder is applied there and the table
   * follows. A failed save puts the old quotation back.
   */
  const handleReorder = async (from, to) => {
    if (from === null || to === null || from === to) return;

    const source = items[from];
    const target = items[to];
    if (!source || !target) return;

    if (source.slotIndex !== target.slotIndex) {
      toast.error("Products can only be reordered within the same slot");
      return;
    }

    const slotIndex = source.slotIndex;

    const nextItems = [...items];
    const [moved] = nextItems.splice(from, 1);
    nextItems.splice(to, 0, moved);

    /* The positions this slot's products should now be read in. */
    const order = nextItems
      .filter((row) => row.slotIndex === slotIndex)
      .map((row) => row.productIndex);

    const previousQuotation = quotation;
    const nextSlots = (quotation.slots || []).map((slot, idx) =>
      idx === slotIndex
        ? { ...slot, Products: order.map((i) => (slot.Products || [])[i]) }
        : slot
    );

    skipInventoryRefetch.current = true;
    setQuotation({ ...quotation, slots: nextSlots });
    setSavingOrder(true);

    try {
      await axios.put(
        `${ApiURL}/quotations/reorder-products/${quotation._id}`,
        { slotIndex, order }
      );
      originalQuotationRef.current = JSON.parse(
        JSON.stringify({ ...previousQuotation, slots: nextSlots })
      );
      toast.success("Product order saved");
    } catch (err) {
      /* The revert restores the same dates, so no refetch is needed. */
      skipInventoryRefetch.current = true;
      setQuotation(previousQuotation);
      toast.error(
        err?.response?.data?.error ||
          "Could not save the new order"
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleShowGenerateModal = () => setShowGenerateModal(true);
  const handleCloseGenerateModal = () => setShowGenerateModal(false);

  const handleInputChange = (e) => {
    console.log(`paymentData: `, paymentData);
    const { name, value } = e.target;

    if (name === 'amount') {
      console.log(`changing amount: `, paymentData.amount);
      const numericValue = parseFloat(value) || 0;
      const maxAmount = parseFloat(quotation?.finalTotal) || 0;
      const finalValue = Math.min(numericValue, maxAmount);
      console.log(`finalTotal: `, quotation?.finalTotal);
      console.log(`numericValue: `, numericValue);
      console.log(`finalValue: `, finalValue);
      setPaymentData((prev) => ({ ...prev, amount: finalValue.toString() }));
    } else {
      setPaymentData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleCheckboxChange = (status) => {
    setPaymentData((prev) => ({ ...prev, status }));
  };

  const handleAddPayment = async () => {

    if (!paymentData.amount || paymentData.amount === '' || paymentData.amount === '0' || paymentData.amount === 0) {
      console.log(`typeof payment.amount `, typeof paymentData.amount);
      toast.error("Amount cannot be empty or zero")
      return
    } else if (paymentData.amount > quotation?.finalTotal) {
      toast.error(`Max allowed to be paid is: ${quotation?.finalTotal}`)
      return
    }

    if (paymentData.status === 'Online' && (!paymentData.mode)) {
      toast.error("Please enter a payment mode")
      return
    }

    // await handleUpdateQuotation();    

    setPaymentLoading(true)
    try {
      // First, make the API call to fetch payment data
      const orderDetails = {
        quotationId: quotation?.quoteId,
        totalAmount: quotation.finalTotal || quotation?.GrandTotal,
        advancedAmount: paymentData.amount,
        paymentMode: paymentData.status, // Send selected payment mode
        paymentRemarks:
          paymentData.status === "Offline" ? "cash" : paymentData.mode,
        comment: paymentData.comments,
        status: "Completed",
      };

      // Make the POST request to add payment
      const response = await axios.post(`${ApiURL}/payment/`, orderDetails);

      // // If the API call is successful, update the payment data state
      if (response.status === 200) {
        console.log("payment successful: ", response.data);
        await handleGenerateOrder()
        setGetPayment(response.data);
      }
      console.log("payment details: ", orderDetails);
    } catch (error) {
      console.error("Error fetching payment data:", error);
      // Optionally handle any errors that occur during the API request
    } finally {
      handleCloseGenerateModal();
      setPaymentLoading(false)
    }
  };

  const handleUpdateQuotation0 = async () => {
    try {
      // Flatten all products from all slots for the Products array
      const allProducts = quotation?.slots
        ? quotation.slots.flatMap((slot) =>
          (slot.Products || []).map((product) => ({
            productId: product.productId,
            productName: product.productName,
            qty: product.qty || product.quantity,
            price: product.price,
            quantity: product.quantity || product.qty,
            total: product.total,
            StockAvailable: product.availableStock, // if needed by backend
          }))
        )
        : [];

      // Prepare the updated quotation details
      const updatedQuotationDetails = {
        enquiryObjectId: quotation._id, // Add this if your backend expects it
        enquiryId: quotation.enquiryId,
        GrandTotal: grandTotal, // updated GrandTotal
        status: quotation?.status,
        Products: allProducts, // Flat array for backend update logic
        slots:
          quotation?.slots?.map((slot) => ({
            slotName: slot.slotName,
            quoteDate: slot.quoteDate,
            endDate: slot.endDate,
            Products:
              slot.Products?.map((product) => ({
                productId: product.productId,
                productName: product.productName,
                qty: product.qty || product.quantity,
                price: product.price,
                quantity: product.quantity || product.qty,
                total: product.total,
                StockAvailable: product.availableStock, // if needed
              })) || [],
          })) || [],
      };

      console.log("Updated Quotation details: ", updatedQuotationDetails);

      // Make the API call to update the quotation
      const response = await axios.put(
        `${ApiURL}/quotations/updateQuotationOnOrder/${quotation._id}`,
        updatedQuotationDetails
      );

      if (response.status === 200) {
        console.log("Quotation updated successfully:", response.data.response);
        await handleGenerateOrder();
        // await handleAddPayment()
        // Optionally, update the state or show a success message
      } else {
        console.error(
          "Failed to update the quotation. Response status:",
          response.status
        );
      }
    } catch (error) {
      // Handle errors during the API call
      console.error(
        "Error updating quotation:",
        error?.response?.data?.error || error.message
      );
    } finally {
      handleCloseGenerateModal();
    }
  };

  const handleGenerateOrder = async () => {
    // toast.success('order generated')
    // return

    setPaymentLoading(true)


    try {
      console.log(`handleGenerateOrder quotation: `, quotation);
      // await handleUpdateQuotation();
      // Prepare the order details from quotationDetails
      const orderDetails = {
        quoteId: quotation.quoteId,
        userId: quotation.userId,
        clientId: quotation?.clientId,
        executiveId: quotation?.executiveId,
        clientNo: quotation?.clientNo,
        GrandTotal: quotation.finalTotal || grandTotal,
        refurbishmentAmount: quotation?.refurbishment || 0,
        paymentStatus: quotation?.paymentStatus,
        clientName: quotation?.clientName,
        executivename: quotation?.executivename,
        Address: quotation?.address,
        labourecharge: quotation?.labourecharge,
        transportcharge: quotation?.transportcharge,
        GST: quotation?.GST,
        discount: quotation?.discount,
        placeaddress: quotation?.placeaddress,
        adjustments: quotation?.adjustments,
        products:
          quotation?.slots?.map((slot) => ({
            products: slot.Products?.map((product) => ({
              productId: product.productId,
              productName: product.productName,
              quantity: product.quantity || product.qty,
              /* What this quotation agreed. Without it the order would be
                 priced from the catalogue and the client would be charged
                 something other than the figure they were quoted. */
              productPrice: quoteLinePrice(product),
              total: product.total,
            })),
          })) || [], // Default to empty array if no slots found
        slots:
          quotation?.slots?.map((slot) => ({
            slotName: quotation?.quoteTime,
            quoteDate: slot.quoteDate,
            endDate: slot.endDate,
            // products: slot.Products?.map((product) => ({
            //   productId: product.productId,
            //   productName: product.productName,
            //   quantity: product.quantity || product.qty,
            //   total: product.total,

            // })),

            // items
            // products: items?.map((product) => {
            //   console.log("productData: ", productDates)
            //   const productData = productDates[product.productId]; // Find corresponding data from x
            //   console.log("product.productId: ", product.productId, "productData: ", productData, "format quote: ", productData?.productQuoteDate)

            //   return {
            //     productId: product.productId,
            //     productName: product.productName,
            //     quantity: product.quantity || product.qty,
            //     total: product.total,
            //     // Inject additional product data if found in x
            //     productQuoteDate: formatDateToDDMMYYYY(productData?.productQuoteDate) || quotation.quoteDate,
            //     productEndDate: formatDateToDDMMYYYY(productData?.productEndDate) || quotation.endDate,
            //     productSlot: productData?.productSlot || quotation.quoteTime,
            //   };
            // }),

            products: slot.Products?.map((product) => {
              console.log("productData: ", productDates)
              const productData = productDates[product.productId]; // Find corresponding data from x
              console.log("product.productId: ", product.productId, "productData: ", productData, "format quote: ", productData?.productQuoteDate)

              return {
                productId: product.productId,
                productName: product.productName,
                quantity: product.quantity || product.qty,
                /* As above: the quoted price travels with the line. */
                productPrice: quoteLinePrice(product),
                total: product.total,
                // Inject additional product data if found in x
                productQuoteDate: formatDateToDDMMYYYY(productData?.productQuoteDate) || quotation.quoteDate,
                productEndDate: formatDateToDDMMYYYY(productData?.productEndDate) || quotation.endDate,
                productSlot: productData?.productSlot || quotation.quoteTime,
              };
            }),

          })) || [], // Default to empty array if no slots found
      };

      // console.log("orderdetails config: ", orderDetails);
      // console.log("orderdetails config enough: ", orderDetails.slots[0].products[0]);
      console.log("orderdetails config enough: ", orderDetails.slots[0].products);
      console.log("product: ", productDates)
      console.log("items: ", items)

      console.log(`orderDetails: `, orderDetails.slots[0]);

      // Make the API call to create the order
      const response = await axios.post(
        `${ApiURL}/order/postaddorder`,
        orderDetails
      );

      // Check if the response is successful
      if (response.status === 201) {
        toast.success("Order created successfully");
        window.location.reload()
        console.log("Order created successfully:", response.data.response);
        // Optionally, update the state or show a success message
        // Example: setOrderDetails(response.data);
      }
    } catch (error) {
      // Backend puts the real reason on `.error` (e.g. "Insufficient
      // stock for X on 31-08-2026") and a generic label on `.message`.
      // Show the specific reason first so the user knows what to fix.
      const specific = error?.response?.data?.error;
      const generic = error?.response?.data?.message;
      toast.error(specific || generic || 'error creating order');
      console.error("Error creating order:", specific || generic, error?.response?.data);
    } finally {
      handleCloseGenerateModal();
      setPaymentLoading(false)
    }
  };


  const handleDateChange = (productId, field, value) => {
    setEditDraft((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value,
      },
    }));
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (!quotation || !originalQuotationRef.current) return false;
    const original = originalQuotationRef.current;

    const normalizeNumber = (v) => Number(v || 0);
    const normalizeDateString = (v) => {
      if (!v) return "";
      if (v instanceof Date && !isNaN(v)) return formatDateToDDMMYYYY(v) || "";
      return String(v || "");
    };

    // Check top-level material changes (exclude totals to avoid false positives)
    const topLevelKeys = ["discount", "transportcharge", "labourecharge", "refurbishment", "GST"];
    for (const key of topLevelKeys) {
      if (normalizeNumber(quotation?.[key]) !== normalizeNumber(original?.[key])) {
        return true;
      }
    }

    // Check product changes in slots with normalized comparison
    const currentSlots = quotation?.slots || [];
    const originalSlots = original?.slots || [];

    // If number of slots changed
    if (currentSlots.length !== originalSlots.length) return true;

    for (let slotIdx = 0; slotIdx < currentSlots.length; slotIdx++) {
      const slot = currentSlots[slotIdx] || {};
      const origSlot = originalSlots[slotIdx] || {};

      const currProducts = slot.Products || [];
      const origProducts = origSlot.Products || [];

      // Product count changed
      if (currProducts.length !== origProducts.length) return true;

      for (const p of currProducts) {
        const origP = origProducts.find((op) => String(op.productId) === String(p.productId)) || {};

        const nextQty = normalizeNumber(p.qty || p.quantity);
        const prevQty = normalizeNumber(origP.qty || origP.quantity);

        const nextTotal = normalizeNumber(p.total);
        const prevTotal = normalizeNumber(origP.total);

        const nextPQD = normalizeDateString(p.productQuoteDate);
        const prevPQD = normalizeDateString(origP.productQuoteDate);

        const nextPED = normalizeDateString(p.productEndDate);
        const prevPED = normalizeDateString(origP.productEndDate);

        const nextSlotVal = String(p.productSlot || "");
        const prevSlotVal = String(origP.productSlot || "");

        const hasChange =
          nextQty !== prevQty ||
          nextTotal !== prevTotal ||
          nextPQD !== prevPQD ||
          nextPED !== prevPED ||
          nextSlotVal !== prevSlotVal;

        if (hasChange) return true;
      }
    }

    return false;
  };

  const handleDownloadPDFClick = async () => {
    console.log(`handleDownloadPDFClick `,);
    if (hasUnsavedChanges()) {
      const shouldSave = window.confirm(
        "You have unsaved changes. Do you want to save the quotation before downloading PDF?"
      );
      if (shouldSave) {
        const result = await handleUpdateQuotation();
        if (result !== true) {
          return
        }
      } else {
        // handleCancelAll()
        // return
      }
    }
    navigate(`/quotation/invoice/${quotation._id}`, { state: { quotation, items, productDates } });
  };

  // // Sync edited productDates into quotation.slots so UI and payload stay in sync
  // useEffect(() => {
  //   if (!quotation || !quotation.slots || Object.keys(productDates || {}).length === 0) return;
  //   const nextSlots = quotation.slots.map((slot) => ({
  //     ...slot,
  //     Products: (slot.Products || []).map((p) => {
  //       const pd = productDates[p.productId];
  //       if (!pd) return p;
  //       return {
  //         ...p,
  //         productQuoteDate: formatDateToDDMMYYYY(pd.productQuoteDate) || p.productQuoteDate || slot.quoteDate,
  //         productEndDate: formatDateToDDMMYYYY(pd.productEndDate) || p.productEndDate || slot.endDate,
  //         productSlot: pd.productSlot || p.productSlot || quotation.quoteTime || slot.quoteTime,
  //       };
  //     }),
  //   }));
  //   setQuotation((prev) => ({ ...prev, slots: nextSlots }));
  //   // eslint-disable-next-line react-hooks/exhaustive-deps
  // }, [productDates]);

  // // Helper: flatten slots/products for table
  // const items =
  //   quotation?.slots && Array.isArray(quotation.slots)
  //     ? quotation.slots.flatMap((slot) =>
  //       (slot.Products || []).map((prod) => {
  //         let days = 1;
  //         // const quoteDate = prod.quoteDate || slot.quoteDate;
  //         // const endDate = prod.endDate || slot.endDate;
  //         const quoteDate = prod.productQuoteDate || slot.quoteDate;
  //         const endDate = prod.productEndDate || slot.endDate;
  //         // console.log("prod total", prod.total)

  //         if (quoteDate && endDate) {
  //           const start = quoteDate instanceof Date ? quoteDate : parseDate(quoteDate);
  //           const end = endDate instanceof Date ? endDate : parseDate(endDate);
  //           days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  //           if (isNaN(days) || days < 1) days = 1;
  //         }

  //         return {
  //           sNo: prod.sNo || "",
  //           productId: prod.productId,
  //           productName: prod.productName || "",
  //           image: prod.ProductIcon,
  //           units: prod.quantity || prod.qty,
  //           days,
  //           pricePerUnit: Number(prod.price) || 0,
  //           amount: Number(prod.total) || 0,
  //           available: prod.availableStock > 0 ? prod.availableStock : 0,
  //           quoteDate,
  //           endDate,
  //         };
  //       })
  //     )
  //     : []; // Return an empty array if no valid quotation or slots

  console.log("items", items)
  const handleShowAdd = () => {
    setShowAdd(true);
    setAddRows([]);
  };

  const handleCloseAdd = () => {
    setShowAdd(false);
    setAddRows([]);
  };

  const addedProductIds = quotation?.slots
    ? quotation.slots.flatMap((slot) =>
      (slot.Products || []).map((p) => String(p.productId || p._id))
    )
    : [];

  const availableToAdd = allProducts.filter(
    (p) => !addedProductIds.includes(String(p._id))
  );

  const handleAddProduct = async () => {
    if (!addRows.length || !addRowsReady) return;

    // Default per-product dates to the quotation's overall range so the
    // backend's inventory validation and the "Under Quotations" count see
    // a fully-formed product entry.
    const defaultQuoteDate = quotation?.quoteDate;
    const defaultEndDate = quotation?.endDate;
    const defaultProductSlot = quotation?.quoteTime;

    /* Every product picked, in the order it was picked. */
    const newProducts = addRows.map((row) => {
      const qty = Number(row.qty) || 1;
      const price = priceOf(row);
      return {
        productId: row.product._id,
        productName: row.product.ProductName,
        qty,
        quantity: qty,
        price,
        total: qty * price,
        ProductIcon: row.product.ProductIcon,
        availableStock: row.availableStock,
        StockAvailable: row.availableStock,
        productQuoteDate: defaultQuoteDate,
        productEndDate: defaultEndDate,
        productSlot: defaultProductSlot,
      };
    });
    const updatedSlots = quotation.slots && quotation.slots.length > 0
      ? quotation.slots.map((slot, idx) =>
        idx === 0
          ? { ...slot, Products: [...(slot.Products || []), ...newProducts] }
          : slot
      )
      : [{
        slotName: "Default Slot",
        Products: [...newProducts],
        quoteDate: defaultQuoteDate,
        endDate: defaultEndDate,
      }];

    // Persist to backend immediately (mirrors the enquiry flow). Without
    // this the newly-added product only lives in local state and is not
    // included in the "Under Quotations" count served by /inventory/filter.
    const slotsPayload = updatedSlots.map((slot) => ({
      slotName: slot.slotName,
      quoteDate: slot.quoteDate || defaultQuoteDate,
      endDate: slot.endDate || defaultEndDate,
      Products: (slot.Products || []).map((p) => {
        const pd = productDates[p.productId] || {};
        const qty = Number(p.qty || p.quantity || 0);
        /* The price this line agreed, read from its own total - never the
           catalogue copy the response puts in its place. */
        const price = quoteLinePrice(p);
        return {
          productId: p.productId,
          productName: p.productName,
          qty,
          quantity: qty,
          price,
          total: p.total || qty * price,
          productQuoteDate:
            formatDateToDDMMYYYY(pd.productQuoteDate) ||
            p.productQuoteDate ||
            slot.quoteDate ||
            quotation.quoteDate,
          productEndDate:
            formatDateToDDMMYYYY(pd.productEndDate) ||
            p.productEndDate ||
            slot.endDate ||
            quotation.endDate,
          productSlot:
            pd.productSlot || p.productSlot || quotation.quoteTime || slot.quoteTime || null,
          StockAvailable: p.availableStock ?? p.StockAvailable,
        };
      }),
    }));

    const payload = {
      enquiryObjectId: quotation._id,
      enquiryId: quotation.enquiryId,
      status: quotation?.status,
      discount: Number(quotation?.discount || 0),
      transportcharge: Number(quotation?.transportcharge || 0),
      labourecharge: Number(quotation?.labourecharge || 0),
      refurbishment: Number(quotation?.refurbishment || 0),
      GST: Number(quotation?.GST || 0),
      GrandTotal: Number(quotation?.finalTotal || quotation?.GrandTotal || 0),
      slots: slotsPayload,
    };

    try {
      setAddLoading(true);
      const res = await axios.put(
        `${ApiURL}/quotations/update-quotation/${quotation._id}`,
        payload
      );
      if (res.status === 200) {
        const updatedQuotation = { ...quotation, slots: updatedSlots };
        setQuotation(updatedQuotation);
        originalQuotationRef.current = JSON.parse(JSON.stringify(updatedQuotation));
        toast.success(
          newProducts.length === 1
            ? "Product added successfully"
            : `${newProducts.length} products added successfully`
        );
        setShowAdd(false);
        setAddRows([]);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        (newProducts.length === 1
          ? "Failed to add product"
          : "Failed to add the products");
      toast.error(msg);
    } finally {
      setAddLoading(false);
    }
  };

  /**
   * Availability for one product over the quotation's dates. Asked per
   * product because that is what the endpoint takes; the picks run in
   * parallel so choosing five is no slower than choosing one.
   */
  const fetchAvailability = async (productId) => {
    try {
      const res = await axios.post(
        `${ApiURL}/inventory/product/filter/${productId}`,
        {},
        {
          params: {
            startDate: quotation?.quoteDate,
            endDate: quotation?.endDate,
            productId,
          },
        }
      );
      return Number(res.data?.availableStock) || 0;
    } catch (error) {
      console.error("Error fetching product availability:", error);
      return 0;
    }
  };

  /**
   * The dialog's product picker. Rows already priced keep their quantity,
   * so adding a sixth product does not reset the five already set up.
   */
  const handleProductsSelect = async (selectedOptions) => {
    const picked = selectedOptions || [];
    const pickedIds = picked.map((o) => String(o.value));

    setAddRows((prev) => {
      const kept = prev.filter((r) => pickedIds.includes(String(r.productId)));
      const keptIds = kept.map((r) => String(r.productId));
      const added = pickedIds
        .filter((id) => !keptIds.includes(id))
        .map((id) => ({
          productId: id,
          product: allProducts.find((p) => String(p._id) === String(id)) || null,
          availableStock: 0,
          qty: 1,
          loading: true,
        }));
      /* Keep the picker's order, so the list reads the way it was built. */
      const byId = {};
      [...kept, ...added].forEach((r) => {
        byId[String(r.productId)] = r;
      });
      return pickedIds.map((id) => byId[id]).filter(Boolean);
    });

    /* Only the newly picked ones need a lookup. */
    const known = addRows.map((r) => String(r.productId));
    const fresh = pickedIds.filter((id) => !known.includes(id));

    await Promise.all(
      fresh.map(async (id) => {
        const stock = await fetchAvailability(id);
        setAddRows((prev) =>
          prev.map((r) =>
            String(r.productId) === String(id)
              ? {
                  ...r,
                  availableStock: stock,
                  /* Never offer more than the dates allow. */
                  qty: Math.min(Math.max(1, r.qty || 1), stock || 1),
                  loading: false,
                }
              : r
          )
        );
      })
    );
  };

  const setRowQty = (productId, value) => {
    setAddRows((prev) =>
      prev.map((r) => {
        if (String(r.productId) !== String(productId)) return r;
        const raw = String(value).replace(/^0+/, "");
        if (raw === "") return { ...r, qty: "" };
        let qty = Math.max(1, Number(raw) || 1);
        if (r.availableStock && qty > r.availableStock) qty = r.availableStock;
        return { ...r, qty };
      })
    );
  };

  const removeAddRow = (productId) =>
    setAddRows((prev) =>
      prev.filter((r) => String(r.productId) !== String(productId))
    );

  const priceOf = (row) => Number(row?.product?.ProductPrice) || 0;
  const lineTotalOf = (row) => (Number(row?.qty) || 0) * priceOf(row);

  /* A row is ready when it has stock to draw on and a quantity within it. */
  const rowIsReady = (row) =>
    !row.loading &&
    row.availableStock > 0 &&
    Number(row.qty) >= 1 &&
    Number(row.qty) <= row.availableStock;

  const addRowsReady = addRows.length > 0 && addRows.every(rowIsReady);
  const addRowsTotal = addRows.reduce((sum, r) => sum + lineTotalOf(r), 0);

  // Calculate subtotal from all items
  const subtotal = items.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Use values from quotation or 0 if not present
  const discount = Number(quotation?.discount || 0);
  // Calculate after discount
  const discountAmt = subtotal * (discount / 100);

  const transport = Number(quotation?.transportcharge || 0);
  const manpower = Number(quotation?.labourecharge || 0);
  // const roundOff = Number(quotation?.adjustments || quotation?.roundOff || 0);
  const gst = Number(quotation?.GST || 0);

  // Add transport and manpower
  const afterCharges = subtotal + transport + manpower;

  const afterDiscount = afterCharges - discountAmt;

  // GST calculation (if GST is a percentage)
  const gstAmt = afterDiscount * (gst / 100);

  // Grand total
  const grandTotal = Math.round(afterDiscount + gstAmt);
  console.log({ subtotal, discountAmt, transport, manpower, gst, gstAmt, afterCharges, afterDiscount, finalTotal: quotation?.finalTotal })

  // const handleEdit = (idx, qty) => {
  //   setEditIdx(idx);
  //   setEditQty(qty);
  // };

  /**
   * Where this quotation stands, in the same three words the quotation list
   * uses - so the two screens never disagree.
   */
  const stage = React.useMemo(() => {
    if (orderState === "cancelled" || quotation?.status === "cancelled") {
      return { label: "Cancelled", pill: "is-cancelled" };
    }
    if (quotation?.status === "send") {
      return { label: "Confirmed", pill: "is-quoted" };
    }
    return { label: "Pending", pill: "is-open" };
  }, [orderState, quotation?.status]);

  const handleEdit = (idx, qty, item) => {
    console.log(`handleEdit `, idx, qty, item);
    setEditIdx(idx);
    setEditQty(qty);
    setEditPrice(item?.pricePerUnit || 0);

    // preload current values into draft
    setEditDraft((prev) => ({
      ...prev,
      [item.productId]: {
        productQuoteDate: parseDate(item.quoteDate),
        productEndDate: parseDate(item.endDate),
        productSlot: item.productSlot || quotation?.slots[0]?.quoteTime,
      },
    }));
  };





  // // Save the new qty (with API call)
  // const handleEditSave = async (item) => {
  //   if (editQty < 1 || editQty > item.available) {
  //     toast.error("Quantity must be between 1 and less than available stock!");
  //     return;
  //   }

  //   const productDateDetails = productDates[item.productId] || {};

  //   // Update the quantity in the correct slot/product in local state
  //   const updatedSlots = quotation.slots.map((slot) => ({
  //     ...slot,
  //     Products: (slot.Products || []).map((prod) =>
  //       prod.productId === item.productId
  //         ? {
  //           ...prod,
  //           qty: editQty,
  //           quantity: editQty,
  //           total: editQty * (prod.price || item.pricePerUnit),
  //           productQuoteDate: productDateDetails.productQuoteDate
  //             ? formatDateToDDMMYYYY(productDateDetails.productQuoteDate)
  //             : prod.productQuoteDate,
  //           productEndDate: productDateDetails.productEndDate
  //             ? formatDateToDDMMYYYY(productDateDetails.productEndDate)
  //             : prod.productEndDate,
  //           productSlot: productDateDetails.productSlot,
  //         }
  //         : prod
  //     ),
  //   }));

  //   const updatedItems = items.map((currentItem) => {
  //     // Check if the current item is the one being edited
  //     if (currentItem.productId === item.productId) {
  //       return {
  //         ...currentItem,
  //         quantity: editQty, // Update the quantity
  //         total: editQty * currentItem.pricePerUnit, // Recalculate the total
  //         productQuoteDate: productDateDetails.productQuoteDate
  //           ? formatDateToDDMMYYYY(productDateDetails.productQuoteDate)
  //           : currentItem.productQuoteDate,

  //         productEndDate: productDateDetails.productEndDate
  //           ? formatDateToDDMMYYYY(productDateDetails.productEndDate)
  //           : currentItem.productEndDate,


  //         productSlot: productDateDetails.productSlot,
  //       };
  //     }
  //     // If the item is not the one being edited, return it unchanged
  //     return currentItem;
  //   });

  //   // Update the state with the new `updatedItems` array
  //   setItems(updatedItems);


  //   console.log("updatedSlots: ", updatedSlots)
  //   setQuotation({ ...quotation, slots: updatedSlots });
  //   setEditIdx(null);
  //   setEditQty(1);
  // };

  const handleEditSave = async (item) => {
    const draft = editDraft[item.productId];
    if (!draft) return;

    // console.log(`editdraft: `, editDraft);
    // console.log(`editDraft[item.productId].productQuoteDate: `, editDraft[item.productId].productQuoteDate);

    // if (editDraft[item.productId].productQuoteDate > editDraft[item.productId].productEndDate) {
    //   toast.error('dates ahead')
    // } else{
    //   toast.success('success')
    // }
    // return

    // commit draft into productDates
    setProductDates((prev) => ({
      ...prev,
      [item.productId]: {
        ...prev[item.productId],
        ...draft,
      },
    }));

    /* A blank or negative price would silently zero the line, so it falls
       back to what the row charged before. */
    const nextPrice =
      Number(editPrice) >= 0 && editPrice !== ""
        ? Number(editPrice)
        : Number(item.pricePerUnit) || 0;

    // update slots inside quotation
    const updatedSlots = quotation.slots.map((slot) => ({
      ...slot,
      Products: (slot.Products || []).map((prod) =>
        prod.productId === item.productId
          ? {
            ...prod,
            qty: editQty,
            quantity: editQty,
            price: nextPrice,
            total: editQty * nextPrice,
            productQuoteDate: formatDateToDDMMYYYY(draft.productQuoteDate),
            productEndDate: formatDateToDDMMYYYY(draft.productEndDate),
            productSlot: draft.productSlot,
          }
          : prod
      ),
    }));

    // update items table
    const updatedItems = items.map((row) =>
      row.productId === item.productId
        ? {
          ...row,
          quantity: editQty,
          pricePerUnit: nextPrice,
          /* What the table and the cost summary add up, per day. */
          amount: editQty * nextPrice,
          total: editQty * nextPrice,
          productQuoteDate: formatDateToDDMMYYYY(draft.productQuoteDate),
          productEndDate: formatDateToDDMMYYYY(draft.productEndDate),
          productSlot: draft.productSlot,
        }
        : row
    );

    setItems(updatedItems);

    const nextQuotation = { ...quotation, slots: updatedSlots };
    setQuotation(nextQuotation);

    /* Written to the server straight away. A tick that only changed the
       screen read as saved, and a reload took the change back; the record
       is what the person was looking at, so it is what is kept.

       The grand total is recomputed here because the one on the record is
       only refreshed while the table renders, which has not happened yet. */
    const totals = computeQuoteTotals({ ...nextQuotation, GrandTotal: 0 });

    /* Awaited, so the tick spins while the server is answering and the row
       stays open until the change is really kept. */
    await handleUpdateQuotation(nextQuotation, totals?.grandTotalToShow);

    // clear edit mode
    setEditIdx(null);
    setEditQty(1);
    setEditPrice(0);
    setEditDraft((prev) => {
      const copy = { ...prev };
      delete copy[item.productId];
      return copy;
    });
  };

  const handleCancelEdit = (productId) => {
    setEditIdx(null);
    setEditQty(1);
    setEditPrice(0);

    setEditDraft((prev) => {
      const copy = { ...prev };
      delete copy[productId];
      return copy;
    });
  };




  // Delete a product (with API call)
  const handleDelete = async (item) => {
    if (!window.confirm("Delete this product?")) return;


    const updatedItems = items.filter((i) => i.productId !== item.productId);

    quotation.slots.forEach((slot) => {
      // Use filter to remove the product by productId
      slot.Products = slot.Products.filter((prod) => prod.productId !== item.productId);
    });

    console.log("quotation.slots: ", quotation?.slots[0].Products)
    console.log("items: ", items)

    // Update the state with the filtered list
    setItems(updatedItems);

  };
  // console.log("**outside quotation.slots: ", quotation?.slots[0].Products)

  const handleCancelQuotation = async () => {
    console.log("quotation: ", quotation);
    const confirmCancel = window.confirm(
      "Are you sure you want to cancel this quotation?"
    );
    if (!confirmCancel) return; // User clicked "Cancel"

    try {
      const response = await axios.post(
        `${ApiURL}/quotations/cancel/${quotation._id}`
      );
      console.log("Quotation cancelled:", response.data);

      // Optionally update your UI or show a message
      toast.success("Quotation successfully cancelled.");
      if (response.status === 200) {
        setQuotation({ ...quotation, status: "cancelled" });
      }
    } catch (error) {
      console.error("Error cancelling quotation:", error);
      alert("Something went wrong while cancelling the quotation.");
    }
  };

  // Update only changed fields (top-level charges and per-product values)
  /**
   * Writes a quotation to the server.
   *
   * `source` is the quotation to send. A caller that has just changed a row
   * passes the changed copy, because React state is not yet updated when
   * its handler runs - sending the state here would save the row as it was
   * a moment ago. `grandTotal` is likewise passed in by such a caller: the
   * one on the record is only recomputed while the table renders.
   */
  /* Saves what is on screen. The row tick calls it with the record it has
     just changed, so the new figure is saved without waiting for a
     re-render; everything else calls it with nothing and the record on
     screen is used.

     A button hands its click event to the first parameter, which is how
     this once came to save an event instead of a quotation and sent the
     request to /update-quotation/undefined. Anything without an id is
     therefore not a quotation and is ignored. */
  const handleUpdateQuotation = async (override, grandTotal) => {
    const source = override && override._id ? override : null;
    const working = source || quotation;
    try {
      setLoading(true)
      // Reuse our single diff source of truth
      const changed = source ? true : hasUnsavedChanges();
      if (!changed) {
        toast.success("No changes to update");
        return true; // allow navigation (e.g., invoice) to proceed
      }

      // Build a safe, explicit payload that reflects the current UI state,
      // so deletions/additions/edits are persisted.
      const slotsPayload = (working?.slots || []).map((slot) => ({
        slotName: slot.slotName,
        quoteDate: slot.quoteDate,
        endDate: slot.endDate,
        Products: (slot.Products || []).map((p) => {
          const pd = productDates[p.productId] || {};
          const productQuoteDate =
            formatDateToDDMMYYYY(pd.productQuoteDate) || p.productQuoteDate || slot.quoteDate || working.quoteDate;
          const productEndDate =
            formatDateToDDMMYYYY(pd.productEndDate) || p.productEndDate || slot.endDate || working.endDate;
          const productSlot = pd.productSlot || p.productSlot || working.quoteTime || slot.quoteTime || null;
          const qty = p.qty || p.quantity || 0;
          /* As above: the line's own price, not the catalogue's. */
          const price = quoteLinePrice(p);
          const total = p.total || qty * price;
          return {
            productId: p.productId,
            productName: p.productName,
            qty,
            quantity: qty,
            price,
            total,
            productQuoteDate,
            productEndDate,
            productSlot,
            StockAvailable: p.availableStock,
          };
        }),
      }));

      const payload = {
        enquiryObjectId: working._id,
        enquiryId: working.enquiryId,
        status: working?.status,
        discount: Number(working?.discount || 0),
        transportcharge: Number(working?.transportcharge || 0),
        labourecharge: Number(working?.labourecharge || 0),
        refurbishment: Number(working?.refurbishment || 0),
        GST: Number(working?.GST || 0),
        GrandTotal: Number(
          grandTotal ?? working?.finalTotal ?? working?.GrandTotal ?? 0
        ),
        slots: slotsPayload,
      };

      console.log("Submitting minimal quotation changes:", { ...payload, Products: payload?.slots[0]?.Products });

      const response = await axios.put(
        `${ApiURL}/quotations/update-quotation/${working._id}`,
        payload
      );
      if (response.status === 200) {
        toast.success("Quotation updated successfully");
        originalQuotationRef.current = JSON.parse(JSON.stringify(working || {}));
        // reload after qt updated sucfly
        // ***DO NOT reload***
        // we're updating & navigating to invoice page, so if we reload we're never navigating
        // window.location.reload()
        return true;
      }
    } catch (error) {
      console.error("Error updating quotation:", error);
      toast.error(error?.response?.data?.error || `Failed to update quotation: ${error?.message}`);
    } finally {
      setLoading(false)
    }
  };




  // const handleDownloadPDF0 = () => {
  //   const doc = new jsPDF();

  //   const {
  //     quoteId,
  //     quoteDate,
  //     endDate,
  //     clientName,
  //     clientNo,
  //     executivename,
  //     placeaddress,
  //     address,
  //     status,
  //     slots = [],
  //     discount,
  //     transportcharge,
  //     labourecharge,
  //     GrandTotal,
  //     adjustments,
  //     GST,
  //   } = quotation;

  //   const slot = slots[0];
  //   const products = slot?.Products || [];

  //   const parseDate = (str) => {
  //     const [day, month, year] = str.split("-");
  //     return new Date(`${year}-${month}-${day}`);
  //   };

  //   // === HEADER ===
  //   doc.setFontSize(18);
  //   doc.text("NNC Event Rentals", 105, 20, { align: "center" });
  //   doc.setFontSize(14);
  //   doc.text("Quotation", 105, 28, { align: "center" });

  //   // === INFO TABLE ===
  //   doc.setFontSize(11);
  //   const info = [
  //     ["Company Name", clientName],
  //     ["Contact Number", clientNo],
  //     ["Executive Name", executivename],
  //     ["Venue", placeaddress],
  //     ["Delivery Date", quoteDate],
  //     ["End Date", endDate],
  //     ["Address", address],
  //     ["Status", status],
  //   ];

  //   autoTable(doc, {
  //     startY: 36,
  //     head: [],
  //     body: info,
  //     theme: "plain",
  //     styles: { fontSize: 11 },
  //     columnStyles: {
  //       0: { fontStyle: "bold", cellWidth: 45 },
  //       1: { cellWidth: 120 },
  //     },
  //     tableLineWidth: 0,
  //   });

  //   // === PRODUCT TABLE ===
  //   const productRows = products.map((p) => {
  //     // const days =
  //     //   quoteDate && endDate
  //     //     ? (parseDate(endDate) - parseDate(quoteDate)) /
  //     //     (1000 * 60 * 60 * 24) +
  //     //     1
  //     //     : 1;
  //     const start = quoteDate instanceof Date ? quoteDate : parseDate(quoteDate);
  //     const end = endDate instanceof Date ? endDate : parseDate(endDate);
  //     let days = 1;
  //     days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
  //     if (isNaN(days) || days < 1) days = 1;


  //     return [
  //       quoteDate,
  //       p.productName,
  //       "element",
  //       p.availableStock,
  //       p.quantity,
  //       days,
  //       `${Number(p.price).toLocaleString("en-IN")}`,
  //       `${Number(p.total).toLocaleString("en-IN", {
  //         minimumFractionDigits: 2,
  //       })}`,
  //     ];
  //   });

  //   autoTable(doc, {
  //     startY: doc.lastAutoTable.finalY + 5,
  //     head: [
  //       [
  //         "Slot Date",
  //         "Product",
  //         "Image",
  //         "Available",
  //         "Qty",
  //         "Days",
  //         "Price/Qty",
  //         "Total",
  //       ],
  //     ],
  //     body: productRows,
  //     styles: { fontSize: 10, cellPadding: 3 },
  //     headStyles: { fillColor: [50, 100, 200] },
  //   });

  //   // === COST SUMMARY ===
  //   const summary = [
  //     // ["Discount (%)", `${(discount || 0).toFixed(2)}`],
  //     ...(discount && discount !== 0
  //       ? [
  //         [`Discount (${discount}%)`, `${(quotation?.discountAmt || 0).toLocaleString("en-IN", {
  //           minimumFractionDigits: 2,
  //         })}`,],
  //       ]
  //       : []),
  //     [
  //       "Transportation",
  //       `${Number(transportcharge || 0).toLocaleString("en-IN", {
  //         minimumFractionDigits: 2,
  //       })}`,
  //     ],
  //     [
  //       "Manpower Charge",
  //       `${Number(labourecharge || 0).toLocaleString("en-IN", {
  //         minimumFractionDigits: 2,
  //       })}`,
  //     ],

  //     // [
  //     //   "Round Off",
  //     //   `Rs. ${Number(adjustments || 0).toLocaleString("en-IN", {
  //     //     minimumFractionDigits: 2,
  //     //   })}`,
  //     // ],
  //     ["GST (%)", `${(quotation?.gstAmt || 0).toFixed(2)}`],
  //     [
  //       "Grand Total",
  //       `${Number(GrandTotal || 0).toLocaleString("en-IN", {
  //         minimumFractionDigits: 2,
  //       })}`,
  //     ],
  //   ];

  //   autoTable(doc, {
  //     startY: doc.lastAutoTable.finalY + 10,
  //     body: summary,
  //     theme: "grid",
  //     styles: { fontSize: 11, halign: "right" },
  //     columnStyles: {
  //       0: { halign: "left", fontStyle: "bold" },
  //       1: { fontStyle: "normal" },
  //     },
  //     tableLineColor: 230,
  //     tableLineWidth: 0.3,
  //   });

  //   doc.save(`${quoteId || "quotation"}.pdf`);
  // };

  // const handleDownloadPDFWorking = async () => {
  //   const doc = new jsPDF();

  //   const imageURL = 'https://api.rentangadi.in/product/1750839736747_Retro 1 seater.png'; // Image URL

  //   // Add the image to the PDF using URL
  //   doc.addImage(imageURL, 'PNG', 10, 10, 50, 50); // 50x50 px image size at position (10, 10)

  //   // Sample product data (just an example)
  //   const productRows = [
  //     ['Product 1', 'Retro 1 Seater', imageURL],
  //   ];

  //   // Add product table with image in the second column
  //   autoTable(doc, {
  //     startY: 60,
  //     head: [['Product', 'Name', 'Image']],
  //     body: productRows,
  //     styles: { fontSize: 10, cellPadding: 3 },
  //     headStyles: { fillColor: [50, 100, 200] },
  //   });

  //   // Save PDF
  //   doc.save('quotation.pdf');
  // };

  // const handleDownloadPDF = async () => {
  //   const doc = new jsPDF();
  //   const imageURL = 'https://api.rentangadi.in/product/1750839736747_Retro 1 seater.png'; // Image URL

  //   // Helper function to get image as Base64
  //   const getImageBase64 = async (url) => {
  //     try {
  //       const response = await fetch(url);
  //       if (!response.ok) {
  //         throw new Error('Failed to fetch image');
  //       }

  //       const blob = await response.blob();
  //       const reader = new FileReader();

  //       return new Promise((resolve, reject) => {
  //         reader.onloadend = () => {
  //           const base64String = reader.result;
  //           if (!base64String || !base64String.startsWith('data:image')) {
  //             reject('Invalid Base64 string');
  //           }
  //           resolve(base64String);
  //         };
  //         reader.onerror = (error) => reject('Error converting image to Base64: ' + error);
  //         reader.readAsDataURL(blob);
  //       });
  //     } catch (error) {
  //       console.error(error);
  //       return null;
  //     }
  //   };

  //   // Fetch the Base64 image before generating the PDF
  //   const imageBase64 = await getImageBase64(imageURL);

  //   // Add Header
  //   doc.setFontSize(18);
  //   doc.text("NNC Event Rentals", 105, 20, { align: "center" });
  //   doc.setFontSize(14);
  //   doc.text("Quotation", 105, 28, { align: "center" });

  //   // === PRODUCT TABLE ===
  //   const productRows = [
  //     [
  //       "Retro 1 Seater",  // Example product name
  //       "Retro 1 Seater",  // Name
  //       imageBase64 || "",  // Base64 image string or empty
  //     ]
  //   ];

  //   // Add product table with image
  //   autoTable(doc, {
  //     startY: 60,
  //     head: [['Product', 'Name', 'Image']],
  //     body: productRows,
  //     styles: { fontSize: 10, cellPadding: 3 },
  //     headStyles: { fillColor: [50, 100, 200] },
  //     didDrawCell: function (data) {
  //       // If the cell is the Image column, draw the image
  //       if (data.column.index === 2 && typeof data.cell.raw === "string" && data.cell.raw.startsWith("data:image")) {
  //         // Adding image directly into the PDF
  //         doc.addImage(data.cell.raw, 'PNG', data.cell.x + 2, data.cell.y + 2, 50, 50);  // Position and size of the image
  //         data.cell.text = [""]; // Clear the text in the cell
  //       }
  //     }
  //   });

  //   // Save PDF
  //   doc.save('quotation.pdf');
  // };

  // const getImageBase64 = async (url) => {
  //   try {
  //     const response = await fetch(url);
  //     if (!response.ok) {
  //       throw new Error('Failed to fetch image');
  //     }

  //     const blob = await response.blob();
  //     const reader = new FileReader();

  //     return new Promise((resolve, reject) => {
  //       reader.onloadend = () => {
  //         // Check if the result is a valid Base64 string
  //         const base64String = reader.result;
  //         if (!base64String || !base64String.startsWith('data:image')) {
  //           reject('Invalid Base64 string');
  //         }
  //         resolve(base64String);
  //       };
  //       reader.onerror = (error) => reject('Error reading image: ' + error);
  //       reader.readAsDataURL(blob);
  //     });
  //   } catch (error) {
  //     console.error("Image fetch failed:", error);
  //     return null; // Return null if there's an error fetching or converting the image
  //   }
  // };

  const deliveryDismantleSlots = [
    "Select Slots",
    "Slot 1: 7:00 AM to 11:00 PM",
    "Slot 2: 11:00 PM to 11:45 PM",
    "Slot 3: 7:30 AM to 4:00 PM",
    "Slot 4: 2:45 PM to 11:45 PM",
  ];

  if (loading) {
    return (
      <Container className="my-5 text-center">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (!quotation) {
    return (
      <Container className="my-5 text-center">
        <h4>Quotation not found.</h4>
      </Container>
    );
  }

  return (
    <Container fluid className="px-0 qd">
      {/* ---- Breadcrumb ---- */}
      <nav className="qd-crumbs" aria-label="Breadcrumb">
        <Link to="/dashboard" aria-label="Dashboard">
          <FaHome />
        </Link>
        <FaChevronRight />
        <Link to="/quotation">Quotation</Link>
        <FaChevronRight />
        <span>Details</span>
      </nav>

      {/* ---- Title row ---- */}
      <div className="qd-head">
        <div className="qd-head__text">
          <div className="qd-head__line">
            <h1 className="qd-head__title">Quotation Details</h1>
            <span className={`eq-pill ${stage.pill}`}>{stage.label}</span>
          </div>
          <p className="qd-head__meta">
            {quotation?.quoteId ? `#${quotation.quoteId}` : "Quotation"}
            {quotation?.createdAt
              ? "  \u00B7  Created on " +
                moment(quotation.createdAt).format("DD MMM YYYY, hh:mm A")
              : ""}
          </p>
        </div>

        <div className="qd-head__actions">
          {/* Wrapped so the click event is not passed on as an argument. */}
          <BusyButton
            className="eq-primary"
            onClick={() => handleUpdateQuotation()}
          >
            <FaEdit /> Update Quotation
          </BusyButton>
          <BusyButton className="eq-ghost" onClick={handleDownloadPDFClick}>
            <FaFilePdf /> Download as PDF
          </BusyButton>
        </div>
      </div>

      {/* ---- Client + stage ---- */}
      <div className="qd-top">
        <Card className="qd-client">
          <Card.Body>
            <img src={logo} alt="" className="qd-client__logo" />
            <div className="qd-client__text">
              <h2 className="qd-client__name">
                {(quotation?.clientName || "Unnamed client").toUpperCase()}
              </h2>
              <ul className="qd-client__meta">
                {quotation?.clientNo ? (
                  <li>
                    <FaPhoneAlt /> {quotation.clientNo}
                  </li>
                ) : null}
                {quotation?.placeaddress || quotation?.address ? (
                  <li>
                    <FaMapMarkerAlt />{" "}
                    {quotation.placeaddress || quotation.address}
                  </li>
                ) : null}
              </ul>
            </div>
          </Card.Body>
        </Card>

        <Card className="qd-stage">
          <Card.Body>
            <ol className="qd-steps">
              {(() => {
                /* An order that was called off leaves the quote saying
                   "send", so neither step is reached once it is. */
                const cancelled = stage.label === "Cancelled";
                const sent = !cancelled && quotation?.status === "send";
                const ordered = !cancelled && Boolean(orderState);
                const steps = [
                  { key: "quote", label: "Quotation", icon: FaFileInvoiceDollar, done: true },
                  { key: "sent", label: "Confirmed", icon: FaCheck, done: sent },
                  { key: "order", label: "Order Generated", icon: FaShoppingBag, done: ordered },
                  /* Completed means the job ran, not that an order exists;
                     the records only ever say Confirm or cancelled today, so
                     this stays unticked until one of these appears. */
                  {
                    key: "done",
                    label: "Completed",
                    icon: FaFlagCheckered,
                    done: ["completed", "returned", "delivered"].includes(orderState),
                  },
                ];
                // The furthest reached step is the one shown as current.
                let current = 0;
                steps.forEach((s2, i) => {
                  if (s2.done) current = i;
                });
                return steps.map((s2, i) => (
                  <li
                    key={s2.key}
                    className={
                      "qd-step" +
                      (s2.done ? " is-done" : "") +
                      (i === current ? " is-current" : "")
                    }
                  >
                    <span className="qd-step__dot">
                      <s2.icon />
                    </span>
                    <span className="qd-step__label">{s2.label}</span>
                    {i === current ? (
                      <span className="qd-step__now">Current stage</span>
                    ) : null}
                  </li>
                ));
              })()}
            </ol>
          </Card.Body>
        </Card>
      </div>
      {/* Company and Event Details */}
      <Card className="mb-4 shadow-sm qd-card qd-details">
        <Card.Body className="p-4">
          <Table responsive borderless size="sm">
            <tbody>
              <tr>
                <td
                  style={{ width: "25%", fontWeight: "500", color: "#34495e" }}
                >
                  <span className="qd-k"><FaBuilding /> Company Name</span>
                </td>
                <td style={{ width: "25%" }}>
                  {(quotation.clientName || "").toUpperCase()}
                </td>
                <td
                  style={{ width: "25%", fontWeight: "500", color: "#34495e" }}
                >
                  <span className="qd-k"><FaPhone /> Contact Number</span>
                </td>
                <td style={{ width: "25%" }}>{quotation?.clientNo || ""}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "500", color: "#34495e" }}>
                  <span className="qd-k"><FaUser /> Executive Name</span>
                </td>
                <td>{quotation.executivename || ""}</td>
                {/* <td style={{ fontWeight: "500", color: "#34495e" }}>Venue</td>
                <td>{quotation.placeaddress || ""}</td> */}
                <td><span className="qd-k"><FaMapMarkerAlt /> Address</span></td>
                <td>{quotation.address || ""}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "500", color: "#34495e" }}>
                  <span className="qd-k"><FaCalendarAlt /> Delivery Date</span>
                </td>
                <td>{quotation.quoteDate || ""}</td>
                <td style={{ fontWeight: "500", color: "#34495e" }}>
                  <span className="qd-k"><FaCalendarAlt /> Dismantle Date</span>
                </td>
                <td>{quotation.endDate || ""}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "500", color: "#34495e" }}>
                  <span className="qd-k"><FaClock /> Slot</span>
                </td>
                <td>
                  {quotation.quoteTime ||
                    quotation?.slots?.[0]?.quoteTime ||
                    ""}
                </td>
                <td style={{ fontWeight: "500", color: "#34495e" }}>
                  <span className="qd-k"><FaUser /> Incharge Name</span>
                </td>
                <td>{quotation.inchargeName || ""}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: "500", color: "#34495e" }}>
                  <span className="qd-k"><FaUser /> Rent Angadi Point of Contact</span>
                </td>
                <td>{quotation.inchargePhone || ""}</td>
                <td><span className="qd-k"><FaBookmark /> Status</span></td>
                <td>
                  {/* The stage, not the record's own word: "send" means
                      little to a reader and says nothing about an order
                      that was called off. */}
                  {quotation.status ? (
                    <span className={`eq-pill ${stage.pill}`}>
                      {stage.label}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
              </tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Items Table */}
      <Card
        className="mb-4 shadow-sm qd-card qd-products"
        style={{ border: "none" }}
      >
        <Card.Body className="">
          {/* Dragging is not discoverable on its own, so it is named. */}
          <div className="qd-reorder-hint">
            <FaGripVertical />
            <span>
              {savingOrder
                ? "Saving the new order..."
                : "Drag a row by its handle to change the product order"}
            </span>
          </div>
          <Table
            bordered
            size="sm"
            style={{ borderColor: "#e0e0e0" }}
            className="mb-0"
          >
            <thead
              style={{
                background: "linear-gradient(45deg, #34495e, #2c3e50)",
                color: "#fff",
              }}
            >
              <tr>
                <th style={{ width: 36 }} aria-label="Reorder" />
                <th>Product</th>
                <th>Slot Date</th>
                <th>Image</th>
                <th>Available</th>
                <th>Qty</th>
                <th>Days</th>
                <th>Product Price</th>
                <th>Total</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                // const days =
                //   parseDate(item.endDate) && parseDate(item.quoteDate)
                //     ? Math.floor(
                //       (parseDate(item.endDate) - parseDate(item.quoteDate)) /
                //       (1000 * 60 * 60 * 24)
                //     ) + 1
                //     : 1;
                let days = 1;
                // console.log(`item fr date: `, item);
                // const start = item.productQuoteDate instanceof Date ? item.productQuoteDate : parseDate(item.productQuoteDate);
                // const end = item.productEndDate instanceof Date ? item.productEndDate : parseDate(item.productEndDate);
                const start = item.quoteDate instanceof Date ? item.quoteDate : parseDate(item.quoteDate);
                const end = item.endDate instanceof Date ? item.endDate : parseDate(item.endDate);
                days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
                if (isNaN(days) || days < 1) days = 1;

                days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
                if (isNaN(days) || days < 1) days = 1;


                // const qty = item.quantity || 0;
                const price = item.pricePerUnit || 0;
                item.days = days;
                quotation.allProductsTotal =
                  items
                    .reduce((sum, item) => sum + (item.amount * item?.days || 0), 0)
                console.log("quotation.allProductsTotal: ", quotation.allProductsTotal)

                // quotation.discount = 0

                quotation.discountAmt = quotation?.allProductsTotal * (quotation?.discount / 100)
                quotation.afterDiscount = quotation?.allProductsTotal - quotation.discountAmt
                quotation.totalWithCharges = quotation?.afterDiscount + quotation.transportcharge + quotation.labourecharge
                quotation.refurbishment && (quotation.totalWithCharges += quotation?.refurbishment)

                quotation.gstAmt = quotation.totalWithCharges * (quotation?.GST / 100);  // Assuming GST is in percentage (e.g., 18 for 18%)
                quotation.finalTotal = quotation.totalWithCharges + quotation?.gstAmt;  // Add GST to the total after discount


                return (
                  <tr
                    key={idx}
                    draggable={!savingOrder && editIdx === null}
                    onDragStart={(e) => {
                      setDragFrom(idx);
                      e.dataTransfer.effectAllowed = "move";
                      /* Firefox will not start a drag without this. */
                      e.dataTransfer.setData("text/plain", String(idx));
                    }}
                    onDragOver={(e) => {
                      if (dragFrom === null) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dragOverIdx !== idx) setDragOverIdx(idx);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleReorder(dragFrom, idx);
                      setDragFrom(null);
                      setDragOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOverIdx(null);
                    }}
                    className={
                      (dragFrom === idx ? "qd-row--dragging " : "") +
                      (dragOverIdx === idx && dragFrom !== null && dragFrom !== idx
                        ? "qd-row--over"
                        : "")
                    }
                  >
                    <td className="qd-handle-cell" title="Drag to reorder">
                      <span className="qd-handle" aria-hidden="true">
                        <FaGripVertical />
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px",
                        verticalAlign: "middle",
                      }}
                    >
                      {item.productName}
                    </td>
                    <td style={{ verticalAlign: "middle", width: "25%" }}>
                      <div className="d-flex">
                        {/* {console.log(`item: `, idx, item, productDates[item.productId])} */}
                        {/* {console.log(`editDraft: `, editIdx, editDraft)} */}
                        {editIdx === idx ? (
                          <DatePicker
                            selected={
                              // productDates[item.productId]?.productQuoteDate ||
                              editDraft[item.productId]?.productQuoteDate ||
                              // '12-12-2023'|| parseDate(item.quoteDate) ||
                              parseDate(item.quoteDate)
                            } // Default to product's own quote date
                            onChange={(date) =>
                              handleDateChange(
                                item.productId,
                                "productQuoteDate",
                                date,
                                item.productSlot || quotation?.slots[0]?.quoteTime
                              )
                            }
                            dateFormat="dd/MM/yyyy"
                            className="form-control"
                            minDate={parseDate(quotation?.quoteDate)} // Ensure date is within range
                            maxDate={parseDate(quotation?.endDate)} // Ensure date is within range
                          />
                        ) : (
                          quotation && (
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: "500",
                                color: "#444",
                                marginRight: "10px"
                              }}
                            >
                              {/* Check if the product date exists, else fallback to quote date */}
                              {productDates[item.productId]?.productQuoteDate
                                ? formatDateToDDMMYYYY(productDates[item.productId]?.productQuoteDate)
                                : (item.quoteDate) || "No date available"}
                              {"    "}
                              <span style={{ paddingLeft: "10px" }}>To</span>
                            </span>
                          )
                        )}

                        <br />
                        {/* {console.log(`productDates `, productDates)} */}
                        {editIdx === idx ? (
                          <DatePicker
                            selected={
                              // productDates[item.productId]?.productEndDate ||
                              editDraft[item.productId]?.productEndDate ||
                              parseDate(item.endDate)
                            } // Default to initial endDate
                            onChange={(date) =>
                              handleDateChange(
                                item.productId,
                                "productEndDate",
                                date,
                                item.productSlot || quotation?.slots[0]?.quoteTime
                              )
                            }
                            dateFormat="dd/MM/yyyy"
                            className="form-control"
                            minDate={
                              productDates[item.productId]?.productQuoteDate ||
                              parseDate(quotation?.quoteDate)
                            } // Ensure date is within range
                            maxDate={parseDate(quotation?.endDate)} // Ensure date is within range
                          />
                        ) : (
                          quotation && (
                            <span
                              style={{
                                fontSize: "14px",
                                fontWeight: "500",
                                color: "#444",
                              }}
                            >
                              {productDates[item.productId]?.productEndDate
                                ? formatDateToDDMMYYYY(productDates[item.productId]?.productEndDate)
                                : (item.endDate) || "No date available"}
                            </span>
                          )
                        )}

                      </div>

                      {/* Slot selection */}
                      <Form.Select
                        className="m-0 mt-1"
                        value={
                          // productDates[item.productId]?.productSlot ||
                          //  "Slot 3: 11:00 PM to 11:45 PM" 
                          // || 
                          editDraft[item.productId]?.productSlot ||
                          item.productSlot ||
                          quotation?.quoteTime
                        }
                        onChange={(e) =>
                          handleDateChange(
                            item.productId,
                            "productSlot",
                            e.target.value,
                            e.target.value
                          )
                        }
                        disabled={editIdx !== idx}
                      >
                        {deliveryDismantleSlots.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Form.Select>
                    </td>

                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      <img
                        src={item.image || '/image.png'}
                        alt="element"
                        style={{
                          width: 50,
                          height: 50,
                          objectFit: "contain",
                          borderRadius: "4px",
                        }}
                      />
                    </td>
                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      {item.available}
                    </td>
                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      {editIdx === idx ? (
                        <Form.Control
                          type="number"
                          min={1}
                          max={item.available}
                          value={editQty}
                          onChange={(e) => {
                            let val = e.target.value.replace(/^0+/, "");
                            setEditQty(
                              val === ""
                                ? ""
                                : Math.max(
                                  1,
                                  Math.min(Number(val), item.available)
                                )
                            );
                          }}
                          style={{
                            width: 70,
                            padding: "2px 6px",
                            fontSize: 13,
                          }}
                          autoFocus
                          disabled={loading}
                        />
                      ) : (
                        item.units
                      )}
                    </td>
                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      {days}
                    </td>
                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      {editIdx === idx ? (
                        <input
                          type="number"
                          min={0}
                          value={editPrice}
                          onChange={(e) => {
                            const val = e.target.value;
                            setEditPrice(val === "" ? "" : Math.max(0, Number(val)));
                          }}
                          style={{
                            width: 90,
                            padding: "2px 6px",
                            fontSize: 13,
                          }}
                          disabled={loading}
                          title="Only this quotation changes; the product keeps its own price"
                        />
                      ) : (
                        <>₹{price}</>
                      )}
                    </td>
                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      ₹{item.amount * days}
                      {/* {total.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })} */}
                    </td>
                    <td style={{ padding: "12px", verticalAlign: "middle" }}>
                      {editIdx === idx ? (
                        // <>
                        //   <BusyButton
                        //     variant="success"
                        //     size="sm"
                        //     style={{ padding: "2px 6px", marginRight: 4 }}
                        //     onClick={() => handleEditSave(item)}
                        //     disabled={
                        //       loading || quotation.status === "cancelled"
                        //     }
                        //   >
                        //     <FaCheck />
                        //   </BusyButton>
                        //   <Button
                        //     variant="secondary"
                        //     size="sm"
                        //     style={{ padding: "2px 6px" }}
                        //     onClick={() => setEditIdx(null)}
                        //     disabled={
                        //       loading || quotation.status === "cancelled"
                        //     }
                        //   >
                        //     <FaTimes />
                        //   </Button>
                        // </>
                        <>
                          <Button
                            variant="success"
                            size="sm"
                            style={{ padding: "2px 6px", marginRight: 4 }}
                            onClick={() => handleEditSave(item)}
                            disabled={
                              loading || quotation.status === "cancelled"
                            }
                          >
                            <FaCheck />
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            style={{ padding: "2px 6px" }}
                            onClick={() => handleCancelEdit(item.productId)}
                            disabled={
                              loading || quotation.status === "cancelled"
                            }
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
                            onClick={() => handleEdit(idx, item.units, item)}
                            disabled={
                              loading || quotation.status === "cancelled" || quotation.status === "send"
                            }
                          >
                            <FaEdit />
                          </Button>
                          <BusyButton
                            variant="link"
                            size="sm"
                            style={{ color: "#d00", padding: 0, marginLeft: 8 }}
                            onClick={() => handleDelete(item)}
                            disabled={
                              loading || quotation.status === "cancelled" || quotation.status === "send"
                            }
                          >
                            <FaTrashAlt />
                          </BusyButton>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card.Body>
      </Card>

      {/* Cost Summary */}
      <Card
        className="mb-4 shadow-sm qd-card qd-cost"
        style={{ border: "none" }}
      >
        <Card.Body className="p-4">
          <h5
            style={{
              fontWeight: "600",
              color: "#2c3e50",
              marginBottom: "20px",
            }}
          >
            Cost Summary
          </h5>
          {quotation.discount === 0 && <Button
            style={{
              fontWeight: "600",
              color: "#2c3e50",
              marginBottom: "20px",
            }}
            variant="link"
            onClick={() => {
              setEditDiscount(true)
              // quotation.discount = 1
              console.log(`Add discount: `, quotation.discount)
            }}
            disabled={quotation.status === "cancelled" || quotation.status === "send"}
          >
            Add discount
          </Button>}

          {/* <div className="d-flex justify-content-between mb-2">
            <span style={{ fontWeight: "600" }}>Products Total:</span>
            <span style={{ fontWeight: "600" }}>
              ₹
              {items
                .reduce((sum, item) => sum + (item.amount * item?.days || 0), 0)
                .toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div> */}
          {/* {quotation?.discount != 0 && <div className="d-flex justify-content-between mb-2">
            <span>Discount ({(quotation.discount || 0).toFixed(2)}%):</span>
            <span>{(quotation.discount || 0).toFixed(2)}</span>
          </div>} */}
          <div className="d-flex justify-content-between mb-2" style={{ fontWeight: "600" }}>
            <span>{quotation?.discount != 0 ? "Total amount before discount:" : "Total amount:"}</span>
            <span>₹{(quotation.allProductsTotal || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
          {(quotation?.discount != 0 || editDiscount) && <div className="d-flex justify-content-between mb-2">
            <span>Discount ({(quotation.discount || 0).toFixed(2)}%):</span>
            {/* <span>-₹{(quotation.discount / 100 * quotation.allProductsTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> */}
            {!editDiscount ? (
              <>
                <div className="d-flex align-items-center">
                  <Button variant="link" size="sm"
                    disabled={quotation.status === "cancelled" || quotation.status === "send"}
                    onClick={() => setEditDiscount(true)}>
                    <FaEdit />
                  </Button>
                  {/* {console.log(`quotation.discount: `, quotation.discount)} */}
                  <span>-₹{(quotation.discount / 100 * quotation.allProductsTotal).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              </>
            ) : (
              <>
                <div className="d-flex align-items-center">
                  <Form.Group controlId="discount" style={{ width: "150px" }}>
                    <Form.Control
                      type="number"
                      value={tempDraft.discount}
                      onChange={(e) => {
                        const raw = parseFloat(e.target.value) || 0;
                        const value = Math.min(100, Math.max(0, raw)); // clamp 0–100
                        // const value = parseFloat(e.target.value) || 0;
                        // setQuotation({ ...quotation, discount: value });
                        setTempDraft({ ...quotation, discount: value });
                        // Update total calculations
                        // quotation.refurbishment = value;
                      }}
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                  <Button variant="primary" size="sm" className="ms-2" onClick={() => {
                    setQuotation({ ...quotation, discount: tempDraft.discount });
                    setEditDiscount(false)
                  }}>
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" className="ms-2" onClick={() => {
                    // Reset to original value
                    setQuotation(prev => ({ ...prev, discount: prev.discount }));
                    setTempDraft(quotation)
                    setEditDiscount(false);
                  }}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>}
          {(quotation?.discount != 0 || editDiscount) && <div className="d-flex justify-content-between mb-2" style={{ fontWeight: "600" }}>
            <span>Total amount after discount:</span>
            <span>₹{(quotation.afterDiscount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>}
          <div className="d-flex justify-content-between mb-2">
            <span>Transportation:</span>
            {/* <span>₹{(quotation.transportcharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> */}
            {!editTransport ? (
              <>
                <div className="d-flex align-items-center">
                  <Button variant="link" size="sm"
                    disabled={quotation.status === "cancelled" || quotation.status === "send"}
                    onClick={() => setEditTransport(true)}>
                    <FaEdit />
                  </Button>
                  <span className="">
                    ₹{(quotation.transportcharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="d-flex align-items-center">
                  <Form.Group controlId="transportation" style={{ width: "150px" }}>
                    <Form.Control
                      type="number"
                      value={tempDraft.transportcharge}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        // setQuotation({ ...quotation, transportcharge: value });
                        setTempDraft({ ...quotation, transportcharge: value });
                        // Update total calculations
                        // quotation.refurbishment = value;
                      }}
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                  <Button variant="primary" size="sm" className="ms-2" onClick={() => {
                    setQuotation({ ...quotation, transportcharge: tempDraft.transportcharge });
                    setEditTransport(false)
                  }}>
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" className="ms-2" onClick={() => {
                    // Reset to original value
                    setQuotation(prev => ({ ...prev, transportcharge: prev.transportcharge }));
                    setTempDraft(quotation)
                    setEditTransport(false);
                  }}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="d-flex justify-content-between mb-2">
            <span>Manpower Charge:</span>
            {/* <span>₹{(quotation.labourecharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span> */}
            {!editManPower ? (
              <>
                <div className="d-flex align-items-center">
                  <Button variant="link" size="sm"
                    disabled={quotation.status === "cancelled" || quotation.status === "send"}
                    onClick={() => setEditManPower(true)}>
                    <FaEdit />
                  </Button>
                  <span className="">
                    ₹{(quotation.labourecharge || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="d-flex align-items-center">
                  <Form.Group controlId="manpower" style={{ width: "150px" }}>
                    <Form.Control
                      type="number"
                      value={tempDraft.labourecharge}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        // setQuotation({ ...quotation, labourecharge: value });
                        setTempDraft({ ...quotation, labourecharge: value });
                        // Update total calculations
                        // quotation.refurbishment = value;
                      }}
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                  <Button variant="primary" size="sm" className="ms-2" onClick={() => {
                    setQuotation({ ...quotation, labourecharge: tempDraft.labourecharge });
                    setEditManPower(false)
                  }}>
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" className="ms-2" onClick={() => {
                    // Reset to original value
                    setQuotation(prev => ({ ...prev, labourecharge: prev.labourecharge }));
                    setTempDraft(quotation)
                    setEditManPower(false);
                  }}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
          <div className="d-flex justify-content-between mb-2">
            {/* <span>Refurbishment:</span> */}
            <span>Reupholestry:</span>
            {/* {!editMode ? (
              <>
                <div className="d-flex align-items-center">
                <Button variant="link" size="sm"
                  disabled={quotation.status === "cancelled" || quotation.status === "send"}
                  onClick={() => setEditMode(true)}>
                    <FaEdit />
                  </Button>
                  <span className="me-2">
                    ₹{(quotation.refurbishment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <Form.Group controlId="refurbishment" style={{ width: "150px" }}>
                  <Form.Control
                    type="number"
                    value={quotation.refurbishment || 0}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      setQuotation({ ...quotation, refurbishment: value });
                      // Update total calculations
                      quotation.refurbishment = value;
                      quotation.totalWithCharges = quotation?.afterDiscount + quotation.transportcharge + quotation.labourecharge + quotation.refurbishment;
                      quotation.gstAmt = quotation.totalWithCharges * (quotation?.GST / 100);
                      quotation.finalTotal = quotation.totalWithCharges + quotation?.gstAmt;
                    }}
                    min="0"
                    step="0.01"
                  />
                </Form.Group>
                <Button variant="primary" size="sm" className="ms-2" onClick={() => setEditMode(false)}>
                  Save
                </Button>
                <Button variant="secondary" size="sm" className="ms-2" onClick={() => {
                  // Reset to original value
                  setQuotation(prev => ({ ...prev, refurbishment: prev.refurbishment }));
                  setEditMode(false);
                }}>
                  Cancel
                </Button>
              </>
            )} */}
            {!editMode ? (
              <>
                <div className="d-flex align-items-center">
                  <Button variant="link" size="sm"
                    disabled={quotation.status === "cancelled" || quotation.status === "send"}
                    onClick={() => { setEditMode(true); setRefurbishment(quotation.refurbishment || 0); }}>
                    <FaEdit />
                  </Button>
                  <span className="">
                    ₹{(quotation.refurbishment || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="d-flex align-items-center">
                  <Form.Group controlId="refurbishment" style={{ width: "150px" }}>
                    <Form.Control
                      type="number"
                      value={refurbishment}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        setRefurbishment(value)
                        // setQuotation({ ...quotation, refurbishment: value });
                        // Update total calculations
                        // quotation.refurbishment = value;
                      }}
                      min="0"
                      step="0.01"
                    />
                  </Form.Group>
                  <Button variant="primary" size="sm" className="ms-2" onClick={() => {
                    setQuotation({ ...quotation, refurbishment: refurbishment });
                    setEditMode(false)
                  }}>
                    Save
                  </Button>
                  <Button variant="secondary" size="sm" className="ms-2" onClick={() => {
                    // Reset to original value
                    setQuotation(prev => ({ ...prev, refurbishment: prev.refurbishment }));
                    setEditMode(false);
                    setRefurbishment(0)
                  }}>
                    Cancel
                  </Button>
                </div>
              </>
            )}

          </div>
          {/* <div className="d-flex justify-content-between mb-2">
            <span>Round Off:</span>
            <span>
              ₹{(quotation.adjustments || quotation.roundOff || 0).toFixed(2)}
            </span>
          </div> */}
          {<div className="d-flex justify-content-between mb-2" style={{ fontWeight: "600" }}>
            <span>Sub-Total:</span>
            <span>₹{(quotation?.totalWithCharges || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>}
          {quotation?.GST != 0 && <div className="d-flex justify-content-between mb-2">
            <span>GST ({(quotation?.GST || 0).toFixed(2)}%):</span>
            <span>₹{(quotation?.gstAmt || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>}
          <hr style={{ borderColor: "#e0e0e0" }} />
          <div
            className="d-flex justify-content-between qd-grand"
            style={{ fontSize: "18px", fontWeight: "700" }}
          >
            <span>Grand Total:</span>
            {/* <span>
              ₹
              {(quotation.GrandTotal || quotation.grandTotal || 0).toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
            </span> */}
            <span>
              ₹{(quotation?.finalTotal ?? 0)
                .toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                })}
            </span>
          </div>
        </Card.Body>
      </Card>

      {/* Notes */}
      {quotation.termsandCondition &&
        quotation.termsandCondition.length > 0 && (
          <Card
            className="mb-4 shadow-sm qd-card qd-inv"
            style={{ border: "none" }}
          >
            <Card.Body className="p-4">
              <h5
                style={{
                  fontWeight: "600",
                  color: "#2c3e50",
                  marginBottom: "15px",
                }}
              >
                Terms and Notes
              </h5>
              <ul
                style={{
                  paddingLeft: "20px",
                  color: "#333",
                  lineHeight: "1.6",
                }}
              >
                {quotation.termsandCondition.map((note, idx) => (
                  <li key={idx} style={{ marginBottom: "10px" }}>
                    {note}
                  </li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        )}

      {/* Action Buttons */}
      <Card
        className="mb-4 shadow-sm qd-card qd-bar"
        style={{ border: "none" }}
      >
        <Card.Body className="p-4 d-flex justify-content-between align-items-center flex-wrap gap-3">
          <BusyButton
            variant="primary"
            style={{
              background: "linear-gradient(45deg, #2980b9, #3498db)",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontWeight: "500",
              transition: "transform 0.2s",
            }}
            disabled={quotation.status === "cancelled"}
            onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
            // onClick={handleShowGenerateModal}
            onClick={handleGenerateOrder}
          >
            Generate Order
          </BusyButton>

          <Button
            variant="info"
            style={{
              background: "linear-gradient(45deg, #27ae60, #2ecc71)",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontWeight: "500",
              transition: "transform 0.2s",
              color: "white",
            }}
            disabled={quotation.status === "cancelled" || quotation.status === "send"}
            onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
            onClick={handleShowAdd}
          >
            Add Product
          </Button>

          <BusyButton
            variant="danger"
            style={{
              background: "linear-gradient(45deg, #c0392b, #e74c3c)",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontWeight: "500",
              transition: "transform 0.2s",
            }}
            disabled={quotation.status === "cancelled" || quotation.status === "send"}
            onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
            onClick={handleCancelQuotation}
          >
            Cancel Quotation
          </BusyButton>
        </Card.Body>
      </Card>

      {/* Add Payment Modal */}
      <Modal
        show={showGenerateModal}
        onHide={handleCloseGenerateModal}
        centered
      >
        <Modal.Header style={{ borderBottom: "none", padding: "20px 20px 0" }}>
          <Modal.Title style={{ fontWeight: "600", color: "#2c3e50" }}>
            Payment
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: "20px" }}>
          <Form>
            {/* Payment Status */}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: "500", color: "#34495e" }}>
                Payment
              </Form.Label>
              <div>
                <Form.Check
                  inline
                  label="Offline"
                  type="checkbox"
                  checked={paymentData.status === "Offline"}
                  onChange={() => handleCheckboxChange("Offline")}
                  style={{ marginRight: "20px" }}
                />
                <Form.Check
                  inline
                  label="Online"
                  type="checkbox"
                  checked={paymentData.status === "Online"}
                  onChange={() => handleCheckboxChange("Online")}
                />
              </div>
            </Form.Group>
            {/* Amount */}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: "500", color: "#34495e" }}>
                Amount
              </Form.Label>
              <div className="d-flex align-items-center">
                <span
                  style={{
                    marginRight: "10px",
                    fontSize: "1.2rem",
                    color: "#34495e",
                  }}
                >
                  ₹
                </span>
                <Form.Control
                  type="number"
                  name="amount"
                  value={paymentData.amount}
                  max={quotation?.GrandTotal}
                  onChange={handleInputChange}
                  placeholder="0"
                  style={{ borderRadius: "6px", borderColor: "#e0e0e0" }}
                  min={0.01}
                />
              </div>
            </Form.Group>
            {/* Amuont Max */}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: "500", color: "#34495e" }}>
                Amount Pending
              </Form.Label>
              <div className="d-flex align-items-center">
                <span
                  style={{
                    marginRight: "10px",
                    fontSize: "1.2rem",
                    color: "#34495e",
                  }}
                >
                  ₹
                </span>
                <Form.Control
                  type="number"
                  name="amount"
                  value={quotation?.finalTotal || quotation?.GrandTotal}
                  placeholder="0"
                  style={{ borderRadius: "6px", borderColor: "#e0e0e0" }}
                  disabled={true}
                />
              </div>
            </Form.Group>
            {/* Payment Mode */}
            {paymentData.status !== "Offline" && (
              // <Form.Group className="mb-3">
              //   <Form.Label style={{ fontWeight: "500", color: "#34495e" }}>
              //     Payment Mode
              //   </Form.Label>
              //   <Form.Select
              //     name="mode"
              //     value={paymentData.mode}
              //     onChange={handleInputChange}
              //     style={{ borderRadius: "6px", borderColor: "#e0e0e0" }}
              //   >
              //     <option value="">Select Payment Mode</option>
              //     {/* <option value="Googlepay">Googlepay</option> */}
              //     {/* <option value="Phonepay">Phonepay</option> */}
              //     {/* <option value="Paytm">Paytm</option> */}
              //     <option value="UPI">UPI</option>
              //     <option value="Account">Account</option>
              //     <option value="Other">Other</option>
              //   </Form.Select>
              // </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label style={{ fontWeight: "500", color: "#34495e" }}>
                  Payment Mode
                </Form.Label>
                <Form.Control
                  type="text"
                  name="mode"
                  value={paymentData.mode}
                  onChange={handleInputChange}
                  placeholder="Enter Payment Mode"
                  style={{ borderRadius: "6px", borderColor: "#e0e0e0" }}
                />
              </Form.Group>
            )}
            {/* Comments */}
            <Form.Group className="mb-3">
              <Form.Label style={{ fontWeight: "500", color: "#34495e" }}>
                Comments
              </Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                name="comments"
                value={paymentData.comments}
                onChange={handleInputChange}
                placeholder="Add any comments or remarks"
                style={{
                  borderRadius: "6px",
                  borderColor: "#e0e0e0",
                  resize: "none",
                }}
              />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer style={{ borderTop: "none", padding: "0 20px 20px" }}>
          <BusyButton
            style={{
              background: "linear-gradient(45deg, #27ae60, #2ecc71)",
              border: "none",
              borderRadius: "8px",
              padding: "6px 10px",
              fontWeight: "500",
              transition: "transform 0.2s",
              width: "100px",
            }}
            className="btn-sm"
            onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
            onClick={handleAddPayment}
            // onClick={handleUpdateQuotation}
            disabled={paymentLoading}
          >
            Add
          </BusyButton>
          <BusyButton
            style={{
              background: "linear-gradient(45deg, #2980b9, #3498db)",
              border: "none",
              borderRadius: "8px",
              padding: "6px 20px",
              fontWeight: "500",
              transition: "transform 0.2s",
            }}
            className="btn-sm"
            onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
            onClick={handleGenerateOrder}
            disabled={paymentLoading}
          >
            Skip
          </BusyButton>
          <Button
            style={{
              background: "linear-gradient(45deg,rgb(185, 41, 72), #3498db)",
              border: "none",
              borderRadius: "8px",
              padding: "6px 20px",
              fontWeight: "500",
              transition: "transform 0.2s",
            }}
            className="btn-sm"
            onMouseOver={(e) => (e.target.style.transform = "scale(1.05)")}
            onMouseOut={(e) => (e.target.style.transform = "scale(1)")}
            onClick={handleCloseGenerateModal}
            disabled={paymentLoading}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      {/* add product  */}
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
                options={availableToAdd.map((p) => ({
                  value: p._id,
                  label: p.ProductName,
                }))}
                value={addRows.map((r) => ({
                  value: r.productId,
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
                  <span className="text-center">Available</span>
                  <span className="text-center">Qty</span>
                  <span className="text-end">Price</span>
                  <span className="text-end">Total</span>
                  <span />
                </div>

                {addRows.map((row) => {
                  const price = priceOf(row);
                  const over =
                    !row.loading &&
                    row.availableStock > 0 &&
                    Number(row.qty) > row.availableStock;
                  const none = !row.loading && row.availableStock <= 0;

                  return (
                    <div
                      key={row.productId}
                      className={`qa-picked__row${none ? " is-blocked" : ""}`}
                    >
                      <span className="qa-picked__name">
                        {row.product?.ProductName || "Product"}
                        {none ? (
                          <span className="qa-picked__warn">
                            Nothing free on these dates
                          </span>
                        ) : over ? (
                          <span className="qa-picked__warn">
                            Cannot exceed {row.availableStock}
                          </span>
                        ) : null}
                      </span>

                      <span className="text-center">
                        {row.loading ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          row.availableStock
                        )}
                      </span>

                      <span className="text-center">
                        <Form.Control
                          type="number"
                          min={1}
                          max={row.availableStock || 1}
                          value={row.qty}
                          disabled={row.loading || none}
                          onChange={(e) =>
                            setRowQty(row.productId, e.target.value)
                          }
                          size="sm"
                          className="qa-picked__qty"
                        />
                      </span>

                      <span className="text-end">&#8377;{price}</span>
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
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCloseAdd}
            disabled={addLoading}
          >
            Cancel
          </Button>
          <BusyButton
            variant="primary"
            size="sm"
            disabled={addLoading || !addRowsReady}
            onClick={handleAddProduct}
          >
            {addLoading
              ? "Adding..."
              : addRows.length > 1
                ? `Add ${addRows.length} products`
                : "Add"}
          </BusyButton>
        </Modal.Footer>
      </Modal>
            <Card className="shadow-sm mb-4" style={{ borderRadius: 14 }}>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="d-flex align-items-center" style={{ gap: 10 }}>
              <FaBoxOpen />
              <h5 style={{ margin: 0, fontWeight: 800 }}>Inventory</h5>
            </div>

            <BusyButton
              size="sm"
              variant="outline-secondary"
              onClick={() => fetchInventoryFromQuoteData(quotation)}
              disabled={inventoryLoading}
            >
              {inventoryLoading ? "Refreshing..." : "Refresh"}
            </BusyButton>
          </div>

          {inventoryError ? (
            <div className="text-danger" style={{ fontSize: 13 }}>
              {inventoryError}
            </div>
          ) : null}

          <div className="table-responsive">
            <Table bordered hover responsive size="sm" style={{ background: "#fff", fontSize: 13 }}>
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
                {inventoryLoading ? (
                  <tr>
                    <td colSpan={5} className="text-center">
                      <Spinner animation="border" size="sm" />
                    </td>
                  </tr>
                ) : inventoryRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-muted">
                      No inventory found.
                    </td>
                  </tr>
                ) : (
                  inventoryRows.map((item, idx) => {
                    const prod = allProducts.find((p) => String(p._id) === String(item.productId));
                    const icon = prod?.ProductIcon;

                    return (
                      <tr key={item.productId}>
                        <td>{idx + 1}</td>
                        <td style={{ fontWeight: 600 }}>{item.productName}</td>
                        <td>
                          {icon ? (
                            <img
                              src={`${icon}`}
                              alt={item.productName}
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
                              {String(item.productName || "P").slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </td>
                        <td>{item.availableStock}</td>
                        <td
                          style={
                            item.availableStock < item.pendingQuotationQty
                              ? { color: "#D97706", fontWeight: 700 }
                              : {}
                          }
                        >
                          {Number(item.pendingQuotationQty) > 0 ? (
                            <button
                              type="button"
                              className={
                                "uq-link" +
                                (item.availableStock < item.pendingQuotationQty
                                  ? " is-over"
                                  : "")
                              }
                              title="See which quotations hold this product"
                              onClick={() => setUnderQuotationsRow(item)}
                            >
                              {item.pendingQuotationQty}
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
          </div>
        </Card.Body>
      </Card>

      <PendingQuotationsModal
        show={!!underQuotationsRow}
        onHide={() => setUnderQuotationsRow(null)}
        row={underQuotationsRow}
        startDate={inventoryRange.startDate}
        endDate={inventoryRange.endDate}
      />
    </Container>
  );
};

export default QuotationDetails;
{/* <RelatedEnquiries quotationId={id} /> */ }
