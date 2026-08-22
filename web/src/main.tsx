import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

// GitHub Pages has no rewrite rule, so a hard refresh on /app/company/RELIANCE
// hits the site 404. That page parks the requested path here and bounces to the
// app shell; this puts the URL back before React Router reads it, so a deep
// link behaves exactly like an in-app navigation.
const parked = sessionStorage.getItem("spa:redirect");
if (parked) {
  sessionStorage.removeItem("spa:redirect");
  if (parked.startsWith(import.meta.env.BASE_URL)) history.replaceState(null, "", parked);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
