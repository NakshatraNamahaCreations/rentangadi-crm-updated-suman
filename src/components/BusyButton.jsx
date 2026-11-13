import React, { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "react-bootstrap";

/**
 * A button that shows it is working.
 *
 * It needs no state from the page: an async `onClick` returns a promise, and
 * this waits on it - spinner shown and the button disabled until it settles.
 * That also stops the double click that used to raise two orders or save the
 * same form twice.
 *
 * A handler that returns nothing (navigation, opening a modal) leaves the
 * button exactly as it was, so this is safe to use anywhere.
 *
 * `busy` can still be passed by a caller that already tracks its own state -
 * the two are OR'd, so an existing "Saving..." label keeps working.
 */
const BusyButton = ({
  onClick,
  busy = false,
  disabled = false,
  children,
  spinnerClassName = "me-2",
  ...rest
}) => {
  const [running, setRunning] = useState(false);
  /* A click can finish after the page has moved on; setting state then would
     warn and change nothing. */
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  const handleClick = async (event) => {
    if (!onClick) return;

    let result;
    try {
      result = onClick(event);
    } catch (err) {
      /* A handler that throws synchronously is the page's business; the
         button simply stops spinning. */
      throw err;
    }

    if (!result || typeof result.then !== "function") return;

    setRunning(true);
    try {
      await result;
    } finally {
      if (alive.current) setRunning(false);
    }
  };

  const working = busy || running;

  return (
    <Button {...rest} disabled={disabled || working} onClick={handleClick}>
      {working ? (
        <Spinner
          as="span"
          animation="border"
          size="sm"
          role="status"
          aria-hidden="true"
          className={spinnerClassName}
        />
      ) : null}
      {children}
    </Button>
  );
};

export default BusyButton;
