import { useState } from "react";
import type { ComponentType, SVGProps } from "react";
import {
  IconCalendar,
  IconCar,
  IconCheckSquare,
  IconFile,
  IconFolder,
  IconLogOut,
  IconNote,
  IconRepeat,
  IconRobot,
  IconSettings,
  IconSun,
  IconX,
} from "./icons";
import { supabase } from "./supabaseClient";

export type ModuleKey =
  | "hoy"
  | "tareas"
  | "agenda"
  | "rutinas"
  | "proyectos"
  | "notas"
  | "documentos"
  | "vehiculos"
  | "asistente"
  | "configuracion";

export const MODULES: { key: ModuleKey; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: "hoy", label: "Hoy", icon: IconSun },
  { key: "agenda", label: "Agenda", icon: IconCalendar },
  { key: "tareas", label: "Tareas", icon: IconCheckSquare },
  { key: "proyectos", label: "Proyectos", icon: IconFolder },
  { key: "rutinas", label: "Rutinas", icon: IconRepeat },
  { key: "notas", label: "Notas y memorias", icon: IconNote },
  { key: "documentos", label: "Documentos", icon: IconFile },
  { key: "vehiculos", label: "Vehículos", icon: IconCar },
  { key: "asistente", label: "Asistente", icon: IconRobot },
  { key: "configuracion", label: "Configuración", icon: IconSettings },
];

function getInitials(email?: string | null) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-9 h-9 flex items-center justify-center flex-shrink-0">
        <div className="absolute inset-[-3px] rounded-xl border border-electric-cyan/30 animate-ringPulse" />
        <img
          src="/logo.png"
          alt="Focusbrain"
          className="w-9 h-9 rounded-xl object-cover shadow-lg shadow-electric-cyan/20 relative"
        />
      </div>
      <div className="leading-none">
        <p className="font-bold text-white text-sm tracking-wide">
          Focus<span className="font-medium text-electric-cyan">brain</span>
        </p>
        <p className="text-white/35 text-[10px] mt-1 font-medium tracking-widest uppercase">Panel</p>
      </div>
    </div>
  );
}

function NavLinks({ active, onChange }: { active: ModuleKey; onChange: (m: ModuleKey) => void }) {
  return (
    <nav className="flex-1 space-y-0.5">
      {MODULES.map((m) => (
        <button
          key={m.key}
          type="button"
          onClick={() => onChange(m.key)}
          className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-left transition-all duration-150 ${
            active === m.key
              ? "bg-electric-cyan text-night-blue shadow-md shadow-electric-cyan/25"
              : "text-white/50 hover:text-white/90 hover:bg-white/6"
          }`}
        >
          <m.icon className="w-[18px] h-[18px] flex-shrink-0" strokeWidth={active === m.key ? 2.25 : 1.75} />
          {m.label}
        </button>
      ))}
    </nav>
  );
}

function UserBlock({ email }: { email?: string | null }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
        <div className="w-8 h-8 rounded-full bg-electric-cyan/15 border border-electric-cyan/30 flex items-center justify-center flex-shrink-0">
          <span className="text-electric-cyan text-xs font-bold">{getInitials(email)}</span>
        </div>
        <div className="min-w-0">
          <p className="text-white text-xs font-semibold truncate leading-tight">{email ?? "—"}</p>
          <p className="text-white/35 text-xs truncate leading-tight mt-0.5">Dueño</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/45 hover:text-white/80 hover:bg-white/6 transition-all duration-150"
      >
        <IconLogOut className="w-[18px] h-[18px] text-white/35 flex-shrink-0" strokeWidth={1.75} />
        Cerrar sesión
      </button>
    </div>
  );
}

interface SidebarProps {
  active: ModuleKey;
  onChange: (m: ModuleKey) => void;
  email?: string | null;
}

export function Sidebar({ active, onChange, email }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop: sidebar fija a la izquierda */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 md:h-screen md:sticky md:top-0 bg-night-blue/70 backdrop-blur-xl border-r border-electric-cyan/10 md:px-3 md:py-6 md:gap-3">
        <div className="px-2 pb-4">
          <Brand />
        </div>
        <div className="mx-2 h-px bg-gradient-to-r from-electric-cyan/25 via-white/8 to-transparent mb-2" />
        <NavLinks active={active} onChange={onChange} />
        <div className="mx-2 h-px bg-gradient-to-r from-electric-cyan/25 via-white/8 to-transparent mt-2 mb-1" />
        <UserBlock email={email} />
      </aside>

      {/* Móvil: barra superior con hamburguesa */}
      <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-electric-cyan/10 bg-night-blue/80 backdrop-blur-xl">
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute top-0 left-0 h-full w-72 bg-night-blue/95 backdrop-blur-xl border-r border-electric-cyan/15 px-3 py-6 flex flex-col gap-3 shadow-2xl">
            <div className="flex items-center justify-between px-2 pb-2">
              <Brand />
              <button
                type="button"
                aria-label="Cerrar menú"
                onClick={() => setMobileOpen(false)}
                className="text-white/40 hover:text-white/80 p-1.5 rounded-lg hover:bg-white/8 transition-colors"
              >
                <IconX className="w-5 h-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="mx-2 h-px bg-white/8 mb-2" />
            <NavLinks
              active={active}
              onChange={(m) => {
                onChange(m);
                setMobileOpen(false);
              }}
            />
            <div className="mx-2 h-px bg-white/8 mt-2 mb-1" />
            <UserBlock email={email} />
          </div>
        </div>
      )}
    </>
  );
}
