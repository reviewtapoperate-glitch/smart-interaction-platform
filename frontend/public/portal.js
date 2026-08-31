import { API, apiPath } from "/api-contract.js";

const tokenKey = "reviewtap_token";
const state = { endpoints: [], config: null, summary: null };
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

function show(message, error = false) { const node = $("message"); node.textContent = message; node.className = error ? "message error" : "message success"; }
async function request(route, { params, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (route.auth === "bearer") headers.Authorization = `Bearer ${localStorage.getItem(tokenKey) || ""}`;
  const r = await fetch(apiPath(route, params), { method: route.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (r.status === 401) { localStorage.removeItem(tokenKey); location.assign("/"); throw new Error("Your session has ended"); }
  const t = await r.text(); let p = {};
  try { p = t ? JSON.parse(t) : {}; } catch { p = { error: t }; }
  if (!r.ok) throw new Error(p.error || "Request failed");
  return p;
}
function renderList(id, rows, empty, formatter) { const node = $(id); if (node) node.innerHTML = rows.length ? rows.map(formatter).join("") : `<p class="empty-state">${empty}</p>`; }

const featureLabels = {
  reviews: "Reviews", whatsapp: "WhatsApp", ordering: "Ordering", reservations: "Reservations", appointments: "Appointments",
  serviceRequests: "Service requests", staff: "Staff", events: "Events", analytics: "Analytics", crm: "CRM", pos: "POS",
  pms: "PMS", inventory: "Inventory", loyalty: "Loyalty"
};

function getOperations(config) { return config?.operations || {}; }
function transactionEnabled(config) {
  const ops = getOperations(config);
  const payments = config?.payments || [];
  return Boolean(ops.ordering || ops.pos || ops.inventory || payments.length || (config?.integrations || []).some(x => ["POS","ACCOUNTING"].includes(x)));
}
function enabledFeatureKeys(config) {
  const ops = getOperations(config);
  return Object.keys(featureLabels).filter(key => Boolean(ops[key]));
}
function applyVisibility(config, summary) {
  state.config = config || {};
  const ops = getOperations(config);
  const paymentOn = transactionEnabled(config);
  const integrationOn = (config?.integrations || []).length > 0;
  const map = { ...ops, payments: paymentOn, revenue: paymentOn, integrations: integrationOn, sessions: true };
  document.querySelectorAll(".feature-dependent[data-feature]").forEach(node => {
    const key = node.dataset.feature;
    node.hidden = !map[key];
  });
  $("insightsNav").hidden = !ops.analytics;
  const featureCards = $("featureCards");
  const keys = enabledFeatureKeys(config);
  featureCards.innerHTML = keys.length ? keys.map(key => `<button class="feature-card" data-scroll-feature="${key}"><span>${escapeHtml(featureLabels[key])}</span><small>Open workspace →</small></button>`).join("") : `<div class="empty-state">Your configured customer experiences will appear here after setup.</div>`;
  featureCards.querySelectorAll("[data-scroll-feature]").forEach(b => b.addEventListener("click", () => { const key = b.dataset.scrollFeature; document.querySelector(`[data-feature="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
  const quick = $("quickActions");
  const actions = [
    ["Create customer touchpoint", "#experience", true],
    ["Continue setup", "#setup", !config || !config.businessType],
    ["View activity", "#operations", true],
    ["Manage insights", "#insights", Boolean(ops.analytics)]
  ].filter(x => x[2]);
  quick.innerHTML = actions.map(([label, href]) => `<a class="quick-action" href="${href}"><strong>${escapeHtml(label)}</strong><span>→</span></a>`).join("");
  if (summary) {
    const cards = [["Customer touchpoints", summary.endpoints], ["Customer activity", summary.sessions], ...(ops.ordering ? [["Orders", summary.orders]] : []), ...(paymentOn ? [["Revenue", `${config?.currency || "KES"} ${(summary.paidAmountMinor / 100).toFixed(2)}`]] : [])];
    $("stats").innerHTML = cards.map(([label, value]) => `<article class="metric-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
    $("revenueValue").textContent = `${config?.currency || "KES"} ${(summary.paidAmountMinor / 100).toFixed(2)}`;
    $("insightSummary").innerHTML = `<div><span>Interactions</span><strong>${summary.interactionEvents}</strong></div><div><span>Customer sessions</span><strong>${summary.sessions}</strong></div><div><span>Orders</span><strong>${summary.orders}</strong></div>`;
  }
}

function render(data) {
  const { business, summary, endpoints, products, branches, sessions, orders, payments, staff, events, integrations } = data;
  state.endpoints = endpoints; state.summary = summary;
  $("welcome").textContent = `${business.name || "Your business"}`;
  $("businessName").value = business.name || ""; $("websiteUrl").value = business.websiteUrl || ""; $("googleBusinessUrl").value = business.googleBusinessUrl || ""; $("currency").value = business.currency || "KES"; $("timezone").value = business.timezone || "Africa/Nairobi";
  renderList("endpoints", endpoints, "No customer touchpoints yet. Create one to start testing QR experiences.", e => `<article class="touchpoint-row"><div><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.type)} · ${escapeHtml(e.status)}</span><small>${escapeHtml(e.code)}</small></div><div class="row-actions"><a class="secondary" href="${escapeHtml(e.publicUrl)}" target="_blank">Test</a><button class="secondary" data-qr="${e.id}">QR</button><button class="secondary" data-destination="${e.id}">Manage</button></div></article>`);
  renderList("products", products, "No products or services yet.", p => `<div class="portal-row"><b>${escapeHtml(p.name)}</b><span>${(p.priceMinor / 100).toFixed(2)} ${escapeHtml(p.currency)} ${p.active ? "" : "· inactive"}</span></div>`);
  renderList("branches", branches, "No locations yet.", b => `<div class="portal-row"><b>${escapeHtml(b.name)}</b><span>${escapeHtml(b.code)} ${b.address ? `· ${escapeHtml(b.address)}` : ""}</span></div>`);
  renderList("sessions", sessions, "No customer activity yet.", s => `<div class="portal-row"><b>${escapeHtml(s.endpoint?.name || "Customer")}</b><span>${escapeHtml(s.status)} · ${new Date(s.createdAt).toLocaleString()}</span></div>`);
  renderList("orders", orders, "No orders yet.", o => `<div class="portal-row"><b>${escapeHtml(o.status)}</b><span>${o.items?.length || 0} items · ${new Date(o.createdAt).toLocaleString()}</span></div>`);
  renderList("payments", payments, "No payments yet.", p => `<div class="portal-row"><b>${escapeHtml(p.status)}</b><span>${escapeHtml(p.provider)} · ${(p.amountMinor / 100).toFixed(2)} ${escapeHtml(p.currency)}</span></div>`);
  renderList("staff", staff, "No staff yet.", s => `<div class="portal-row"><b>${escapeHtml(s.name)}</b><span>${escapeHtml(s.email)} · ${escapeHtml(s.role)}</span></div>`);
  renderList("events", events, "No events yet.", e => `<div class="portal-row"><b>${escapeHtml(e.name)}</b><span>${escapeHtml(e.status)} · ${new Date(e.startsAt).toLocaleString()}</span></div>`);
  renderList("integrations", integrations, "No integrations connected yet.", i => `<div class="portal-row"><b>${escapeHtml(i.provider)}</b><span>${escapeHtml(i.type)} · ${i.active ? "Connected" : "Not connected"}</span></div>`);
  document.querySelectorAll("[data-qr]").forEach(b => b.addEventListener("click", () => downloadQr(b.dataset.qr)));
  document.querySelectorAll("[data-destination]").forEach(b => b.addEventListener("click", () => editDestinations(b.dataset.destination)));
  renderRecentActivity(sessions, orders, payments);
}
function renderRecentActivity(sessions, orders, payments) {
  const items = [...sessions.map(x => ({ t: x.createdAt, text: `${x.endpoint?.name || "Customer"} started a session` })), ...orders.map(x => ({ t: x.createdAt, text: `Order ${x.status.toLowerCase()}` })), ...payments.map(x => ({ t: x.createdAt, text: `Payment ${x.status.toLowerCase()}` }))].sort((a,b) => new Date(b.t) - new Date(a.t)).slice(0, 6);
  $("recentActivity").innerHTML = items.length ? items.map(x => `<div class="activity-item"><span>${escapeHtml(x.text)}</span><small>${new Date(x.t).toLocaleString()}</small></div>`).join("") : `<div class="empty-state">Your recent customer activity will appear here.</div>`;
}
function updateStatus(config, quotes) {
  const quotePending = quotes?.some(q => ["DRAFT","SENT"].includes(q.status));
  const configured = Boolean(config?.businessType);
  const status = $("statusPill");
  status.textContent = quotePending ? "Quote in progress" : configured ? "Workspace ready" : "Setup in progress";
  const next = $("nextAction");
  if (!configured) next.innerHTML = `<div><span class="section-kicker">NEXT STEP</span><h2>Complete your business setup</h2><p>Choose the experiences, payments and integrations you want ReviewTap to handle.</p></div><a class="primary" href="#setup">Continue setup →</a>`;
  else if (quotePending) next.innerHTML = `<div><span class="section-kicker">NEXT STEP</span><h2>Your configuration is being prepared</h2><p>Review your quote when it becomes available, then continue to provisioning.</p></div><a class="secondary" href="#setup">View quote →</a>`;
  else next.innerHTML = `<div><span class="section-kicker">NEXT STEP</span><h2>Your workspace is ready</h2><p>Create a customer touchpoint and test the QR experience before deploying hardware.</p></div><a class="primary" href="#experience">Create touchpoint →</a>`;
}
async function load() {
  try {
    const [business, summary, endpoints, products, branches, sessions, orders, payments, staff, events, integrations, onboarding, quotes] = await Promise.all([request(API.business.get), request(API.analytics.summary), request(API.endpoints.list), request(API.products.list), request(API.business.branches), request(API.business.sessions), request(API.business.orders), request(API.business.payments), request(API.business.staff), request(API.events.list), request(API.integrations.list), request(API.onboarding.get), request(API.onboarding.quotes)]);
    render({ business, summary, endpoints, products, branches, sessions, orders, payments, staff, events, integrations });
    renderOnboarding(onboarding, quotes); updateStatus(onboarding, quotes); applyVisibility(onboarding, summary);
  } catch (e) { show(e.message, true); }
}
function renderOnboarding(config, quotes) {
  if (config) {
    $("businessType").value = config.businessType || "Restaurant"; const ops = config.operations || {};
    document.querySelectorAll("[data-op]").forEach(c => c.checked = Boolean(ops[c.dataset.op]));
    const payments = config.payments || []; document.querySelectorAll("#paymentChoices input").forEach(c => c.checked = payments.includes(c.value));
    const integrations = config.integrations || []; document.querySelectorAll("#integrationChoices input").forEach(c => c.checked = integrations.includes(c.value));
    $("nfcRequired").checked = Boolean(config.hardware?.nfc); $("qrRequired").checked = config.hardware?.qr !== false; $("hardwareQuantity").value = config.hardware?.quantity || ""; $("locationList").value = (config.locations || []).join(", ");
  }
  $("quotes").innerHTML = quotes?.length ? quotes.map(q => `<article class="quote-row"><div><b>${escapeHtml(q.status)}</b><span>${escapeHtml(q.currency)} ${(q.setupMinor / 100).toFixed(2)} setup · ${escapeHtml(q.currency)} ${(q.monthlyMinor / 100).toFixed(2)}/month</span><small>${escapeHtml(q.notes || "")}</small></div>${q.status === "SENT" ? `<button class="primary" data-accept-quote="${q.id}">Accept quote</button>` : ""}</article>`).join("") : `<p class="empty-state">No quote yet. Save your configuration to request one.</p>`;
  document.querySelectorAll("[data-accept-quote]").forEach(b => b.addEventListener("click", async () => { try { await request(API.onboarding.acceptQuote, { params: { id: b.dataset.acceptQuote }, body: {} }); show("Quote accepted."); load(); } catch (e) { show(e.message, true); } }));
}
async function editDestinations(id) { const e = state.endpoints.find(x => x.id === id); if (!e) return; const c = e.actionProfile || {}; const reviewUrl = prompt("Google review URL", c.reviewUrl || ""); if (reviewUrl === null) return; const whatsappUrl = prompt("WhatsApp URL", c.whatsappUrl || ""); if (whatsappUrl === null) return; const websiteUrl = prompt("Website URL", c.websiteUrl || ""); if (websiteUrl === null) return; try { await request(API.endpoints.update, { params: { id }, body: { actionProfile: { ...c, reviewUrl: reviewUrl || null, whatsappUrl: whatsappUrl || null, websiteUrl: websiteUrl || null } } }); show("Customer destinations updated."); load(); } catch (e) { show(e.message, true); } }
async function downloadQr(id) { try { const r = await fetch(apiPath(API.endpoints.qr, { id }), { headers: { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ""}` } }); if (!r.ok) throw new Error("Unable to create QR image"); const url = URL.createObjectURL(await r.blob()); const a = document.createElement("a"); a.href = url; a.download = `reviewtap-${id}.png`; a.click(); URL.revokeObjectURL(url); } catch (e) { show(e.message, true); } }

$("businessForm").addEventListener("submit", async e => { e.preventDefault(); try { await request(API.business.update, { body: { name: $("businessName").value, websiteUrl: $("websiteUrl").value || null, googleBusinessUrl: $("googleBusinessUrl").value || null, currency: $("currency").value || "KES", timezone: $("timezone").value || "Africa/Nairobi" } }); show("Business saved."); load(); } catch (x) { show(x.message, true); } });
$("configForm").addEventListener("submit", async e => { e.preventDefault(); const operations = {}; document.querySelectorAll("[data-op]").forEach(c => operations[c.dataset.op] = c.checked); const payments = [...document.querySelectorAll("#paymentChoices input:checked")].map(c => c.value); const integrations = [...document.querySelectorAll("#integrationChoices input:checked")].map(c => c.value); try { await request(API.onboarding.save, { body: { businessType: $("businessType").value, operations, payments, integrations, hardware: { nfc: $("nfcRequired").checked, qr: $("qrRequired").checked, quantity: Number($("hardwareQuantity").value || 0) }, locations: $("locationList").value.split(",").map(x => x.trim()).filter(Boolean), staff: { quantity: 0, roles: [] } } }); show("Configuration submitted for quote."); load(); } catch (x) { show(x.message, true); } });
$("endpointForm").addEventListener("submit", async e => { e.preventDefault(); try { await request(API.endpoints.create, { body: { name: $("endpointName").value, code: $("endpointCode").value, type: $("endpointType").value, actionProfile: { allowOrdering: $("allowOrdering").checked } } }); e.target.reset(); show("Customer touchpoint created."); load(); } catch (x) { show(x.message, true); } });
$("productForm").addEventListener("submit", async e => { e.preventDefault(); try { await request(API.products.create, { body: { name: $("productName").value, price: Number($("productPrice").value) } }); e.target.reset(); show("Product added."); load(); } catch (x) { show(x.message, true); } });
$("branchForm").addEventListener("submit", async e => { e.preventDefault(); try { await request(API.business.createBranch, { body: { name: $("branchName").value, code: $("branchCode").value, address: $("branchAddress").value || undefined } }); e.target.reset(); show("Location added."); load(); } catch (x) { show(x.message, true); } });
$("logout").addEventListener("click", () => { localStorage.removeItem(tokenKey); location.assign("/"); });
load();
