import crypto from "node:crypto";

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function toMinor(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Invalid monetary amount");
  return Math.round(n * 100);
}

export function fromMinor(value) {
  return Number(value) / 100;
}
