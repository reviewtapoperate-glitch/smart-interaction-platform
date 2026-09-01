import { API, apiPath } from "/api-contract.js";

const tokenKey = "reviewtap_token";
const state = { config: null, business: null, summary: null, endpoints: [], products: [], branches: [], sessions: [], orders: [], payments: [], staff: [], events: [], integrations: [], quotes: [] };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const money = (minor, currency) => `${escapeHtml(currency || "KES")} ${(Number(minor || 0) / 100).toFixed(2)}`;

function show(message, error = false) {
  const node = $("message");
  if (!node) return;
  node.textContent = message || "";
  node.style.color = error ? "#f29a9a" : "#9fe5c0";
}

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ""}` };
}

async function request(route, { params, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (route.auth === "bearer") headers.Authorization = `Bearer ${localStorage.getItem(tokenKey) || ""}`;
  const response = await fetch(apiPath(route, params), { method: route.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 401) {
    localStorage.removeItem(tokenKey);
    location.assign("/");
    throw new Error("Your session has ended. Please log in again.");
  }
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function safe(route, fallback, options = {}) {
  try { return await request(route, options); } catch (error) { console.warn(apiPath(route, options.params), error); return fallback; }
}

function normalizeUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString(); }
  catch { throw new Error(`Please enter a valid URL: ${raw}`); }
}

function activeOperations() {
  return state.config?.operations || {};
}

function enabled(name) {
  const ops = activeOperations();
  if (name === "payments") return Boolean(ops.pos || ops.ordering || (state.config?.payments || []).length);
  return Boolean(ops[name]);
}

function setView(view) {
  document.querySelectorAll(".rt-view").forEach(node => node.classList.toggle("active", node.id === `view-${view}`));
  document.querySelectorAll(".rt-nav").forEach(node => node.classList.toggle("active", node.dataset.view === view));
  history.replaceState(null, "", `#${view}`);
}

function setupNavigation() {
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => setView(button.dataset.go)));
  const initial = location.hash.replace("#", "");
  setView(initial && document.getElementById(`view-${initial}`) ? initial : "overview");
}

function renderStats() {
  const summary = state.summary || {};
  const ops = activeOperations();
  const showRevenue = enabled("payments");
  const metrics = [
    ["Smart links", summary.endpoints || 0],
    ["Interactions", summary.interactionEvents || 0],
    ...(ops.ordering ? [["Orders", summary.orders || 0]] : []),
    ...(showRevenue ? [["Revenue", money(summary.paidAmountMinor, state.business?.currency)]] : [["Customers", summary.sessions || 0]])
  ];
  $("stats").innerHTML = metrics.map(([label, value]) => `<article class="rt-metric"><div class="label">${label}</div><div class="value">${value}</div></article>`).join("");
}

function renderConditionalNav() {
  document.querySelectorAll("[data-module]").forEach(button => {
    const module = button.dataset.module;
    let visible = true;
    if (module === "catalogue") visible = enabled("ordering") || enabled("inventory");
    if (module === "locations") visible = state.branches.length > 0 || (state.config?.locations || []).length > 0;
    button.hidden = !visible;
  });
}

