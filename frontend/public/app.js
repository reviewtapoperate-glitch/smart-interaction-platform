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
  const response = await fetch(apiPath(route), {
    method: route.method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function renderPricing() {
  const currency = document.getElementById("currency").value;
  document.getElementById("pricingGrid").innerHTML = Object.entries(packages).map(([id, plan], index) => {
    const amount = plan.price === null ? "Custom" : new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(plan.price * rates[currency]);
    return `<article class="price ${index === 1 ? "featured" : ""}"><div class="eyebrow">${plan.name.toUpperCase()}</div><div class="amount">${amount}</div><p>${plan.cards ? `${plan.cards} card${plan.cards > 1 ? "s" : ""} included` : "Tailored rollout"}</p><ul><li>NFC + QR</li><li>Custom branding</li><li>Smart link: ${plan.smart ? "Yes" : "—"}</li><li>Analytics: ${plan.analytics ? "Yes" : "—"}</li><li>Multi-location: ${plan.multi ? "Yes" : "—"}</li></ul><button class="primary" data-plan="${id}">Choose ${plan.name}</button></article>`;
  }).join("");
  document.querySelectorAll("[data-plan]").forEach(button => button.addEventListener("click", () => openAuth("register")));
}

window.openAuth = nextMode => {
  mode = nextMode;
  document.getElementById("auth").classList.add("open");
  document.getElementById("authTitle").textContent = mode === "login" ? "Welcome back" : "Create your account";
  document.getElementById("authSubmit").textContent = mode === "login" ? "Login" : "Create account";
  document.getElementById("name").style.display = mode === "login" ? "none" : "block";
  document.getElementById("ownerName").style.display = mode === "login" ? "none" : "block";
  document.getElementById("authMsg").textContent = "";
};
window.closeAuth = () => document.getElementById("auth").classList.remove("open");

document.getElementById("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const message = document.getElementById("authMsg");
  try {
    const payload = mode === "login"
      ? await request(API.auth.login, { email: email.value, password: password.value })
      : await request(API.auth.register, { businessName: name.value, name: ownerName.value || name.value, email: email.value, password: password.value });
    localStorage.setItem(tokenKey, payload.token);
    location.assign("/app.html");
  } catch (error) {
    message.textContent = error.message;
  }
});

document.getElementById("currency").addEventListener("change", renderPricing);
renderPricing();
