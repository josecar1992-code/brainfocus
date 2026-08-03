import { useState } from "react";
import { supabase } from "./supabaseClient";

export function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (!error) setSent(true);
  }

  if (sent) return <p className="text-center mt-20">Revisa tu correo para el link de acceso.</p>;

  return (
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-20 flex flex-col items-center gap-4">
      <img src="/logo.jpeg" alt="Focusbrain" className="w-16 h-16 rounded-2xl" />
      <h1 className="text-xl">
        <span className="font-bold">Focus</span>
        <span className="font-medium text-electric-cyan">brain</span>
      </h1>
      <input
        type="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full border border-deep-blue/40 bg-white/5 rounded px-3 py-2 text-white placeholder:text-white/40"
      />
      <button
        type="submit"
        className="w-full bg-electric-cyan text-night-blue font-medium rounded px-3 py-2"
      >
        Entrar con magic link
      </button>
    </form>
  );
}
