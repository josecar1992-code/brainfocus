import { useState } from "react";
import { supabase } from "./supabaseClient";

export type ModuleKey = "tareas" | "agenda";

export const MODULES: { key: ModuleKey; label: string; icon: string }[] = [
  { key: "tareas", label: "Tareas", icon: "✓" },
  { key: "agenda", label: "Agenda", icon: "◷" },
];

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.jpeg" alt="Focusbrain" className="w-8 h-8 rounded-lg" />
      <h1 className="text-lg">
        <span className="font-bold">Focus</span>
        <span className="font-medium text-electric-cyan">brain</span>
      </h1>
    </div>
  );
}

function NavLinks({ active, onChange }: { active: ModuleKey; onChange: (m: ModuleKey) => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {MODULES.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-left transition ${
            active === m.key
              ? "bg-electric-cyan/10 text-electric-cyan border border-electric-cyan/30"
              : "text-white/60 hover:bg-white/5 hover:text-white border border-transparent"
          }`}
        >
          <span className="w-4 text-center">{m.icon}</span>
          {m.label}
        </button>
      ))}
    </nav>
  );
}

interface SidebarProps {
  active: ModuleKey;
  onChange: (m: ModuleKey) => void;
}

export function Sidebar({ active, onChange }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: sidebar fija a la izquierda */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 md:h-screen md:sticky md:top-0 md:border-r md:border-white/10 md:px-4 md:py-6 md:gap-6">
        <Brand />
        <NavLinks active={active} onChange={onChange} />
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mt-auto text-sm text-white/40 hover:text-electric-cyan text-left"
        >
          Cerrar sesión
        </button>
      </aside>

      {/* Móvil: barra superior con hamburguesa */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-white/10">
        <Brand />
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={() => setMobileOpen(true)}
          className="w-9 h-9 flex flex-col items-center justify-center gap-1 rounded-lg hover:bg-white/5"
        >
          <span className="w-5 h-0.5 bg-white/70" />
          <span className="w-5 h-0.5 bg-white/70" />
          <span className="w-5 h-0.5 bg-white/70" />
        </button>
      </div>

      {/* Móvil: drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-64 bg-night-blue border-r border-white/10 px-4 py-6 flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="text-white/50 hover:text-white text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <NavLinks
              active={active}
              onChange={(m) => {
                onChange(m);
                setMobileOpen(false);
              }}
            />
            <button
              type="button"
              onClick={() => supabase.auth.signOut()}
              className="mt-auto text-sm text-white/40 hover:text-electric-cyan text-left"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