function renderOverview() {
  const configured = Boolean(state.config);
  $("welcome").textContent = `${state.business?.name || "Your business"} on ReviewTap`;
  const ops = activeOperations();
  const selected = Object.entries(ops).filter(([, value]) => value).map(([key]) => key);
  const nextTitle = $("nextTitle");
  const nextText = $("nextText");
  const nextAction = $("nextAction");
  if (!configured) {
    nextTitle.textContent = "Set up your business";
    nextText.textContent = "Choose the services, payments, integrations and hardware you actually need. Your workspace will adapt to those choices.";
    nextAction.textContent = "Start setup";
    nextAction.dataset.go = "setup";
  } else if (!state.endpoints.length) {
    nextTitle.textContent = "Create your first smart link";
    nextText.textContent = "Your QR test journey starts with a smart link. Create one for a table, room, service, product, event or custom destination.";
    nextAction.textContent = "Create smart link";
    nextAction.dataset.go = "smart";
  } else {
    nextTitle.textContent = "Your workspace is ready";
    nextText.textContent = `${selected.length || 1} configured feature${selected.length === 1 ? "" : "s"} are active. Add more touchpoints or manage the areas enabled for your business.`;
    nextAction.textContent = "Manage smart links";
    nextAction.dataset.go = "smart";
  }
  $("overviewEndpoints").innerHTML = state.endpoints.length ? state.endpoints.slice(0, 4).map(endpointSummary).join("") : `<div class="rt-empty">No smart links yet.</div>`;
  const modules = [];
  const add = (title, description, view) => modules.push(`<article class="rt-module"><div class="rt-panel-kicker">ENABLED</div><h3>${title}</h3><p>${description}</p><button class="secondary" data-go="${view}">Open</button></article>`);
  if (enabled("ordering")) add("Ordering", `${state.orders.length} orders and ${state.sessions.length} customer sessions.`, "orders");
  if (enabled("payments")) add("Payments", `${state.payments.length} payment records available.`, "payments");
  if (enabled("staff")) add("Staff", `${state.staff.length} active team members.`, "staff");
  if (enabled("events")) add("Events", `${state.events.length} events configured.`, "events");
  if (enabled("analytics")) add("Analytics", "Track the customer interactions your selected features generate.", "analytics");
  if ((state.config?.integrations || []).length) add("Integrations", `${state.config.integrations.length} integration option${state.config.integrations.length === 1 ? "" : "s"} selected.`, "integrations");
  $("overviewModules").innerHTML = modules.length ? modules.join("") : `<article class="rt-module"><div class="rt-panel-kicker">KEEP IT SIMPLE</div><h3>Only what you need</h3><p>Select more capabilities in Business setup when you are ready. They will appear here automatically.</p><button class="secondary" data-go="setup">Review setup</button></article>`;
  document.querySelectorAll("[data-go]").forEach(button => button.onclick = () => setView(button.dataset.go));
}

function endpointSummary(endpoint) {
  return `<div class="rt-stat-line"><span>${escapeHtml(endpoint.name)} <span class="rt-chip">${escapeHtml(endpoint.type)}</span></span><strong>${escapeHtml(endpoint.status)}</strong></div>`;
}

function renderList(id, rows, empty, formatter) {
  const node = $(id);
  if (!node) return;
  node.innerHTML = rows.length ? rows.map(formatter).join("") : `<div class="rt-empty">${empty}</div>`;
}

function renderEndpoints() {
  renderList("endpoints", state.endpoints, "No smart links yet. Create your first customer touchpoint above.", endpoint => `<article class="rt-item"><div class="rt-item-main"><div class="rt-item-title">${escapeHtml(endpoint.name)} <span class="rt-chip">${escapeHtml(endpoint.type)}</span></div><div class="rt-item-meta">${escapeHtml(endpoint.code)} · ${escapeHtml(endpoint.status)}</div><div class="rt-item-meta">${escapeHtml(endpoint.publicUrl)}</div></div><div class="rt-item-actions"><a class="secondary" href="${escapeHtml(endpoint.publicUrl)}" target="_blank" rel="noreferrer">Open</a><button class="secondary" data-qr="${endpoint.id}">Download QR</button><button class="secondary" data-destination="${endpoint.id}">Destinations</button></div></article>`);
  document.querySelectorAll("[data-qr]").forEach(button => button.onclick = () => downloadQr(button.dataset.qr));
  document.querySelectorAll("[data-destination]").forEach(button => button.onclick = () => editDestinations(button.dataset.destination));
}

function renderDataLists() {
  renderList("products", state.products, "No products or services yet.", product => `<article class="rt-item"><div class="rt-item-main"><div class="rt-item-title">${escapeHtml(product.name)}</div><div class="rt-item-meta">${money(product.priceMinor, product.currency)} · ${product.active ? "Active" : "Inactive"}</div></div></article>`);
  renderList("branches", state.branches, "No locations yet.", branch => `<article class="rt-item"><div class="rt-item-main"><div class="rt-item-title">${escapeHtml(branch.name)}</div><div class="rt-item-meta">${escapeHtml(branch.code)}${branch.address ? ` · ${escapeHtml(branch.address)}` : ""}</div></div></article>`);
  renderList("sessions", state.sessions, "No customer sessions yet.", session => `<div class="rt-stat-line"><span>${escapeHtml(session.endpoint?.name || "Endpoint")}</span><strong>${escapeHtml(session.status)}</strong></div>`);
  renderList("orders", state.orders, "No orders yet.", order => `<div class="rt-stat-line"><span>${escapeHtml(order.status)} · ${order.items?.length || 0} item${(order.items?.length || 0) === 1 ? "" : "s"}</span><strong>${new Date(order.createdAt).toLocaleString()}</strong></div>`);
  renderList("payments", state.payments, "No payments yet.", payment => `<div class="rt-stat-line"><span>${escapeHtml(payment.provider)} · ${escapeHtml(payment.status)}</span><strong>${money(payment.amountMinor, payment.currency)}</strong></div>`);
  renderList("staff", state.staff, "No additional staff members yet.", person => `<div class="rt-stat-line"><span>${escapeHtml(person.name)}<br><small class="rt-muted">${escapeHtml(person.email)}</small></span><strong>${escapeHtml(person.role)}</strong></div>`);
  renderList("events", state.events, "No events yet.", event => `<div class="rt-stat-line"><span>${escapeHtml(event.name)}<br><small class="rt-muted">${new Date(event.startsAt).toLocaleString()}</small></span><strong>${escapeHtml(event.status || "Scheduled")}</strong></div>`);
  renderList("integrations", state.integrations, "No connected integrations yet.", integration => `<div class="rt-stat-line"><span>${escapeHtml(integration.provider)} · ${escapeHtml(integration.type)}</span><strong class="rt-chip ${integration.active ? "good" : "warn"}">${integration.active ? "Connected" : "Not connected"}</strong></div>`);
}

