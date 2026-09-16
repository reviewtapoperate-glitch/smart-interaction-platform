import { API, apiPath } from "/api-contract.js";

const tokenKey = "reviewtap_token";
const state = { endpoint: null, profile: {}, business: null };
const $ = id => document.getElementById(id);
const socialPlatforms = ["Instagram", "Facebook", "TikTok", "LinkedIn", "YouTube", "X", "Threads", "Telegram", "Website", "Other"];
const profileTypes = ["Person", "Creator", "Professional", "Business", "Restaurant", "Shop", "Salon", "Organization", "Event", "Custom"];
const presets = {
  Person: ["contact", "social"], Creator: ["contact", "social"], Professional: ["contact", "social", "gallery"],
  Business: ["contact", "social", "payment", "gallery", "hours"], Restaurant: ["contact", "social", "payment", "menu", "gallery", "hours"],
  Shop: ["contact", "social", "payment", "menu", "gallery", "hours"], Salon: ["contact", "social", "payment", "gallery", "hours"],
  Organization: ["contact", "social", "gallery"], Event: ["contact", "social", "gallery", "hours"], Custom: ["contact", "social", "payment", "menu", "gallery", "hours"]
};
function show(message, error = false) { $("message").textContent = message || ""; $("message").style.color = error ? "#f29a9a" : "#9fe5c0"; }
function authHeaders() { return { Authorization: `Bearer ${localStorage.getItem(tokenKey) || ""}` }; }
async function request(route, { params, body } = {}) {
  const headers = { "Content-Type": "application/json", ...authHeaders() };
  const response = await fetch(apiPath(route, params), { method: route.method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (response.status === 401) { localStorage.removeItem(tokenKey); location.assign("/"); throw new Error("Your session has ended. Please log in again."); }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
function normalizeUrl(value) { const raw = String(value || "").trim(); if (!raw) return null; try { return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).toString(); } catch { throw new Error(`Invalid URL: ${raw}`); } }
function slugify(value) { return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "profile"; }
async function imageToDataUrl(file) {
  if (!file) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error("Please choose an image smaller than 8 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const img = new Image(); img.onload = () => { const max = 720, scale = Math.min(1, max / Math.max(img.width, img.height)); const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.width * scale)); canvas.height = Math.max(1, Math.round(img.height * scale)); canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL("image/jpeg", .58)); }; img.onerror = () => reject(new Error("Could not read image.")); img.src = reader.result; }; reader.onerror = () => reject(new Error("Could not read image.")); reader.readAsDataURL(file);
  });
}
function setField(id, value) { if ($(id)) $(id).value = value ?? ""; }
function renderSocialFields() {
  const social = state.profile.social || {};
  $("socialFields").innerHTML = socialPlatforms.map(platform => { const key = platform.toLowerCase().replace(/[^a-z0-9]+/g, ""); return `<label>${platform}<input data-social="${key}" placeholder="https://..."></label>`; }).join("");
  socialPlatforms.forEach(platform => { const key = platform.toLowerCase().replace(/[^a-z0-9]+/g, ""); const input = document.querySelector(`[data-social="${key}"]`); if (input) input.value = social[key] || ""; });
}
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }
function menuRow(item = {}) {
  const row = document.createElement("div"); row.className = "rt-panel"; row.style.marginBottom = "12px";
  row.innerHTML = `<div class="rt-form-row"><label>Item name<input data-menu-name value="${escapeAttr(item.name)}"></label><label>Category<input data-menu-category value="${escapeAttr(item.category)}" placeholder="e.g. Main"></label><label>Price<input data-menu-price value="${escapeAttr(item.price)}" placeholder="Optional"></label></div><label>Description<textarea data-menu-description rows="2">${escapeHtml(item.description)}</textarea></label><label>Photo<input data-menu-photo type="file" accept="image/jpeg,image/png,image/webp"></label><img data-menu-preview style="max-width:140px;max-height:90px;border-radius:12px;display:${item.image ? "block" : "none"}" src="${escapeAttr(item.image)}" alt="Menu item photo"><button type="button" class="ghost" data-remove>Remove</button>`;
  row.querySelector("[data-menu-preview]").dataset.value = item.image || "";
  row.querySelector("[data-remove]").onclick = () => row.remove();
  row.querySelector("[data-menu-photo]").onchange = async e => { try { const data = await imageToDataUrl(e.target.files[0]); const preview = row.querySelector("[data-menu-preview]"); preview.src = data; preview.dataset.value = data; preview.style.display = "block"; } catch (error) { show(error.message, true); } };
  $("menuItems").append(row);
}
function galleryRow(item = {}) {
  const row = document.createElement("div"); row.className = "rt-panel"; row.style.marginBottom = "12px";
  row.innerHTML = `<label>Photo<input data-gallery-photo type="file" accept="image/jpeg,image/png,image/webp"></label><label>Caption<input data-gallery-caption value="${escapeAttr(item.caption)}"></label><img data-gallery-preview style="max-width:180px;max-height:120px;border-radius:12px;display:${item.image ? "block" : "none"}" src="${escapeAttr(item.image)}" alt="Gallery preview"><button type="button" class="ghost" data-remove>Remove</button>`;
  row.querySelector("[data-gallery-preview]").dataset.value = item.image || "";
  row.querySelector("[data-remove]").onclick = () => row.remove();
  row.querySelector("[data-gallery-photo]").onchange = async e => { try { const data = await imageToDataUrl(e.target.files[0]); const preview = row.querySelector("[data-gallery-preview]"); preview.src = data; preview.dataset.value = data; preview.style.display = "block"; } catch (error) { show(error.message, true); } };
  $("galleryItems").append(row);
}
function applyPresetVisibility() {
  const type = $("profileType").value || "Business";
  const allowed = new Set(presets[type] || presets.Custom);
  document.querySelectorAll("[data-profile-section]").forEach(section => {
    const key = section.dataset.profileSection;
    const hasData = key === "menu" ? Boolean((state.profile.menu || []).length) : key === "gallery" ? Boolean((state.profile.gallery || []).length) : key === "payment" ? Boolean(state.profile.paybill) : false;
    section.hidden = !allowed.has(key) && !hasData;
  });
}
function render() {
  const p = state.profile;
  setField("fullName", p.fullName || state.business?.name || ""); setField("linkId", p.linkId || state.endpoint?.publicToken || state.endpoint?.code || slugify(state.business?.name));
  setField("title", p.title || ""); setField("profileType", p.profileType || "Business"); setField("phone", p.phone || ""); setField("whatsapp", p.whatsapp || ""); setField("whatsappMessage", p.whatsappMessage || "Hi, I found you on ReviewTap.");
  setField("reviewUrl", p.reviewUrl || state.business?.googleBusinessUrl || ""); setField("directionsUrl", p.directionsUrl || ""); setField("websiteUrl", p.websiteUrl || state.business?.websiteUrl || ""); setField("address", p.address || "");
  setField("paybill", p.paybill || ""); setField("paybillLabel", p.paybillLabel || "Till / Paybill"); setField("menuLabel", p.menuLabel || "Menu"); setField("galleryLabel", p.galleryLabel || "Gallery");
  setField("theme", p.theme || "1"); setField("coverMode", p.coverMode || "cover"); setField("coverDarkness", p.coverDarkness ?? 25); $("darknessValue").textContent = `${$("coverDarkness").value}%`;
  setField("openTime", p.openTime || ""); setField("closeTime", p.closeTime || ""); $("showHours").checked = Boolean(p.showHours); renderSocialFields(); $("menuItems").innerHTML = ""; (p.menu || []).slice(0, 20).forEach(menuRow); $("galleryItems").innerHTML = ""; (p.gallery || []).slice(0, 12).forEach(galleryRow); renderImages(); applyPresetVisibility(); updatePreview();
}
function renderImages() { const items = []; if (state.profile.profilePhoto) items.push(`<div><small>Profile photo</small><img src="${escapeAttr(state.profile.profilePhoto)}" alt="Profile photo" style="width:100%;max-height:180px;object-fit:cover;border-radius:14px"></div>`); if (state.profile.coverPhoto) items.push(`<div><small>Cover photo</small><img src="${escapeAttr(state.profile.coverPhoto)}" alt="Cover photo" style="width:100%;max-height:180px;object-fit:cover;border-radius:14px"></div>`); $("imagePreview").innerHTML = items.join(""); }
function updatePreview() { const id = $("linkId").value.trim(); $("preview").href = id ? `/e/${encodeURIComponent(id)}` : "/"; }
async function ensureEndpoint() {
  const endpoints = await request(API.endpoints.list);
  const existing = endpoints.find(e => e.type === "CUSTOM" || e.actionProfile?.profileType);
  if (existing) { state.endpoint = existing; state.profile = existing.actionProfile || {}; return; }
  const name = state.business?.name || "My ReviewTap page", linkId = slugify(name);
  state.endpoint = await request(API.endpoints.create, { body: { name, code: linkId, type: "CUSTOM", actionProfile: { fullName: name, linkId, profileType: "Business" } } });
  state.profile = state.endpoint.actionProfile || {};
}
async function load() { try { state.business = await request(API.business.get); await ensureEndpoint(); render(); } catch (error) { show(error.message, true); } }
$("profileType").innerHTML = profileTypes.map(type => `<option value="${type}">${type}</option>`).join("");
$("profileType").addEventListener("change", () => { applyPresetVisibility(); show(`Showing the sections commonly used by ${$("profileType").value}. Existing content is never removed.`); });
$("coverDarkness").addEventListener("input", () => $("darknessValue").textContent = `${$("coverDarkness").value}%`);
$("linkId").addEventListener("input", updatePreview); $("addMenu").onclick = () => { if (document.querySelectorAll("#menuItems > .rt-panel").length < 20) menuRow(); else show("You can add up to 20 menu items in this editor.", true); }; $("addGallery").onclick = () => { if (document.querySelectorAll("#galleryItems > .rt-panel").length < 12) galleryRow(); else show("You can add up to 12 gallery photos in this editor.", true); };
$("profilePhoto").onchange = async e => { try { state.profile.profilePhoto = await imageToDataUrl(e.target.files[0]); renderImages(); } catch (error) { show(error.message, true); } };
$("coverPhoto").onchange = async e => { try { state.profile.coverPhoto = await imageToDataUrl(e.target.files[0]); renderImages(); } catch (error) { show(error.message, true); } };
$("cancel").onclick = () => render(); $("logout").onclick = () => { localStorage.removeItem(tokenKey); location.assign("/"); };
$("profileForm").addEventListener("submit", async e => {
  e.preventDefault(); show("Publishing…");
  try {
    const social = {}; document.querySelectorAll("[data-social]").forEach(input => { if (input.value.trim()) social[input.dataset.social] = normalizeUrl(input.value); });
    const menu = []; document.querySelectorAll("#menuItems > .rt-panel").forEach(row => { const name = row.querySelector("[data-menu-name]").value.trim(); if (!name) return; menu.push({ name, category: row.querySelector("[data-menu-category]").value.trim(), price: row.querySelector("[data-menu-price]").value.trim(), description: row.querySelector("[data-menu-description]").value.trim(), image: row.querySelector("[data-menu-preview]").dataset.value || null }); });
    const gallery = []; document.querySelectorAll("#galleryItems > .rt-panel").forEach(row => { const image = row.querySelector("[data-gallery-preview]").dataset.value; if (image) gallery.push({ image, caption: row.querySelector("[data-gallery-caption]").value.trim() }); });
    const linkId = $("linkId").value.trim(); if (!/^[A-Za-z0-9-]{1,80}$/.test(linkId)) throw new Error("Link ID may contain only letters, numbers and dashes.");
    const profile = { ...state.profile, fullName: $("fullName").value.trim(), linkId, title: $("title").value.trim(), profileType: $("profileType").value, phone: $("phone").value.trim(), whatsapp: $("whatsapp").value.trim(), whatsappMessage: $("whatsappMessage").value.trim(), reviewUrl: normalizeUrl($("reviewUrl").value), directionsUrl: normalizeUrl($("directionsUrl").value), websiteUrl: normalizeUrl($("websiteUrl").value), address: $("address").value.trim(), paybill: $("paybill").value.trim(), paybillLabel: $("paybillLabel").value.trim(), menuLabel: $("menuLabel").value.trim() || "Menu", galleryLabel: $("galleryLabel").value.trim() || "Gallery", social, menu, gallery, theme: $("theme").value, coverMode: $("coverMode").value, coverDarkness: Number($("coverDarkness").value), openTime: $("openTime").value, closeTime: $("closeTime").value, showHours: $("showHours").checked };
    if (!profile.fullName || !profile.linkId) throw new Error("Name and Link ID are required.");
    if (!profile.phone && profile.profileType === "Person") { /* contact button simply stays hidden */ }
    const body = { name: profile.fullName, code: profile.linkId, publicToken: profile.linkId, actionProfile: profile };
    if (JSON.stringify(body).length > 1.75 * 1024 * 1024) throw new Error("The page contains too many/larger images. Remove a few photos and publish again.");
    await request(API.endpoints.update, { params: { id: state.endpoint.id }, body });
    state.profile = profile; state.endpoint.code = linkId; state.endpoint.publicToken = linkId; show("Published successfully."); updatePreview(); applyPresetVisibility();
  } catch (error) { show(error.message, true); }
});
load();
