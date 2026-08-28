import { API, apiPath } from "/api-contract.js";

const tokenKey = "reviewtap_token";
const state = { endpoints: [], config: null };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function show(message, error = false) {
  const node = $("message");
  node.textContent = message || "";
  node.style.color = error ? "#b42318" : "#047857";
}

async function request(route, { params, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (route.auth === "bearer") headers.Authorization = `Bearer ${localStorage.getItem(tokenKey) || ""}`;
  const response = await fetch(apiPath(route, params), {
    method: route.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (response.status === 401) {
    localStorage.removeItem(tokenKey);
    location.assign("/");
    throw new Error("Your session has ended");
  }
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function renderList(id, rows, empty, formatter) {
  const node = $(id);
  if (!node) return;
  node.innerHTML = rows.length ? rows.map(formatter).join("") : `<p>${empty}</p>`;
}

function setFeatureVisible(feature, visible) {
  document.querySelectorAll(`[data-feature="${feature}"]`).forEach(node => {
    node.hidden = !visible;
  });
}

function applyConfiguration(config) {
  state.config = config || {};
  const ops = state.config.operations || {};
  const payments = state.config.payments || [];
  const integrations = state.config.integrations || [];
  const hardware = state.config.hardware || {};

  // A fresh business sees the setup and quote workflow only. Operational modules
  // appear after the client has selected the corresponding capability.
  const configured = Boolean(config);
  const hasEndpoints = configured && (Boolean(hardware.nfc) || Boolean(hardware.qr) || Boolean(ops.ordering) || Boolean(ops.reviews) || Boolean(ops.whatsapp) || Boolean(ops.serviceRequests) || Number(hardware.quantity || 0) > 0);
  const hasCatalogue = configured && (Boolean(ops.ordering) || Boolean(ops.inventory) || ["Restaurant","Hotel","Bar","Cafe","Retail"].includes(state.config.businessType));
  const hasLocations = configured && (Boolean(state.config.locations?.length) || ["Restaurant","Hotel","Retail","Clinic","Salon","Spa","Corporate"].includes(state.config.businessType));
  const hasPayments = configured && payments.length > 0;
  const hasTransactions = configured && (Boolean(ops.pos) || Boolean(ops.ordering));

  setFeatureVisible("endpoints", hasEndpoints);
  setFeatureVisible("catalogue", hasCatalogue);
  setFeatureVisible("locations", hasLocations);
  setFeatureVisible("sessions", configured && (Boolean(ops.ordering) || Boolean(ops.serviceRequests) || Boolean(ops.appointments) || Boolean(ops.reservations)));
  setFeatureVisible("orders", configured && Boolean(ops.ordering));
  setFeatureVisible("payments", hasPayments || hasTransactions);
  setFeatureVisible("revenue", hasTransactions);
  setFeatureVisible("staff", configured && Boolean(ops.staff));
  setFeatureVisible("events", configured && Boolean(ops.events));
  setFeatureVisible("integrations", configured && integrations.length > 0);
  setFeatureVisible("analytics", configured && Boolean(ops.analytics));

  if ($("revenueValue")) $("revenueValue").innerHTML = hasTransactions ? `<div class="price"><div class="eyebrow">Recorded platform transactions</div><div class="amount">${escapeHtml(state.config.currency || "KES")} ${(Number(state.config.paidAmountMinor || 0) / 100).toFixed(2)}</div></div>` : "";
  if ($("analyticsValue")) $("analyticsValue").innerHTML = ops.analytics ? `<p>Analytics will show activity for the capabilities you selected. Your workspace does not expose transaction analytics unless transaction/POS functionality is configured.</p>` : "";
}

function render(data) {
  const { business, summary, endpoints, products, branches, sessions, orders, payments, staff, events, integrations } = data;
  $("welcome").textContent = `${business.name} on ReviewTap`;
  $("businessName").value = business.name || "";
  $("websiteUrl").value = business.websiteUrl || "";
  $("googleBusinessUrl").value = business.googleBusinessUrl || "";
  $("currency").value = business.currency || "KES";
  $("timezone").value = business.timezone || "Africa/Nairobi";

  const stats = [["Live endpoints", summary.endpoints], ["Sessions", summary.sessions], ["Orders", summary.orders], ["Interactions", summary.interactionEvents]];
  $("stats").innerHTML = stats.map(([label, value]) => `<article class="price"><div class="eyebrow">${label}</div><div class="amount">${value}</div></article>`).join("");

  state.endpoints = endpoints;
  renderList("endpoints", endpoints, "No endpoints yet.", e => `<article class="price portal-row"><b>${escapeHtml(e.name)}</b> · ${escapeHtml(e.type)} · ${escapeHtml(e.status)}<br><small>${escapeHtml(e.code)}</small><br><a href="${escapeHtml(e.publicUrl)}" target="_blank" rel="noopener">Open smart link</a> <button class="secondary" data-qr="${e.id}">QR</button> <button class="secondary" data-destination="${e.id}">Destinations</button></article>`);
  renderList("products", products, "No products yet.", p => `<div class="price portal-row"><b>${escapeHtml(p.name)}</b> — ${(p.priceMinor / 100).toFixed(2)} ${escapeHtml(p.currency)} ${p.active ? "" : "(inactive)"}</div>`);
  renderList("branches", branches, "No locations yet.", b => `<div class="price portal-row"><b>${escapeHtml(b.name)}</b> — ${escapeHtml(b.code)} ${b.address ? `· ${escapeHtml(b.address)}` : ""}</div>`);
  renderList("sessions", sessions, "No sessions yet.", s => `<div class="portal-row"><b>${escapeHtml(s.endpoint?.name || "Endpoint")}</b><br>${escapeHtml(s.status)} · ${new Date(s.createdAt).toLocaleString()}</div>`);
  renderList("orders", orders, "No orders yet.", o => `<div class="portal-row"><b>${escapeHtml(o.status)}</b><br>${o.items?.length || 0} items · ${new Date(o.createdAt).toLocaleString()}</div>`);
  renderList("payments", payments, "No payments yet.", p => `<div class="portal-row"><b>${escapeHtml(p.status)}</b><br>${escapeHtml(p.provider)} · ${(p.amountMinor / 100).toFixed(2)} ${escapeHtml(p.currency)}</div>`);
  renderList("staff", staff, "No staff yet.", s => `<div class="portal-row"><b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.email)} · ${escapeHtml(s.role)}</div>`);
  renderList("events", events, "No events yet.", e => `<div class="portal-row"><b>${escapeHtml(e.name)}</b><br>${escapeHtml(e.status)} · ${new Date(e.startsAt).toLocaleString()}</div>`);
  renderList("integrations", integrations, "No integrations connected yet.", i => `<div class="portal-row"><b>${escapeHtml(i.provider)}</b><br>${escapeHtml(i.type)} · ${i.active ? "Connected" : "Not connected"}</div>`);

  document.querySelectorAll("[data-qr]").forEach(button => button.addEventListener("click", () => downloadQr(button.dataset.qr)));
  document.querySelectorAll("[data-destination]").forEach(button => button.addEventListener("click", () => editDestinations(button.dataset.destination)));
}

async function load() {
  try {
    const [business, summary, endpoints, products, branches, sessions, orders, payments, staff, events, integrations, onboarding, quotes] = await Promise.all([
      request(API.business.get), request(API.analytics.summary), request(API.endpoints.list), request(API.products.list), request(API.business.branches),
      request(API.business.sessions), request(API.business.orders), request(API.business.payments), request(API.business.staff), request(API.events.list),
      request(API.integrations.list), request(API.onboarding.get), request(API.onboarding.quotes)
    ]);
    render({ business, summary, endpoints, products, branches, sessions, orders, payments, staff, events, integrations });
    renderOnboarding(onboarding, quotes);
    applyConfiguration(onboarding);
  } catch (error) {
    show(error.message, true);
  }
}

function renderOnboarding(config, quotes) {
  if (config) {
    $("businessType").value = config.businessType || "Restaurant";
    const ops = config.operations || {};
    document.querySelectorAll("[data-op]").forEach(control => control.checked = Boolean(ops[control.dataset.op]));
    const payments = config.payments || [];
    document.querySelectorAll("#paymentChoices input").forEach(control => control.checked = payments.includes(control.value));
    const integrations = config.integrations || [];
    document.querySelectorAll("#integrationChoices input").forEach(control => control.checked = integrations.includes(control.value));
    $("nfcRequired").checked = Boolean(config.hardware?.nfc);
    $("qrRequired").checked = Boolean(config.hardware?.qr);
    $("hardwareQuantity").value = config.hardware?.quantity || "";
    $("locationList").value = (config.locations || []).join(", ");
  }
  $("quotes").innerHTML = quotes.length ? quotes.map(q => `<article class="price portal-row"><b>${escapeHtml(q.status)}</b> · ${escapeHtml(q.currency)} ${(q.setupMinor / 100).toFixed(2)} setup · ${escapeHtml(q.currency)} ${(q.monthlyMinor / 100).toFixed(2)}/month<br>${escapeHtml(q.notes || "")} ${q.status === "SENT" ? `<button class="primary" data-accept-quote="${q.id}">Accept quote</button>` : ""}</article>`).join("") : "<p>No quote yet. Submit your configuration and the ReviewTap team can prepare one.</p>";
  document.querySelectorAll("[data-accept-quote]").forEach(button => button.addEventListener("click", async () => {
    try { await request(API.onboarding.acceptQuote, { params: { id: button.dataset.acceptQuote }, body: {} }); show("Quote accepted."); load(); }
    catch (error) { show(error.message, true); }
  }));
}

async function editDestinations(id) {
  const endpoint = state.endpoints.find(item => item.id === id);
  if (!endpoint) return;
  const current = endpoint.actionProfile || {};
  const reviewUrl = prompt("Google review URL", current.reviewUrl || "");
  if (reviewUrl === null) return;
  const whatsappUrl = prompt("WhatsApp URL", current.whatsappUrl || "");
  if (whatsappUrl === null) return;
  const websiteUrl = prompt("Website URL", current.websiteUrl || "");
  if (websiteUrl === null) return;
  try {
    await request(API.endpoints.update, { params: { id }, body: { actionProfile: { ...current, reviewUrl: reviewUrl || null, whatsappUrl: whatsappUrl || null, websiteUrl: websiteUrl || null } } });
    show("Destinations updated.");
    load();
  } catch (error) { show(error.message, true); }
}

async function downloadQr(id) {
  try {
    const response = await fetch(apiPath(API.endpoints.qr, { id }), { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ""}` } });
    if (!response.ok) throw new Error("Unable to create QR image");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = `reviewtap-${id}.png`; link.click(); URL.revokeObjectURL(url);
  } catch (error) { show(error.message, true); }
}

$("businessForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await request(API.business.update, { body: { name: $("businessName").value, websiteUrl: $("websiteUrl").value || null, googleBusinessUrl: $("googleBusinessUrl").value || null, currency: $("currency").value || "KES", timezone: $("timezone").value || "Africa/Nairobi" } });
    show("Business saved."); load();
  } catch (error) { show(error.message, true); }
});

$("configForm").addEventListener("submit", async event => {
  event.preventDefault();
  const operations = {};
  document.querySelectorAll("[data-op]").forEach(control => operations[control.dataset.op] = control.checked);
  const payments = [...document.querySelectorAll("#paymentChoices input:checked")].map(control => control.value);
  const integrations = [...document.querySelectorAll("#integrationChoices input:checked")].map(control => control.value);
  try {
    await request(API.onboarding.save, { body: { businessType: $("businessType").value, operations, payments, integrations, hardware: { nfc: $("nfcRequired").checked, qr: $("qrRequired").checked, quantity: Number($("hardwareQuantity").value || 0) }, locations: $("locationList").value.split(",").map(value => value.trim()).filter(Boolean), staff: { quantity: 0, roles: [] } } });
    show("Configuration submitted for quote."); load();
  } catch (error) { show(error.message, true); }
});

$("endpointForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.endpoints.create, { body: { name: $("endpointName").value, code: $("endpointCode").value, type: $("endpointType").value, actionProfile: { allowOrdering: $("allowOrdering").checked } } }); event.target.reset(); show("Endpoint created."); load(); }
  catch (error) { show(error.message, true); }
});

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.products.create, { body: { name: $("productName").value, price: Number($("productPrice").value) } }); event.target.reset(); show("Product added."); load(); }
  catch (error) { show(error.message, true); }
});

$("branchForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.business.createBranch, { body: { name: $("branchName").value, code: $("branchCode").value, address: $("branchAddress").value || undefined } }); event.target.reset(); show("Location added."); load(); }
  catch (error) { show(error.message, true); }
});

$("logout").addEventListener("click", () => { localStorage.removeItem(tokenKey); location.assign("/"); });
load();
