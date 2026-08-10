import { useCallback, useEffect, useState } from "react";
import { MODULES, type ModuleKey } from "./Sidebar";

// Cada ModuleKey ya es un slug limpio ("tareas", "agenda", ...), así que se
// usa tal cual como ruta ("/tareas", "/agenda") — sin mapeo aparte.
function moduleFromPath(pathname: string): ModuleKey {
  const key = pathname.replace(/^\/+/, "").split("/")[0];
  return MODULES.some((m) => m.key === key) ? (key as ModuleKey) : MODULES[0].key;
}

// Router mínimo casero (History API directa) en vez de sumar react-router-dom
// — la app es de un solo usuario y de 10 pantallas fijas, no hace falta la
// librería completa. Antes todo vivía en un solo `useState` sin tocar la URL,
// así que refrescar la página (o compartir/guardar un link a un módulo)
// siempre volvía a "Hoy". nginx.conf ya tiene `try_files ... /index.html`
// (SPA fallback), así que cualquier ruta real (`/tareas`, `/asistente`, etc.)
// sirve el mismo `index.html` y esto la resuelve del lado del cliente.
export function useModuleRoute(): [ModuleKey, (m: ModuleKey) => void] {
  const [activeModule, setActiveModuleState] = useState<ModuleKey>(() => moduleFromPath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setActiveModuleState(moduleFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const setActiveModule = useCallback((m: ModuleKey) => {
    setActiveModuleState(m);
    const path = `/${m}`;
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  return [activeModule, setActiveModule];
}
