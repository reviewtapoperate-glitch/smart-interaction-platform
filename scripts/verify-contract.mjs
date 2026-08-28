import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API } from "../contract/api-contract.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(dirname, "../frontend/public");
const contractKeys = new Set();
for (const [group, routes] of Object.entries(API)) {
  for (const key of Object.keys(routes.path ? { route: routes } : routes)) contractKeys.add(`${group}.${key}`);
}

const stalePaths = ["/api/config", "/api/cards", "/api/dashboard", "/api/reseller", "/api/orders", "/api/events", "/api/qr/"];
const files = fs.readdirSync(publicDir).filter(file => file.endsWith(".js"));
const problems = [];
for (const file of files) {
  const source = fs.readFileSync(path.join(publicDir, file), "utf8");
  for (const match of source.matchAll(/API\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g)) {
    if (!contractKeys.has(`${match[1]}.${match[2]}`)) problems.push(`${file}: unknown API key ${match[0]}`);
  }
  for (const stalePath of stalePaths) {
    if (source.includes(stalePath)) problems.push(`${file}: stale route ${stalePath}`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Contract check passed for ${files.length} browser modules.`);
