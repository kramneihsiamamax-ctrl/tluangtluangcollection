// @ts-check
// Serwist "configurator" mode: `serwist build` runs after `next build`
// and works with Turbopack (the Next.js 16 default bundler).
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});
