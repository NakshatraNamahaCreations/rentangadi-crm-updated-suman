import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Form, Card } from "react-bootstrap";
import {
  FaTrashAlt,
  FaPlus,
  FaSearch,
  FaImage,
  FaCloudUploadAlt,
} from "react-icons/fa";
import { ApiURL, ImageApiURL } from "../../api";
import Pagination from "../../components/Pagination";
import axios from "axios";
import { toast } from "react-hot-toast";

/**
 * App banners.
 *
 * The record holds only an id and an image, so a table of mongo ids reads
 * poorly: the banner itself is the content, which is why these are laid out
 * as a gallery instead.
 */

const imageSrc = (value) => {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("data:")) return v;
  return `${ImageApiURL}/userbanner/${v}`;
};

/* A banner image can be missing or point at a path that no longer resolves. */
const BannerImage = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="bn-card__img bn-card__img--empty">
        <FaImage />
        <small>No image</small>
      </span>
    );
  }

  return (
    <span className="bn-card__img">
      <img src={src} alt={alt || ""} onError={() => setFailed(true)} />
    </span>
  );
};

const Banner = () => {
  const [showModal, setShowModal] = useState(false);
  const [banners, setBanners] = useState([]);
  const [newBanner, setNewBanner] = useState({ banner: null, preview: "" });
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);

  useEffect(() => {
    fetchBanner();
  }, []);

  const fetchBanner = async () => {
    try {
      const res = await axios.get(`${ApiURL}/banner/getallbanner`);
      if (res.status === 200) {
        setBanners(res.data.banner || []);
      }
    } catch (error) {
      console.error("Error fetching banners:", error);
      toast.error("Failed to fetch banners");
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewBanner({ banner: file, preview: URL.createObjectURL(file) });
      setError("");
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setNewBanner({ banner: null, preview: "" });
    setError("");
  };

  const handleAddBanner = async () => {
    if (!newBanner.banner) {
      setError("Please select a banner image.");
      return;
    }

    const formData = new FormData();
    formData.append("banner", newBanner.banner);

    try {
      setUploading(true);
      const res = await axios.post(`${ApiURL}/banner/addbanner`, formData);
      if (res.status === 200) {
        toast.success("Banner uploaded successfully");
        fetchBanner();
        closeModal();
      } else {
        toast.error("Failed to upload banner");
      }
    } catch (err) {
      console.error(err);
      toast.error("Server error. Failed to upload banner.");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBanner = async (id) => {
    if (!window.confirm("Are you sure you want to delete this banner?")) return;
    try {
      const res = await axios.delete(`${ApiURL}/banner/deletebanner/${id}`);
      if (res.status === 200) {
        toast.success("Banner deleted successfully");
        setSelectedRows((prev) => prev.filter((x) => x !== id));
        fetchBanner();
      } else {
        toast.error("Failed to delete banner");
      }
    } catch (err) {
      console.error(err);
      toast.error("Server error. Deletion failed.");
    }
  };

  const handleDeleteSelected = async () => {
    if (!window.confirm("Are you sure you want to delete selected banners?")) {
      return;
    }

    try {
      await Promise.all(
        selectedRows.map((id) =>
          axios.delete(`${ApiURL}/banner/deletebanner/${id}`)
        )
      );
      toast.success("Selected banners deleted");
      fetchBanner();
      setSelectedRows([]);
    } catch {
      toast.error("Error deleting selected banners");
    }
  };

  const handleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllRows = (checked) => {
    const currentPageIds = currentBanners.map((banner) => banner._id);
    if (checked) {
      setSelectedRows([...new Set([...selectedRows, ...currentPageIds])]);
    } else {
      setSelectedRows(
        selectedRows.filter((id) => !currentPageIds.includes(id))
      );
    }
  };

  const filteredBanners = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return banners;
    return banners.filter((banner) =>
      String(banner._id || "").toLowerCase().includes(q)
    );
  }, [banners, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentBanners = filteredBanners.slice(
    indexOfFirstItem,
    indexOfLastItem
  );

  const allOnPage =
    currentBanners.length > 0 &&
    currentBanners.every((banner) => selectedRows.includes(banner._id));

  return (
    <div className="px-0">
      {/* ---- Header ---- */}
      <div className="eq-head">
        <div>
          <h2 className="eq-head__title">Banners</h2>
          <p className="eq-head__sub">
            Images shown on the customer app home screen.
          </p>
        </div>
        <div className="eq-head__actions">
          <Button className="eq-primary" onClick={() => setShowModal(true)}>
            <FaPlus /> Add Banner
          </Button>
        </div>
      </div>

      {/* ---- Filters ---- */}
      <Card className="eq-card mb-3">
        <Card.Body className="eq-filters">
          <div className="eq-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search by banner id..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search banners"
            />
          </div>

          <label className="bn-selectall">
            <input
              type="checkbox"
              onChange={(e) => handleSelectAllRows(e.target.checked)}
              checked={allOnPage}
              aria-label="Select all on this page"
            />
            <span>Select page</span>
          </label>

          <div className="eq-filters__end">
            {selectedRows.length > 0 ? (
              <Button
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </Button>
            ) : null}
          </div>
        </Card.Body>
      </Card>

      {/* ---- Gallery ---- */}
      {selectedRows.length > 0 ? (
        <Card className="eq-card mb-3">
          <div className="cl-selbar">
            <span>
              <strong>{selectedRows.length}</strong>{" "}
              {selectedRows.length === 1 ? "banner" : "banners"} selected
            </span>
            <button type="button" onClick={() => setSelectedRows([])}>
              Clear
            </button>
          </div>
        </Card>
      ) : null}

      {currentBanners.length === 0 ? (
        <Card className="eq-card">
          <Card.Body className="inv-empty">
            <span className="inv-empty__icon">
              <FaImage />
            </span>
            <h3>No banners found</h3>
            <p>
              {searchQuery
                ? "No banner id matches that search."
                : "Upload a banner to show it on the app home screen."}
            </p>
          </Card.Body>
        </Card>
      ) : (
        <div className="bn-grid">
          {currentBanners.map((banner) => {
            const checked = selectedRows.includes(banner._id);
            return (
              <div
                className={`bn-card${checked ? " is-selected" : ""}`}
                key={banner._id}
              >
                <BannerImage src={imageSrc(banner.banner)} alt="Banner" />

                <label className="bn-card__pick">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleSelectRow(banner._id)}
                    aria-label="Select banner"
                  />
                </label>

                <div className="bn-card__foot">
                  <span className="bn-card__id" title={banner._id}>
                    {banner._id}
                  </span>
                  <button
                    type="button"
                    className="eq-act is-del"
                    title="Delete banner"
                    onClick={() => handleDeleteBanner(banner._id)}
                  >
                    <FaTrashAlt />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredBanners.length > itemsPerPage ? (
        <Card className="eq-card mt-3">
          <div className="eq-foot">
            <label className="eq-perpage">
              <span>Per page</span>
              <Form.Select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                aria-label="Banners per page"
              >
                {[12, 24, 48].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Form.Select>
            </label>

            <Pagination
              totalItems={filteredBanners.length}
              itemsPerPage={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        </Card>
      ) : null}

      {/* ---- Upload ---- */}
      <Modal show={showModal} onHide={closeModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Add Banner</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error ? <p className="ms-error">{error}</p> : null}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Banner Image</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              {newBanner.preview ? (
                <div className="bn-preview">
                  <img src={newBanner.preview} alt="Preview" />
                </div>
              ) : (
                <div className="bn-drop">
                  <FaCloudUploadAlt />
                  <span>Pick an image to see it here first</span>
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={closeModal}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            className="eq-primary"
            onClick={handleAddBanner}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default Banner;
