import React from "react";
import { createRoot } from "react-dom/client";
import { RootGate } from "./auth-staff.jsx";
import "./index.css";

// RootGate chooses between the staff (phone-OTP) experience and the existing
// admin app (engine AuthGate + AppShell), based on how the person signs in.
createRoot(document.getElementById("root")).render(<RootGate />);
