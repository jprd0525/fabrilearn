import React from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./auth-gate.jsx";
import AppShell from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <AuthGate>
    <AppShell />
  </AuthGate>
);
