/**
 * Bundles the main process and the two preload scripts.
 *
 * Preloads run sandboxed, where only CommonJS loads, so everything is emitted
 * as `.cjs` and Electron itself stays external. `ONIRIX_DEFAULT_SERVER` is
 * baked in at build time so a hosted edition can ship pre-pointed at its own
 * server while the open source build starts on localhost.
 */
import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
  define: {
    // `||`, not `??`: CI passes an unset repository variable as an empty
    // string, which would otherwise ship a connect screen with a blank address.
    "process.env.ONIRIX_DEFAULT_SERVER": JSON.stringify(
      process.env.ONIRIX_DEFAULT_SERVER || "http://localhost:3001",
    ),
  },
};

await mkdir("dist", { recursive: true });

await Promise.all([
  build({ ...shared, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" }),
  build({ ...shared, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" }),
  build({
    ...shared,
    entryPoints: ["src/connect-preload.ts"],
    outfile: "dist/connect-preload.cjs",
  }),
  cp("src/connect.html", "dist/connect.html"),
]);
