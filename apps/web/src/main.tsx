import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Theme } from "@radix-ui/themes";
import "@radix-ui/themes/styles.css";
import "@fontsource-variable/manrope";
import { App } from "./App";
import { ErrorBoundary } from "./components/UI";
import { LocaleProvider } from "./lib/i18n";
import "./styles.css";
const root = document.getElementById("root");
if (root === null) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <Theme accentColor="teal" grayColor="sage" radius="medium" scaling="100%">
      <LocaleProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </LocaleProvider>
    </Theme>
  </StrictMode>,
);
