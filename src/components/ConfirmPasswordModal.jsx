import React, { useEffect, useRef, useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { FaExclamationTriangle, FaLock } from "react-icons/fa";

/**
 * Asks for the signed-in admin's password before something is deleted.
 *
 * Deleting a whole enquiry, quotation or order takes a client's history and
 * the money against it out of the system, and a browser left open is enough
 * for anyone to do it. A token says the browser was logged in once; the
 * password says the person at the keyboard is the one who logged in.
 *
 * The password is only ever handed to the caller, which sends it with the
 * delete request. It is never stored, and it is cleared the moment the
 * dialog closes - including when the delete succeeds - so it cannot be
 * reused by whatever opens next.
 *
 * The backend is what actually enforces this (middleware/confirmPassword.js).
 * This dialog is the way to ask, not the check itself.
 */
const ConfirmPasswordModal = ({
  show,
  onHide,
  onConfirm,
  title = "Confirm deletion",
  message,
  confirmLabel = "Delete",
  busy = false,
  error = "",
}) => {
  const [password, setPassword] = useState("");
  const fieldRef = useRef(null);

  /* Nothing is carried from one deletion to the next. */
  useEffect(() => {
    if (!show) setPassword("");
  }, [show]);

  /* Straight into the field, so confirming is type-and-enter. */
  useEffect(() => {
    if (!show) return undefined;
    const id = setTimeout(() => fieldRef.current?.focus(), 150);
    return () => clearTimeout(id);
  }, [show]);

  const submit = (e) => {
    e.preventDefault();
    if (!password || busy) return;
    onConfirm(password);
  };

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} centered backdrop="static">
      <Form onSubmit={submit}>
        <Modal.Header closeButton={!busy}>
          <Modal.Title style={{ fontSize: "1.05rem", fontWeight: 700 }}>
            <FaExclamationTriangle
              style={{ color: "#D97706", marginRight: 8, marginTop: -3 }}
            />
            {title}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body>
          {message ? (
            <p style={{ marginBottom: 14, color: "#475569" }}>{message}</p>
          ) : null}

          <p
            style={{
              marginBottom: 14,
              fontSize: "0.8125rem",
              color: "#9f1d2b",
              background: "#fef2f3",
              border: "1px solid #fbd3d7",
              borderRadius: 10,
              padding: "9px 12px",
            }}
          >
            This cannot be undone.
          </p>

          <Form.Group controlId="confirmDeletePassword">
            <Form.Label style={{ fontSize: "0.8125rem", fontWeight: 600 }}>
              <FaLock size={11} style={{ marginRight: 6, marginTop: -2 }} />
              Your admin password
            </Form.Label>
            <Form.Control
              ref={fieldRef}
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="Enter your password to confirm"
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              isInvalid={Boolean(error)}
            />
            <Form.Control.Feedback type="invalid">{error}</Form.Control.Feedback>
          </Form.Group>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="light" onClick={onHide} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={!password || busy}>
            {busy ? (
              <>
                <Spinner animation="border" size="sm" /> Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default ConfirmPasswordModal;
