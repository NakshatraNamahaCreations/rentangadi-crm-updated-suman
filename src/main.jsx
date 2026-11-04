import 'bootstrap/dist/css/bootstrap.min.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { rehydrateSession } from './auth';
import './index.css';
import './theme.css';

// Restores a "keep me signed in" session before the first read of sessionStorage.
rehydrateSession();

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
    <App />
  // {/* </React.StrictMode>, */}
);
