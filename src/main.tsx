// First: attaches the beforeinstallprompt / appinstalled listeners before anything can fire them.
import "./features/settings/install";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { api } from "../convex/_generated/api";
import "./styles/global.css";
import "./app/app.css";
import "./features/auth/auth.css";
import { App } from "./app/App";

if (import.meta.env.DEV) (await import("./app/qaOffline")).installQaOffline();

const root = document.getElementById("root");
if (!root) throw new Error("#root missing from index.html");

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!convexUrl) throw new Error("VITE_CONVEX_URL is not set (run `npx convex dev` to create .env.local)");
const convex = new ConvexReactClient(convexUrl);

createRoot(root).render(
  <StrictMode>
    <ConvexAuthProvider
      client={convex}
      api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, isAuthenticated: api.auth.isAuthenticated }}
    >
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
