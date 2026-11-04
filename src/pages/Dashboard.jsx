// import React from "react";
// import { Card } from "react-bootstrap";
// import {
//   AiOutlineUser,
//   AiOutlinePhone,
//   AiOutlineDollarCircle,
//   AiOutlineCalendar,
//   AiOutlineTool,
// } from "react-icons/ai";
// import {
//   FaUsers,
//   FaWarehouse,
//   FaTruckLoading,
//   FaIndustry,
//   FaUserCog,
//   FaCheckCircle,
//   FaPencilAlt,
//   FaMoneyCheckAlt,
//   FaBoxOpen,
//   FaBox,
// } from "react-icons/fa";

// // Importing chart.js and react-chartjs-2 for the bar chart
// import { Bar } from "react-chartjs-2";
// import {
//   Chart as ChartJS,
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend,
// } from "chart.js";

// // Registering the necessary chart.js components
// ChartJS.register(
//   CategoryScale,
//   LinearScale,
//   BarElement,
//   Title,
//   Tooltip,
//   Legend
// );

// const Dashboard = () => {
//   const preProductionData = [
//     {
//       title: "Orders",
//       count: 45,
//       icon: <FaBoxOpen size={40} />,
//     },
//     {
//       title: "Clients",
//       count: 10,
//       icon: <FaUsers size={40} />,
//     },
//     {
//       title: "Quotations",
//       count: 25,
//       icon: <FaWarehouse size={40} />,
//     },
//   ];

//   // Sample data for the bar chart (Orders in different months)
//   const orderData = {
//     labels: ["January", "February", "March", "April", "May", "June"], // Months
//     datasets: [
//       {
//         label: "Orders",
//         data: [10, 20, 15, 30, 25, 40],
//         backgroundColor: "#4e73df",
//         borderColor: "#2e59d9",
//         borderWidth: 1,
//       },
//     ],
//   };

//   const options = {
//     responsive: true,
//     plugins: {
//       title: {
//         display: true,
//         text: "Orders per Month",
//       },
//       tooltip: {
//         callbacks: {
//           // Customize tooltip to show the count of orders in the tooltip
//           label: (context) => `Orders: ${context.raw}`,
//         },
//       },
//     },
//     scales: {
//       y: {
//         beginAtZero: true,
//         ticks: {
//           stepSize: 5,
//         },
//       },
//     },
//   };

//   return (
//     <div className="container p-4 rounded " style={{ background: "#F4F4F4" }}>
//       <div className="row mt-4 justify-content-start">
//         {preProductionData.map((item, index) => (
//           <div className="col-4 mb-2 px-1" key={index}>
//             <Card className="shadow border-0 p-2 text-center card-hover">
//               <Card.Body className="d-flex flex-column align-items-center justify-content-center">
//                 <div className="mb-1 icon">{item.icon}</div>
//                 <h6 className="fw-bold mb-1" style={{ fontSize: "12px" }}>
//                   {item.title}
//                 </h6>
//                 <p className="fw-bold mb-0" style={{ fontSize: "18px" }}>
//                   {item.count}
//                 </p>
//                 <small className="text-muted" style={{ fontSize: "10px" }}>
//                   {item.subtitle}
//                 </small>
//               </Card.Body>
//             </Card>
//           </div>
//         ))}
//       </div>

//       {/* Bar Chart for Orders */}
//       <div className="mt-4">
//         <Card className="shadow border-0 p-2">
//           <Card.Body>
//             <h6 className="fw-bold mb-3" style={{ fontSize: "16px" }}>
//               Orders Per Month
//             </h6>
//             <Bar data={orderData} options={options} />
//           </Card.Body>
//         </Card>
//       </div>
//     </div>
//   );
// };

// export default Dashboard;

import React, { useEffect, useMemo, useState } from "react";
import { Card } from "react-bootstrap";
import {
  FaUsers,
  FaWarehouse,
  FaBoxOpen,
  FaArrowUp,
  FaArrowDown,
  FaRegCalendarAlt,
  FaChartLine,
  FaClipboardList,
  FaCommentDots,
  FaShoppingBag,
  FaEllipsisH,
} from "react-icons/fa";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import axios from "axios";
import moment from "moment";
import { Link } from "react-router-dom";
import { ApiURL } from "../api";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ACCENT = "#BD5525";

