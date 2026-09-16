const routeValue = decodeURIComponent(location.pathname.split("/").filter(Boolean).pop() || "");
const app = document.getElementById("app");
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
const safeUrl = value => { try { const u = new URL(value); return ["http:", "https:", "mailto:", "tel:"].includes(u.protocol) ? u.toString() : null; } catch { return null; } };
let currentData = null;
let refreshTimer = null;
async function request() {
  const path = location.pathname.startsWith("/e/") ? `/api/public/endpoint/${encodeURIComponent(routeValue)}` : `/api/public/profile/${encodeURIComponent(routeValue)}`;
  const response = await fetch(path, { cache: "no-store" }); const text = await response.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data.error || "Page not found"); return data;
}
async function track(action, token) { try { await fetch(`/api/public/endpoint/${encodeURIComponent(token)}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }), keepalive: true }); } catch {} }
function isOpen(p) { if (!p.showHours || !p.openTime || !p.closeTime) return null; const now = new Date(), minutes = now.getHours() * 60 + now.getMinutes(), [oh, om] = p.openTime.split(":").map(Number), [ch, cm] = p.closeTime.split(":").map(Number), open = oh * 60 + om, close = ch * 60 + cm; return open <= close ? minutes >= open && minutes < close : minutes >= open || minutes < close; }
function vcard(p) { return `BEGIN:VCARD\nVERSION:3.0\nFN:${String(p.fullName || "").replace(/\n/g, " ")}\n${p.phone ? `TEL:${p.phone}\n` : ""}${p.websiteUrl ? `URL:${p.websiteUrl}\n` : ""}${p.address ? `ADR:;;${p.address.replace(/\n/g, " ")}\n` : ""}END:VCARD`; }
function section(title, id, body) { return body ? `<section class="section" id="${escapeHtml(id)}"><h2>${escapeHtml(title)}</h2>${body}</section>` : ""; }
function render(data) {
  currentData = data;
  const p = data.endpoint.actionProfile || {}, b = data.business || {}, theme = Number(p.theme || 1), themes = ["#111827", "#17324d", "#153e32", "#4a244a", "#402b16", "#222", "#1d3557", "#2f3e46", "#3a2d13"];
  document.documentElement.style.setProperty("--accent", themes[(theme - 1) % 9]);
  const cover = p.coverPhoto || "", darkness = Math.max(0, Math.min(80, Number(p.coverDarkness ?? 25))) / 100, open = isOpen(p), status = p.showHours && open !== null ? `<span class="status"><span class="dot ${open ? "open" : ""}"></span>${open ? "Open now" : "Closed now"}</span>` : "";
  const actions = [];
  if (p.phone) actions.push(`<a class="action" href="tel:${escapeHtml(p.phone)}" id="phone">Call</a>`);
  if (p.phone) actions.push(`<button class="action alt" id="saveContact" type="button">Save Contact</button>`);
  actions.push(`<button class="action alt" id="shareBtn" type="button">Share this page</button>`);
  if (p.whatsapp) { const wa = p.whatsapp.replace(/\D/g, ""), msg = encodeURIComponent(p.whatsappMessage || "Hi, I found you on ReviewTap."); actions.push(`<a class="action" href="https://wa.me/${wa}?text=${msg}" target="_blank" rel="noopener noreferrer" id="whatsapp">WhatsApp</a>`); }
  if (p.reviewUrl && safeUrl(p.reviewUrl)) actions.push(`<a class="action alt" href="${escapeHtml(safeUrl(p.reviewUrl))}" target="_blank" rel="noopener noreferrer" id="review">Google review</a>`);
  if (p.directionsUrl && safeUrl(p.directionsUrl)) actions.push(`<a class="action alt" href="${escapeHtml(safeUrl(p.directionsUrl))}" target="_blank" rel="noopener noreferrer" id="directions">Get Directions</a>`);
  if (p.websiteUrl && safeUrl(p.websiteUrl)) actions.push(`<a class="action alt" href="${escapeHtml(safeUrl(p.websiteUrl))}" target="_blank" rel="noopener noreferrer" id="website">Visit website</a>`);
  const socials = Object.entries(p.social || {}).map(([k, v]) => { const u = safeUrl(v); return u ? `<a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" data-social="${escapeHtml(k)}">${escapeHtml(k)}</a>` : ""; }).join("");
  const menuGroups = {}; (Array.isArray(p.menu) ? p.menu : []).forEach(item => { const key = item.category || "Menu"; (menuGroups[key] ??= []).push(item); });
  const menuHtml = Object.entries(menuGroups).map(([cat, items]) => `<div class="card"><strong>${escapeHtml(cat)}</strong><div class="menu">${items.map(item => `<div class="menuitem"><div><strong>${escapeHtml(item.name)}</strong><div class="muted">${escapeHtml(item.description)}</div></div><div>${item.price ? `<span class="price">${escapeHtml(item.price)}</span>` : ""}${item.image ? `<img loading="lazy" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}">` : ""}</div></div>`).join("")}</div></div>`).join("");
  const galleryHtml = (Array.isArray(p.gallery) ? p.gallery : []).map((g, i) => `<img loading="lazy" src="${escapeHtml(g.image)}" alt="${escapeHtml(g.caption || `Photo ${i + 1}`)}" data-gallery-src="${escapeHtml(g.image)}">`).join("");
  const pay = p.paybill ? `<div class="card pay"><div><strong>${escapeHtml(p.paybillLabel || "Till / Paybill")}</strong><div class="muted">${escapeHtml(p.paybill)}</div></div><button class="copy" id="copyPay" type="button">Tap to copy</button></div>` : "";
  const coverStyle = cover ? `background-image:linear-gradient(rgba(0,0,0,${darkness}),rgba(0,0,0,${darkness})),url("${escapeHtml(cover)}")` : "background-image:none";
  app.innerHTML = `<div class="cover" style="${coverStyle};${p.coverMode === "background" ? "height:310px" : ""}"></div><div class="wrap"><img class="avatar ${p.profilePhoto ? "" : "hidden"}" loading="eager" src="${escapeHtml(p.profilePhoto || "")}" alt="${escapeHtml(p.fullName || b.name)}"><div class="identity"><h1>${escapeHtml(p.fullName || b.name)}</h1>${p.title ? `<p>${escapeHtml(p.title)}</p>` : ""}${status}</div><div class="actions">${actions.join("")}</div>${p.address ? section("Address", "address", `<div class="card">${escapeHtml(p.address)}</div>`) : ""}${socials ? section("Connect", "connect", `<div class="socials">${socials}</div>`) : ""}${pay ? section("Payment", "pay", pay) : ""}${menuHtml ? section(p.menuLabel || "Menu", "menu", menuHtml) : ""}${galleryHtml ? section(p.galleryLabel || "Gallery", "gallery", `<div class="gallery">${galleryHtml}</div>`) : ""}<div class="footer">Powered by <strong>RTO — ReviewTapOperate</strong><br><span>Want a page like this? Contact us.</span></div></div>`;
  document.getElementById("saveContact")?.addEventListener("click", () => { const blob = new Blob([vcard(p)], { type: "text/vcard;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(p.fullName || "contact").replace(/[^a-z0-9]+/gi, "-")}.vcf`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); track("SAVE_CONTACT_CLICKED", data.endpoint.publicToken); });
  document.getElementById("shareBtn")?.addEventListener("click", async () => { await track("SHARE_CLICKED", data.endpoint.publicToken); try { if (navigator.share) await navigator.share({ title: p.fullName || b.name, text: p.title || "ReviewTap profile", url: location.href }); else if (navigator.clipboard) { await navigator.clipboard.writeText(location.href); document.getElementById("shareBtn").textContent = "Link copied"; } } catch {} });
  document.getElementById("whatsapp")?.addEventListener("click", () => track("WHATSAPP_CLICKED", data.endpoint.publicToken)); document.getElementById("review")?.addEventListener("click", () => track("REVIEW_CLICKED", data.endpoint.publicToken)); document.getElementById("directions")?.addEventListener("click", () => track("DIRECTIONS_CLICKED", data.endpoint.publicToken)); document.getElementById("website")?.addEventListener("click", () => track("WEBSITE_CLICKED", data.endpoint.publicToken)); document.getElementById("phone")?.addEventListener("click", () => track("SOCIAL_CLICKED", data.endpoint.publicToken));
  document.querySelectorAll("[data-social]").forEach(node => node.addEventListener("click", () => track("SOCIAL_CLICKED", data.endpoint.publicToken)));
  document.getElementById("copyPay")?.addEventListener("click", async () => { try { await navigator.clipboard?.writeText(p.paybill); document.getElementById("copyPay").textContent = "Copied"; } catch {} await track("PAYMENT_COPIED", data.endpoint.publicToken); });
  document.querySelectorAll("[data-gallery-src]").forEach(img => img.addEventListener("click", () => { document.getElementById("lightboxImage").src = img.dataset.gallerySrc; document.getElementById("lightbox").classList.add("open"); track("GALLERY_OPENED", data.endpoint.publicToken); }));
  const target = new URLSearchParams(location.search).get("section"); if (target) document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
}
async function refresh() { try { const data = await request(); const old = currentData?.endpoint?.updatedAt; if (!currentData || data.endpoint?.updatedAt !== old) render(data); } catch {} }
document.getElementById("closeLightbox").onclick = () => document.getElementById("lightbox").classList.remove("open");
request().then(data => { render(data); refreshTimer = setInterval(refresh, 5000); }).catch(error => app.innerHTML = `<div class="error"><h2>ReviewTap page unavailable</h2><p>${escapeHtml(error.message)}</p></div>`);
window.addEventListener("pagehide", () => { if (refreshTimer) clearInterval(refreshTimer); });
