import { API, apiPath } from "/api-contract.js";

const tokenKey = "reviewtap_token";
const packages = {
  smart: { name: "Smart", price: 19, cards: 1, smart: true, analytics: true, multi: false },
  business: { name: "Business", price: 49, cards: 5, smart: true, analytics: true, multi: true },
  pro: { name: "Pro", price: 99, cards: 15, smart: true, analytics: true, multi: true },
  enterprise: { name: "Enterprise", price: null, cards: 0, smart: true, analytics: true, multi: true }
};
const rates = { USD: 1, EUR: 0.85, GBP: 0.73, KES: 129, AED: 3.67, CAD: 1.37, AUD: 1.53 };
let mode = "login";

async function request(route, body) {
  const headers = { "Content-Type": "application/json" };
  if (route.auth === "bearer") headers.Authorization = `Bearer ${localStorage.getItem(tokenKey) || ""}`;
  const response = await fetch(apiPath(route), {
    method: route.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { error: text }; }
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function renderPricing() {
  const currency = document.getElementById("currency").value;
  document.getElementById("pricingGrid").innerHTML = Object.entries(packages).map(([id, plan], index) => {
    const amount = plan.price === null ? "Custom" : new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(plan.price * rates[currency]);
    return `<article class="price ${index === 1 ? "featured" : ""}"><div class="eyebrow">${plan.name.toUpperCase()}</div><div class="amount">${amount}</div><p>${plan.cards ? `${plan.cards} card${plan.cards > 1 ? "s" : ""} included` : "Tailored rollout"}</p><ul><li>NFC + QR</li><li>Custom branding</li><li>Smart link: ${plan.smart ? "Yes" : "—"}</li><li>Analytics: ${plan.analytics ? "Yes" : "—"}</li><li>Multi-location: ${plan.multi ? "Yes" : "—"}</li></ul><button type="button" class="primary" data-plan="${id}">Choose ${plan.name}</button></article>`;
  }).join("");
  document.querySelectorAll("[data-plan]").forEach(button => button.addEventListener("click", () => openAuth("register")));
}

function openAuth(nextMode = "login") {
  mode = nextMode;
  const auth = document.getElementById("auth");
  const authTitle = document.getElementById("authTitle");
  const authSubmit = document.getElementById("authSubmit");
  const name = document.getElementById("name");
  const ownerName = document.getElementById("ownerName");
  const message = document.getElementById("authMsg");
  auth.classList.add("open");
  authTitle.textContent = mode === "login" ? "Welcome back" : "Create your account";
  authSubmit.textContent = mode === "login" ? "Login" : "Create account";
  name.style.display = mode === "login" ? "none" : "block";
  ownerName.style.display = mode === "login" ? "none" : "block";
  name.required = mode === "register";
  ownerName.required = mode === "register";
  message.textContent = "";
}

function closeAuth() { document.getElementById("auth")?.classList.remove("open"); }

const authForm = document.getElementById("authForm");
const emailField = document.getElementById("email");
const passwordField = document.getElementById("password");
const nameField = document.getElementById("name");
const ownerNameField = document.getElementById("ownerName");
const authMessage = document.getElementById("authMsg");

if (authForm) authForm.addEventListener("submit", async event => {
  event.preventDefault();
  authMessage.textContent = "Working…";
  const body = mode === "login"
    ? { email: emailField.value.trim(), password: passwordField.value }
    : { businessName: nameField.value.trim(), name: ownerNameField.value.trim(), email: emailField.value.trim(), password: passwordField.value };
  try {
    const payload = await request(mode === "login" ? API.auth.login : API.auth.register, body);
    localStorage.setItem(tokenKey, payload.token);
    window.location.assign("/app.html");
  } catch (error) { authMessage.textContent = error.message; }
});

document.getElementById("loginButton")?.addEventListener("click", () => openAuth("login"));
document.getElementById("getStartedButton")?.addEventListener("click", () => openAuth("register"));
document.getElementById("authClose")?.addEventListener("click", closeAuth);
document.getElementById("menuButton")?.addEventListener("click", () => document.querySelector(".navlinks")?.classList.toggle("show"));
document.getElementById("currency")?.addEventListener("change", renderPricing);
document.getElementById("auth")?.addEventListener("click", event => { if (event.target.id === "auth") closeAuth(); });
renderPricing();
