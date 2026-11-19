import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { applyTheme } from "./app/theme.js";
import { readPreferences } from "./services/preferences.js";
import "./styles.css";

applyTheme(readPreferences().theme);

const rootElement = document.getElementById("root");
if (!rootElement) {
    throw new Error("The War Room root element is missing.");
}

createRoot(rootElement).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
