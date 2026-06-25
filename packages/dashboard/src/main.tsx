import React from "react";
import { createRoot } from "react-dom/client";
import "./app/styles.css";
import { DashboardApp } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DashboardApp />
  </React.StrictMode>
);
