import axios from "axios";
import { clearPersistedSession } from "./auth";
import { ApiURL } from "./api";

/**
 * Sends the signed-in admin's token with every request, and sends the user
 * back to the login screen when the API says it is no longer good.
 *
 * Forty-four files call axios directly, and until now six of them attached
 * the token by hand while the rest sent nothing - which was fine only because
 * the API asked for nothing. Now that it does, attaching it in each of those
 * files would mean forty-four chances to forget. These interceptors sit on
 * the default axios instance, which every one of those files uses, so there
 * is one place to get right and nothing for a new screen to remember.
 *
 * Imported for its side effect from main.jsx, before the first render.
 */

/* The token is in sessionStorage; auth.js copies a remembered one back into
   it on startup, so there is only ever this one place to read. */
const tokenOf = () => {
  try {
    return sessionStorage.getItem("token");
  } catch (err) {
    /* Blocked storage reads as signed out, which the 401 below then handles. */
    return null;
  }
};

/* Only our own API. A request to Cloudinary or anywhere else has no business
   carrying a staff token, and sending it would leak it to that third party. */
const isOurApi = (url) => {
  if (!url) return false;
  if (url.startsWith(ApiURL)) return true;
  /* Relative paths resolve against our own origin. */
  return !/^https?:\/\//i.test(url);
};

axios.interceptors.request.use((config) => {
  const token = tokenOf();
  if (!token || !isOurApi(config.url)) return config;

  config.headers = config.headers || {};
  /* A call that set the header itself keeps what it set: some of them send a
     different token on purpose, and this should not second-guess them. */
  if (!config.headers.Authorization && !config.headers.authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* Set while the redirect is in flight, so twelve parallel calls on one screen
   do not each clear the session and navigate. */
let signingOut = false;

const signOut = () => {
  if (signingOut) return;
  signingOut = true;

  try {
    sessionStorage.clear();
  } catch (err) {
    /* Nothing to clear; the redirect still has to happen. */
  }
  clearPersistedSession();

  /* A full load rather than a router navigate: this module has no router, and
     after an expired token the cleanest thing is a clean slate. */
  if (!/\/login\/?$/i.test(window.location.pathname)) {
    window.location.assign("/login");
  }
};

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url;

    /* 403 is a role refusal - the user is signed in, just not allowed here -
       so it is left to the screen to report rather than treated as expiry. */
    if (status === 401 && isOurApi(url)) signOut();

    return Promise.reject(error);
  }
);
