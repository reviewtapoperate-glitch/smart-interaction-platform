import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/app");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-md">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Smart Interaction Platform</p>
          <h1 className="mt-3 text-3xl font-bold">Business login</h1>
        </div>

        <form onSubmit={submit} className="rounded-3xl bg-white p-6 text-slate-900 shadow-xl">
          <label className="block text-sm font-semibold">Email</label>
          <input className="input mt-2" type="email" value={email} onChange={e => setEmail(e.target.value)} required />

          <label className="mt-5 block text-sm font-semibold">Password</label>
          <input className="input mt-2" type="password" value={password} onChange={e => setPassword(e.target.value)} required />

          {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button className="btn-primary mt-6 w-full" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>

          <p className="mt-5 text-center text-sm text-slate-600">
            New business? <Link className="font-semibold text-slate-900 underline" to="/register">Create account</Link>
          </p>
        </form>
      </div>
    </main>
  );
}
