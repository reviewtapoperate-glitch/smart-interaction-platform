// Canonical API base shared by the ReviewTap backend and browser clients.
// Keep this file dependency-free so it can be imported from any service path.
export const API_ROOT = "/api";

export function apiPath(path = "", params = {}) {
  let output = `${API_ROOT}${path.startsWith("/") ? path : `/${path}`}`;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    output = output.replace(`:${key}`, encodeURIComponent(String(value)));
  }
  return output;
}