/* Blue ramp for the status doughnut, darkest slice first. */
const DONUT_COLORS = ["#BD5525", "#D9703A", "#EDBD9D", "#F0D9CB"];

const inr = (n) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Number(n) || 0)
  );


/* Vertical gradient under a line, built once Chart.js has measured the plot. */
const fillFor = (hex, strength) => (ctx) => {
  const chart = ctx.chart;
  const area = chart.chartArea;
  if (!area) return hex + "20";
  const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
  g.addColorStop(0, hex + (strength || "55"));
  g.addColorStop(1, hex + "03");
  return g;
};

const SPARK_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 600 },
  plugins: { legend: { display: false }, tooltip: { enabled: false } },
  scales: { x: { display: false }, y: { display: false } },
};

const Spark = ({ data }) => (
  <span className="rt-spark">
    <Line
      data={{
        labels: data.map((_, i) => i),
        datasets: [
          {
            data,
            borderColor: ACCENT,
            backgroundColor: fillFor(ACCENT, "3D"),
            borderWidth: 2,
            fill: true,
            tension: 0.42,
            pointRadius: 0,
          },
        ],
      }}
      options={SPARK_OPTIONS}
    />
  </span>
);

/* Group orders by a field, summing count and value, highest value first. */
const groupOrders = (list, field, fallback) => {
  const map = new Map();
  list.forEach((o) => {
    const key = String(o?.[field] || "").trim() || fallback;
    const row = map.get(key) || { name: key, count: 0, value: 0 };
    row.count += 1;
    row.value += Number(o?.GrandTotal) || 0;
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => b.value - a.value);
};

/* Status -> pill tone. Only the states this data actually carries. */
const orderTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "confirm" || s === "confirmed") return { cls: "is-green", label: "Confirmed" };
  if (s === "cancelled" || s === "canceled") return { cls: "is-red", label: "Cancelled" };
  if (s === "delivered") return { cls: "is-violet", label: "Delivered" };
  return { cls: "is-amber", label: status || "Pending" };
};

const enquiryTone = (status) => {
  const s = String(status || "").toLowerCase();
  if (s === "sent") return { cls: "is-violet", label: "Quoted" };
  if (s === "not send") return { cls: "is-blue", label: "New" };
  return { cls: "is-amber", label: status || "Open" };
};

