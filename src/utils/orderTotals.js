/**
 * The cost breakdown of an order, in one place.
 *
 * This is the arithmetic the order invoice has always used. It lives here now
 * so the calendar can show the same figures without a second copy of it - two
 * copies of a money calculation drift, and then two screens disagree about
 * what an order is worth.
 */

export const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fmtMoney = (n) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNum(n));

const parseDDMMYYYY = (str) => {
  try {
    if (!str) return null;
    const [dd, mm, yyyy] = String(str).split("-");
    if (!dd || !mm || !yyyy) return null;
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isNaN(d.getTime()) ? null : d;
  } catch (e) {
    return null;
  }
};

/** Both ends count, so a one-day hire is one day and not zero. */
export const calcDays = (startStr, endStr) => {
  try {
    const start = parseDDMMYYYY(startStr);
    const end = parseDDMMYYYY(endStr);
    if (!start || !end) return 1;
    const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return !Number.isFinite(diff) || diff < 1 ? 1 : diff;
  } catch (e) {
    return 1;
  }
};

/**
 * The priced lines of an order, taken from its first slot - which is the slot
 * the invoice bills from.
 */
export const buildOrderItems = (order) => {
  const slot = order?.slots?.[0] || null;
  const slotProducts = Array.isArray(slot?.products) ? slot.products : [];

  return slotProducts.map((p) => {
    const qty = safeNum(p?.quantity);
    const unitPrice = safeNum(p?.ProductPrice ?? p?.productPrice);
    const days = calcDays(
      p?.productQuoteDate || slot?.quoteDate,
      p?.productEndDate || slot?.endDate
    );

    return {
      productId: p?.productId,
      productName: p?.productName,
      unitPrice,
      quantity: qty,
      days,
      /* A stored line total wins; it is what was agreed. */
      amount: safeNum(p?.total) || unitPrice * qty * days,
    };
  });
};

/**
 * The priced lines of a quotation, taken from its first slot.
 *
 * Two things differ from an order. The products sit under `Products`, and
 * the stored line `total` is price x quantity only - it does not carry the
 * days - so unlike an order's it cannot stand in for the amount. Every
 * multi-day line in the data was checked: all 204 store price x quantity.
 */
export const buildQuoteItems = (quote) => {
  const slot = quote?.slots?.[0] || null;
  const products = Array.isArray(slot?.Products) ? slot.Products : [];

  return products.map((p) => {
    /* Both keys occur; where both are present they always agree. */
    const qty = safeNum(p?.quantity ?? p?.qty);
    const unitPrice = safeNum(p?.price);
    const days = calcDays(
      p?.productQuoteDate || slot?.quoteDate || quote?.quoteDate,
      p?.productEndDate || slot?.endDate || quote?.endDate
    );

    return {
      productId: p?.productId,
      productName: p?.productName || p?.name,
      unitPrice,
      quantity: qty,
      days,
      amount: unitPrice * qty * days,
    };
  });
};


/**
 * `discount` and `GST` are percentages on the record, not amounts.
 * Refurbishment is added into the total but has no row of its own on the
 * invoice, so it is returned separately for a caller that wants to show it.
 */
export const computeOrderTotals = (order, items) => {
  if (!order) return null;

  const lines = items || buildOrderItems(order);
  const productsTotal = lines.reduce((sum, it) => sum + safeNum(it.amount), 0);

  const discountPercent = safeNum(order?.discount);
  const discountAmount = (productsTotal * discountPercent) / 100;
  const totalBeforeCharges = productsTotal - discountAmount;

  const labour = safeNum(order?.labourecharge);
  const transport = safeNum(order?.transportcharge);
  const refurb = safeNum(order?.refurbishmentAmount);
  const additionalTransportation = safeNum(order?.additionalTransportation);

  const totalAfterCharges =
    totalBeforeCharges + labour + transport + refurb + additionalTransportation;

  const gstPercent = safeNum(order?.GST);
  const gstAmount = (totalAfterCharges * gstPercent) / 100;
  const computedGrandTotal = Math.round(totalAfterCharges + gstAmount);

  return {
    productsTotal,
    discountPercent,
    discountAmount: Math.round(discountAmount),
    totalBeforeCharges,
    labour,
    transport,
    refurb,
    additionalTransportation,
    totalAfterCharges,
    gstPercent,
    gstAmount: Math.round(gstAmount),
    /* The stored figure is what the client was billed; the computed one is
       only a fallback for a record that never stored it. */
    grandTotalToShow: safeNum(order?.GrandTotal) || computedGrandTotal,
  };
};

/**
 * A quotation's totals, which are the same arithmetic as an order's - on
 * purpose, so there is one money calculation here and not two. A quotation
 * only names refurbishment differently and has no additional transportation
 * of its own.
 */
export const computeQuoteTotals = (quote, items) => {
  if (!quote) return null;

  return computeOrderTotals(
    {
      ...quote,
      refurbishmentAmount: quote?.refurbishment,
      additionalTransportation: 0,
    },
    items || buildQuoteItems(quote)
  );
};
