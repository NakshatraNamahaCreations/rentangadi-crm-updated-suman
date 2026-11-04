import { useEffect, useState } from "react";

/**
 * Tracks a media query so a component can render a different layout instead of
 * only restyling one. Defaults to the Bootstrap `md` breakpoint that the rest
 * of the responsive layer in App.css / theme.css is built around.
 */
export default function useIsMobile(query = "(max-width: 767.98px)") {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = (event) => setIsMobile(event.matches);

    setIsMobile(mq.matches);

    // Safari below 14 only has the deprecated listener API.
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [query]);

  return isMobile;
}
