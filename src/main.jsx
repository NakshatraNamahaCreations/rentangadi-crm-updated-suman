import 'bootstrap/dist/css/bootstrap.min.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { rehydrateSession } from './auth';
// Attaches the signed-in token to every API call and signs out on 401.
// Imported for its side effect: it registers two axios interceptors and
// exports nothing. It reads the token per request, not at import, so it does
// not matter that imports run before rehydrateSession() below.
import './authHttp';
import './index.css';
import './theme.css';

// Restores a "keep me signed in" session before the first read of sessionStorage.
rehydrateSession();

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
    <App />
  // {/* </React.StrictMode>, */}
);
