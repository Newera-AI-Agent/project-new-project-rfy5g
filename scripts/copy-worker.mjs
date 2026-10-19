// Copies the pdf.js worker into /public so it is served as a static asset and
// loaded off the main thread (requirement R39: off-screen/worker rendering).
import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const pub = resolve(root, "public");

const candidates = [
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.mjs",
];

const dest = resolve(pub, "pdf.worker.min.mjs");
mkdirSync(pub, { recursive: true });

const src = candidates.map((c) => resolve(root, c)).find((c) => existsSync(c));
if (!src) {
  console.warn("[copy-worker] pdfjs-dist worker not found — run npm install first.");
  process.exit(0);
}
copyFileSync(src, dest);
console.log(`[copy-worker] ${src.replace(root + "/", "")} -> public/pdf.worker.min.mjs`);