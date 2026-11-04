import React from "react";
import { Link } from "react-router-dom";
import {
  FaTimes,
  FaBoxOpen,
  FaTag,
  FaLayerGroup,
  FaChair,
  FaCube,
  FaEdit,
  FaExternalLinkAlt,
} from "react-icons/fa";
import { stockOf, priceOf, stockTone, inr } from "./productFields";

/**
 * Right-hand preview for the product list.
 *
 * The reference design also carries an image carousel, dimensions, a
 * description, tags, and Inventory/History tabs. The product record holds a
 * single image and no dimension, description or tag fields, so those panels
 * are left out rather than shown empty.
 */

const Cell = ({ icon, label, value }) =>
  value || value === 0 ? (
    <div className="eqp-cell">
      <span className="eqp-cell__label">
        {icon} {label}
      </span>
      <span className="eqp-cell__value">{value}</span>
    </div>
  ) : null;

const ProductPeek = ({ product, onClose }) => {
  if (!product) {
    return (
      <aside className="eqp eqp--empty">
        <p>Select a product to see its details here.</p>
      </aside>
    );
  }

  const tone = stockTone(product);
  const stock = stockOf(product);

  return (
    <aside className="eqp">
      <div className="eqp__head">
        <span className="eqp__id">Product</span>
        <span className={`rt-pill ${tone.cls}`}>{tone.label}</span>
        <button
          type="button"
          className="eqp__close"
          onClick={onClose}
          aria-label="Close preview"
        >
          <FaTimes />
        </button>
      </div>

      <div className="eqp__body">
        {/* ---- Image ---- */}
        <div className="pm-hero">
          {product.ProductIcon ? (
            <img src={product.ProductIcon} alt="" />
          ) : (
            <span className="pm-hero__empty">
              <FaBoxOpen />
            </span>
          )}
        </div>

        <h3 className="eqp__client">{product.ProductName || "Unnamed product"}</h3>
        {product.ProductSubcategory ? (
          <p className="pm-sub">{product.ProductSubcategory}</p>
        ) : null}

        {/* ---- Price and stock ---- */}
        <div className="eqp__money">
          <div>
            <span className="eqp__money-label">Price</span>
            <span className="eqp__money-value">
              &#8377;{inr(priceOf(product))}
            </span>
          </div>
          <div>
            <span className="eqp__money-label">Stock</span>
            <span className="eqp__money-value">
              {stock} <small>units</small>
            </span>
          </div>
        </div>

        {/* ---- Details ---- */}
        <div className="eqp__section">
          <span className="eqp__section-title">Details</span>
          <div className="eqp__grid">
            <Cell
              icon={<FaLayerGroup />}
              label="Category"
              value={product.ProductCategory}
            />
            <Cell
              icon={<FaTag />}
              label="Sub category"
              value={product.ProductSubcategory}
            />
            <Cell icon={<FaChair />} label="Seater" value={product.seater} />
            <Cell icon={<FaCube />} label="Material" value={product.Material} />
          </div>
        </div>
      </div>

      <div className="eqp__foot eqp__foot--split">
        <Link to={`/product-details/${product._id}`} className="eqp__ghost">
          <FaExternalLinkAlt /> View
        </Link>
        <Link to={`/edit-product/${product._id}`} className="eqp__open">
          <FaEdit /> Edit Product
        </Link>
      </div>
    </aside>
  );
};

export default ProductPeek;
