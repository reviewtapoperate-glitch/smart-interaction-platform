import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ businessName: "", name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(form);
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Foundation v1</p>
        <h1 className="mt-3 text-3xl font-bold">Create your business</h1>

        <form onSubmit={submit} className="mt-8 rounded-3xl bg-white p-6 text-slate-900 shadow-xl">
          {[
            ["businessName", "Business name", "text"],
            ["name", "Your name", "text"],
            ["email", "Email", "email"],
            ["password", "Password", "password"]
          ].map(([key, label, type]) => (
            <div key={key} className="mb-5">
              <label className="block text-sm font-semibold">{label}</label>
              <input
                className="input mt-2"
                type={type}
                value={form[key]}
                onChange={e => update(key, e.target.value)}
                required
              />
            </div>
          ))}

          {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Creating..." : "Create business"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-600">
            Already registered? <Link className="font-semibold underline" to="/login">Sign in</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