const Dashboard = () => {
  const [counts, setCounts] = useState({ Orders: 0, Clients: 0, Quotations: 0 });
  const [orders, setOrders] = useState([]);
  const [enquiries, setEnquiries] = useState([]);
  const [series, setSeries] = useState({ Orders: [], Clients: [], Quotations: [] });
  const [selectedCategory, setSelectedCategory] = useState("Orders");

  const thisYear = moment().year();
  const monthsSoFar = moment().month() + 1;
  const adminName = sessionStorage.getItem("adminName") || "Administrator";

  useEffect(() => {
    fetchCounts();
    fetchAllSeries();
    fetchEnquiries();
  }, []);

  const fetchCounts = async () => {
    try {
      const [ordersRes, clientsRes, quotationsRes] = await Promise.all([
        axios.get(ApiURL + "/order/TotalNumberOfOrder"),
        axios.get(ApiURL + "/client/TotalNumberOfClients"),
        axios.get(ApiURL + "/quotations/TotalNumberOfquotation"),
      ]);
      setCounts({
        Orders: ordersRes.data.totalorderCount || 0,
        Clients: clientsRes.data.clientCount || 0,
        Quotations: quotationsRes.data.totalQuotationCount || 0,
      });
    } catch (error) {
      // counts stay at zero
    }
  };

  const pickList = (payload) => {
    if (Array.isArray(payload)) return payload;
    return (
      payload?.orderData ||
      payload?.Client ||
      payload?.quoteData ||
      payload?.data ||
      []
    );
  };

  const toMonthly = (data) => {
    const monthly = Array(12).fill(0);
    (Array.isArray(data) ? data : []).forEach((item) => {
      if (!item?.createdAt) return;
      const d = moment(item.createdAt);
      if (d.isValid() && d.year() === thisYear) monthly[d.month()] += 1;
    });
    return monthly;
  };

  const fetchAllSeries = async () => {
    // A high limit is passed so the value and status panels aggregate over the
    // whole set rather than whatever the default first page returns.
    const endpoints = [
      ["Orders", ApiURL + "/order/getallorder"],
      ["Clients", ApiURL + "/client/getallclients"],
      ["Quotations", ApiURL + "/quotations/getallquotations"],
    ];
    const results = await Promise.allSettled(
      endpoints.map((e) => axios.get(e[1]))
    );
    const next = {};
    results.forEach((res, i) => {
      const key = endpoints[i][0];
      const list = res.status === "fulfilled" ? pickList(res.value?.data) : [];
      next[key] = toMonthly(list);
      if (key === "Orders") setOrders(Array.isArray(list) ? list : []);
    });
    setSeries(next);
  };

  const fetchEnquiries = async () => {
    try {
      const res = await axios.get(ApiURL + "/Enquiry/getallEnquiry");
      const list = pickList(res?.data);
      setEnquiries(Array.isArray(list) ? list : []);
    } catch (error) {
      setEnquiries([]);
    }
  };

  /* Movement between the two most recent COMPLETE months. The running month is
     skipped on purpose: a few days against a full month reads as a false drop.
     Returns null with no baseline, so a card omits the pill rather than
     showing a figure we cannot stand behind. */
  const trendFrom = (data) => {
    const last = moment().month() - 1;
    if (last < 1 || !data || data.length < 12) return null;
    const current = Number(data[last]) || 0;
    const previous = Number(data[last - 1]) || 0;
    if (previous === 0) return null;
    const pct = ((current - previous) / previous) * 100;
    if (!isFinite(pct)) return null;
    return {
      pct,
      up: pct >= 0,
      label: "vs " + MONTHS_SHORT[last - 1] + " " + thisYear,
    };
  };

  const ordersThisYear = useMemo(
    () =>
      orders.filter((o) => {
        const d = moment(o?.createdAt);
        return d.isValid() && d.year() === thisYear;
      }),
    [orders, thisYear]
  );


  const statusBreakdown = useMemo(() => {
    const b = {};
    ordersThisYear.forEach((o) => {
      const { label } = orderTone(o?.orderStatus);
      b[label] = (b[label] || 0) + 1;
    });
    return b;
  }, [ordersThisYear]);

  const recentOrders = useMemo(
    () =>
      orders
        .filter((o) => o?.createdAt)
        .slice()
        .sort((a, b) => moment(b.createdAt).valueOf() - moment(a.createdAt).valueOf())
        .slice(0, 5),
    [orders]
  );

  const recentEnquiries = useMemo(() => {
    const withDate = enquiries.map((e) => ({
      ...e,
      _when: e?.createdAt
        ? moment(e.createdAt)
        : moment(e?.enquiryDate, "DD-MM-YYYY"),
    }));
    return withDate
      .filter((e) => e._when.isValid())
      .sort((a, b) => b._when.valueOf() - a._when.valueOf())
      .slice(0, 5);
  }, [enquiries]);

  // Items on an order: products are nested under slots.
  const itemCount = (order) =>
    (order?.slots || []).reduce(
      (sum, slot) => sum + ((slot?.products || []).length || 0),
      0
    ) || (order?.products || []).length;

  const cards = [
    {
      key: "Orders",
      title: "Orders",
      value: counts.Orders,
      icon: FaClipboardList,
      spark: series.Orders.slice(0, monthsSoFar),
      trend: trendFrom(series.Orders),
      selectable: true,
    },
    {
      key: "Quotations",
      title: "Quotations",
      value: counts.Quotations,
      icon: FaCommentDots,
      spark: series.Quotations.slice(0, monthsSoFar),
      trend: trendFrom(series.Quotations),
      selectable: true,
    },
    {
      key: "Clients",
      title: "Clients",
      value: counts.Clients,
      icon: FaUsers,
      spark: series.Clients.slice(0, monthsSoFar),
      trend: trendFrom(series.Clients),
      selectable: true,
    },
  ];

  /* ---- Trend chart ---- */
  const plotted = (series[selectedCategory] || []).slice(0, monthsSoFar);

  const areaData = {
    labels: MONTHS_SHORT.slice(0, monthsSoFar),
    datasets: [
      {
        label: selectedCategory,
        data: plotted,
        borderColor: ACCENT,
        backgroundColor: fillFor(ACCENT, "45"),
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointHoverBackgroundColor: ACCENT,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
      },
    ],
  };

  const areaOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 700, easing: "easeOutQuart" },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#111827",
        padding: 11,
        cornerRadius: 8,
        displayColors: false,
        titleFont: { family: "Poppins", size: 12, weight: "600" },
        bodyFont: { family: "Poppins", size: 12 },
        callbacks: {
          title: (items) => (items[0] ? items[0].label + " " + thisYear : ""),
          label: (ctx) => selectedCategory + ": " + ctx.raw,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0,
          color: "#94A3B8",
          font: { family: "Poppins", size: 11 },
          maxTicksLimit: 5,
        },
        grid: { color: "#EEF2F7", drawTicks: false },
        border: { display: false },
      },
      x: {
        ticks: { color: "#94A3B8", font: { family: "Poppins", size: 11 } },
        grid: { display: false },
        border: { color: "#E5E8EC" },
      },
    },
  };

  /* ---- Status doughnut ---- */
  const statusEntries = Object.entries(statusBreakdown);
  const statusTotal = statusEntries.reduce((s, e) => s + e[1], 0);

  const donutData = {
    labels: statusEntries.map((e) => e[0]),
    datasets: [
      {
        data: statusEntries.map((e) => e[1]),
        backgroundColor: statusEntries.map(
          (_, i) => DONUT_COLORS[i % DONUT_COLORS.length]
        ),
        borderWidth: 0,
        hoverOffset: 6,
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "74%",
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#111827",
        padding: 10,
        cornerRadius: 8,
        bodyFont: { family: "Poppins", size: 12 },
        callbacks: {
          label: (ctx) => {
            const pct = statusTotal ? ((ctx.raw / statusTotal) * 100).toFixed(1) : 0;
            return " " + ctx.label + ": " + ctx.raw + " (" + pct + "%)";
          },
        },
      },
    },
  };

  const totalForCategory = plotted.reduce((s, n) => s + (Number(n) || 0), 0);

  return (
    <div className="rt-dash">
      {/* ---- Greeting ---- */}
      <div className="rt-hello">
        <div>
          <h2 className="rt-hello__title">Welcome back, {adminName}</h2>
          <p className="rt-hello__sub">
            Here&apos;s what&apos;s happening with Rent Angadi today.
          </p>
        </div>
        <span className="rt-hello__date">
          <FaRegCalendarAlt />
          {moment().format("ddd, DD MMM YYYY")}
        </span>
      </div>

      {/* ---- KPI row ---- */}
      <div className="rt-kpi-grid">
        {cards.map((item) => {
          const isActive = item.selectable && selectedCategory === item.key;
          const Tag = item.selectable ? "button" : "div";
          const extra = item.selectable
            ? {
                type: "button",
                onClick: () => setSelectedCategory(item.key),
                "aria-pressed": isActive,
              }
            : {};
          return (
            <Tag
              key={item.key}
              {...extra}
              className={
                "rt-kpi" +
                (isActive ? " is-active" : "") +
                (item.selectable ? "" : " is-static")
              }
            >
              <span className="rt-kpi__icon">
                <item.icon />
              </span>

              <span className="rt-kpi__body">
                <span className="rt-kpi__label">{item.title}</span>
                <span className="rt-kpi__value">{item.value}</span>
                {item.trend ? (
                  <>
                    <span
                      className={
                        "rt-kpi__trend " + (item.trend.up ? "is-up" : "is-down")
                      }
                    >
                      {item.trend.up ? <FaArrowUp /> : <FaArrowDown />}
                      {item.trend.up ? "+" : "-"}
                      {Math.abs(item.trend.pct).toFixed(1)}%
                    </span>
                    <span className="rt-kpi__hint">{item.trend.label}</span>
                  </>
                ) : (
                  <span className="rt-kpi__hint">{thisYear} to date</span>
                )}
              </span>

              {item.spark.some((n) => n > 0) ? <Spark data={item.spark} /> : null}
            </Tag>
          );
        })}
      </div>

      {/* ---- Trend + status ---- */}
      <div className="rt-dash-grid">
        <Card className="rt-panel">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaChartLine />
              </span>
              <div>
                <h3 className="rt-panel__title">{selectedCategory} Trend</h3>
                <p className="rt-panel__sub">
                  {thisYear} &middot; {totalForCategory} total {selectedCategory.toLowerCase()}
                </p>
              </div>
            </div>
            <div className="rt-chip-row">
              {["Orders", "Quotations", "Clients"].map((k) => (
                <button
                  key={k}
                  type="button"
                  className={"rt-chip" + (selectedCategory === k ? " is-active" : "")}
                  onClick={() => setSelectedCategory(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          </Card.Header>
          <Card.Body>
            <div className="rt-chart-area">
              <Line data={areaData} options={areaOptions} />
            </div>
          </Card.Body>
        </Card>

        <Card className="rt-panel">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaShoppingBag />
              </span>
              <div>
                <h3 className="rt-panel__title">Order Status</h3>
                <p className="rt-panel__sub">
                  {thisYear} &middot; {statusTotal} orders
                </p>
              </div>
            </div>
          </Card.Header>
          <Card.Body>
            {statusTotal > 0 ? (
              <div className="rt-donut-row">
                <div className="rt-donut">
                  <Doughnut data={donutData} options={donutOptions} />
                  <div className="rt-donut__center">
                    <span className="rt-donut__value">{statusTotal}</span>
                    <span className="rt-donut__label">Orders</span>
                  </div>
                </div>
                <ul className="rt-legend">
                  {statusEntries.map((e, i) => (
                    <li key={e[0]}>
                      <i style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="rt-legend__name">{e[0]}</span>
                      <span className="rt-legend__val">{e[1]}</span>
                      <span className="rt-legend__pct">
                        {statusTotal ? ((e[1] / statusTotal) * 100).toFixed(1) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rt-empty">No orders recorded for {thisYear} yet.</p>
            )}
          </Card.Body>
        </Card>
      </div>

      {/* ---- Recent orders + recent enquiries ---- */}
      <div className="rt-dash-grid rt-dash-grid--even">
        <Card className="rt-panel">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaShoppingBag />
              </span>
              <h3 className="rt-panel__title">Recent Orders</h3>
            </div>
            <Link to="/orders" className="rt-viewall">
              View All
            </Link>
          </Card.Header>
          <Card.Body className="p-0">
            {recentOrders.length ? (
              <div className="table-responsive">
                <table className="table rt-mini">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Client</th>
                      <th>Items</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o, i) => {
                      const tone = orderTone(o?.orderStatus);
                      return (
                        <tr key={o?._id || i}>
                          <td>{i + 1}</td>
                          <td className="rt-mini__strong">
                            {o?.clientName || "Unnamed client"}
                          </td>
                          <td>{itemCount(o)} items</td>
                          <td className="rt-mini__num">&#8377;{inr(o?.GrandTotal)}</td>
                          <td>
                            <span className={"rt-pill " + tone.cls}>{tone.label}</span>
                          </td>
                          <td>{moment(o.createdAt).format("DD MMM YYYY")}</td>
                          <td className="text-end">
                            <Link
                              to={`/orders-details/${o?._id}`}
                              className="rt-rowbtn"
                              aria-label="Open order"
                            >
                              <FaEllipsisH />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rt-empty">No recent orders.</p>
            )}
          </Card.Body>
        </Card>

        <Card className="rt-panel">
          <Card.Header className="rt-panel__head">
            <div className="rt-panel__id">
              <span className="rt-panel__icon">
                <FaCommentDots />
              </span>
              <h3 className="rt-panel__title">Recent Enquiries</h3>
            </div>
            <Link to="/enquiry-list" className="rt-viewall">
              View All
            </Link>
          </Card.Header>
          <Card.Body className="p-0">
            {recentEnquiries.length ? (
              <div className="table-responsive">
                <table className="table rt-mini">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Client</th>
                      <th>Executive</th>
                      <th>Date</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {recentEnquiries.map((e, i) => {
                      const tone = enquiryTone(e?.status);
                      return (
                        <tr key={e?._id || i}>
                          <td>{i + 1}</td>
                          <td className="rt-mini__strong">
                            {e?.clientName || "Unnamed client"}
                          </td>
                          <td>{e?.executivename || "—"}</td>
                          <td>{e._when.format("DD MMM YYYY")}</td>
                          <td>
                            <span className={"rt-pill " + tone.cls}>{tone.label}</span>
                          </td>
                          <td className="text-end">
                            <Link
                              to={`/enquiry-details/${e?._id}`}
                              className="rt-rowbtn"
                              aria-label="Open enquiry"
                            >
                              <FaEllipsisH />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rt-empty">No recent enquiries.</p>
            )}
          </Card.Body>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