function renderAnalytics() {
  const s = state.summary || {};
  const cards = [["Customer interactions", s.interactionEvents || 0], ["Smart links", s.endpoints || 0]];
  if (enabled("ordering")) cards.push(["Orders", s.orders || 0]);
  if (enabled("payments")) cards.push(["Successful payments", s.successfulPayments || 0], ["Revenue", money(s.paidAmountMinor, state.business?.currency)]);
  else cards.push(["Customer sessions", s.sessions || 0]);
  $("analyticsCards").innerHTML = cards.map(([label, value]) => `<article class="rt-module"><div class="rt-panel-kicker">LIVE DATA</div><h3>${label}</h3><div class="value" style="font-size:30px;font-weight:900">${value}</div></article>`).join("");
}

function renderSetup() {
  const config = state.config;
  if (!config) return;
  $("businessType").value = config.businessType || "Restaurant";
  const operations = config.operations || {};
  document.querySelectorAll("[data-op]").forEach(input => input.checked = Boolean(operations[input.dataset.op]));
  const payments = config.payments || [];
  document.querySelectorAll("#paymentChoices input").forEach(input => input.checked = payments.includes(input.value));
  const integrations = config.integrations || [];
  document.querySelectorAll("#integrationChoices input").forEach(input => input.checked = integrations.includes(input.value));
  $("nfcRequired").checked = Boolean(config.hardware?.nfc);
  $("qrRequired").checked = config.hardware?.qr !== false;
  $("hardwareQuantity").value = config.hardware?.quantity || "";
  $("locationList").value = (config.locations || []).join(", ");
  $("quotes").innerHTML = state.quotes.length ? state.quotes.map(quote => `<div class="rt-quote"><b>${escapeHtml(quote.status)}</b> · ${escapeHtml(quote.currency)} ${(quote.setupMinor / 100).toFixed(2)} setup · ${escapeHtml(quote.currency)} ${(quote.monthlyMinor / 100).toFixed(2)}/month<br><span class="rt-muted">${escapeHtml(quote.notes || "")}</span>${quote.status === "SENT" ? `<br><button class="primary" data-accept-quote="${quote.id}">Accept quote</button>` : ""}</div>`).join("") : `<div class="rt-empty">No quote yet. Submit your setup and the ReviewTap team can prepare one.</div>`;
  document.querySelectorAll("[data-accept-quote]").forEach(button => button.onclick = async () => { try { await request(API.onboarding.acceptQuote, { params: { id: button.dataset.acceptQuote }, body: {} }); show("Quote accepted."); await load(); } catch (error) { show(error.message, true); } });
}

function renderAll() {
  renderStats(); renderConditionalNav(); renderOverview(); renderEndpoints(); renderDataLists(); renderAnalytics(); renderSetup();
}

async function load() {
  try {
    const [business, summary, config, quotes, endpoints, products, branches] = await Promise.all([
      request(API.business.get), request(API.analytics.summary), request(API.onboarding.get), request(API.onboarding.quotes), request(API.endpoints.list), request(API.products.list), request(API.business.branches)
    ]);
    state.business = business; state.summary = summary; state.config = config; state.quotes = quotes || []; state.endpoints = endpoints || []; state.products = products || []; state.branches = branches || [];
    const ops = config?.operations || {};
    const [sessions, orders, payments, staff, events, integrations] = await Promise.all([
      enabled("ordering") ? safe(API.business.sessions, []) : [],
      enabled("ordering") ? safe(API.business.orders, []) : [],
      enabled("payments") ? safe(API.business.payments, []) : [],
      enabled("staff") ? safe(API.business.staff, []) : [],
      enabled("events") ? safe(API.events.list, []) : [],
      (config?.integrations || []).length ? safe(API.integrations.list, []) : []
    ]);
    state.sessions = sessions || []; state.orders = orders || []; state.payments = payments || []; state.staff = staff || []; state.events = events || []; state.integrations = integrations || [];
    renderAll();
  } catch (error) {
    show(error.message, true);
  }
}

