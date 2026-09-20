import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { TooltipProvider } from "@onirix/ui/components/tooltip";
import { applyStoredAppearance } from "@onirix/ui/lib/appearance";

import { App } from "./app";

// The person's colours, fonts and contrast, put back before anything is drawn
// so the window never shows the defaults for a frame first.
applyStoredAppearance();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </StrictMode>,
  );
}
