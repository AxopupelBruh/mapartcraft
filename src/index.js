import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter as Router, Switch, Route } from "react-router-dom";

import FAQ from "./components/faq";
import Root from "./components/root";

import "./index.css";

// The app is served both from the domain root (local/Tailscale) and from a
// GitHub Pages project subdirectory. Derive the router basename from the
// current document URL instead of hard-coding either case.
const appBasePath = new URL(document.baseURI).pathname.replace(/\/+$/, "");
const basename = appBasePath || "/";
const appBaseUrl = `${window.location.origin}${basename === "/" ? "/" : basename + "/"}`;

// GitHub Pages serves 404.html for deep links. That page sends the original
// path back here as a query parameter; restore it before React Router starts.
try {
  const redirectParams = new URLSearchParams(window.location.search);
  const redirectTarget = redirectParams.get("spa-redirect");
  if (redirectTarget && redirectTarget.startsWith("/")) {
    window.history.replaceState(null, "", redirectTarget);
  }
} catch (error) {
  console.warn("Could not restore the deep link", error);
}

ReactDOM.render(
  <React.StrictMode>
    <Router basename={basename}>
      <Switch>
        <Route path="/:countryCode?/faq" component={FAQ} />
        <Route path="/:countryCode?" component={Root} />
      </Switch>
    </Router>
  </React.StrictMode>,
  document.getElementById("root")
);

// PWA: the app shell is cached by public/sw.js after the first load. Projects
// and exports remain local-only in IndexedDB / the user's chosen folder.
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    const swUrl = new URL("sw.js", appBaseUrl).href;
    navigator.serviceWorker.register(swUrl).catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
