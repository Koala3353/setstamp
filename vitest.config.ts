import fs from "node:fs";
import { defineConfig, type Plugin } from "vitest/config";

// Convex's bundler turns `import m from "x.wasm"` into a WebAssembly.Module
// (Convex Auth's password hashing relies on it). Mirror that for tests.
const wasmModule: Plugin = {
  name: "wasm-as-module",
  enforce: "pre",
  load(id) {
    if (!id.endsWith(".wasm")) return null;
    const b64 = fs.readFileSync(id).toString("base64");
    return `const b = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));\nexport default new WebAssembly.Module(b);`;
  },
};

// Two projects: app/unit tests in Node, Convex backend tests in the
// edge-runtime environment that convex-test requires.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "app",
          include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [wasmModule],
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          testTimeout: 60_000, // argon2 hashing in wasm is slow
          // Convex Auth validates token issuers against this deployment URL.
          env: { CONVEX_CLOUD_URL: "https://test.convex.cloud", CONVEX_SITE_URL: "https://test.convex.site" },
          server: { deps: { inline: ["convex-test", "@convex-dev/auth", "password-hash-wasm"] } },
        },
      },
    ],
  },
});
