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
    <form onSubmit={handleSubmit} className="max-w-sm mx-auto mt-20 flex flex-col gap-3">
      <h1 className="text-xl font-semibold">BrainFocusCR</h1>
      <input
        type="email"
        required
        placeholder="tu@correo.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border rounded px-3 py-2"
      />
      <button type="submit" className="bg-black text-white rounded px-3 py-2">
        Entrar con magic link
      </button>
    </form>
  );
}
