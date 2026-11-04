

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Card, Container, Form, Table } from "react-bootstrap";
import { MdVisibility } from "react-icons/md";
import {
  FaClipboardList,
  FaCheckCircle,
  FaTimesCircle,
  FaFileExport,
  FaRegCalendarAlt,
  FaListUl,
} from "react-icons/fa";
import * as XLSX from "xlsx";
import { toast } from "react-hot-toast";
import moment from "moment";
import { useNavigate, useSearchParams } from "react-router-dom";
import Pagination from "../../components/Pagination";
import axios from "axios";
import { ApiURL } from "../../api";
import DatePicker from "react-datepicker";
import RecordCalendar from "../../components/RecordCalendar";
import DayRecordsModal from "../../components/DayRecordsModal";
import "react-datepicker/dist/react-datepicker.css";

const PAGE_SIZE = 10;

/* An order sits on every date in its slots, so one order can show on
   several days of the month. */
const orderDates = (order) =>
  (order?.slots || [])
    .map((slot) => moment(slot?.quoteDate, "DD-MM-YYYY", true))
    .filter((d) => d.isValid())
    .map((d) => d.format("YYYY-MM-DD"));

/* orderStatus is "Confirm" or "cancelled"; nothing else exists on the
   record, so the calendar colours and the legend use exactly those two. */
const isConfirmed = (order) =>
  String(order?.orderStatus || "").toLowerCase() === "confirm";

const isCancelled = (order) =>
  String(order?.orderStatus || "").toLowerCase() === "cancelled";

const amountOf = (order) => Number(order?.GrandTotal ?? order?.grandTotal) || 0;


const toDDMMYYYY = (d) => {
  try {
    if (!d || !(d instanceof Date) || isNaN(d)) return "";
    return moment(d).format("DD-MM-YYYY");
  } catch (e) {
    return "";
  }
};

const parseDDMMYYYYToDate = (str) => {
  try {
    if (!str) return null;
    const m = moment(str, "DD-MM-YYYY", true);
    if (!m.isValid()) return null;
    return m.toDate();
  } catch (e) {
    return null;
  }
};

