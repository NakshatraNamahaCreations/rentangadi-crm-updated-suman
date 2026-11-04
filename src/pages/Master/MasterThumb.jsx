import React, { useState } from "react";
import { FaImage } from "react-icons/fa";

/**
 * Image cell for the master tables.
 *
 * A stored image can be missing or point at a path that no longer resolves,
 * so the cell falls back to a placeholder instead of leaving the browser's
 * broken-image icon in the row.
 */

const MasterThumb = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span className="ms-thumb ms-thumb--empty" title="No image">
        <FaImage />
      </span>
    );
  }

  return (
    <span className="ms-thumb">
      <img src={src} alt={alt || ""} onError={() => setFailed(true)} />
    </span>
  );
};

export default MasterThumb;
