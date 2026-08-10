import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AgendaPage } from "./AgendaPage";
import { AsistentePage } from "./AsistentePage";
import { ApiError, api } from "./api";
import { DocumentsPage } from "./DocumentsPage";
import { Header } from "./Header";
import { Login } from "./Login";
import { NeuronBackground } from "./NeuronBackground";
import { MODULES, Sidebar, type ModuleKey } from "./Sidebar";
import { NotesPage } from "./NotesPage";
import { ProjectsPage } from "./ProjectsPage";
import { RoutinesPage } from "./RoutinesPage";
import { TodayPage } from "./TodayPage";
import { SettingsPage } from "./SettingsPage";
import { supabase } from "./supabaseClient";
import { TasksPage } from "./TasksPage";
import { VehiclesPage } from "./VehiclesPage";

type AccessState = "checking" | "granted";

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [access, setAccess] = useState<AccessState>("checking");
  const [activeModule, setActiveModule] = useState<ModuleKey>(MODULES[0].key);
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

  // OJO: la dependencia es el user.id, no el objeto `session` entero. Supabase
  // dispara onAuthStateChange (con un objeto `session` nuevo) en cada refresco
  // de token, algo que pasa solo con volver el foco a la pestaña — típicamente
  // al volver del selector nativo de archivos en Android. Si este efecto
  // dependiera de `session`, cada refresco de token ponía `access` de nuevo en
  // "checking", lo que desmonta TODA la app un instante (el early return de
  // más abajo) y borra cualquier estado local en pantalla, como un archivo
  // recién elegido para subir en el módulo Documentos.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

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
    <div className="md:flex md:h-screen">
      {/* Misma estética "red neuronal" del login, pero discreta — de fondo detrás
          de los paneles de datos, no protagonista. */}
      <NeuronBackground nodeCount={32} opacity={0.28} />
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 15% 10%, rgba(0,210,255,0.07) 0%, transparent 55%)," +
            "radial-gradient(circle at 85% 90%, rgba(0,136,204,0.07) 0%, transparent 55%)",
        }}
      />

      <Sidebar active={activeModule} onChange={setActiveModule} email={session.user.email} />
      <div className="flex-1 flex flex-col min-w-0 md:overflow-hidden">
        <Header active={activeModule} email={session.user.email} />
        <main className="flex-1 md:overflow-auto px-4 py-6 md:px-8 md:py-8">
          <div className="max-w-3xl mx-auto w-full">
            {activeModule === "hoy" && <TodayPage />}
            {activeModule === "tareas" && <TasksPage />}
            {activeModule === "agenda" && <AgendaPage />}
            {activeModule === "rutinas" && <RoutinesPage />}
            {activeModule === "proyectos" && <ProjectsPage />}
            {activeModule === "notas" && <NotesPage />}
            {activeModule === "documentos" && <DocumentsPage />}
            {activeModule === "vehiculos" && <VehiclesPage />}
            {activeModule === "asistente" && <AsistentePage />}
            {activeModule === "configuracion" && <SettingsPage />}
          </div>
        </main>
      </div>
    </div>
  );
}