async function editDestinations(id) {
  const endpoint = state.endpoints.find(item => item.id === id); if (!endpoint) return;
  const profile = endpoint.actionProfile || {};
  const reviewUrl = prompt("Google review URL", profile.reviewUrl || ""); if (reviewUrl === null) return;
  const whatsappUrl = prompt("WhatsApp URL", profile.whatsappUrl || ""); if (whatsappUrl === null) return;
  const websiteUrl = prompt("Website URL", profile.websiteUrl || ""); if (websiteUrl === null) return;
  try {
    await request(API.endpoints.update, { params: { id }, body: { actionProfile: { ...profile, reviewUrl: normalizeUrl(reviewUrl), whatsappUrl: normalizeUrl(whatsappUrl), websiteUrl: normalizeUrl(websiteUrl) } } });
    show("Customer destinations updated."); await load();
  } catch (error) { show(error.message, true); }
}

async function downloadQr(id) {
  try {
    const response = await fetch(apiPath(API.endpoints.qr, { id }), { headers: authHeaders() });
    if (!response.ok) throw new Error("Unable to generate the QR code.");
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `reviewtap-${id}.png`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url); show("QR code generated and downloaded.");
  } catch (error) { show(error.message, true); }
}

$("businessForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await request(API.business.update, { body: { name: $("businessName").value.trim(), websiteUrl: normalizeUrl($("websiteUrl").value), googleBusinessUrl: normalizeUrl($("googleBusinessUrl").value), currency: ($("currency").value || "KES").trim().toUpperCase(), timezone: ($("timezone").value || "Africa/Nairobi").trim() } });
    show("Business profile saved."); await load();
  } catch (error) { show(error.message, true); }
});

$("configForm").addEventListener("submit", async event => {
  event.preventDefault();
  const operations = {}; document.querySelectorAll("[data-op]").forEach(input => operations[input.dataset.op] = input.checked);
  const payments = [...document.querySelectorAll("#paymentChoices input:checked")].map(input => input.value);
  const integrations = [...document.querySelectorAll("#integrationChoices input:checked")].map(input => input.value);
  const quantity = Number($("hardwareQuantity").value || 0);
  try {
    await request(API.onboarding.save, { body: { businessType: $("businessType").value, operations, payments, integrations, hardware: { nfc: $("nfcRequired").checked, qr: $("qrRequired").checked, quantity }, locations: $("locationList").value.split(",").map(value => value.trim()).filter(Boolean), staff: { quantity: 0, roles: [] } } });
    show("Setup saved and submitted for quote."); await load(); setView("overview");
  } catch (error) { show(error.message, true); }
});

$("endpointForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    await request(API.endpoints.create, { body: { name: $("endpointName").value.trim(), code: $("endpointCode").value.trim(), type: $("endpointType").value, actionProfile: { allowOrdering: $("allowOrdering").checked } } });
    event.target.reset(); show("Smart link created."); await load(); setView("smart");
  } catch (error) { show(error.message, true); }
});

$("productForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.products.create, { body: { name: $("productName").value.trim(), price: Number($("productPrice").value) } }); event.target.reset(); show("Catalogue item added."); await load(); }
  catch (error) { show(error.message, true); }
});

$("branchForm").addEventListener("submit", async event => {
  event.preventDefault();
  try { await request(API.business.createBranch, { body: { name: $("branchName").value.trim(), code: $("branchCode").value.trim(), address: $("branchAddress").value.trim() || undefined } }); event.target.reset(); show("Location added."); await load(); }
  catch (error) { show(error.message, true); }
});

$("createEvent")?.addEventListener("click", async () => {
  const name = prompt("Event name"); if (!name) return;
  const startsAt = prompt("Start date/time (for example 2026-09-15T18:00:00+03:00)"); if (!startsAt) return;
  try { await request(API.events.create, { body: { name, startsAt } }); show("Event created."); await load(); }
  catch (error) { show(error.message, true); }
});

$("logout").addEventListener("click", () => { localStorage.removeItem(tokenKey); location.assign("/"); });
setupNavigation();
load();
