import { useState } from "react";
import { supabase } from "./supabaseClient";

type Mode = "password" | "magic-link";
type Status = "idle" | "loading" | "sent";

export function Login() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("loading");

    if (mode === "password") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message === "Invalid login credentials" ? "Correo o contraseña incorrectos." : error.message);
        setStatus("idle");
      }
      // si no hay error, onAuthStateChange en App.tsx toma el control
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  function toggleMode() {
    setMode((m) => (m === "password" ? "magic-link" : "password"));
    setError(null);
    setStatus("idle");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <img src="/logo.jpeg" alt="Focusbrain" className="w-16 h-16 rounded-2xl" />
          <h1 className="text-2xl">
            <span className="font-bold">Focus</span>
            <span className="font-medium text-electric-cyan">brain</span>
          </h1>
          <p className="text-sm text-white/50 text-center">Claridad sobre el ruido mental.</p>
        </div>

        {status === "sent" ? (
          <p className="text-center text-white/80">
            Revisa <span className="text-electric-cyan">{email}</span> para el link de acceso.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-xs text-white/50">
                Correo
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@correo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-deep-blue/40 bg-white/5 rounded px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:border-electric-cyan"
              />
            </div>

            {mode === "password" && (
              <div className="flex flex-col gap-1">
                <label htmlFor="password" className="text-xs text-white/50">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-deep-blue/40 bg-white/5 rounded px-3 py-2 text-white placeholder:text-white/40 focus:outline-none focus:border-electric-cyan"
                />
              </div>
            )}

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={status === "loading"}
              className="w-full bg-electric-cyan text-night-blue font-medium rounded px-3 py-2 disabled:opacity-50 mt-1"
            >
              {status === "loading" ? "Entrando..." : mode === "password" ? "Entrar" : "Enviar link de acceso"}
            </button>

            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-white/50 hover:text-electric-cyan self-center mt-1"
            >
              {mode === "password" ? "Prefiero un link mágico por correo" : "Prefiero entrar con contraseña"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
