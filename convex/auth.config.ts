import type { AuthConfig } from "convex/server";
import { convexAuthProvider } from "@convex-dev/auth/server";

// Convex Auth v2: the deployment signs access tokens itself (ES256, JWKS at
// CONVEX_CLOUD_URL/.well-known/jwks.json), so no JWT_PRIVATE_KEY/JWKS env vars.
export default {
  providers: [convexAuthProvider()],
} satisfies AuthConfig;
