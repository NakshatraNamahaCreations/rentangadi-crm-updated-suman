import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

/**
 * The inventory availability sheet, with a picture of each product in it.
 *
 * Why this is not the `xlsx` package the rest of the app exports with: the
 * community build of SheetJS cannot put an image into a worksheet at all.
 * It writes cells, and that is the end of it. ExcelJS can, so this one
 * export uses it; everything else still goes through `exportToExcel`.
 *
 *
 * ABOUT THE IMAGES
 *
 * The product pictures are Cloudinary URLs and the full-size files are
 * around 300KB each - 267 products would be an 85MB spreadsheet nobody can
 * open. Cloudinary resizes on request though, so a 90px thumbnail is asked
 * for instead and the same picture comes back at about 2KB. A whole
 * catalogue is then well under a megabyte.
 *
 * Cloudinary serves `Access-Control-Allow-Origin: *`, so the browser is
 * allowed to read the bytes back; without that the image could be shown on
 * a page but never put inside a file.
 *
 * An image that will not load is left out and the row is still written. A
 * missing photograph is not a reason to lose the stock figures.
 */

/* Cloudinary applies transformations named between /upload/ and the version
   segment. Anything that is not a Cloudinary URL is fetched as it is. */
const THUMB = "w_90,h_90,c_fit,q_auto,f_jpg";

const thumbnailUrl = (url) => {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (!raw.includes("/image/upload/")) return raw;
  /* Only ever inserted once, so a URL that already carries the transform is
     left alone. */
  if (raw.includes(`/upload/${THUMB}/`)) return raw;
  return raw.replace("/image/upload/", `/image/upload/${THUMB}/`);
};

/* The bytes of one image, or null if it cannot be had. */
const fetchImage = async (url) => {
  const src = thumbnailUrl(url);
  if (!src) return null;

  try {
    const res = await fetch(src, { mode: "cors" });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) return null;
    return buffer;
  } catch (e) {
    /* Blocked, offline, or a dead link - the row goes in without it. */
    return null;
  }
};

const COLUMNS = [
  { header: "Image", key: "image", width: 14 },
  { header: "Product Name", key: "productName", width: 36 },
  { header: "Subcategory", key: "subcategory", width: 20 },
  { header: "Available Stock", key: "available", width: 16 },
  { header: "Blocked Stock", key: "blocked", width: 15 },
  { header: "Under Quotations", key: "underQuotations", width: 18 },
  { header: "Total Stock", key: "totalStock", width: 13 },
  { header: "Price", key: "price", width: 12 },
  { header: "Status", key: "status", width: 16 },
];

/**
 * @param rows      the inventory rows as the screen has them
 * @param imageOf   given a row, the product's picture URL ("" if none)
 * @param filename  what to save it as
 * @param onProgress optional (done, total) while the images are fetched
 */
export async function exportInventoryWithImages({
  rows,
  imageOf,
  filename = "inventory.xlsx",
  onProgress,
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Inventory");

  sheet.columns = COLUMNS;

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };

  /* Every picture at once rather than one after another: ninety of them in
     sequence is a visible wait, in parallel it is one round trip. */
  const buffers = await (async () => {
    let done = 0;
    return Promise.all(
      rows.map(async (row) => {
        const buffer = await fetchImage(imageOf(row));
        done += 1;
        if (onProgress) onProgress(done, rows.length);
        return buffer;
      })
    );
  })();

  rows.forEach((row, i) => {
    const line = sheet.addRow({
      image: "",
      productName: row.productName || "",
      subcategory: row.productSubcategory || "",
      available: Number(row.availableStock) || 0,
      blocked: Number(row.reservedStock) || 0,
      underQuotations: Number(row.pendingQuotationQty) || 0,
      totalStock: Number(row.totalStock) || 0,
      price: Number(row.price) || 0,
      status: row.statusLabel || "",
    });

    /* Tall enough for the thumbnail to sit in without being clipped. */
    line.height = 70;
    line.alignment = { vertical: "middle" };

    const buffer = buffers[i];
    if (!buffer) return;

    const id = workbook.addImage({ buffer, extension: "jpeg" });

    /* Anchored inside the first cell with a small margin, so the picture
       belongs to its row and moves with it when the sheet is sorted. */
    sheet.addImage(id, {
      tl: { col: 0.15, row: line.number - 1 + 0.12 },
      ext: { width: 80, height: 80 },
      editAs: "oneCell",
    });
  });

  sheet.getColumn("price").numFmt = "#,##0";

  const out = await workbook.xlsx.writeBuffer();
  saveAs(
    new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}

export default exportInventoryWithImages;
