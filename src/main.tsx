import "@fontsource/commit-mono/400.css";
import "@fontsource/commit-mono/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme"; // before the first paint, so that a picked theme does not flash
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
