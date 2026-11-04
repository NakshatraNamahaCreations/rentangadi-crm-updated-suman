import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Table,
  Button,
  Row,
  Col,
  Modal,
  Form,
  Spinner,
  Container,
} from "react-bootstrap";
import { Link, useFetcher, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import Select from "react-select";
import {
  FaEdit,
  FaTrashAlt,
  FaCheck,
  FaTimes,
  FaHome,
  FaChevronRight,
  FaFilePdf,
  FaFileInvoiceDollar,
  FaPhoneAlt,
  FaMapMarkerAlt,
  FaUserTie,
  FaRupeeSign,
  FaRegCalendarAlt,
  FaClock,
  FaSyncAlt,
  FaCommentDots,
  FaBan,
  FaPlus,
  FaBoxOpen,
  FaGripVertical,
} from "react-icons/fa";
import moment from "moment";
import PendingQuotationsModal from "../../components/PendingQuotationsModal";
import { ApiURL, ImageApiURL } from "../../api";
import { toast } from "react-hot-toast";
import DatePicker from "react-datepicker";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const labelStyle = {
  color: "#64748B",
  fontWeight: 600,
  fontSize: 12,
  minWidth: 150,
  letterSpacing: "0.01em",
};
const valueStyle = {
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 600,
};

const parseDate = (str) => {
  // console.log("parseDate str error: ", str)
  if (!str) return null; // If date is undefined or null, return null.
  const [day, month, year] = str.split("-"); // Assuming date format is DD-MM-YYYY
  return new Date(`${year}-${month}-${day}`); // Convert to YYYY-MM-DD format for JavaScript Date
};

const formatDateToDDMMYYYY = (date) => {
  if (!date) return null; // If date is null or undefined, return null.
  if (!(date instanceof Date) || isNaN(date)) {
    // console.log("formatDateToDDMMYYYY date:", date);
    return null;
  }
  const day = String(date.getDate()).padStart(2, "0"); // Add leading zero if needed
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Add leading zero if needed
  const year = date.getFullYear();

  return `${day}-${month}-${year}`; // Return in dd-mm-yyyy format
};

const token = sessionStorage.getItem("token") || ""
const OrderDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // States for order details
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addProductLoading, setAddProductLoading] = useState(false);
  const [addPaymentLoading, setAddPaymentLoading] = useState(false);
  const [products, setProducts] = useState([]);
  /* Row being dragged and the row it is hovering over, as positions in
     `products`; plus a flag while the new order is being saved. */
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  /* Set just before a reorder updates `order`, so the effect that rebuilds
     the product rows skips that one change. That effect puts the page into
     its loading state and refetches stock for every product, which on a
     reorder is both a visible flash and wasted work - the rows are already
     in hand, only their order changed. */
  const skipProductRebuild = useRef(false);
  const [showRefModal, setShowRefModal] = useState(false);

  // Add Product Modal states
  const [showAdd, setShowAdd] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState(1);
  const [selectedAddProduct, setSelectedAddProduct] = useState(null);

  // Edit product states
  const [editIdx, setEditIdx] = useState(null);
  const [editQty, setEditQty] = useState(1);

  // Refurbishment modal states
  const [refProduct, setRefProduct] = useState("");
  const [refQty, setRefQty] = useState("");
  const [refPrice, setRefPrice] = useState("");
  const [refDamage, setRefDamage] = useState("");
  const [addedRefProducts, setAddedRefProducts] = useState([]);
  const [shippingAddress, setShippingAddress] = useState("");
  const [floorManager, setFloorManager] = useState("");
  const [refurbishmentdata, setRefurbishmentdata] = useState({});
  const [productDates, setProductDates] = useState({});
  const pdfRef = useRef();
  const [pdfMode, setPdfMode] = useState(false);
  const [productDays, setProductDays] = useState({});
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [paymentData, setPaymentData] = useState({
    status: "Online",
    amount: 0,
    mode: "",
    comments: "",
    date: new Date().toLocaleDateString("en-GB").split("/").join("-"),
  });
  const [amountPaid, setAmountPaid] = useState(0)
  const [amountPending, setAmountPending] = useState(0)

  // Add roundOff state
  const [roundOff, setRoundOff] = useState(0);
  const [isEditingRoundOff, setIsEditingRoundOff] = useState(false);

  const [additionalTransportation, setAdditionalTransportation] = useState(0);
  const [isEditingTransport, setIsEditingTransport] = useState(false);
  const [isSavingTransport, setIsSavingTransport] = useState(false);


  const [isEditingManpower, setIsEditingManpower] = useState(false);
  const [manpowerValue, setManpowerValue] = useState(order?.labourecharge || 0);
  const [isSavingManpower, setIsSavingManpower] = useState(false);

  const [currentUser, setCurrentUser] = useState("")

  const [remarks, setRemarks] = useState("");
  const [isSavingRemarks, setIsSavingRemarks] = useState(false);

  const [inventoryRows, setInventoryRows] = useState([]);
  /* The dates the inventory figures were fetched for, shown in the
     breakdown so it is clear which window the numbers cover. */
  const [inventoryRange, setInventoryRange] = useState({ startDate: "", endDate: "" });
  /* The stock row whose quotation breakdown is open, or null. */
  const [underQuotationsRow, setUnderQuotationsRow] = useState(null);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");

  /**
   * Moves a product row and saves the new order.
   *
   * The stored shape is slots[].products (or a top-level products array on
   * older orders), so the flat table order is translated back into positions
   * within one of those. Only moves inside the same slot are allowed:
   * dropping a row into another slot would change its dates, which is not
   * what dragging a row is asking for.
   *
   * Both the table state and order.slots are updated, because the invoice
   * and PDF read the products back off the order. A failed save puts both
   * back the way they were.
   */
  const handleReorder = async (from, to) => {
    if (from === null || to === null || from === to) return;

    const source = products[from];
    const target = products[to];
    if (!source || !target) return;

    if (source._slotIndex !== target._slotIndex) {
      toast.error("Products can only be reordered within the same slot");
      return;
    }

    const slotIndex = source._slotIndex;

    const nextProducts = [...products];
    const [moved] = nextProducts.splice(from, 1);
    nextProducts.splice(to, 0, moved);

    /* The positions these products should now be read in. */
    const newOrder = nextProducts
      .filter((row) => row._slotIndex === slotIndex)
      .map((row) => row._productIndex);

    const previousProducts = products;
    const previousOrder = order;

    const permute = (arr) => newOrder.map((i) => (arr || [])[i]);
    const nextOrderDoc =
      slotIndex === null
        ? { ...order, products: permute(order?.products) }
        : {
            ...order,
            slots: (order?.slots || []).map((slot, idx) =>
              idx === slotIndex
                ? { ...slot, products: permute(slot.products) }
                : slot
            ),
          };

    /* Renumber, so a second drag before a reload still maps correctly. */
    setProducts(
      nextProducts.map((row, i) =>
        row._slotIndex === slotIndex ? { ...row, _productIndex: i } : row
      )
    );
    skipProductRebuild.current = true;
    setOrder(nextOrderDoc);
    setSavingOrder(true);

    try {
      await axios.put(
        `${ApiURL}/order/reorder-products/${order._id}`,
        { slotIndex, order: newOrder }
      );
      toast.success("Product order saved");
    } catch (err) {
      /* The revert sets both back together, so the rebuild is not needed
         for this change either. */
      skipProductRebuild.current = true;
      setProducts(previousProducts);
      setOrder(previousOrder);
      toast.error(
        err?.response?.data?.error || "Could not save the new order"
      );
    } finally {
      setSavingOrder(false);
    }
  };

  const handleShowGenerateModal = () => setShowGenerateModal(true);
  const handleCloseGenerateModal = () => setShowGenerateModal(false);


  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        if (!token) {
          setCurrentUser("");

          return;
        }

        const res = await axios.get(`${ApiURL}/admins/permissions`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const admin = res?.data?.admin;

        if (!admin) {

          setCurrentUser("");


          return;
        }

        setCurrentUser(admin || "");

        // (optional) store role/email too if you want
        sessionStorage.setItem("currentUserEmail", admin?.email || "");
        sessionStorage.setItem("role", admin?.role || "");
      } catch (err) {
        console.error("fetchCurrentUser error:", err?.response?.data || err.message);


        setCurrentUser("");

      }
    };

    fetchCurrentUser();
  }, [token]);

  useEffect(() => {
    if (order) setRemarks(order?.remarks || "");
  }, [order]);

  const handleUpdateRemarks = async () => {
    try {
      if (!order?._id) return;

      setIsSavingRemarks(true);

      const res = await axios.put(`${ApiURL}/order/updateRemarks`, {
        orderId: order._id,
        remarks,
      });

      toast.success("Remarks updated!");
      setOrder(res.data.updatedOrder); // keep UI in sync
    } catch (err) {
      console.error("handleUpdateRemarks error:", err);
      toast.error(err?.response?.data?.message || "Failed to update remarks");
    } finally {
      setIsSavingRemarks(false);
    }
  };

  const handleRefurbishment = async () => {
    try {
      if (addedRefProducts.length === 0) {
        toast.error("Please add at least one product");
        return;
      }

      const payload = {
        products: addedRefProducts,
        // shippingAddress,
        // floorManager,
        status: "sent",
        orderId: order._id,
      };

      const response = await axios.post(
        `${ApiURL}/refurbishment/create`,
        payload
      );
      if (response.status === 201) {
        toast.success("Refurbishment submitted successfully");
        handleCloseRefModal();
      } else {
        toast.error("Failed to submit refurbishment");
      }
    } catch (error) {
      console.error("Error submitting refurbishment:", error);
      toast.error("Error occurred while adding refurbishment");
    }
  };

  // Fetching filtered inventory for the order details
  // const fetchFilteredInventoryForOrder = async () => {
  //   console.log("order before fetch call: ", order);
  //   console.log("products: ", products);
  //   try {
  //     const response = await axios.get(`${ApiURL}/inventory/filter`, {
  //       params: {
  //         startDate: order?.slots[0].quoteDate,
  //         endDate: order?.slots[0].endDate,
  //         products: order?.slots[0].products.map((p) => p.productId).join(","),
  //       },
  //     });

  //     console.log(`${ApiURL}/inventory/filter: `, response.data.stock);
  //     let filtered = response.data.stock || [];
  //     console.log("filtered: ", filtered);

  //     if (order?.slots?.length && filtered?.length) {
  //       // Loop through each slot in the order
  //       order.slots = order.slots.map((slot) => {
  //         if (slot?.products?.length) {
  //           // Loop through each product in the slot's products
  //           slot.products = slot.products.map((product) => {
  //             const stock = filtered.find(
  //               (item) => item.productId === product.productId
  //             );

  //             // If stock is found, inject availableStock into the product, otherwise default to 0
  //             return {
  //               ...product,
  //               availableStock: stock ? stock.availableStock : 0,
  //             };
  //           });
  //         }
  //         return slot;
  //       });

  //       console.log("order.slots[0].products: ", order.slots[0].products);

  //       // You can also update the top-level `products` if you want
  //       if (order?.products?.length) {
  //         order.products = order.products.map((product) => {
  //           const stock = filtered.find(
  //             (item) => item.productId === product.productId
  //           );

  //           // Update the top-level product with available stock
  //           return {
  //             ...product,
  //             availableStock: stock ? stock.availableStock : 0,
  //           };
  //         });
  //       }

  //       console.log("Updated order with available stock: ", order);
  //     }

  //     // // Directly inject available stock into each product in the order
  //     // if (order?.products?.length && filtered?.length) {
  //     //   order.products = order.products.map((product) => {
  //     //     const stock = filtered.find((item) => item.productId === product.productId);
  //     //     return {
  //     //       ...product,
  //     //       availableStock: stock ? stock.availableStock : 0, // If stock found, add availableStock, else 0
  //     //     };
  //     //   });
  //     //   console.log("order after fetch: ",  order)

  //     //   // Now you can do anything with the updated order object
  //     //   console.log("Updated order with available stock: ", order);
  //     // }

  //     // // Directly inject available stock into each product in the order
  //     // // if (filtered?.length) {
  //     //   const updatedOrder = { ...order };  // Clone the order object

  //     //   updatedOrder.products = updatedOrder.products.map((product) => {
  //     //     const stock = filtered.find((item) => item.productId === product.productId);
  //     //     return {
  //     //       ...product,
  //     //       availableStock: stock ? stock.availableStock : 0, // If stock found, add availableStock, else 0
  //     //     };
  //     //   });

  //     //   // Use `setOrder` to update the state with the modified order
  //     //   setOrder(updatedOrder);

  //     // console.log("Updated order with available stock: ", updatedOrder);
  //     // }
  //   } catch (error) {
  //     console.error("Error fetching inventory for order:", error);
  //   }
  // };

  const fetchFilteredInventoryForOrder = async () => {
    try {
      setInventoryLoading(true);
      setInventoryError("");

      const slot0 = order?.slots?.[0];
      if (!slot0?.quoteDate || !slot0?.endDate) {
        setInventoryRows([]);
        setInventoryError("Slot dates not found.");
        return;
      }

      const productIds = (slot0?.products || [])
        .map((p) => p?.productId)
        .filter(Boolean);

      if (productIds.length === 0) {
        setInventoryRows([]);
        return;
      }

      const res = await axios.get(`${ApiURL}/inventory/filter`, {
        params: {
          startDate: slot0.quoteDate,
          endDate: slot0.endDate,
          products: productIds.join(","),
        },
      });

      setInventoryRows(res?.data?.stock || []);
      setInventoryRange({ startDate: slot0.quoteDate, endDate: slot0.endDate });
    } catch (err) {
      console.error("fetchFilteredInventoryForOrder error:", err);
      setInventoryRows([]);
      setInventoryError(err?.response?.data?.message || "Failed to fetch inventory");
    } finally {
      setInventoryLoading(false);
    }
  };

  // Fetch Order Details
  const fetchOrderDetails = async () => {
    try {
      const res = await axios.get(`${ApiURL}/order/getOrder/${id}`);
      console.log("fetchorder details: ", res.data.order);
      console.log("fetchorder details products only: ", res.data.order.slots[0].products);
      if (res.status === 200) {
        setOrder(res.data.order); // <-- Make sure your backend returns the order details
        setAdditionalTransportation(res.data.order?.additionalTransportation || 0);
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
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

  // Fetch order details by id
  // **************previous working
  // useEffect(() => {
  //   const fetchOrderDetails = async () => {
  //     setLoading(true);
  //     try {
  //       const response = await axios.get(`${ApiURL}/order/getOrder/${id}`);
  //       console.log("fetchOrderDetails res data: ", response.data);

  //       if (response.data.order) {
  //         // First, set the order data
  //         setOrder(response.data.order);

  //         let mergedProducts = [];

  //         // Process order slots to merge products
  //         if (
  //           Array.isArray(response.data.order.slots) &&
  //           response.data.order.slots.length > 0
  //         ) {
  //           response.data.order.slots.forEach((slot) => {
  //             if (Array.isArray(slot.products)) {
  //               slot.products.forEach((p) => {
  //                 mergedProducts.push({
  //                   ...p,
  //                   unitPrice: p.total / (p.quantity),
  //                 });
  //               });
  //             }
  //           });
  //         }

  //         // If no products in slots, use products directly from the order
  //         if (
  //           mergedProducts.length === 0 &&
  //           Array.isArray(response.data.order.products) &&
  //           response.data.order.products[0]?.productName
  //         ) {
  //           mergedProducts = response.data.order.products.map((p) => ({
  //             ...p,
  //             unitPrice: p.total / (p.quantity),
  //           }));
  //         }

  //         console.log("mergedProducts: ", mergedProducts)
  //         // Fetch available stock for all products and inject it into the mergedProducts array
  //         const stockMap = await fetchAvailableStockForAllProducts(mergedProducts);

  //         // Merge the stock data with products
  //         const mergedWithStock = mergedProducts.map((prod) => ({
  //           ...prod,
  //           availableStock: stockMap[prod.productId || prod._id] ?? prod.availableStock ?? 0,
  //         }));

  //         // Now, set the products after the order is fully set
  //         setProducts(mergedWithStock);
  //       }
  //     } catch (error) {
  //       console.error("Error fetching order details", error);
  //     }
  //     setLoading(false);
  //   };

  //   fetchOrderDetails();
  // }, [id]);

  useEffect(() => {
    /* A reorder has already set the rows itself; rebuilding them here would
       only flash the loading state and refetch stock for no new reason. */
    if (skipProductRebuild.current) {
      skipProductRebuild.current = false;
      return;
    }

    const fetchOrderDetails = async () => {
      setLoading(true);
      try {
        if (order) {
          // First, set the order data
          setOrder(order);

          let mergedProducts = [];

          // Process order slots to merge products
          if (Array.isArray(order.slots) && order.slots.length > 0) {
            order.slots.forEach((slot, slotIndex) => {
              if (Array.isArray(slot.products)) {
                slot.products.forEach((p, productIndex) => {
                  mergedProducts.push({
                    ...p,
                    /* Where this row sits in the stored order, so dragging
                       it can be written back to the right place. */
                    _slotIndex: slotIndex,
                    _productIndex: productIndex,
                    unitPrice: p.total / p.quantity,
                  });
                });
              }
            });
          }

          // If no products in slots, use products directly from the order
          if (
            mergedProducts.length === 0 &&
            Array.isArray(order.products) &&
            order.products[0]?.productName
          ) {
            /* Older orders keep their products at the top level instead of on
               a slot; a null slot index addresses that array. */
            mergedProducts = order.products.map((p, productIndex) => ({
              ...p,
              _slotIndex: null,
              _productIndex: productIndex,
              unitPrice: p.total / p.quantity,
            }));
          }

          console.log("mergedProducts: ", mergedProducts);
          // Fetch available stock for all products and inject it into the mergedProducts array
          const stockMap = await fetchAvailableStockForAllProducts(
            mergedProducts
          );

          // Merge the stock data with products
          const mergedWithStock = mergedProducts.map((prod) => ({
            ...prod,
            availableStock:
              stockMap[prod.productId || prod._id] ?? prod.availableStock ?? 0,
          }));

          // Now, set the products after the order is fully set
          setProducts(mergedWithStock);
        }
      } catch (error) {
        console.error("Error fetching order details", error);
      }
      setLoading(false);
    };

    fetchOrderDetails();
  }, [order]);

  // useEffect(() => {
  //   console.log({products})
  // }, [products])

  // useEffect(() => {
  //   fetchAllProducts();
  // }, []);
  // Calculate grand total based on products
  // const grandTotal = products.reduce((sum, p) => sum + Number(p.total || 0), 0);

  // Add Product Modal logic
  const addedProductIds = products.map((p) => String(p.productId || p._id));
  const availableToAdd = allProducts.filter(
    (p) => !addedProductIds.includes(String(p._id))
  );

  // Resolve a display name for a stored product, falling back to the product
  // master when the stored name is missing or was saved as "Unnamed Product".
  const resolveProductName = (prod) => {
    const stored = prod?.productName;
    if (stored && stored.trim() && stored !== "Unnamed Product") return stored;
    const fromMaster = allProducts.find(
      (p) => String(p._id) === String(prod?.productId || prod?._id)
    );
    return (
      fromMaster?.ProductName ||
      fromMaster?.productName ||
      fromMaster?.name ||
      stored ||
      "—"
    );
  };

  const handleShowAdd = () => {
    setShowAdd(true);
    setAddProductId("");
    setAddQty(1);
    setSelectedAddProduct(null);
  };

  const handleCloseAdd = () => {
    setShowAdd(false);
    setAddProductId("");
    setAddQty(1);
    setSelectedAddProduct(null);
  };

  const handleProductSelect = async (selected) => {
    if (selected) {
      const productId = selected.value;
      setAddProductId(productId);
      setAddQty(1);

      const productObj = allProducts.find(
        (p) => String(p._id) === String(productId)
      );

      try {
        console.log("order quotedate: ", order.slots[0].quoteDate);
        console.log("order enddate: ", order.slots[0].endDate);
        const res = await axios.post(
          `${ApiURL}/inventory/product/filter/${productId}`,
          {},
          {
            params: {
              startDate: order.slots[0].quoteDate,
              endDate: order.slots[0].endDate,
              productId,
            },
          }
        );

        console.log("inventory/product/filter res.data: ", res.data);

        if (res.data?.availableStock) {
          console.log("res.data?.avaiableStock");
          setSelectedAddProduct({
            ...productObj,
            availableStock: res.data.availableStock,
          });
        } else {
          setSelectedAddProduct(null);
        }
      } catch (error) {
        console.error("Error fetching product:", error);
        setSelectedAddProduct(null);
      }
    } else {
      // Handle clearing
      setAddProductId("");
      setSelectedAddProduct(null);
      setAddQty(0);
    }
  };

  const handleAddProduct = async () => {
    if (!selectedAddProduct || !addQty) return;
    // console.log("selectedAddProduct: ", selectedAddProduct)
    // const productSlot = productDates[selectedAddProduct._id]?.productSlot || order.slots[0].quoteTime;

    // Prepare new product object
    const newProduct = {
      productId: selectedAddProduct._id,
      productName: selectedAddProduct.ProductName,
      quantity: addQty,
      unitPrice: Number(selectedAddProduct.ProductPrice),
      total: addQty * Number(selectedAddProduct.ProductPrice),
      ProductIcon: selectedAddProduct.ProductIcon,
      availableStock: selectedAddProduct.availableStock,
    };

    const requestData = {
      productId: selectedAddProduct._id, // ID of the selected product to update
      productName: selectedAddProduct.ProductName,
      unitPrice: Number(selectedAddProduct.ProductPrice),
      quantity: addQty, // Updated quantity for the product
      quoteDate: order.slots[0].quoteDate, // Start date from the first slot
      endDate: order.slots[0].endDate, // End date from the first slot
      isNewProduct: true, // Flag to mark it as a new product addition
      productQuoteDate: order.slots[0].quoteDate,
      productEndDate: order.slots[0].endDate,
      productSlot: "Slot 1: 7:00 AM to 11:00 PM",
    };

    // Log the request data to console
    console.log("Request Data to be sent:", requestData);
    setAddProductLoading(true)

    try {
      // Send the updated quantity to the backend for processing
      const response = await axios.put(
        `${ApiURL}/order/addNewProductToOrderById/${order._id}`,
        {
          productId: selectedAddProduct._id,
          productName: selectedAddProduct.ProductName,
          unitPrice: Number(selectedAddProduct.ProductPrice),
          quantity: addQty, // The new quantity
          quoteDate: order.slots[0].quoteDate, // Start date of the slot
          endDate: order.slots[0].endDate, // End date of the slot
          isNewProduct: true,
          productQuoteDate: order.slots[0].quoteDate,
          productEndDate: order.slots[0].endDate,
          productSlot: "Slot 1: 7:00 AM to 11:00 PM",
        }
      );
      if (response.status === 200) {
        console.log(`response is 200. added successfully`);
        fetchOrderDetails();
        // setProducts((prev) => [...prev, newProduct]);
      }
    } catch (error) {
      console.error("Error setting up the request:", error.message);
      toast.error("An unexpected error occurred. Please try again.");
    } finally {
      setShowAdd(false);
      setAddProductLoading(false)
    }
  };



  // Edit product logic
  const handleEdit = (idx, qty) => {
    setEditIdx(idx);
    setEditQty(qty);
  };

  const handleEditSave = async (idx) => {
    // Ensure the quantity is valid based on the available stock
    const availableStock = products[idx].availableStock;
    const currentQuantity = products[idx].quantity;
    console.log("order: ", order);
    console.log("availableStock: ", availableStock);
    console.log("currentQuantity: ", currentQuantity);
    console.log("editQty: ", editQty);

    if (editQty < 1 || editQty > (availableStock + currentQuantity || 1)) {
      toast.error("Quantity must be between 1 and available stock!!!");
      return;
    }

    const productObj = allProducts.find(
      (p) => String(p._id) === String(order.slots[0].products[idx].productId)
    );

    // console.log(`productObj edited: `, productObj);
    // console.log("productDates.productSlot: ", productDates.productSlot);

    try {
      // Send the updated quantity to the backend for processing
      // console.log("productDates: ", productDates);
      // Sample logic to create the response object
      const productId = order.slots[0].products[idx].productId; // The product ID being updated
      // const editQty = 5; // New quantity value (for example)
      // const editQty = order.slots[0].products[idx].; // New quantity value (for example)
      const productSlot =
        productDates[order.slots[0].products[idx].productId]?.productSlot ||
        order.slots[0].products[idx].productSlot;
      const productQuoteDate = formatDateToDDMMYYYY(
        productDates[order.slots[0].products[idx].productId]
          ?.productQuoteDate || order.slots[0].quoteDate
      );
      const productEndDate = formatDateToDDMMYYYY(
        productDates[order.slots[0].products[idx].productId]?.productEndDate ||
        order.slots[0].endDate
      );

      const responseObj = {
        productId, // The ID of the product being updated
        quantity: editQty, // The new quantity
        quoteDate: order.slots[0].quoteDate, // Start date of the slot
        endDate: order.slots[0].endDate, // End date of the slot
        productSlot, // Slot information
        productQuoteDate, // Quote date for the product
        productEndDate, // End date for the product
      };

      console.log("Generated response object:", responseObj);

      const response = await axios.put(
        `${ApiURL}/order/updateExistingOrderById/${order._id}`,
        {
          productId: order.slots[0].products[idx].productId, // The ID of the product being updated
          // unitPrice: productObj.ProductPrice,
          quantity: editQty, // The new quantity
          quoteDate: order.slots[0].quoteDate, // Start date of the slot
          endDate: order.slots[0].endDate, // End date of the slot
          productQuoteDate: productQuoteDate || order.slots[0].products[idx]?.productQuoteDate || order.slots[0].quoteDate,
          productEndDate: productEndDate || order.slots[0].products[idx]?.productEndDate || order.slots[0].endDate,
          productSlot, // Slot information
        }
      );

      if (response.status === 200) {
        // const updatedAvailableStock = response.data.availableStock; // Get the latest available stock
        // order.slots[0].products[idx].availableStock=
        fetchOrderDetails();

        // Update the products state with the new quantity and total
        setProducts((prev) =>
          prev.map((prod, i) =>
            i === idx
              ? {
                ...prod,
                quantity: editQty, // Set the updated quantity
                total: editQty * prod.unitPrice, // Recalculate the total based on the new quantity
              }
              : prod
          )
        );

        toast.success("Quantity updated successfully!");
      } else {
        // If the response is not successful, show an error
        toast.error("Failed to update order. Please try again.");
      }
    } catch (error) {
      // Handle any errors during the Axios request
      console.error("Error updating order:", error);
      toast.error(error?.response?.data?.message || "An error occurred while updating the order.");
    }

    // Reset the editing state after successful update
    setEditIdx(null);
    setEditQty(1);
  };

  // // Delete product logic
  // const handleDelete = (idx) => {
  //   if (!window.confirm("Delete this product?")) return;
  //   setProducts((prev) => prev.filter((_, i) => i !== idx));
  // };

  const handleDelete = async (idx) => {
    const product = order.slots[0].products[idx]; // Get the product to delete
    const productId = product.productId;
    const quantity = product.quantity;
    const quoteDate = order.slots[0].quoteDate;
    const endDate = order.slots[0].endDate;

    // Ask for confirmation before deleting
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this product?"
    );
    if (!confirmDelete) return; // If user cancels, do nothing

    try {
      // Send the delete request to the backend
      const response = await axios.delete(
        `${ApiURL}/order/deleteProductInOrderById/${order._id}`,
        {
          data: {
            productId, // Product ID to delete
            quantity, // Quantity of the product being removed
            quoteDate, // Start date of the slot
            endDate, // End date of the slot
          },
        }
      );

      if (response.status === 200) {
        // Successfully deleted, fetch the updated order details from the backend
        fetchOrderDetails();

        toast.success("Product deleted successfully!");
      } else {
        // If the response is not successful, show an error
        toast.error("Failed to delete product. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting product:", error);
      toast.error("An error occurred while deleting the product.");
    }
  };

  // Refurbishment modal handlers
  const handleAddRefProduct = () => {
    if (!refProduct || !refQty || !refPrice) return;
    console.log("refProduct :", refProduct);
    console.log("refQTy :", refQty);
    console.log("refPrice :", refPrice);
    setAddedRefProducts((prev) => [
      ...prev,
      {
        productName: refProduct,
        quantity: Number(refQty),
        price: refPrice,
        damage: refDamage,
      },
    ]);
    setRefProduct("");
    setRefQty("");
    setRefPrice("");
    setRefDamage("");
  };

  const handleCloseRefModal = () => {
    setShowRefModal(false);
    setRefProduct("");
    setRefQty("");
    setRefPrice("");
    setRefDamage("");
    setAddedRefProducts([]);
    setShippingAddress("");
    setFloorManager("");
  };

  const fetchAvailableStockForAllProducts = async (products) => {
    const productIds = Array.from(
      new Set(products?.map((prod) => prod.productId || prod._id))
    );
    if (productIds.length === 0) return {};

    // console.log("order.slots.products: ", order.slots[0].products);
    // console.log("startDate: ", order?.slots[0].quoteDate);
    // console.log("endDate: ", order?.slots[0].endDate);

    try {
      const response = await axios.get(`${ApiURL}/inventory/filter`, {
        params: {
          products: productIds.join(","),
          startDate: order?.slots[0].quoteDate,
          endDate: order?.slots[0].endDate,
        },
      });
      // Assume response.data.stock is [{ productId, availableStock }]
      const stockMap = {};
      (response.data.stock || []).forEach((item) => {
        stockMap[item.productId] = item.availableStock;
      });
      console.log("stockmap: ", stockMap);
      return stockMap;
    } catch (error) {
      console.error("Error fetching available stock for all products:", error);
      return {};
    }
  };

  const getRefurbishmentByOrderId = async () => {
    try {
      const response = await fetch(`${ApiURL}/refurbishment/${id}`);
      // console.log(response, "response");
      const data = await response.json();
      setRefurbishmentdata(data);
    } catch (error) {
      console.error("Error fetching refurbishment:", error);
    }
  };

  useEffect(() => {
    if (order?.slots) {
      const daysObj = {};
      order.slots.forEach((slot) => {
        slot.products.forEach((item) => {
          const quoteDate = item.productQuoteDate;
          const endDate = item.productEndDate;
          if (quoteDate && endDate) {
            const start = parseDate(quoteDate);
            const end = parseDate(endDate);
            const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
            daysObj[item.productId] = days >= 1 ? days : 1;
          }
        });
      });
      setProductDays(daysObj);
    }
  }, [order]); // Re-run the effect whenever order changes

  const calculateGrandTotal = (order) => {
    // const productTotal = (order?.slots[0]?.products || []).reduce((sum, item) => {
    //   // console.log("item: ", item);
    //   const days = productDays[item.productId] || 1; // Get days for each product
    //   return sum + (item.total || 0); // Multiply total by days for each product
    // }, 0);

    products.forEach((prod, idx) => {
      console.log(`calculateGrandTotal prods: `, products);

      if (idx === 0) console.log("prod order:", prod);
      let days = 1;
      const quoteDate = prod.productQuoteDate || slot.quoteDate;
      const endDate = prod.productEndDate || slot.endDate;

      if (quoteDate && endDate) {
        const start =
          quoteDate instanceof Date
            ? quoteDate
            : parseDate(quoteDate);
        const end =
          endDate instanceof Date ? endDate : parseDate(endDate);
        days =
          Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (isNaN(days) || days < 1) days = 1;
      }

      const price = prod.productPrice || 0;
      prod.days = days;
      prod.productTotal = price * days * prod.quantity;
      console.log(`${prod.productName} productTotal: ${prod.productTotal}`)

      if (idx === 0) console.log("date difference fr prod.prodname: ", prod.productName, days);
    })

    const allProductsTotal = products.reduce((sum, prod) => sum + (prod.productTotal || 0), 0)

    // console.log("order.slots.prods: ", order.slots[0].products)
    // console.log("productTotal: ", productTotal)

    const labour = order.labourecharge || 0;
    const transport = order.transportcharge || 0;
    const discountPercent = order.discount || 0;
    const refurbishmentAmount = order.refurbishmentAmount || 0;
    const gstPercent = order.GST || 0;
    const additionalTransportation = order.additionalTransportation || 0;
    // const adjustments = order.adjustments || 0;

    // const subtotal = productTotal + labour + transport - adjustments;
    const discountAmount = (allProductsTotal * discountPercent) / 100;
    const totalBeforeCharges = allProductsTotal - discountAmount;
    const totalAfterCharges = totalBeforeCharges + labour + transport + refurbishmentAmount + additionalTransportation;
    const gstAmount = ((totalAfterCharges) * gstPercent) / 100;
    const grandTotal = Math.round(totalAfterCharges + gstAmount);



    // return Math.round(totalAfterCharges + gstAmount);
    return {
      grandTotal,
      discountAmount,
      totalBeforeCharges,
      totalAfterCharges,
      gstAmount,
      allProductsTotal,
    };

  };

  const {
    grandTotal,
    discountAmount,
    totalBeforeCharges,
    totalAfterCharges,
    gstAmount,
    allProductsTotal,
  } = order ? calculateGrandTotal(order) : {};


  useEffect(() => {
    // const paid = order?.payments.reduce((acc, curr) => acc + curr?.advancedAmount, 0)
    const paid = (order?.payments || []).reduce((acc, curr) => acc + curr?.advancedAmount, 0);
    setAmountPaid(paid)

    if (order?.roundOff !== 0) {
      console.log(`order?.roundOff === 0: `, order?.roundOff);
      const pending = grandTotal - order?.roundOff - paid
      setAmountPending(pending)
    } else {
      console.log(`order?.grandTotal === 0: `, grandTotal);
      const pending = grandTotal - paid
      setAmountPending(pending)
    }
  }, [order, grandTotal])

  useEffect(() => {
    console.log("useeffect");
    fetchOrderDetails();
    fetchAllProducts();
  }, []);

  useEffect(() => {
    fetchAvailableStockForAllProducts();
  }, [products]);

  useEffect(() => {
    if (order) {
      fetchFilteredInventoryForOrder();
    }
  }, [order]);

  useEffect(() => {
    getRefurbishmentByOrderId();
  }, [id]);

  useEffect(() => {
    if (order) {
      setRoundOff(order.roundOff || 0);
    }
  }, [order]);

  const navigateToDetails = (_id) => {
    // Navigate to the next page and pass the `_id` in state
    navigate("/invoice", { state: { id: _id } });
  };

  const handleDateChange = (productId, dateType, date, productData) => {
    console.log({ productId, dateType, date, productData });
    // Update the productDates state with the new date and slot value
    setProductDates((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [dateType]: date,
        productData,
      },
    }));
  };

  // console.log("productDates: ", productDates);

  const handleCancelOrder = async () => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    try {
      const res = await axios.post(`${ApiURL}/order/cancel-slot`, {
        orderId: order._id,
      });
      if (res.status === 200) {
        setOrder(res.data.order); // <-- Make sure your backend returns the order details
      }
    } catch (error) {
      console.error("Error fetching order details:", error);
    }
  };

  const handleDownloadPDF = async () => {
    // Navigate to dedicated Order Sheet view with prepared data
    if (!order) return;
    const derivedItems = (order?.slots?.[0]?.products || []).map((p) => {
      // derive days from per-product dates
      let days = 1;
      const start = parseDate(p.productQuoteDate);
      const end = parseDate(p.productEndDate);
      if (start && end) {
        const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        days = isNaN(diff) || diff < 1 ? 1 : diff;
      }
      return {
        productId: p.productId,
        productName: p.productName,
        productSlot: p.productSlot || order?.slots?.[0]?.quoteTime,
        image: p.ProductIcon,
        // pricePerUnit: Number((p.total || 0) / (p.quantity || 1)) || 0,
        quantity: p.quantity,
        days,
        // amount: Number((p.total || 0) / (p.quantity || 1)) || 0,    
      };
    });
    navigate(`/order-sheet/${order._id}`, { state: { order, items: derivedItems, productDates } });
  };

  const handlePaymentInputChange = async (e) => {
    // const numericValue = parseFloat(value) || 0;
    // const maxAmount = parseFloat(quotation?.finalTotal) || 0;
    // const finalValue = Math.min(numericValue, maxAmount);

    // setPaymentData((prev) => ({ ...prev, amount: e.target.value }))

    console.log(`paymentData: `, paymentData);
    const { name, value } = e.target;

    if (name === 'amount') {
      console.log(`changing amount: `, paymentData.amount);
      const numericValue = parseFloat(value) || 0;
      const maxAmount = parseFloat(amountPending) || 0;
      const finalValue = Math.min(numericValue, maxAmount);
      console.log(`grandTotal: `, grandTotal);
      console.log(`numericValue: `, numericValue);
      console.log(`finalValue: `, finalValue);
      setPaymentData((prev) => ({ ...prev, amount: finalValue.toString() }));
    } else {
      setPaymentData((prev) => ({ ...prev, [name]: value }));
    }
  }

  const handleAddPayment = async () => {

    // if (!paymentData.amount || paymentData.amount === '' || paymentData.amount === '0' || paymentData.amount === 0) {
    //   console.log(`typeof payment.amount `, typeof paymentData.amount);
    //   toast.error("Amount cannot be empty or zero")
    //   return
    // } else if (!paymentData.mode) {
    //   toast.error("Please select a payment mode")
    //   return
    // }
    if (!paymentData.amount || paymentData.amount === '' || paymentData.amount === '0' || paymentData.amount === 0) {
      console.log(`typeof payment.amount `, typeof paymentData.amount);
      toast.error("Amount cannot be empty or zero")
      return
    } else if (paymentData.amount > order?.GrandTotal) {
      toast.error(`Max allowed to be paid is: ${order?.GrandTotal}`)
      return
    }

    if (paymentData.status === 'Online' && (!paymentData.mode)) {
      toast.error("Please enter a payment mode")
      return
    }

    // toast.success(`executed total: Rs. ${order?.GrandTotal}`)
    // return

    setAddPaymentLoading(true)

    try {
      // First, make the API call to fetch payment data
      const orderDetails = {
        quotationId: order?.quoteId,
        totalAmount: order?.GrandTotal,
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
        toast.success("payment added successfully!");
        window.location.reload();
        // setGetPayment(response.data);
      }
      console.log("payment details: ", orderDetails);
    } catch (error) {
      console.error("Error fetching payment data:", error);
      // Optionally handle any errors that occur during the API request
    } finally {
      handleCloseGenerateModal();
      setAddPaymentLoading(false);
    }
  };

  const handleGoToOrderInvoice = () => {
    try {
      if (!order?._id) return;
      navigate(`/order-pdf/${order._id}`);
    } catch (e) {
      console.error(e);
    }
  };


  const handleRoundOffChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    setRoundOff(value);
  };

  const handleSaveRoundOff = async () => {
    try {
      const response = await axios.put(`${ApiURL}/order/updateOrderFields`, {
        orderId: order._id,
        roundOff,
      });

      if (response.status === 200) {
        toast.success("RoundOff updated successfully");
        setIsEditingRoundOff(false);
        // Update order state with new roundOff value
        setOrder(prev => ({
          ...prev,
          roundOff
        }));
      } else {
        toast.error("Failed to update roundOff");
      }
    } catch (error) {
      console.error("Error updating roundOff:", error);
      toast.error("Error occurred while updating roundOff");
    }
  };

  const handleCancelRoundOff = () => {
    setRoundOff(order.roundOff || 0);
    setIsEditingRoundOff(false);
  };

  const handleTransportChange = (e) => {
    const value = parseInt(e.target.value) || 0;
    setAdditionalTransportation(value);
  };

  const handleSaveManpower = async () => {
    try {
      setIsSavingManpower(true);

      const res = await axios.put(`${ApiURL}/order/updateOrderFields`, {
        orderId: order._id,
        labourecharge: Number(manpowerValue) || 0, // manpower field in schema
      });

      setOrder(res.data.updatedOrder);
      setIsEditingManpower(false);
    } catch (err) {
      console.error("Error updating manpower:", err);
    } finally {
      setIsSavingManpower(false);
    }
  };

  const handleSaveTransport = async () => {
    try {
      setIsSavingTransport(true);

      const res = await axios.put(`${ApiURL}/order/updateOrderFields`, {
        orderId: order._id,
        additionalTransportation: Number(additionalTransportation) || 0,
      });

      toast.success("Transportation charge updated successfully!");
      setIsEditingTransport(false);
      setOrder(res.data.updatedOrder);
    } catch (error) {
      console.error("Error updating transport:", error);
      toast.error("Error occurred while updating transportation charge");
    } finally {
      setIsSavingTransport(false);
    }
  };
  const handleCancelTransportEdit = () => {
    setAdditionalTransportation(order.additionalTransportation || 0);
    setIsEditingTransport(false);
  };



  if (loading) {
    return (
      <Container className="my-5 text-center">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (!order) {
    return <div>Loading...</div>;
  }

  const deliveryDismantleSlots = [
    "Select Slots",
    "Slot 1: 7:00 AM to 11:00 PM",
    "Slot 2: 11:00 PM to 11:45 PM",
    "Slot 3: 7:30 AM to 4:00 PM",
    "Slot 4: 2:45 PM to 11:45 PM",
  ];

  return (
    <Container fluid className="px-0 qd od">
      <div ref={pdfRef}>
        {/* ---- Breadcrumb ---- */}
        {!pdfMode && (
          <nav className="qd-crumbs" aria-label="Breadcrumb">
            <Link to="/dashboard" aria-label="Dashboard">
              <FaHome />
            </Link>
            <FaChevronRight />
            <Link to="/orders">Orders</Link>
            <FaChevronRight />
            <span>Details</span>
          </nav>
        )}

        {/* ---- Title row ---- */}
        <div className="qd-head">
          <div className="qd-head__text">
            <div className="qd-head__line">
              <h1 className="qd-head__title">Order Details</h1>
              <span
                className={`eq-pill ${
                  order?.orderStatus === "Confirm" ? "is-quoted" : "is-open"
                }`}
              >
                {order?.orderStatus || "\u2014"}
              </span>
            </div>
            <p className="qd-head__meta">
              {order?.clientName || "Order"}
              {order?.createdAt
                ? "  \u00B7  Placed on " +
                  moment(order.createdAt).format("DD MMM YYYY, hh:mm A")
                : ""}
            </p>
          </div>

          {!pdfMode && (
            <div className="qd-head__actions">
              <Button className="eq-ghost" onClick={handleDownloadPDF}>
                <FaFilePdf /> PDF
              </Button>
              {currentUser?.role === "superAdmin" && (
                <Button
                  className="eq-primary"
                  onClick={handleGoToOrderInvoice}
                  disabled={order && order.orderStatus === "cancelled"}
                >
                  <FaFileInvoiceDollar /> Client PDF
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ---- Client + event window ---- */}
        <div className="qd-top">
          <Card className="qd-client">
            <Card.Body>
              <span className="od-client__avatar">
                {String(order?.clientName || "?")
                  .trim()
                  .charAt(0)
                  .toUpperCase() || "?"}
              </span>
              <div className="qd-client__text">
                <h2 className="qd-client__name">
                  {(order?.clientName || "Unnamed client").toUpperCase()}
                </h2>
                <ul className="qd-client__meta">
                  {order?.clientNo ? (
                    <li>
                      <FaPhoneAlt /> {order.clientNo}
                    </li>
                  ) : null}
                  {order?.executivename ? (
                    <li>
                      <FaUserTie /> {order.executivename}
                    </li>
                  ) : null}
                  {order?.Address ? (
                    <li>
                      <FaMapMarkerAlt /> {order.Address}
                    </li>
                  ) : null}
                </ul>
              </div>
            </Card.Body>
          </Card>

          <Card className="qd-stage od-event">
            <Card.Body>
              <span className="od-pane__title">
                <FaRegCalendarAlt /> Event Window
              </span>
              {order?.slots?.length ? (
                <ul className="od-slots">
                  {order.slots.map((slot, i) => (
                    <li key={i}>
                      <span className="od-slots__dates">
                        {slot.quoteDate || "\u2014"}
                        {slot.endDate && slot.endDate !== slot.quoteDate
                          ? " \u2192 " + slot.endDate
                          : ""}
                      </span>
                      {slot.quoteTime ? (
                        <span className="od-slots__time">
                          <FaClock /> {slot.quoteTime}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="qc-empty">No slot dates on this order.</p>
              )}
            </Card.Body>
          </Card>
        </div>

        <Card className="shadow-sm mb-4 qd-card">
          <Card.Body>
            <div className="od-split">
              <div className="od-pane">
                <span className="od-pane__title">
                  <FaUserTie /> Order Information
                </span>                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Client Id:</span>
                  <span style={valueStyle}>{order.clientId}</span>
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Company Name: </span>
                  <span style={valueStyle}>{order.clientName}</span>
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Phone No: </span>
                  <span style={valueStyle}>{order.clientNo}</span>
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Executive Name: </span>
                  <span style={valueStyle}>{order.executivename}</span>
                </div>
                {/* <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Address: </span>
                  <span style={valueStyle}>{order.placeaddress}</span>
                </div> */}
                {!pdfMode && (
                  <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                    <span style={labelStyle}>Order Status: </span>
                    <span
                      style={{ ...valueStyle, color: order.orderStatus === "Confirm" ? "#1dbf73" : "#E53935", fontWeight: 600 }}
                    >
                      {order.orderStatus}
                    </span>
                  </div>
                )}
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Venue address:</span>
                  <span style={valueStyle}>{order.Address}</span>
                </div>
              </div>

              <div className="od-pane od-pane--cost">
                <span className="od-pane__title">
                  <FaRupeeSign /> Cost Summary
                </span>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Sub total:</span>
                  <span style={valueStyle}>₹ {totalBeforeCharges || 0}</span>
                  {/* <span style={valueStyle}>{order.Address}</span> */}

                </div>
                <div
                  className="mb-1"
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <span style={labelStyle}>Man power:</span>

                  {!isEditingManpower ? (
                    <>
                      <span style={valueStyle}>
                        ₹ {order?.labourecharge ?? 0}
                      </span>

                      <Button
                        variant="link"
                        size="sm"
                        style={{
                          padding: "0",
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                        }}
                        onClick={() => setIsEditingManpower(true)}
                        disabled={order?.orderStatus === "cancelled"}
                      >
                        <FaEdit style={{ fontSize: "14px" }} />
                      </Button>
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Form.Control
                        type="number"
                        step="1"
                        value={manpowerValue}
                        onChange={(e) => setManpowerValue(Number(e.target.value))}
                        style={{ maxWidth: "100px", height: "30px" }}
                        disabled={order?.orderStatus === "cancelled"}
                      />

                      <Button
                        variant="success"
                        size="sm"
                        onClick={handleSaveManpower}
                        disabled={isSavingManpower}
                      >
                        {isSavingManpower ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <FaCheck />
                        )}
                      </Button>

                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          setManpowerValue(order?.labourecharge || 0);
                          setIsEditingManpower(false);
                        }}
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Transport: </span>
                  <span style={valueStyle}>₹ {order.transportcharge}</span>
                </div>
                <div
                  className="mb-1"
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <span style={labelStyle}>Additional Transportation:</span>

                  {!isEditingTransport ? (
                    <>
                      <span style={valueStyle}>
                        ₹ {order.additionalTransportation ?? 0}
                      </span>
                      <Button
                        variant="link"
                        size="sm"
                        style={{
                          padding: "0",
                          height: "20px",
                          display: "flex",
                          alignItems: "center",
                        }}
                        onClick={() => setIsEditingTransport(true)}
                        disabled={order && order.orderStatus === "cancelled"} // ✅ correct placement
                      >
                        <FaEdit style={{ fontSize: "14px", margin: "0" }} />
                      </Button>
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Form.Control
                        type="number"
                        step="1"
                        value={additionalTransportation}
                        onChange={handleTransportChange}
                        style={{ maxWidth: "100px", height: "30px" }}
                        disabled={order && order.orderStatus === "cancelled"} // ✅ also disable input
                      />
                      <Button
                        variant="success"
                        size="sm"
                        onClick={handleSaveTransport}
                        disabled={
                          isSavingTransport || (order && order.orderStatus === "cancelled")
                        } // ✅ disable when cancelled
                      >
                        {isSavingTransport ? (
                          <Spinner animation="border" size="sm" />
                        ) : (
                          <FaCheck />
                        )}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleCancelTransportEdit}
                        disabled={order && order.orderStatus === "cancelled"} // ✅ disable cancel too
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Total:</span>
                  <span style={valueStyle}>₹ {totalAfterCharges || 'N/A'}</span>
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>GSt(18%):</span>
                  <span style={valueStyle}>₹ {gstAmount || 'N/A'}</span>
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>Grand Total: </span>
                  {/* <span style={valueStyle}>₹ {grandTotal}</span> */}
                  <span style={valueStyle}>₹ {order?.GrandTotal || "N/A"}</span>
                </div>
                {/* )} */}



                {/* <div
                  className="mb-1"
                  style={{ display: "flex", gap: "10px", alignItems: "center", lineHeight: "1.2" }}
                >
                  <span style={labelStyle}>Roundoff:</span>
                  {!isEditingRoundOff ? (
                    <>
                      <span style={valueStyle}>₹ {roundOff}</span>
                      <Button
                        variant="link"
                        size="sm"
                        style={{ padding: "0", height: "20px", display: "flex", alignItems: "center" }}
                        onClick={() => setIsEditingRoundOff(true)}
                      >
                        <FaEdit style={{ fontSize: "14px", margin: "0" }} />
                      </Button>
                    </>
                  ) : (
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Form.Control
                        type="number"
                        step="0.01"
                        value={roundOff}
                        onChange={handleRoundOffChange}
                        style={{ maxWidth: "100px", height: "30px" }}
                      />
                      <Button
                        variant="success"
                        size="sm"
                        onClick={handleSaveRoundOff}
                      >
                        <FaCheck className="fa-1x" />
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleCancelRoundOff}
                      >
                        <FaTimes />
                      </Button>
                    </div>
                  )}
                </div> */}
                {/* <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>paid so far:</span>
                  <span style={valueStyle}>₹ {amountPaid}</span>
                </div>
                <div className="mb-1" style={{ display: "flex", gap: "10px" }}>
                  <span style={labelStyle}>remaining pay:</span>
                  <span style={valueStyle}>₹ {amountPending}</span>
                </div> */}
              </div>
            </div>
            <div className="od-sec">
              <span className="od-sec__title">
                <FaBoxOpen /> Products
              </span>
              {!pdfMode && (
                <div>
                  <Button
                    className="eq-primary"
                    onClick={handleShowAdd}
                    disabled={order && order.orderStatus === "cancelled"}
                  >
                    <FaPlus />{" "}
                    {addProductLoading ? "Adding Product..." : "Add Product"}
                  </Button>
                  {/* <Button
                    variant="outline-success"
                    size="sm"
                    style={{ fontSize: 12, padding: "2px 14px" }}
                    onClick={() => setShowRefModal(true)}
                    disabled={order && order.orderStatus === "cancelled"}
                  >
                    Add Refurbishment
                  </Button> */}
                </div>
              )}
            </div>


            {/* products table */}
            {/* Dragging is not discoverable on its own, so it is named. */}
            {!pdfMode && (
              <div className="qd-reorder-hint">
                <FaGripVertical />
                <span>
                  {savingOrder
                    ? "Saving the new order..."
                    : "Drag a row by its handle to change the product order"}
                </span>
              </div>
            )}
            <div className="table-responsive mb-3 qd-products">
              <Table
                bordered
                size="sm"
                style={{ background: "#fff", fontSize: 13, borderRadius: 8 }}
              >
                <thead>
                  <tr style={{ background: "#f3f6fa" }}>
                    {/* The PDF has no reordering, so no handle column. */}
                    {!pdfMode && <th style={{ width: 36 }} aria-label="Reorder" />}
                    <th>Slot Date</th>
                    <th>Product Name</th>
                    <th>Product img</th>
                    {!pdfMode && <th>Remaining Stock</th>}
                    <th>Selected Qty</th>
                    <th>Days</th>
                    {/* you have t comment these 2 */}
                    {/* <th>Price/Qty</th> */}
                    {/* <th>Total</th> */}
                    {!pdfMode && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((prod, idx) => {
                    // const slotDate =
                    //   order.slots && order.slots.length > 0
                    //     ? `${order.slots[0].quoteDate} to ${order.slots[0].endDate}`
                    //     : "No Slot";

                    // see if grandottal calc works here too
                    // if (idx === 0) console.log("prod order:", prod);
                    // let days = 1;
                    // const quoteDate = prod.productQuoteDate || slot.quoteDate;
                    // const endDate = prod.productEndDate || slot.endDate;

                    // if (quoteDate && endDate) {
                    //   const start =
                    //     quoteDate instanceof Date
                    //       ? quoteDate
                    //       : parseDate(quoteDate);
                    //   const end =
                    //     endDate instanceof Date ? endDate : parseDate(endDate);
                    //   days =
                    //     Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
                    //   if (isNaN(days) || days < 1) days = 1;
                    // }

                    // const price = prod.ProductPrice || 0;
                    // prod.days = days;
                    // prod.productTotal = price * days * prod.quantity;
                    // console.log(`${prod.productName} productTotal: ${prod.productTotal}`)

                    // if (idx === 0) console.log("date difference fr prod.prodname: ", prod.productName, days);

                    return (
                      <tr
                        key={idx}
                        draggable={!pdfMode && !savingOrder && editIdx === null}
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
                          (dragOverIdx === idx &&
                          dragFrom !== null &&
                          dragFrom !== idx
                            ? "qd-row--over"
                            : "")
                        }
                      >
                        {!pdfMode && (
                          <td className="qd-handle-cell" title="Drag to reorder">
                            <span className="qd-handle" aria-hidden="true">
                              <FaGripVertical />
                            </span>
                          </td>
                        )}
                        <td style={{ verticalAlign: "middle", width: "25%" }}>
                          {editIdx === idx ? (
                            <>
                              <div className="d-flex">
                                <DatePicker
                                  selected={
                                    productDates[prod.productId]
                                      ?.productQuoteDate ||
                                    parseDate(prod.productQuoteDate)
                                  }
                                  onChange={(date) =>
                                    handleDateChange(
                                      prod.productId,
                                      "productQuoteDate",
                                      date,
                                      prod.productQuoteDate ||
                                      order?.slots[0]?.quoteTime
                                    )
                                  }
                                  dateFormat="dd/MM/yyyy"
                                  className="form-control"
                                  minDate={parseDate(order.slots[0].quoteDate)} // Ensure date is within range
                                  maxDate={parseDate(order.slots[0].endDate)} // Ensure date is within range
                                  disabled={
                                    order && order.orderStatus === "cancelled"
                                  }
                                />
                                {console.log("end date: ", productDates[prod.productId])}
                                <DatePicker
                                  selected={
                                    productDates[prod.productId]
                                      ?.productEndDate ||
                                    parseDate(prod.productEndDate)
                                  }
                                  onChange={(date) =>
                                    handleDateChange(
                                      prod.productId,
                                      "productEndDate",
                                      date,
                                      prod.productEndDate ||
                                      order?.slots[0]?.endTime
                                    )
                                  }
                                  dateFormat="dd/MM/yyyy"
                                  className="form-control"
                                  minDate={parseDate(order.slots[0].quoteDate)}
                                  maxDate={parseDate(order.slots[0].endDate)}
                                  disabled={
                                    order && order.orderStatus === "cancelled"
                                  }
                                />
                              </div>
                              <Form.Select
                                className="m-0 mt-1"
                                value={
                                  productDates[prod.productId]?.productSlot ||
                                  prod.productSlot
                                }
                                onChange={(e) =>
                                  handleDateChange(
                                    prod.productId,
                                    "productSlot",
                                    e.target.value,
                                    e.target.value
                                  )
                                }
                                disabled={
                                  order && order.orderStatus === "cancelled"
                                }
                              >
                                {deliveryDismantleSlots.map((s) => (
                                  <option key={s} value={s}>
                                    {s}
                                  </option>
                                ))}
                              </Form.Select>
                            </>
                          ) : (
                            <>
                              {/* If not in edit mode, just show the date and slot */}
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "500",
                                  color: "#444",
                                  marginRight: "10px",
                                }}
                              >
                                {/* Show productQuoteDate */}
                                {/* {productDates[prod.productId]?.productQuoteDate
                                ? formatDateToDDMMYYYY(
                                    productDates[prod.productId]
                                      ?.productQuoteDate
                                  )
                                : order?.slots[0]?.quoteDate ||
                                  "No date available"}
                              {"    "} */}

                                {prod.productQuoteDate}
                                <span style={{ paddingLeft: "10px" }}>To</span>
                              </span>
                              <span
                                style={{
                                  fontSize: "14px",
                                  fontWeight: "500",
                                  color: "#444",
                                }}
                              >
                                {/* Show productEndDate */}
                                {/* {productDates[prod.productId]?.productEndDate
                                ? formatDateToDDMMYYYY(
                                    productDates[prod.productId]?.productEndDate
                                  )
                                : order?.slots[0]?.endDate ||
                                  "No date available"} */}

                                {prod.productEndDate}
                              </span>
                              {/* Show productSlot */}
                              <div>
                                {productDates[prod.productId]?.productSlot ||
                                  prod.productSlot}
                              </div>
                            </>
                          )}
                        </td>

                        <td>{resolveProductName(prod)}</td>
                        <td>
                          <img
                            src={`${prod.ProductIcon}`}
                            alt={resolveProductName(prod)}
                            style={{ width: "50px", height: "50px" }}
                            crossOrigin="anonymous"
                          />
                        </td>
                        {!pdfMode && (
                          <td style={{ color: "#1a73e8", fontWeight: 500 }}>
                            {prod.availableStock}
                          </td>
                        )}
                        <td>
                          {editIdx === idx ? (
                            <Form.Control
                              type="number"
                              min={1}
                              max={prod.availableStock + prod.quantity}
                              value={editQty}
                              onChange={(e) => {
                                let val = e.target.value.replace(/^0+/, "");
                                setEditQty(
                                  val === ""
                                    ? ""
                                    : Math.max(
                                      1,
                                      Math.min(
                                        Number(val),
                                        prod.availableStock + prod.quantity
                                      )
                                    )
                                );
                              }}
                              style={{
                                width: 70,
                                padding: "2px 6px",
                                fontSize: 13,
                              }}
                              autoFocus
                            />
                          ) : (
                            prod.quantity
                          )}
                        </td>
                        <td>{prod.days}</td>
                        {/* you have t comment these 2 */}
                        {/* <td>₹{(prod.productPrice)}</td> */}
                        {/* <td>₹{prod.productTotal}</td> */}
                        {/* {(idx === 0) && console.log(`prod.total * days: ${prod.total * days} prod.productName: ${prod.productName}prod.total: ${prod.total}`)} */}
                        {!pdfMode && (
                          <td>
                            {editIdx === idx ? (
                              <>
                                <Button
                                  variant="success"
                                  size="sm"
                                  style={{ padding: "2px 6px", marginRight: 4 }}
                                  onClick={() => handleEditSave(idx)}
                                >
                                  <FaCheck />
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  style={{ padding: "2px 6px" }}
                                  onClick={() => setEditIdx(null)}
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
                                  onClick={() => handleEdit(idx, prod.quantity)}
                                  disabled={
                                    order && order.orderStatus === "cancelled"
                                  }
                                >
                                  <FaEdit />
                                </Button>
                                <Button
                                  variant="link"
                                  size="sm"
                                  style={{
                                    color: "#d00",
                                    padding: 0,
                                    marginLeft: 8,
                                  }}
                                  onClick={() => handleDelete(idx)}
                                  disabled={
                                    order && order.orderStatus === "cancelled"
                                  }
                                >
                                  <FaTrashAlt />
                                </Button>
                              </>
                            )}
                          </td>)}
                      </tr>
                    );
                  })}
                  {console.log(`*** products: `, products)}
                  {/* {
                    (
                      <tr>
                        <td colSpan={6} className="text-end">
                          <strong>Products Total:</strong>
                        </td>
                        <td className="text-end">
                          <strong>₹{products.reduce((acc, curr) => acc + curr?.productTotal, 0)}</strong>
                        </td>
                      </tr>
                    )}
                  {
                    (
                      <tr>
                        <td colSpan={6} className="text-end">
                          <strong>Paid Total:</strong>
                        </td>
                        <td className="text-end">
                          <strong>₹{order?.payments.reduce((acc, curr) => acc + curr?.advancedAmount, 0)}</strong>
                        </td>
                      </tr>
                    )} */}
                </tbody>
              </Table>
            </div>


            <>
              {/* ✅ Remarks input (above Pay/Cancel) */}
              <div
                className="mt-3"
                style={{
                  background: "#fff",
                  border: "1px solid #e9ecef",
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div className="od-sec__title od-sec__title--tight">
                  <FaCommentDots /> Remarks
                </div>

                <div className="d-flex flex-wrap gap-2 align-items-start">
                  <Form.Control
                    as="textarea"
                    rows={2}
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Type remarks for this order..."
                    style={{ minWidth: 260, flex: 1, resize: "none" }}
                    disabled={order?.orderStatus === "cancelled" || isSavingRemarks}
                  />

                  <Button
                    className="eq-primary"
                    onClick={handleUpdateRemarks}
                    disabled={order?.orderStatus === "cancelled" || isSavingRemarks}
                    style={{ minWidth: 120 }}
                  >
                    {isSavingRemarks ? (
                      <span className="d-flex align-items-center gap-2">
                        <Spinner size="sm" animation="border" />
                        Updating
                      </span>
                    ) : (
                      "Update"
                    )}
                  </Button>
                </div>
              </div>
            </>




            {!pdfMode && (
              <div className="d-flex flex-wrap gap-2 mt-3">
                {/* <Button
                  variant="primary"
                  size="sm"
                  style={{ fontSize: 13, fontWeight: 600 }}
                  onClick={() => navigate(`/invoice/${id}`, { state: { orderData: order, grandTotal } })}
                  disabled={order && order.orderStatus === "cancelled"}
                >
                  Generate Invoice
                </Button> */}
                {/* <Button
                  variant="info"
                  size="sm"
                  style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}
                  onClick={() => navigate(`/refurbishment-invoice/${id}`)}
                  disabled={order && order.orderStatus === "cancelled"}
                >
                  Refurbishment Invoice
                </Button> */}
                {/* <Button
                  variant="primary"
                  size="sm"
                  style={{ fontSize: 13, fontWeight: 600 }}
                  onClick={handleShowGenerateModal}
                  disabled={order && order.orderStatus === "cancelled"}
                >
                  Pay Amount
                </Button> */}
                <Button
                  variant="danger"
                  size="sm"
                  className="ml-auto od-cancel"
                  onClick={handleCancelOrder}
                  disabled={order && order.orderStatus === "cancelled"}
                >
                  <FaBan /> Cancel Order
                </Button>
              </div>
            )}


          </Card.Body>
        </Card>


        <Card className="shadow-sm mb-4 qd-card qd-inv">
          <Card.Body>
            <div className="od-sec">
              <span className="od-sec__title">
                <FaBoxOpen /> Inventory
              </span>
              <Button
                className="eq-ghost"
                onClick={fetchFilteredInventoryForOrder}
                disabled={inventoryLoading}
              >
                <FaSyncAlt />{" "}
                {inventoryLoading ? "Fetching..." : "Refresh"}
              </Button>
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
                    <th>Product Name</th>
                    <th style={{ width: 200 }}>Product Icon</th>
                    <th>Available Stock</th>
                    <th>Under Quotations</th>
                  </tr>
                </thead>
                <tbody>
                  {inventoryLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center">
                        <Spinner animation="border" size="sm" />
                      </td>
                    </tr>
                  ) : inventoryRows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted">
                        No inventory found.
                      </td>
                    </tr>
                  ) : (
                    inventoryRows.map((item) => {
                      const prod = allProducts.find((p) => String(p._id) === String(item.productId));
                      const icon = prod?.ProductIcon;
                      return (
                        <tr key={item.productId}>
                          <td>{item.productName}</td>
                          <td>
                            {icon ? (
                              <img
                                src={`${icon}`}
                                alt={item.productName}
                                style={{ width: 90, height: 70, objectFit: "contain" }}
                              />
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td style={{ fontWeight: 700 }}>{item.availableStock}</td>
                          <td
                            style={
                              item.availableStock < item.pendingQuotationQty
                                ? { color: "red", fontWeight: 700 }
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

        {/* Add Product Modal */}
        <Modal show={showAdd} onHide={handleCloseAdd} centered>
          <Modal.Header closeButton>
            <Modal.Title>Add Product</Modal.Title>
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
                    addProductId
                      ? availableToAdd
                        .map((p) => ({ value: p._id, label: p.ProductName }))
                        .find(
                          (opt) => String(opt.value) === String(addProductId)
                        )
                      : null
                  }
                  onChange={handleProductSelect}
                  isClearable
                  placeholder="Search product..."
                />
              </Form.Group>
              <Row>
                <Col xs={6}>
                  <Form.Group className="mb-3" controlId="addProductStock">
                    <Form.Label>Available Stock</Form.Label>
                    <Form.Control
                      type="text"
                      value={
                        selectedAddProduct ? selectedAddProduct.availableStock : 0
                      }
                      disabled
                    />
                  </Form.Group>
                </Col>
                <Col xs={6}>
                  <Form.Group className="mb-3" controlId="addProductQty">
                    <Form.Label>Quantity</Form.Label>
                    <Form.Control
                      type="number"
                      min={1}
                      max={selectedAddProduct?.availableStock || 1}
                      value={addQty}
                      disabled={!addProductId}
                      onChange={(e) => {
                        let val = e.target.value.replace(/^0+/, "");
                        let qty = val === "" ? "" : Math.max(1, Number(val));
                        if (
                          selectedAddProduct &&
                          qty > selectedAddProduct.availableStock
                        ) {
                          qty = selectedAddProduct.availableStock;
                        }
                        setAddQty(qty);
                      }}
                    />
                    {selectedAddProduct &&
                      addQty > selectedAddProduct.availableStock && (
                        <div style={{ color: "red", fontSize: 12 }}>
                          Cannot exceed available stock (
                          {selectedAddProduct.availableStock})
                        </div>
                      )}
                  </Form.Group>
                </Col>
                <Col xs={6}>
                  <Form.Group className="mb-3" controlId="addProductPrice">
                    <Form.Label>Price</Form.Label>
                    <Form.Control
                      type="text"
                      value={`₹${selectedAddProduct ? selectedAddProduct.ProductPrice : 0
                        }`}
                      disabled
                    />
                  </Form.Group>
                </Col>
                <Col xs={6}>
                  <Form.Group className="mb-3" controlId="addProductTotal">
                    <Form.Label>Total Price</Form.Label>
                    <Form.Control
                      type="text"
                      value={
                        selectedAddProduct
                          ? `₹${(addQty ? addQty : 1) *
                          selectedAddProduct.ProductPrice
                          }`
                          : "₹0"
                      }
                      disabled
                    />
                  </Form.Group>
                </Col>
                {/* <Col xs={6}>
                <Form.Group className="mb-3" controlId="addProductTotal">
                  <Form.Label>choose slot</Form.Label>
                  <Form.Select
                    className="m-0 mt-1"
                    value={
                      productDates[selectedAddProduct?.productId]?.productSlot ||
                      selectedAddProduct?.productSlot
                    } // Default to initial slot value
                    onChange={(e) =>
                      handleDateChange(
                        selectedAddProduct._id,
                        "productSlot",
                        e.target.value,
                        e.target.value
                      )
                    }
                  >
                    {deliveryDismantleSlots.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col> */}
              </Row>
            </Form>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="primary"
              size="sm"
              disabled={
                !addProductId ||
                !addQty ||
                addQty < 1 ||
                (selectedAddProduct && addQty > selectedAddProduct.availableStock)
              }
              onClick={handleAddProduct}
            >
              Add
            </Button>
          </Modal.Footer>
        </Modal>

      </div>
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

export default OrderDetails;





