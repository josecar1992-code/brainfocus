import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CR_TIMEZONE } from "@brainfocus/shared-time";
import { api, type AdminUser, type AdminUserPatch } from "./api";

const OPTIONAL_MODULES: { key: string; label: string }[] = [
  { key: "proyectos", label: "Proyectos" },
  { key: "rutinas", label: "Rutinas" },
  { key: "notas", label: "Notas y memorias" },
  { key: "documentos", label: "Documentos" },
  { key: "vehiculos", label: "Vehículos" },
];

const STATUS_LABEL: Record<AdminUser["status"], string> = {
  pending: "Pendiente",
  active: "Activo",
  blocked: "Bloqueado",
};
const STATUS_STYLE: Record<AdminUser["status"], string> = {
  pending: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  active: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
  blocked: "bg-red-400/15 text-red-300 border-red-400/30",
};

// Siempre con timeZone explícito (regla del proyecto): nunca la zona del navegador.
const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-CR", { timeZone: CR_TIMEZONE, dateStyle: "medium", timeStyle: "short" })
    : "—";

function UserCard({ user, selfId, defaultLimit }: { user: AdminUser; selfId: string | undefined; defaultLimit: number | undefined }) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(user.whatsapp_phone ?? "");
  const [limit, setLimit] = useState(user.daily_message_limit?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const isSelf = user.id === selfId;

  const update = useMutation({
    mutationFn: (patch: AdminUserPatch) => api.adminUpdateUser(user.id, patch),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (err: Error) => {
      try {
        const body = JSON.parse(err.message);
        setError(typeof body.error === "string" ? body.error : "No se pudo guardar");
      } catch {
        setError("No se pudo guardar");
      }
    },
  });

  const allModules = user.enabled_modules === null;
  const toggleModule = (key: string) => {
    const current = user.enabled_modules ?? OPTIONAL_MODULES.map((m) => m.key);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    update.mutate({ enabled_modules: next.length === OPTIONAL_MODULES.length ? null : next });
  };

  return (
    <div className="rounded-xl border border-electric-cyan/12 bg-night-blue/50 p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{user.email ?? user.id}</p>
          <p className="text-[11px] text-white/35 mt-0.5">
            Registrado {fmt(user.created_at)} · Último ingreso {fmt(user.last_sign_in_at)}
          </p>
        </div>
        <span className={`text-[11px] font-semibold border rounded-full px-2.5 py-0.5 ${STATUS_STYLE[user.status]}`}>
          {user.is_admin ? "Administrador · " : ""}
          {STATUS_LABEL[user.status]}
        </span>
      </div>

      {!isSelf && (
        <div className="flex flex-wrap gap-2">
          {user.status !== "active" && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "active" })}
              className="rounded-lg bg-electric-cyan text-night-blue text-xs font-semibold px-3 py-1.5 disabled:opacity-50"
            >
              Activar
            </button>
          )}
          {user.status !== "blocked" && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "blocked" })}
              className="rounded-lg border border-red-400/40 text-red-300 text-xs font-semibold px-3 py-1.5 hover:bg-red-400/10 disabled:opacity-50"
            >
              Bloquear
            </button>
          )}
          {user.status === "active" && (
            <button
              type="button"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: "pending" })}
              className="rounded-lg border border-white/15 text-white/60 text-xs font-semibold px-3 py-1.5 hover:bg-white/5 disabled:opacity-50"
            >
              Dejar pendiente
            </button>
          )}
        </div>
      )}

      {!user.is_admin && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-white/60">Módulos opcionales</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {OPTIONAL_MODULES.map((m) => (
              <label key={m.key} className="flex items-center gap-1.5 text-xs text-white/75 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allModules || user.enabled_modules!.includes(m.key)}
                  disabled={update.isPending}
                  onChange={() => toggleModule(m.key)}
                />
                {m.label}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-white/30">
            Hoy, Agenda, Tareas, Asistente, Resumen y Configuración siempre están disponibles.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-white/60">WhatsApp de Quicks</p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            update.mutate({ whatsapp_phone: phone.trim() === "" ? null : phone });
          }}
        >
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+506 8888 8888"
            inputMode="tel"
            className="bg-night-blue/60 border border-electric-cyan/15 rounded-lg px-2.5 py-1.5 text-sm text-white/90 w-48"
          />
          <button
            type="submit"
            disabled={update.isPending || phone === (user.whatsapp_phone ?? "")}
            className="rounded-lg border border-electric-cyan/40 text-electric-cyan text-xs font-semibold px-3 py-1.5 hover:bg-electric-cyan/10 disabled:opacity-40"
          >
            Guardar número
          </button>
          {user.whatsapp_last_inbound_at && (
            <span className="text-[11px] text-white/35">Último mensaje: {fmt(user.whatsapp_last_inbound_at)}</span>
          )}
        </form>
        <p className="text-[11px] text-white/30">
          Quicks solo responde a números vinculados aquí y con la cuenta activa; a cualquier otro lo ignora.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-white/60">Mensajes diarios a Quicks</p>
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(limit);
            if (limit.trim() !== "" && (!Number.isInteger(n) || n < 1 || n > 5000)) {
              setError("El límite debe ser un número entero entre 1 y 5000");
              return;
            }
            update.mutate({ daily_message_limit: limit.trim() === "" ? null : n });
          }}
        >
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder={defaultLimit ? `General (${defaultLimit})` : "General"}
            inputMode="numeric"
            className="bg-night-blue/60 border border-electric-cyan/15 rounded-lg px-2.5 py-1.5 text-sm text-white/90 w-28"
          />
          <button
            type="submit"
            disabled={update.isPending || limit.trim() === (user.daily_message_limit?.toString() ?? "")}
            className="rounded-lg border border-electric-cyan/40 text-electric-cyan text-xs font-semibold px-3 py-1.5 hover:bg-electric-cyan/10 disabled:opacity-40"
          >
            Guardar límite
          </button>
        </form>
        <p className="text-[11px] text-white/30">
          Máximo de mensajes por día (hora de Costa Rica). Vacío = el límite general{defaultLimit ? ` (${defaultLimit} por día)` : ""}. Al pasarlo, Quicks avisa y
          responde de nuevo a medianoche.
        </p>
      </div>

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

export function AdminPage() {
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.me });
  const { data: config } = useQuery({ queryKey: ["admin-config"], queryFn: api.adminConfig });
  const { data: users, isLoading, isError } = useQuery({ queryKey: ["admin-users"], queryFn: api.adminListUsers });

  const order = { pending: 0, active: 1, blocked: 2 } as const;
  const sorted = [...(users ?? [])].sort(
    (a, b) => order[a.status] - order[b.status] || a.created_at.localeCompare(b.created_at),
  );
  const pending = sorted.filter((u) => u.status === "pending").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">Usuarios</h1>
        <p className="text-sm text-white/40">
          El registro no es público: quien entra con Google queda pendiente hasta que lo actives aquí.
          {pending > 0 && (
            <span className="text-amber-300">
              {" "}
              {pending} pendiente{pending > 1 ? "s" : ""} de revisar.
            </span>
          )}
        </p>
      </div>
      {isLoading && <p className="text-sm text-white/40">Cargando…</p>}
      {isError && <p className="text-sm text-red-300">No se pudo cargar la lista de usuarios.</p>}
      <div className="space-y-3">
        {sorted.map((u) => (
          <UserCard key={u.id} user={u} selfId={me?.userId} defaultLimit={config?.daily_message_limit_default} />
        ))}
      </div>
    </div>
  );
}
