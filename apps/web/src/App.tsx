import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
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

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoaded(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!loaded) return null;
  if (!session) return <Login />;

  return (
    <div className="max-w-md mx-auto mt-10 px-4">
      <AppHeader />
      <TasksPage />
    </div>
  );
}
