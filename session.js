import { API, apiPath } from "/api-contract.js";

const token = location.pathname.split("/").filter(Boolean).pop();
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

async function request(route, { params, body, headers } = {}) {
  const response = await fetch(apiPath(route, params), { method: route.method, headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(amountMinor, currency) { return new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "KES" }).format(amountMinor / 100); }

async function load() {
  try {
    const [data, products] = await Promise.all([
      request(API.public.session, { params: { token } }), request(API.public.products, { params: { token } })
    ]);
    title.textContent = `${data.business.name} · ${data.session.endpoint}`;
    message.textContent = data.session.status === "ACTIVE" ? "Add items, then choose what you would like to pay." : `Session ${data.session.status.toLowerCase()}.`;
    document.getElementById("products").innerHTML = products.map(product => `<article><h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description || "")}</p><b>${money(product.priceMinor, product.currency)}</b><button class="primary" style="display:block;margin-top:12px" data-product="${product.id}">Add to order</button></article>`).join("") || "<p>No products are available.</p>";
    document.querySelectorAll("[data-product]").forEach(button => button.addEventListener("click", () => order(button.dataset.product)));
    renderBill(data.bill, data.business.currency, data.session.status);
  } catch (error) { message.textContent = error.message; }
}

function renderBill(bill, currency, status) {
  const lines = bill.items.map(item => `<label style="display:block;margin:12px 0"><input type="checkbox" name="billItem" value="${item.id}" checked ${status !== "ACTIVE" ? "disabled" : ""}> ${escapeHtml(item.name)} × ${item.quantity} — ${money(item.totalMinor, currency)}</label>`).join("");
  document.getElementById("bill").innerHTML = `<article class="price">${lines || "No outstanding items."}<h3>Total: ${money(bill.totalMinor, currency)}</h3>${status === "ACTIVE" && bill.items.length ? '<input id="phone" placeholder="M-Pesa phone number"><button class="primary" id="pay" style="margin-top:12px">Request M-Pesa payment</button><p id="paymentStatus"></p>' : ""}</article>`;
  document.getElementById("pay")?.addEventListener("click", pay);
}

async function order(productId) {
  try {
    await request(API.public.order, { params: { token }, body: { items: [{ productId, quantity: 1 }] } });
    await load();
  } catch (error) { message.textContent = error.message; }
}

async function pay() {
  const selectedItemIds = [...document.querySelectorAll("input[name=billItem]:checked")].map(input => input.value);
  if (!selectedItemIds.length) return;
  const status = document.getElementById("paymentStatus");
  try {
    const idempotencyKey = crypto.randomUUID();
    const payment = await request(API.payments.request, { params: { token }, headers: { "Idempotency-Key": idempotencyKey }, body: { provider: "MPESA", phone: phone.value, selectedItemIds } });
    status.textContent = "Payment request sent. Waiting for confirmation…";
    pollPayment(payment.paymentId, status);
  } catch (error) { status.textContent = error.message; }
}

async function pollPayment(paymentId, status) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    const payment = await request(API.payments.get, { params: { paymentId } });
    status.textContent = `Payment status: ${payment.status}`;
    if (["SUCCESS", "FAILED", "REQUIRES_REVIEW"].includes(payment.status)) { await load(); return; }
  }
}

load();
