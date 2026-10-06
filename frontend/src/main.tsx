/**
 * src/main.tsx  ← REPLACE your existing main.tsx with this
 * Only change: added ThemeProvider wrapper
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";   // ← NEW
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>          {/* ← NEW */}
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>         {/* ← NEW */}
    </BrowserRouter>
  </React.StrictMode>
);