/**
 * Bundles the main process, the preload scripts, and the local renderer.
 *
 * Preloads run sandboxed, where only CommonJS loads, so everything on the
 * Electron side is emitted as `.cjs` and Electron itself stays external.
 * `ONIRIX_DEFAULT_SERVER` is baked in at build time so a hosted edition can
 * ship pre-pointed at its own server while the open source build starts on
 * localhost.
 *
 * The renderer (the app with no server, see `renderer/`) is a React app built
 * into `dist/renderer`, which is the one directory the shell's `onirix-app://`
 * scheme serves. Nothing in it is fetched at run time: the page has no
 * network access, so scripts, styles, and fonts all ship in that directory.
 *
 * Run directly, this builds everything once. `dev.mjs` imports the same
 * options and keeps them building, so the two cannot drift apart.
 */
import { build } from "esbuild";
import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

export const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
  define: {
    // `||`, not `??`: CI passes an unset repository variable as an empty
    // string, which would otherwise ship a server form with a blank address.
    "process.env.ONIRIX_DEFAULT_SERVER": JSON.stringify(
      process.env.ONIRIX_DEFAULT_SERVER || "http://localhost:3001",
    ),
  },
};

/** Where an installed package keeps its files, wherever pnpm put it. */
function packageDir(name) {
  return dirname(require.resolve(`${name}/package.json`));
}

const FONTS = [
  ["@fontsource-variable/jetbrains-mono", "jetbrains-mono-latin-wght-normal.woff2"],
  ["@fontsource-variable/jetbrains-mono", "jetbrains-mono-latin-ext-wght-normal.woff2"],
];

/**
 * The provider marks, which live once in the dashboard's public folder. The
 * renderer has no asset pipeline, so they are copied beside the page and
 * loaded as plain images, which its `img-src 'self'` policy allows.
 */
const LOGOS = ["openai.svg", "claude.svg", "google.svg", "x-ai.svg"];

/** `dev` trades size for a build worth debugging: readable, mapped, React's warnings on. */
export function rendererOptions({ dev = false } = {}) {
  return {
    entryPoints: ["renderer/main.tsx"],
    outdir: "dist/renderer",
    bundle: true,
    platform: "browser",
    format: "esm",
    // The syntax highlighter loads a grammar per language on demand. With
    // splitting those stay separate files instead of one enormous script.
    splitting: true,
    chunkNames: "chunks/[name]-[hash]",
    jsx: "automatic",
    target: "chrome130",
    minify: !dev,
    // Most of the output is the highlighter's grammars, whose maps would
    // add about 19 MB to every installer. Set ONIRIX_RENDERER_SOURCEMAP to
    // get them back for a debugging session.
    sourcemap: dev || Boolean(process.env.ONIRIX_RENDERER_SOURCEMAP),
    // One line for the entry instead of seven hundred for the grammars.
    logLevel: "warning",
    define: { "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production") },
    // The shared components say "use client" for Next.js. It means nothing
    // here, and esbuild says so once per file.
    logOverride: { "module-level-directive": "silent" },
  };
}

/**
 * Tailwind's own CLI: the stylesheet imports the design system's globals.css,
 * and the classes are collected from the sources it names.
 */
export function tailwindCommand({ watch = false } = {}) {
  return [
    join(packageDir("@tailwindcss/cli"), "dist/index.mjs"),
    "--input",
    "renderer/styles.css",
    "--output",
    "dist/renderer/styles.css",
    ...(watch ? ["--watch"] : ["--minify"]),
  ];
}

/** The shell's own files: main, the two preloads, and the document reader. */
export const SHELL_BUILDS = [
  { entryPoints: ["src/local-preload.ts"], outfile: "dist/local-preload.cjs" },
  { entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" },
  { entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" },
  // Documents are read in a process of their own (see extract-worker.ts), so
  // the parsers are bundled into that file rather than into main.cjs.
  { entryPoints: ["src/extract-worker.ts"], outfile: "dist/extract-worker.cjs" },
].map((entry) => ({ ...shared, ...entry }));

/** An empty `dist/renderer` holding what is copied rather than built. */
export async function prepareRenderer() {
  // Chunk names carry a content hash, so an old build's chunks would pile up
  // beside the new ones and ship in the installer.
  await rm("dist/renderer", { recursive: true, force: true });
  await mkdir("dist/renderer/fonts", { recursive: true });
  await mkdir("dist/renderer/images", { recursive: true });
  // Left behind by builds from before the connect screen was removed.
  await Promise.all(
    ["connect.html", "connect-preload.cjs", "connect-preload.cjs.map"].map((name) =>
      rm(`dist/${name}`, { force: true }),
    ),
  );
  await Promise.all([
    cp("renderer/index.html", "dist/renderer/index.html"),
    ...FONTS.map(([name, file]) =>
      cp(join(packageDir(name), "files", file), join("dist/renderer/fonts", file)),
    ),
    ...LOGOS.map((file) =>
      cp(join("../dashboard/public/images", file), join("dist/renderer/images", file)),
    ),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await prepareRenderer();
  await Promise.all([
    build(rendererOptions()),
    run(process.execPath, tailwindCommand(), { maxBuffer: 16 * 1024 * 1024 }),
    ...SHELL_BUILDS.map((options) => build(options)),
  ]);
}
