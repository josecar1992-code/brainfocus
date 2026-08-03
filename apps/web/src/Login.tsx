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

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setStatus("idle");
    } else {
      setStatus("sent");
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setError(error.message);
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

            <div className="flex items-center gap-2 text-xs text-white/30 my-1">
              <div className="flex-1 h-px bg-white/10" />
              o
              <div className="flex-1 h-px bg-white/10" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-2 border border-deep-blue/40 rounded px-3 py-2 text-white hover:bg-white/5"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path
                  fill="#4285F4"
                  d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
                />
                <path
                  fill="#34A853"
                  d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z"
                />
                <path
                  fill="#FBBC05"
                  d="M3.95 10.7A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.27-1.7V4.96H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.04l3.05-2.34z"
                />
                <path
                  fill="#EA4335"
                  d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.96L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"
                />
              </svg>
              Entrar con Google
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
