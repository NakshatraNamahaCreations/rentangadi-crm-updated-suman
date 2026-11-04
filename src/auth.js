/**
 * Session persistence for "Keep me signed in".
 *
 * The whole app reads auth out of sessionStorage, which empties when the tab
 * closes. Rather than rewrite every one of those reads, a remembered session
 * is mirrored into localStorage and copied back into sessionStorage once, on
 * startup, before the first component reads it. Everything downstream keeps
 * working unchanged.
 *
 * Note that a remembered session leaves the admin token on disk until the
 * user signs out, which is the trade-off any "keep me signed in" makes.
 */

const KEYS = ["isLoggedIn", "roles", "token", "permissions"];
const FLAG = "ra.session.persist";

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch (err) {
    /* private mode or blocked storage */
    return fallback;
  }
};

/* Called once before the first render. */
export const rehydrateSession = () => {
  safe(() => {
    if (localStorage.getItem(FLAG) !== "1") return;
    if (sessionStorage.getItem("isLoggedIn")) return; // this tab is already in
    KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) sessionStorage.setItem(k, v);
    });
  });
};

/* Called after a successful sign-in. */
export const persistSession = (remember) => {
  safe(() => {
    if (!remember) {
      clearPersistedSession();
      return;
    }
    localStorage.setItem(FLAG, "1");
    KEYS.forEach((k) => {
      const v = sessionStorage.getItem(k);
      if (v !== null) localStorage.setItem(k, v);
    });
  });
};

export const clearPersistedSession = () => {
  safe(() => {
    localStorage.removeItem(FLAG);
    KEYS.forEach((k) => localStorage.removeItem(k));
  });
};

export const isSessionRemembered = () =>
  safe(() => localStorage.getItem(FLAG) === "1", false);
