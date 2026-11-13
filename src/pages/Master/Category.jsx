import React, { useEffect, useMemo, useState } from "react";
import { Modal, Button, Form, Card } from "react-bootstrap";
import {
  FaEdit,
  FaTrashAlt,
  FaPlus,
  FaSearch,
  FaLayerGroup,
} from "react-icons/fa";
import axios from "axios";
import { toast } from "react-hot-toast";
import { ApiURL, ImageApiURL } from "../../api.js";
import Pagination from "../../components/Pagination";
import MasterThumb from "./MasterThumb";
import BusyButton from "../../components/BusyButton";

/**
 * Product categories.
 *
 * The record only holds a name and an image, so there is nothing else to show
 * per row. Stored image values are sometimes a bare filename and sometimes a
 * full URL, so `imageSrc` handles both rather than assuming one.
 */

const imageSrc = (value) => {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^(https?:)?\/\//i.test(v) || v.startsWith("data:")) return v;
  return `${ImageApiURL}/category/${v}`;
};

const Category = () => {
  const [showModal, setShowModal] = useState(false);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState({
    categoryName: "",
    categoryImage: "",
    previewImage: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await axios.get(`${ApiURL}/category/getcategory`);
      if (res.status === 200) {
        setCategories(res.data.category || []);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Could not load the categories");
    }
  };

  const filterData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((category) =>
      String(category.category || "").toLowerCase().includes(q)
    );
  }, [categories, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, itemsPerPage]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setNewCategory((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setNewCategory((prev) => ({
        ...prev,
        categoryImage: file,
        previewImage: URL.createObjectURL(file),
      }));
    }
  };

  const handleAddOrEditCategory = async () => {
    if (!newCategory.categoryName || !newCategory.categoryImage) {
      setError("Please fill in both category name and image.");
      return;
    }

    const formData = new FormData();
    formData.append("category", newCategory.categoryName);
    if (newCategory.categoryImage instanceof File) {
      formData.append("categoryImg", newCategory.categoryImage);
    }

    try {
      setSaving(true);
      if (isEditing) {
        await axios.put(`${ApiURL}/category/editcategory/${editingId}`, formData);
        toast.success("Category updated successfully");
      } else {
        await axios({
          url: "/category/addcategory",
          method: "post",
          baseURL: ApiURL,
          data: formData,
        });
        toast.success("Category added successfully");
      }

      fetchCategories();
      setShowModal(false);
      setNewCategory({ categoryName: "", categoryImage: "", previewImage: "" });
      setIsEditing(false);
      setEditingId(null);
      setError("");
    } catch (error) {
      console.error("Error saving the category:", error);
      toast.error("An error occurred");
    } finally {
      setSaving(false);
    }
  };

  const handleEditCategory = (id) => {
    const selected = filterData.find((item) => item._id === id);
    if (!selected) return;
    setNewCategory({
      categoryName: selected.category,
      categoryImage: selected.categoryImg,
      previewImage: imageSrc(selected.categoryImg),
    });
    setIsEditing(true);
    setEditingId(id);
    setError("");
    setShowModal(true);
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm("Are you sure you want to delete?")) return;
    try {
      await axios.delete(`${ApiURL}/category/deletecategory/${id}`);
      toast.success("Category deleted successfully");
      setSelectedRows((prev) => prev.filter((x) => x !== id));
      fetchCategories();
    } catch (error) {
      console.error("Error deleting the category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleDeleteSelected = async () => {
    if (
      !window.confirm("Are you sure you want to delete selected categories?")
    ) {
      return;
    }

    try {
      await Promise.all(
        selectedRows.map((id) =>
          axios.delete(`${ApiURL}/category/deletecategory/${id}`)
        )
      );
      toast.success("Selected categories deleted");
      fetchCategories();
      setSelectedRows([]);
    } catch {
      toast.error("Error deleting selected categories");
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

  const openAddModal = () => {
    setNewCategory({ categoryName: "", categoryImage: "", previewImage: "" });
    setIsEditing(false);
    setEditingId(null);
    setError("");
    setShowModal(true);
  };

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = filterData.slice(indexOfFirstItem, indexOfLastItem);

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
              placeholder="Search categories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search categories"
            />
          </div>

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
            <Button className="eq-primary" onClick={openAddModal}>
              <FaPlus /> Add Category
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
              {selectedRows.length === 1 ? "category" : "categories"} selected
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
                <th>Category Name</th>
                <th>Image</th>
                <th style={{ width: "110px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentItems.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-5 eq-none">
                    No categories found.
                  </td>
                </tr>
              ) : (
                currentItems.map((categoryItem) => (
                  <tr key={categoryItem._id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(categoryItem._id)}
                        onChange={() => handleSelectRow(categoryItem._id)}
                        aria-label="Select category"
                      />
                    </td>

                    <td>
                      <div className="ms-cat">
                        <span className="ms-cat__icon">
                          <FaLayerGroup />
                        </span>
                        <span className="eq-strong">
                          {categoryItem.category}
                        </span>
                      </div>
                    </td>

                    <td>
                      <MasterThumb
                        src={imageSrc(categoryItem.categoryImg)}
                        alt={categoryItem.category}
                      />
                    </td>

                    <td>
                      <div className="eq-actions">
                        <button
                          type="button"
                          className="eq-act is-edit"
                          title="Edit"
                          onClick={() => handleEditCategory(categoryItem._id)}
                        >
                          <FaEdit />
                        </button>
                        <button
                          type="button"
                          className="eq-act is-del"
                          title="Delete"
                          onClick={() => handleDeleteCategory(categoryItem._id)}
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

        {filterData.length > itemsPerPage ? (
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
              totalItems={filterData.length}
              itemsPerPage={itemsPerPage}
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
          </div>
        ) : null}
      </Card>

      {/* ---- Add / edit ---- */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>
            {isEditing ? "Edit Category" : "Add Category"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error ? <p className="ms-error">{error}</p> : null}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Category Name</Form.Label>
              <Form.Control
                type="text"
                placeholder="Enter category name"
                value={newCategory.categoryName}
                onChange={handleChange}
                name="categoryName"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Category Image</Form.Label>
              <Form.Control
                type="file"
                accept="image/*"
                onChange={handleImageChange}
              />
              {newCategory.previewImage ? (
                <div className="ms-preview">
                  <img src={newCategory.previewImage} alt="Preview" />
                </div>
              ) : null}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => setShowModal(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <BusyButton
            className="eq-primary"
            onClick={handleAddOrEditCategory}
            disabled={saving}
          >
            {saving ? "Saving..." : isEditing ? "Update" : "Add"}
          </BusyButton>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default Category;
