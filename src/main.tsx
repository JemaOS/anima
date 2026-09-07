// Copyright (c) 2025 Jema Technology.
// Distributed under the license specified in the root directory of this project.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { I18nProvider } from "./i18n";
import "./index.css";
import App from "./App.tsx";
import { registerSW } from "./registerSW";

registerSW();

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <App />
        </I18nProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
