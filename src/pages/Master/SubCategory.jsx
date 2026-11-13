import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Form, Card } from "react-bootstrap";
import { FaEdit, FaTrashAlt, FaPlus, FaSearch, FaTags } from "react-icons/fa";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ApiURL, ImageApiURL } from "../../api";
import Pagination from "../../components/Pagination";
import MasterThumb from "./MasterThumb";
import BusyButton from "../../components/BusyButton";

/**
 * Product sub-categories.
 *
 * A sub-category carries a name, its parent category name and an image.
 * Stored image values are sometimes a bare filename and sometimes a full URL,
 * so `imageSrc` handles both rather than assuming one.
 */

const imageSrc = (value) => {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("data:")) return v;
  return `${ImageApiURL}/subcategory/${v}`;
};

const SubCategory = () => {
  const [showModal, setShowModal] = useState(false);
  const [subCategories, setSubCategories] = useState([]);
  const [newSubCategory, setNewSubCategory] = useState({
    subcategory: "",
    subcatimg: null,
    category: "",
  });
  const [selectedCategory, setSelectedCategory] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedRows, setSelectedRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    getSubcategory();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${ApiURL}/category/getcategory`);
      if (res.status === 200) {
        setCategories(res.data.category || []);
      }
    } catch (error) {
      toast.error("Failed to fetch categories");
    }
  };

  const getSubcategory = async () => {
    try {
      const res = await axios.get(`${ApiURL}/subcategory/getappsubcat`);
      if (res.status === 200) {
        const sortedData = (res.data.subcategory || []).sort((a, b) => {
          const dateA = new Date(a.updatedAt || a.createdAt || 0);
          const dateB = new Date(b.updatedAt || b.createdAt || 0);
          return dateB - dateA;
        });
        setSubCategories(sortedData);
      } else {
        console.warn("Unexpected response structure:", res.data);
      }
    } catch (error) {
      console.error("Error fetching subcategories:", error);
      toast.error("Failed to fetch subcategories");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewSubCategory((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewSubCategory((prev) => ({ ...prev, subcatimg: file }));
    }
  };

  const resetForm = () => {
    setNewSubCategory({ subcategory: "", subcatimg: null, category: "" });
    setSelectedCategory("");
    setError("");
    setIsEditing(false);
    setEditingId(null);
  };

  const handleAddSubCategory = async () => {
    if (
      !newSubCategory.subcategory ||
      (!newSubCategory.subcatimg && !isEditing) ||
      !selectedCategory
    ) {
      setError("Please fill in all fields.");
      return;
    }

    const formData = new FormData();
    formData.append("subcategory", newSubCategory.subcategory);
    formData.append("category", selectedCategory); // category name
    if (newSubCategory.subcatimg) {
      formData.append("subcatimg", newSubCategory.subcatimg);
    }

    try {
      setSaving(true);
      const url = isEditing
        ? `${ApiURL}/subcategory/editappsubcat/${editingId}`
        : `${ApiURL}/subcategory/addappsubcat`;

      const response = isEditing
        ? await axios.put(url, formData)
        : await axios.post(url, formData);

      if (response.status === 200) {
        toast.success(`Successfully ${isEditing ? "updated" : "added"}`);
        getSubcategory();
        resetForm();
        setShowModal(false);
      } else {
        toast.error("Failed to save subcategory");
      }
    } catch (error) {
      console.error(error);
      toast.error("Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubCategory = (subCategory) => {
    setIsEditing(true);
    setEditingId(subCategory._id);
    setNewSubCategory({
      subcategory: subCategory.subcategory,
      subcatimg: null,
      category: subCategory.category,
    });
    setSelectedCategory(subCategory.category);
    setError("");
    setShowModal(true);
  };

  const handleDeleteSubCategory = async (id) => {
    if (!window.confirm("Are you sure you want to delete?")) return;
    try {
      const response = await axios.delete(
        `${ApiURL}/subcategory/deleteappsubcat/${id}`
      );
      if (response.status === 200) {
        toast.success("Successfully deleted");
        setSelectedRows((prev) => prev.filter((x) => x !== id));
        getSubcategory();
      } else {
        toast.error("Failed to delete subcategory");
      }
    } catch (error) {
      console.error(error.message);
      toast.error("Deletion failed");
    }
  };

  const handleSelectRow = (id) => {
    setSelectedRows((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllRows = (checked) => {
    const currentPageIds = currentItems.map((item) => item._id);
    if (checked) {
      setSelectedRows([...new Set([...selectedRows, ...currentPageIds])]);
    } else {
      setSelectedRows(
        selectedRows.filter((id) => !currentPageIds.includes(id))
      );
    }
  };

  const handleDeleteSelected = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete selected sub-categories?"
      )
    ) {
      return;
    }

    try {
      await Promise.all(
        selectedRows.map((id) =>
          axios.delete(`${ApiURL}/subcategory/deleteappsubcat/${id}`)
        )
      );
      toast.success("Selected sub-categories deleted");
      getSubcategory();
      setSelectedRows([]);
    } catch (err) {
      console.error(err);
      toast.error("Error deleting selected sub-categories");
    }
  };

  const filteredSubCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return subCategories.filter((subCategory) => {
      if (q && !String(subCategory.subcategory || "").toLowerCase().includes(q)) {
        return false;
      }
      if (
        categoryFilter !== "all" &&
        String(subCategory.category || "") !== categoryFilter
      ) {
        return false;
      }
      return true;
    });
  }, [subCategories, searchQuery, categoryFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, itemsPerPage]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filteredSubCategories.slice(
    indexOfFirstItem,
    indexOfLastItem
  );

  const allOnPage =
    currentItems.length > 0 &&
    currentItems.every((item) => selectedRows.includes(item._id));

  return (
    <>
      {/* ---- Filters ---- */}
      <Card className="eq-card mb-3">
        <Card.Body className="eq-filters">
          <div className="eq-search">
            <FaSearch />
            <input
              type="text"
              placeholder="Search sub-categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search sub-categories"
            />
          </div>

          <Form.Select
            className="eq-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat._id} value={cat.category}>
                {cat.category}
              </option>
            ))}
          </Form.Select>

          <div className="eq-filters__end">
            {selectedRows.length > 0 ? (
              <BusyButton
                variant="outline-danger"
                className="eq-ghost"
                onClick={handleDeleteSelected}
              >
                <FaTrashAlt /> Delete {selectedRows.length}
              </BusyButton>
            ) : null}
            <Button
              className="eq-primary"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
            >
              <FaPlus /> Add Sub-Category
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* ---- Table ---- */}
      <Card className="eq-card">
        {selectedRows.length > 0 ? (
          <div className="cl-selbar">
            <span>
              <strong>{selectedRows.length}</strong>{" "}
              {selectedRows.length === 1 ? "sub-category" : "sub-categories"}{" "}
              selected
            </span>
            <button type="button" onClick={() => setSelectedRows([])}>
              Clear
            </button>
          </div>
        ) : null}

        <div className="table-responsive">
          <table className="table eq-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}>
                  <input
                    type="checkbox"
                    onChange={(e) => handleSelectAllRows(e.target.checked)}
                    checked={allOnPage}
                    aria-label="Select all on this page"
                  />
                </th>
                <th>Sub-Category Name</th>
                <th>Category</th>
                <th>Image</th>
                <th style={{ width: "110px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-5 eq-none">
                    No sub-categories found.
                  </td>
                </tr>
              ) : (
                currentItems.map((subCategory) => (
                  <tr key={subCategory._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(subCategory._id)}
                        onChange={() => handleSelectRow(subCategory._id)}
                        aria-label="Select sub-category"
                      />
                    </td>

                    <td>
                      <div className="ms-cat">
                        <span className="ms-cat__icon">
                          <FaTags />
                        </span>
                        <span className="eq-strong">
                          {subCategory.subcategory}
                        </span>
                      </div>
                    </td>

                    <td>
                      {subCategory.category ? (
                        <span className="pm-cat">{subCategory.category}</span>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      <MasterThumb
                        src={imageSrc(subCategory.subcatimg)}
                        alt={subCategory.subcategory}
                      />
                    </td>

                    <td>
                      <div className="eq-actions">
                        <button
                          type="button"
                          className="eq-act is-edit"
                          title="Edit"
                          onClick={() => handleEditSubCategory(subCategory)}
                        >
                          <FaEdit />
                        </button>
                        <button
                          type="button"
                          className="eq-act is-del"
                          title="Delete"
                          onClick={() =>
                            handleDeleteSubCategory(subCategory._id)
                          }
                        >
                          <FaTrashAlt />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filteredSubCategories.length > itemsPerPage ? (
          <div className="eq-foot">
            <label className="eq-perpage">
              <span>Rows</span>
              <Form.Select
                value={itemsPerPage}
                onChange={(e) => setItemsPerPage(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Form.Select>
            </label>

            <Pagination
              totalItems={filteredSubCategories.length}
              itemsPerPage={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        ) : null}
      </Card>

      {/* ---- Add / edit ---- */}
      <Modal
        show={showModal}
        onHide={() => {
          resetForm();
          setShowModal(false);
        }}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {isEditing ? "Edit Sub-Category" : "Add Sub-Category"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error ? <p className="ms-error">{error}</p> : null}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Sub-Category Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter sub-category name"
                name="subcategory"
                value={newSubCategory.subcategory}
                onChange={handleChange}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Category</Form.Label>
              <Form.Select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat._id} value={cat.category}>
                    {cat.category}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>
                Sub-Category Image {isEditing ? "(Optional)" : ""}
              </Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              {newSubCategory.subcatimg ? (
                <div className="ms-preview">
                  <img
                    src={URL.createObjectURL(newSubCategory.subcatimg)}
                    alt="Preview"
                  />
                </div>
              ) : null}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => {
              resetForm();
              setShowModal(false);
            }}
            disabled={saving}
          >
            Cancel
          </Button>
          <BusyButton
            className="eq-primary"
            onClick={handleAddSubCategory}
            disabled={saving}
          >
            {saving ? "Saving..." : isEditing ? "Update" : "Add"}
          </BusyButton>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default SubCategory;
