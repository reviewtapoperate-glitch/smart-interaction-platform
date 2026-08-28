import { API, apiPath } from "/api-contract.js";

const tokenKey = "reviewtap_token";
const state = { endpoints: [] };
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

function show(message, isError = false) {
  const node = document.getElementById("message");
  node.textContent = message;
  node.style.color = isError ? "#b42318" : "#047857";
}

async function request(route, { params, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (route.auth === "bearer") headers.Authorization = `Bearer ${localStorage.getItem(tokenKey) || ""}`;
  const response = await fetch(apiPath(route, params), { method: route.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) {
    localStorage.removeItem(tokenKey);
    location.assign("/");
    throw new Error("Your session has ended");
  }
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function render({ business, summary, endpoints, products, branches }) {
  document.getElementById("welcome").textContent = `${business.name} on ReviewTap`;
  businessName.value = business.name;
  websiteUrl.value = business.websiteUrl || "";
  googleBusinessUrl.value = business.googleBusinessUrl || "";
  const stats = [["Live endpoints", summary.endpoints], ["Sessions", summary.sessions], ["Orders", summary.orders], ["Interactions", summary.interactionEvents]];
  document.getElementById("stats").innerHTML = stats.map(([label, amount]) => `<article class="price"><div class="eyebrow">${label}</div><div class="amount">${amount}</div></article>`).join("");
  state.endpoints = endpoints;
  document.getElementById("endpoints").innerHTML = endpoints.length ? endpoints.map(endpoint => `<article class="price" style="margin:12px 0"><b>${escapeHtml(endpoint.name)}</b> · ${escapeHtml(endpoint.type)} · <a href="${escapeHtml(endpoint.publicUrl)}" target="_blank">Open smart link</a><br><small>${escapeHtml(endpoint.code)} · ${endpoint.status}</small><div style="margin-top:12px"><button class="secondary" data-destination="${endpoint.id}">Edit destinations</button> <button class="secondary" data-qr="${endpoint.id}">Download QR</button></div></article>`).join("") : "<p>No endpoints yet.</p>";
  document.getElementById("products").innerHTML = products.length ? products.map(product => `<div class="price" style="margin:10px 0"><b>${escapeHtml(product.name)}</b> — ${(product.priceMinor / 100).toFixed(2)} ${escapeHtml(product.currency)} ${product.active ? "" : "(inactive)"}</div>`).join("") : "<p>No products yet.</p>";
  document.getElementById("branches").innerHTML = branches.length ? branches.map(branch => `<div class="price" style="margin:10px 0"><b>${escapeHtml(branch.name)}</b> — ${escapeHtml(branch.code)}${branch.address ? ` · ${escapeHtml(branch.address)}` : ""}</div>`).join("") : "<p>No locations yet.</p>";
  document.querySelectorAll("[data-destination]").forEach(button => button.addEventListener("click", () => editDestinations(button.dataset.destination)));
  document.querySelectorAll("[data-qr]").forEach(button => button.addEventListener("click", () => downloadQr(button.dataset.qr)));
}

async function load() {
  try {
    const [business, summary, endpoints, products, branches] = await Promise.all([
      request(API.business.get), request(API.analytics.summary), request(API.endpoints.list), request(API.products.list), request(API.business.branches)
    ]);
    render({ business, summary, endpoints, products, branches });
  } catch (error) { show(error.message, true); }
}

async function editDestinations(endpointId) {
  const endpoint = state.endpoints.find(candidate => candidate.id === endpointId);
  if (!endpoint) return;
  const current = endpoint.actionProfile || {};
  const reviewUrl = prompt("Google review URL (leave blank to remove)", current.reviewUrl || "");
  if (reviewUrl === null) return;
  const whatsappUrl = prompt("WhatsApp URL, for example https://wa.me/254... (leave blank to remove)", current.whatsappUrl || "");
  if (whatsappUrl === null) return;
  const website = prompt("Website URL (leave blank to remove)", current.websiteUrl || "");
  if (website === null) return;
  try {
    await request(API.endpoints.update, { params: { id: endpointId }, body: {
      actionProfile: { ...current, reviewUrl: reviewUrl || null, whatsappUrl: whatsappUrl || null, websiteUrl: website || null }
    } });
    show("Smart-link destinations updated.");
    load();
  } catch (error) { show(error.message, true); }
}

async function downloadQr(endpointId) {
  try {
    const response = await fetch(apiPath(API.endpoints.qr, { id: endpointId }), { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ""}` } });
    if (!response.ok) throw new Error("Unable to create QR image");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = "reviewtap-qr.png"; link.click(); URL.revokeObjectURL(url);
  } catch (error) { show(error.message, true); }
}

businessForm.addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.business.update, { body: { name: businessName.value, websiteUrl: websiteUrl.value || null, googleBusinessUrl: googleBusinessUrl.value || null } }); show("Business saved."); load(); } catch (error) { show(error.message, true); }
});
endpointForm.addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.endpoints.create, { body: { name: endpointName.value, code: endpointCode.value, type: endpointType.value, actionProfile: { reviewUrl: googleBusinessUrl.value || undefined, websiteUrl: websiteUrl.value || undefined, allowOrdering: allowOrdering.checked } } }); endpointForm.reset(); show("Smart endpoint created."); load(); } catch (error) { show(error.message, true); }
});
productForm.addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.products.create, { body: { name: productName.value, price: Number(productPrice.value) } }); productForm.reset(); show("Product added."); load(); } catch (error) { show(error.message, true); }
});
branchForm.addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.business.createBranch, { body: { name: branchName.value, code: branchCode.value, address: branchAddress.value || undefined } }); branchForm.reset(); show("Location added."); load(); } catch (error) { show(error.message, true); }
});
logout.addEventListener("click", () => { localStorage.removeItem(tokenKey); location.assign("/"); });
load();