const Orders = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ✅ Only FILTERS + PAGE stored in URL (NOT view)
  const qParam = searchParams.get("q") || "";
  const fromParam = searchParams.get("from") || "";
  const toParam = searchParams.get("to") || "";
  const pageParam = Number(searchParams.get("page") || "1");

  // ✅ View is always default Calendar on reload
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarVisible, setCalendarVisible] = useState([]);
  const [viewMode, setViewMode] = useState("calendar");
  /* The day whose total was clicked, or null. Holds the day's orders so
     the modal does not refetch what the calendar already has. */
  const [dayBreakdown, setDayBreakdown] = useState(null);

  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState(qParam);
  /* "all" | "confirmed" | "cancelled". Nearly a hundred orders are already
     cancelled, and until now there was no way to separate them out. */
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(parseDDMMYYYYToDate(fromParam));
  const [toDate, setToDate] = useState(parseDDMMYYYYToDate(toParam));
  const [currentPage, setCurrentPage] = useState(
    Number.isFinite(pageParam) ? pageParam : 1
  );

  const setParam = (key, value) => {
    try {
      const next = new URLSearchParams(searchParams);
      if (!value) next.delete(key);
      else next.set(key, value);
      setSearchParams(next);
    } catch (e) {
      console.error(e);
    }
  };

  const setParamsBatch = (obj) => {
    try {
      const next = new URLSearchParams(searchParams);
      Object.entries(obj).forEach(([k, v]) => {
        if (!v) next.delete(k);
        else next.set(k, v);
      });
      setSearchParams(next);
    } catch (e) {
      console.error(e);
    }
  };

  // ✅ Keep filter state synced with URL (browser back/forward)
  useEffect(() => {
    try {
      setSearchQuery(qParam);
      setFromDate(parseDDMMYYYYToDate(fromParam));
      setToDate(parseDDMMYYYYToDate(toParam));
      setCurrentPage(Number.isFinite(pageParam) ? pageParam : 1);
    } catch (e) {
      console.error(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qParam, fromParam, toParam, pageParam]);

  // ✅ Fetch Orders once
  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await axios.get(`${ApiURL}/order/getallorder`);
        if (res.status === 200) {
          const transformed = (res.data.orderData || []).map((order) => {
            const slotsWithQuoteDates = (order.slots || []).map((slot) => ({
              ...slot,
              quoteDate: slot.quoteDate,
            }));

            return {
              ...order,
              companyName: order.clientName,
              executiveName: order.executivename,
              grandTotal: order.GrandTotal,
              bookingDate: order.createdAt,
              slots: slotsWithQuoteDates,
              address: order.Address,
              id: order._id,
              orderStatus: order.orderStatus,
            };
          });

          setOrders(transformed);
        } else {
          setOrders([]);
        }
      } catch (error) {
        setOrders([]);
      }
    };

    fetchOrders();
  }, []);

  // ✅ Filtered Orders (works for BOTH views)
  const filteredOrders = useMemo(() => {
    try {
      let data = [...orders];
      const query = (searchQuery || "").toLowerCase().trim();

      if (query) {
        data = data.filter(
          (order) =>
            (order.companyName || "").toLowerCase().includes(query) ||
            (order.executiveName || "").toLowerCase().includes(query) ||
            (order.address || "").toLowerCase().includes(query) ||
            (order.orderStatus || "").toLowerCase().includes(query)
        );
      }

      if (statusFilter === "confirmed") {
        data = data.filter(isConfirmed);
      } else if (statusFilter === "cancelled") {
        data = data.filter(isCancelled);
      }

      if (fromDate instanceof Date && !isNaN(fromDate)) {
        data = data.filter((order) =>
          (order.slots || []).some((slot) =>
            moment(slot.quoteDate, "DD-MM-YYYY").isSameOrAfter(
              moment(fromDate),
              "day"
            )
          )
        );
      }

      if (toDate instanceof Date && !isNaN(toDate)) {
        data = data.filter((order) =>
          (order.slots || []).some((slot) =>
            moment(slot.quoteDate, "DD-MM-YYYY").isSameOrBefore(
              moment(toDate),
              "day"
            )
          )
        );
      }

      return data;
    } catch (e) {
      return [];
    }
  }, [orders, searchQuery, statusFilter, fromDate, toDate]);

  // ✅ Pagination
  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE) || 1;
  const safePage = Math.min(Math.max(currentPage, 1), totalPages);

  const paginatedOrders = filteredOrders.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  // ✅ keep page in URL
  useEffect(() => {
    try {
      setParam("page", String(safePage));
    } catch (e) {
      console.error(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePage]);

  // ✅ The calendar owns its own search/status/executive filters and reports
  // back what survived them, so the tiles stay in step with what is on screen.
  const handleCalendarVisible = useCallback(
    (rows) => setCalendarVisible(rows),
    []
  );

  const calendarStats = useMemo(() => {
    const total = calendarVisible.length;
    const confirmed = calendarVisible.filter(isConfirmed).length;
    return {
      total,
      confirmed,
      /* Counted on the status itself rather than as "everything not
         confirmed", so a status added later is not silently filed here. */
      cancelled: calendarVisible.filter(isCancelled).length,
      value: calendarVisible.reduce((s, o) => s + amountOf(o), 0),
    };
  }, [calendarVisible]);

  const calendarTiles = [
    {
      key: "total",
      label: "Total Orders",
      value: calendarStats.total,
      icon: FaClipboardList,
      tone: "amber",
    },
    {
      key: "confirmed",
      label: "Confirmed",
      value: calendarStats.confirmed,
      icon: FaCheckCircle,
      tone: "green",
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: calendarStats.cancelled,
      icon: FaTimesCircle,
      tone: "grey",
    },
  ];

  /* Exports the rows the calendar is showing, filters and all. */
  const handleExport = () => {
    try {
      const rows = (viewMode === "calendar" ? calendarVisible : filteredOrders).map(
        (o, i) => ({
          "#": i + 1,
          Client: o.companyName || "",
          Executive: o.executiveName || "",
          "Booking Date": o.bookingDate
            ? moment(o.bookingDate).format("DD-MM-YYYY")
            : "",
          "Event Dates": orderDates(o)
            .map((d) => moment(d, "YYYY-MM-DD").format("DD-MM-YYYY"))
            .join(", "),
          Address: o.address || "",
          "Grand Total": amountOf(o),
          Status: o.orderStatus || "",
        })
      );
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 5 }, { wch: 28 }, { wch: 18 }, { wch: 14 },
        { wch: 26 }, { wch: 34 }, { wch: 14 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `orders-${moment(calendarDate).format("YYYY-MM")}.xlsx`);
    } catch (e) {
      toast.error("Could not export the orders");
    }
  };

  // ✅ UI handlers
  const toggleView = () => {
    setViewMode((prev) => (prev === "calendar" ? "list" : "calendar"));
  };

  const onSearchChange = (val) => {
    setSearchQuery(val);
    setParamsBatch({ q: val || "", page: "1" });
  };

  const onFromChange = (date) => {
    setFromDate(date);
    setParamsBatch({ from: date ? toDDMMYYYY(date) : "", page: "1" });
  };

  const onToChange = (date) => {
    setToDate(date);
    setParamsBatch({ to: date ? toDDMMYYYY(date) : "", page: "1" });
  };

  const hasFilters = !!(searchQuery || fromDate || toDate || statusFilter !== "all");

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setFromDate(null);
    setToDate(null);
    setParamsBatch({ q: "", from: "", to: "", page: "1" });
  };

  return (

    <Container className="my-4 qc">
      <style>
        {`
      .orders-datepicker-popper {
        z-index: 99999 !important;
      }
      .orders-filter-card {
        overflow: visible !important;
        position: relative;
        z-index: 20;
      }
    `}
      </style>
      <div className="qc-head">
        <span className="qc-head__icon">
          <FaClipboardList />
        </span>
        <div className="qc-head__text">
          <h2 className="qc-head__title">Order Management</h2>
          <p className="qc-head__sub">
            Track every order by the date its slot runs.
          </p>
        </div>
        <div className="qc-head__actions">
          <Button className="eq-ghost" onClick={handleExport}>
            <FaFileExport /> Export
          </Button>
          <Button className="eq-primary" onClick={toggleView}>
            {viewMode === "calendar" ? (
              <>
                <FaListUl /> List View
              </>
            ) : (
              <>
                <FaRegCalendarAlt /> Calendar View
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ✅ List view only: the calendar carries its own filter bar */}
      {viewMode === "list" ? (
      <Card
        className="shadow-sm mb-4 orders-filter-card"
        style={{ overflow: "visible", position: "relative", zIndex: 20 }}
      >
        <Card.Body>
          <div className="row align-items-center">
            <div className="col-md-3 mb-3 mb-md-0" style={{ position: "relative", zIndex: 30 }}>
              <DatePicker
                selected={fromDate}
                onChange={onFromChange}
                placeholderText="From Date"
                className="form-control form-control-sm"
                dateFormat="dd-MM-yyyy"
                isClearable
                popperClassName="orders-datepicker-popper"
                popperPlacement="bottom-start"
              />
            </div>

            <div className="col-md-3 mb-3 mb-md-0" style={{ position: "relative", zIndex: 30 }}>
              <DatePicker
                selected={toDate}
                onChange={onToChange}
                placeholderText="To Date"
                className="form-control form-control-sm"
                dateFormat="dd-MM-yyyy"
                isClearable
                popperClassName="orders-datepicker-popper"
                popperPlacement="bottom-start"
              />
            </div>

            <div className="col-md-3 mb-3 mb-md-0">
              <Form.Control
                type="text"
                placeholder="Search by Company, Executive, Address"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                size="sm"
              />
            </div>

            <div className="col-md-3">
              <Form.Select
                size="sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by order status"
              >
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="cancelled">Cancelled</option>
              </Form.Select>
            </div>
          </div>

          <div className="d-flex justify-content-end mt-3">
            {hasFilters && (
              <Button variant="outline-danger" size="sm" onClick={clearFilters}>
                Clear Filter
              </Button>
            )}
          </div>
        </Card.Body>
      </Card>
      ) : null}


      {/* ✅ Content */}
      {viewMode === "calendar" ? (
        <div className="qc">
          <div className="eq-stats">
            {calendarTiles.map((t) => (
              <div className={`eq-stat is-${t.tone}`} key={t.key}>
                <span className="eq-stat__icon">
                  <t.icon />
                </span>
                <div className="eq-stat__body">
                  <span className="eq-stat__label">{t.label}</span>
                  <span className="eq-stat__value">{t.value}</span>
                  <span className="eq-stat__hint">
                    {moment(calendarDate).format("MMMM YYYY")}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <RecordCalendar
            records={filteredOrders}
            month={calendarDate}
            onMonthChange={(m) => setCalendarDate(m.toDate())}
            getDates={orderDates}
            getTitle={(o) => o.companyName || o.clientName || "Unnamed client"}
            getSubtitle={(o) => o.address || ""}
            getAmount={amountOf}
            getExecutive={(o) => o.executiveName || o.executivename || ""}
            isDone={isConfirmed}
            isCancelled={isCancelled}
            unit="orders"
            unitOne="order"
            doneLabel="Confirmed"
            pendingLabel="Unconfirmed"
            getStatusLabel={(o) => {
              // The record stores "Confirm"/"cancelled"; anything else is
              // shown exactly as it came back.
              const v = String(o.orderStatus || "").toLowerCase();
              if (v === "confirm") return "Confirmed";
              if (v === "cancelled") return "Cancelled";
              return o.orderStatus || "";
            }}
            onAmountClick={({ date, records }) =>
              setDayBreakdown({
                dateLabel: date?.isValid?.() ? date.format("DD MMM YYYY") : "",
                orders: records,
              })
            }
            onSelect={(o) => navigate(`/orders-details/${o.id || o._id}`)}
            onVisibleChange={handleCalendarVisible}
          />
        </div>
      ) : (
        <Card className="shadow-sm">
          <div className="table-responsive">
            <Table striped bordered hover className="mb-0" style={{ fontSize: "0.85rem" }}>
              <thead style={{ backgroundColor: "#f8f9fa" }}>
                <tr>
                  <th style={{ width: "10%" }}>Booking Date</th>
                  <th style={{ width: "15%" }}>Company Name</th>
                  <th style={{ width: "15%" }}>Executive Name</th>
                  <th style={{ width: "10%" }}>Grand Total</th>
                  <th style={{ width: "10%" }}>Event Date</th>
                  <th style={{ width: "25%" }}>Address</th>
                  <th style={{ width: "10%" }}>Status</th>
                  <th style={{ width: "10%" }} className="text-center">Action</th>
                </tr>
              </thead>

              <tbody>
                {paginatedOrders.map((order) => {
                  const quoteDate =
                    order.slots?.length > 0 ? order.slots[0].quoteDate : "";
                  return (
                    <tr key={order.id} style={{ verticalAlign: "middle" }}>
                      <td>{moment(order.bookingDate).format("DD-MM-YYYY")}</td>
                      <td>{order.companyName}</td>
                      <td>{order.executiveName}</td>
                      <td>{order.grandTotal}</td>
                      <td>{quoteDate}</td>
                      <td>{order.address}</td>
                      <td
                        style={{
                          color:
                            order.orderStatus === "Confirm"
                              ? "green"
                              : order.orderStatus === "cancelled"
                                ? "red"
                                : "black",
                          fontWeight: "600",
                        }}
                      >
                        {order.orderStatus}
                      </td>
                      <td className="text-center">
                        <Button
                          variant="outline-dark"
                          size="sm"
                          onClick={() => navigate(`/orders-details/${order.id}`)}
                          title="View"
                        >
                          <MdVisibility />
                        </Button>
                      </td>
                    </tr>
                  );
                })}

                {paginatedOrders.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-center text-muted">
                      No orders found.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>

          <Pagination
            totalItems={filteredOrders.length}
            itemsPerPage={PAGE_SIZE}
            currentPage={safePage}
            onPageChange={(p) => {
              setCurrentPage(p);
              setParam("page", String(p));
            }}
          />
        </Card>
      )}

      <DayRecordsModal
        show={Boolean(dayBreakdown)}
        onHide={() => setDayBreakdown(null)}
        dateLabel={dayBreakdown?.dateLabel}
        records={dayBreakdown?.orders || []}
        variant="order"
      />
    </Container>
  );
};

export default Orders;
