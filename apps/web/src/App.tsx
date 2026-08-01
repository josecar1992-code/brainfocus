import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Login } from "./Login";
import { supabase } from "./supabaseClient";
import { TasksPage } from "./TasksPage";

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
  return session ? <TasksPage /> : <Login />;
}
