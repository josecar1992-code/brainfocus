import { MODULES, type ModuleKey } from "./Sidebar";

function getInitials(email?: string | null) {
  if (!email) return "?";
  return email.slice(0, 2).toUpperCase();
}

export function Header({ active, email }: { active: ModuleKey; email?: string | null }) {
  const current = MODULES.find((m) => m.key === active);

  return (
    <header className="sticky top-0 z-10 bg-night-blue/75 backdrop-blur-xl border-b border-electric-cyan/10 px-4 md:px-8 h-14 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-electric-cyan animate-pulse hidden sm:inline-block" />
        <span className="text-xs text-white/40 hidden sm:inline font-medium">Focusbrain</span>
        <span className="text-white/25 hidden sm:inline text-xs">/</span>
        <span className="text-sm font-semibold text-white">{current?.label ?? "Panel"}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden sm:block text-xs text-white/40 font-medium">
          {new Date().toLocaleDateString("es-CR", { weekday: "long", day: "numeric", month: "long" })}
        </span>
        <div className="w-7 h-7 rounded-full bg-electric-cyan/15 border border-electric-cyan/30 shadow-[0_0_10px_-2px_rgba(0,210,255,0.5)] flex items-center justify-center flex-shrink-0">
          <span className="text-electric-cyan text-[10px] font-bold">{getInitials(email)}</span>
        </div>
      </div>
    </header>
  );
}
