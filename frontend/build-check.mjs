import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = new URL("./public/", import.meta.url).pathname;
const required = [
  "index.html", "app.html", "endpoint.html", "session.html", "admin.html",
  "app.js", "portal.js", "endpoint.js", "session.js", "admin.js",
  "api-contract.js", "styles.css", "favicon.svg"
];

for (const file of required) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`Missing frontend asset: ${file}`);
}

for (const file of ["app.js", "portal.js", "endpoint.js", "session.js", "admin.js", "api-contract.js"]) {
  execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "inherit" });
}

const contract = fs.readFileSync(path.join(root, "api-contract.js"), "utf8");
if (!contract.includes("export const API") || !contract.includes("export function apiPath")) {
  throw new Error("Browser API contract is missing the canonical API exports");
}

const htmlFiles = ["index.html", "app.html", "endpoint.html", "session.html", "admin.html"];
for (const file of htmlFiles) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  if (!html.includes("/styles.css")) throw new Error(`${file} does not load /styles.css`);
}

console.log(`Frontend build check passed: ${required.length} required assets verified.`);
