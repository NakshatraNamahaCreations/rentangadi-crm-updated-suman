/**
 * Which backend this panel talks to.
 *
 * Our own VPS (newapi.rentangadi.in, behind nginx on the box that also serves
 * newadmin.rentangadi.in), unless VITE_API_HOST says otherwise.
 *
 * The override exists so that working against a local backend does not mean
 * editing this file and remembering to put it back - a commented-out line
 * left uncommented builds a production bundle that talks to localhost, and
 * nothing catches that until the site is live. Put the override in
 * `.env.development.local` instead: Vite loads that only for `npm run dev`
 * and never for `npm run build`, so a build cannot pick it up by accident.
 *
 *   VITE_API_HOST=http://localhost:8000
 */
const HOST = import.meta.env.VITE_API_HOST || "https://newapi.rentangadi.in";

export const ApiURL = `${HOST}/api`;
export const ImageApiURL = HOST;

// Other backends, for reference. Set VITE_API_HOST rather than editing above.
//
//   https://rentangadi-backend-suman.onrender.com   hosted on Render
//   http://localhost:8000                           nodemon in rentangadi-bankend-new-main
//   https://api.rentangadi.in                       the older VPS host
