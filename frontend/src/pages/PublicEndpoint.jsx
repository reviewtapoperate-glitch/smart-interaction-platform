import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";

export default function PublicEndpoint() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/endpoint/${token}`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || "Endpoint unavailable"));
  }, [token]);

  async function startSession() {
    setBusy(true);
    try {
      const { data } = await api.post(`/public/endpoint/${token}/session`, {});
      navigate(`/s/${data.session.publicToken}`);
    } catch (err) {
      setError(err.response?.data?.error || "Could not start session");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="min-h-screen grid place-items-center p-6"><div className="card max-w-md text-center"><h1 className="text-xl font-bold">Unavailable</h1><p className="mt-2 text-slate-500">{error}</p></div></main>;
  if (!data) return <main className="min-h-screen grid place-items-center"><p>Loading...</p></main>;

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <div className="mx-auto max-w-lg">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-400">{data.business.name}</p>
        <h1 className="mt-3 text-4xl font-bold">{data.endpoint.name}</h1>
        <p className="mt-3 text-slate-300">Tap or scan to continue. No customer account is required.</p>

        <div className="mt-8 rounded-3xl bg-white p-6 text-slate-900 shadow-xl">
          <div className="grid gap-3 sm:grid-cols-2">
            {["View menu", "Order", "View bill", "Pay", "Request service", "Leave review"].map(action => (
              <div className="rounded-2xl border border-slate-200 p-4" key={action}>
                <p className="font-semibold">{action}</p>
                <p className="mt-1 text-xs text-slate-500">Available when enabled by the business.</p>
              </div>
            ))}
          </div>

          <button className="btn-primary mt-6 w-full" onClick={startSession} disabled={busy}>
            {busy ? "Starting..." : data.activeSession ? "Continue current session" : "Continue as guest"}
          </button>
        </div>
      </div>
    </main>
  );
}
