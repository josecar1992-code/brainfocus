import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ApiError, api } from "./api";
import { Login } from "./Login";
import { supabase } from "./supabaseClient";
import { TasksPage } from "./TasksPage";

function AppHeader() {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <img src="/logo.jpeg" alt="Focusbrain" className="w-8 h-8 rounded-lg" />
        <h1 className="text-lg">
          <span className="font-bold">Focus</span>
          <span className="font-medium text-electric-cyan">brain</span>
        </h1>
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="text-sm text-white/50 hover:text-electric-cyan"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

type AccessState = "checking" | "granted";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [access, setAccess] = useState<AccessState>("checking");
  // Independiente de `session`: signOut() lo borra, pero el mensaje debe seguir
  // visible en vez de saltar directo a la pantalla de login.
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setAccess("checking");
      return;
    }
    setAccess("checking");
    api
      .checkAccess()
      .then(() => setAccess("granted"))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setDenied(true);
          supabase.auth.signOut();
        } else {
          // otro tipo de error (red, 5xx): no bloqueamos el acceso por esto
          setAccess("granted");
        }
      });
  }, [session]);

  if (!loaded) return null;

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-center text-white/70 max-w-sm">
          Esta cuenta no tiene acceso a Focusbrain. Si crees que es un error, contacta al dueño de la app.
        </p>
      </div>
    );
  }

  if (!session) return <Login />;
  if (access === "checking") return null;

  return (
    <div className="max-w-md mx-auto mt-10 px-4">
      <AppHeader />
      <TasksPage />
    </div>
  );
}
