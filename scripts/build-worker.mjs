/**
 * Bundles the background-removal Web Worker with esbuild into public/workers/bg-removal.js.
 *
 * Why not `new Worker(new URL(...))` through Next/Turbopack? onnxruntime-web (inside
 * @imgly/background-removal) has its own worker/`import.meta.url` logic that Turbopack's
 * worker bootstrap doesn't handle, so the worker is built as one self-contained ES module.
 * Runs automatically before `dev` and `build`.
 */
import { build } from "esbuild";

const watch = process.argv.includes("--watch");

const options = {
  entryPoints: ["src/workers/bg-removal.worker.ts"],
  outfile: "public/workers/bg-removal.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020", "safari16", "chrome100"],
  minify: !watch,
  sourcemap: false,
  legalComments: "linked",
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
};

if (watch) {
  const { context } = await import("esbuild");
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
