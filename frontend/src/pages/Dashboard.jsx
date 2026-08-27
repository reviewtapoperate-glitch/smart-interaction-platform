import { useEffect, useState } from "react";
import { Link, Routes, Route, useNavigate } from "react-router-dom";
import { BarChart3, Boxes, Building2, LogOut, QrCode, Settings, Users } from "lucide-react";
import api from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { money } from "../lib/money";

function Layout({ children }) {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <div>
            <p className="font-bold text-slate-900">{session?.business?.name}</p>
            <p className="text-xs text-slate-500">Smart Interaction Platform</p>
          </div>
          <button className="btn-secondary" onClick={() => { logout(); navigate("/login"); }}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[230px_1fr]">
        <aside className="card h-fit">
          <nav className="space-y-1">
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100" to="/app"><BarChart3 className="h-4 w-4" /> Overview</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100" to="/app/products"><Boxes className="h-4 w-4" /> Products</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100" to="/app/endpoints"><QrCode className="h-4 w-4" /> Endpoints</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100" to="/app/branches"><Building2 className="h-4 w-4" /> Branches</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100" to="/app/staff"><Users className="h-4 w-4" /> Staff</Link>
            <Link className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium hover:bg-slate-100" to="/app/settings"><Settings className="h-4 w-4" /> Settings</Link>
          </nav>
        </aside>

        <main>
          {children}
        </main>
      </div>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/analytics/summary").then(r => setData(r.data));
  }, []);

  const cards = [
    ["Active endpoints", data?.endpoints ?? "—"],
    ["Sessions", data?.sessions ?? "—"],
    ["Orders", data?.orders ?? "—"],
    ["Successful payments", data?.successfulPayments ?? "—"],
    ["Paid value", data ? money(data.paidAmountMinor) : "—"]
  ];

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">Your business interaction layer at a glance.</p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <div className="card" key={label}>
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function Products() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: "", price: "" });

  async function load() {
    const { data } = await api.get("/products");
    setProducts(data);
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    await api.post("/products", { name: form.name, price: Number(form.price) });
    setForm({ name: "", price: "" });
    load();
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Products</h1>
      <form onSubmit={create} className="card mt-6 grid gap-3 md:grid-cols-3">
        <input className="input" placeholder="Product name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input className="input" placeholder="Price" type="number" min="0" step="0.01" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} required />
        <button className="btn-primary">Add product</button>
      </form>

      <div className="mt-6 space-y-3">
        {products.map(product => (
          <div className="card flex items-center justify-between" key={product.id}>
            <div>
              <p className="font-semibold">{product.name}</p>
              <p className="text-sm text-slate-500">{product.active ? "Active" : "Inactive"}</p>
            </div>
            <p className="font-bold">{money(product.priceMinor, product.currency)}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function Branches() {
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ name: "", code: "", address: "" });

  async function load() {
    const { data } = await api.get("/business/branches");
    setBranches(data);
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    await api.post("/business/branches", form);
    setForm({ name: "", code: "", address: "" });
    load();
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Branches</h1>
      <form onSubmit={create} className="card mt-6 grid gap-3 md:grid-cols-3">
        <input className="input" placeholder="Branch name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input className="input" placeholder="Branch code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required />
        <input className="input" placeholder="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <button className="btn-primary md:col-span-3">Add branch</button>
      </form>

      <div className="mt-6 grid gap-3">
        {branches.map(branch => (
          <div className="card" key={branch.id}>
            <p className="font-semibold">{branch.name}</p>
            <p className="text-sm text-slate-500">{branch.code}{branch.address ? ` · ${branch.address}` : ""}</p>
          </div>
        ))}
      </div>
    </>
  );
}

function Endpoints() {
  const [endpoints, setEndpoints] = useState([]);
  const [branches, setBranches] = useState([]);
  const [form, setForm] = useState({ name: "", code: "", type: "TABLE", branchId: "" });
  const base = import.meta.env.VITE_PUBLIC_BASE_URL || "http://localhost:4000";

  async function load() {
    const [{ data: e }, { data: b }] = await Promise.all([
      api.get("/endpoints"),
      api.get("/business/branches")
    ]);
    setEndpoints(e);
    setBranches(b);
  }

  useEffect(() => { load(); }, []);

  async function create(e) {
    e.preventDefault();
    await api.post("/endpoints", { ...form, branchId: form.branchId || null });
    setForm({ name: "", code: "", type: "TABLE", branchId: "" });
    load();
  }

  return (
    <>
      <h1 className="text-2xl font-bold">NFC / QR endpoints</h1>
      <p className="mt-1 text-sm text-slate-500">One stable endpoint can represent a table, room, product, waiter or event station.</p>

      <form onSubmit={create} className="card mt-6 grid gap-3 md:grid-cols-4">
        <input className="input" placeholder="Name e.g. Table 17" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
        <input className="input" placeholder="Code e.g. TABLE_17" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required />
        <select className="input" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
          {["TABLE", "ROOM", "PRODUCT", "SERVICE", "WAITER", "EVENT", "CUSTOM"].map(type => <option key={type}>{type}</option>)}
        </select>
        <select className="input" value={form.branchId} onChange={e => setForm({ ...form, branchId: e.target.value })}>
          <option value="">No branch</option>
          {branches.map(b => <option value={b.id} key={b.id}>{b.name}</option>)}
        </select>
        <button className="btn-primary md:col-span-4">Create endpoint</button>
      </form>

      <div className="mt-6 grid gap-4">
        {endpoints.map(endpoint => (
          <div className="card" key={endpoint.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{endpoint.name}</p>
                <p className="text-sm text-slate-500">{endpoint.type} · {endpoint.code}</p>
              </div>
              <a className="btn-secondary" href={`${base}/e/${endpoint.publicToken}`} target="_blank" rel="noreferrer">Open public endpoint</a>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">Endpoint URL</p>
                <p className="mt-1 break-all text-sm">{endpoint.publicUrl}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-slate-500">QR</p>
                <img className="mt-2 h-40 w-40 rounded-xl border border-slate-200" src={`${import.meta.env.VITE_API_URL || "http://localhost:4000/api"}/endpoints/${endpoint.id}/qr`} alt={`QR for ${endpoint.name}`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Staff() {
  const [staff, setStaff] = useState([]);
  useEffect(() => { api.get("/business/staff").then(r => setStaff(r.data)); }, []);

  return (
    <>
      <h1 className="text-2xl font-bold">Staff</h1>
      <div className="mt-6 grid gap-3">
        {staff.map(user => (
          <div className="card flex items-center justify-between" key={user.id}>
            <div>
              <p className="font-semibold">{user.name}</p>
              <p className="text-sm text-slate-500">{user.email}</p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{user.role}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function SettingsPage() {
  const { session } = useAuth();
  const [form, setForm] = useState({
    name: session?.business?.name || "",
    websiteUrl: session?.business?.websiteUrl || "",
    googleBusinessUrl: session?.business?.googleBusinessUrl || ""
  });
  const [message, setMessage] = useState("");

  async function save(e) {
    e.preventDefault();
    await api.patch("/business/me", {
      name: form.name,
      websiteUrl: form.websiteUrl || null,
      googleBusinessUrl: form.googleBusinessUrl || null
    });
    setMessage("Saved.");
  }

  return (
    <>
      <h1 className="text-2xl font-bold">Business settings</h1>
      <form onSubmit={save} className="card mt-6 max-w-2xl space-y-5">
        <div>
          <label className="text-sm font-semibold">Business name</label>
          <input className="input mt-2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="text-sm font-semibold">Website</label>
          <input className="input mt-2" value={form.websiteUrl} onChange={e => setForm({ ...form, websiteUrl: e.target.value })} placeholder="https://..." />
        </div>
        <div>
          <label className="text-sm font-semibold">Google Business URL</label>
          <input className="input mt-2" value={form.googleBusinessUrl} onChange={e => setForm({ ...form, googleBusinessUrl: e.target.value })} placeholder="https://..." />
        </div>
        <button className="btn-primary">Save</button>
        {message && <p className="text-sm text-green-700">{message}</p>}
      </form>
    </>
  );
}

export default function Dashboard() {
  return (
    <Layout>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="products" element={<Products />} />
        <Route path="branches" element={<Branches />} />
        <Route path="endpoints" element={<Endpoints />} />
        <Route path="staff" element={<Staff />} />
        <Route path="settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
