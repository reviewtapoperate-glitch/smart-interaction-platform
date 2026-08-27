import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../lib/api";
import { money } from "../lib/money";

export default function PublicSession() {
  const { token } = useParams();
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState({});
  const [message, setMessage] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: s }, { data: p }] = await Promise.all([
      api.get(`/public/session/${token}`),
      api.get(`/public/session/${token}/products`)
    ]);
    setSession(s);
    setProducts(p);
  }

  useEffect(() => {
    load().catch(err => setMessage(err.response?.data?.error || "Could not load session"));
  }, [token]);

  useEffect(() => {
    if (!session?.session?.id) return;
    const socket = io(import.meta.env.VITE_PUBLIC_BASE_URL || "http://localhost:4000");
    socket.emit("session:join", { sessionId: session.session.id });
    socket.on("order:created", load);
    socket.on("payment:confirmed", load);
    return () => socket.disconnect();
  }, [session?.session?.id]);

  const selectedItems = useMemo(
    () => Object.entries(selected).filter(([, checked]) => checked).map(([id]) => id),
    [selected]
  );

  async function order(productId) {
    setBusy(true);
    try {
      await api.post(`/public/session/${token}/orders`, {
        items: [{ productId, quantity: 1 }]
      });
      await load();
      setMessage("Order submitted.");
    } catch (err) {
      setMessage(err.response?.data?.error || "Order failed");
    } finally {
      setBusy(false);
    }
  }

  async function pay(itemIds) {
    if (!phone) {
      setMessage("Enter the payment phone number first.");
      return;
    }

    if (!itemIds.length) {
      setMessage("Select at least one unpaid item.");
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post(`/payments/session/${token}/request`, {
        provider: "MPESA",
        phone,
        selectedItemIds: itemIds
      });
      setMessage(`Payment request sent. Status: ${data.status}. Complete the prompt on your phone.`);
    } catch (err) {
      setMessage(err.response?.data?.error || "Payment request failed");
    } finally {
      setBusy(false);
    }
  }

  if (!session) return <main className="min-h-screen grid place-items-center p-6"><p>{message || "Loading..."}</p></main>;

  const bill = session.bill;
  const allIds = bill.items.map(item => item.id);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl bg-slate-950 p-6 text-white">
          <p className="text-sm text-slate-400">{session.business.name}</p>
          <h1 className="mt-1 text-3xl font-bold">{session.session.endpoint}</h1>
          <p className="mt-2 text-sm text-slate-300">Guest checkout · No account required</p>
        </div>

        <section className="card mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Menu</h2>
            <span className="text-sm text-slate-500">Tap to add one</span>
          </div>

          <div className="mt-4 grid gap-3">
            {products.map(product => (
              <div className="flex items-center justify-between rounded-2xl border border-slate-200 p-4" key={product.id}>
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-sm text-slate-500">{money(product.priceMinor, product.currency)}</p>
                </div>
                <button className="btn-secondary" disabled={busy} onClick={() => order(product.id)}>Add</button>
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Current bill</h2>
            <span className="text-lg font-bold">{money(bill.totalMinor, session.business.currency)}</span>
          </div>

          <div className="mt-4 space-y-3">
            {bill.items.length === 0 && <p className="text-sm text-slate-500">No unpaid items yet.</p>}
            {bill.items.map(item => (
              <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-4" key={item.id}>
                <input
                  type="checkbox"
                  checked={Boolean(selected[item.id])}
                  onChange={e => setSelected(current => ({ ...current, [item.id]: e.target.checked }))}
                />
                <span className="flex-1">
                  <span className="block font-semibold">{item.name}</span>
                  <span className="text-sm text-slate-500">{item.quantity} × {money(item.unitPriceMinor, session.business.currency)}</span>
                </span>
                <span className="font-semibold">{money(item.totalMinor, session.business.currency)}</span>
              </label>
            ))}
          </div>

          <div className="mt-6">
            <label className="text-sm font-semibold">M-Pesa phone number</label>
            <input className="input mt-2" placeholder="2547XXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button className="btn-primary" disabled={busy || !allIds.length} onClick={() => pay(allIds)}>
              Pay whole bill
            </button>
            <button className="btn-secondary" disabled={busy || !selectedItems.length} onClick={() => pay(selectedItems)}>
              Pay selected items
            </button>
          </div>

          {message && <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}
        </section>
      </div>
    </main>
  );
}
