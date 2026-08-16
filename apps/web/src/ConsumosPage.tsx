import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { CR_TIMEZONE } from "@brainfocus/shared-time";
import { api, type Consumo } from "./api";

const CATEGORIA_LABEL: Record<Consumo["categoria"], string> = {
  ia: "IA",
  mensajeria: "Mensajería",
  hosting: "Hosting",
  otro: "Otro",
};

const ORIGEN_LABEL: Record<Consumo["origen"], string> = {
  "openclaw-export": "Automático (OpenClaw)",
  "kapso-api": "Automático (Kapso)",
  manual: "Manual",
};

function formatUsd(n: number) {
  return n.toLocaleString("es-CR", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

// Mismo día calendario Costa Rica usado en todo el resto de la app (corte
// 06:00Z-06:00Z, ver CLAUDE.md) — el mes actual se calcula con timeZone
// explícito, no con la hora del navegador.
function currentMonthRangeCR(): { desde: string; hasta: string; label: string } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CR_TIMEZONE, year: "numeric", month: "2-digit" }).format(now);
  const [year, month] = parts.split("-");
  const desde = `${year}-${month}-01`;
  const lastDay = new Date(Number(year), Number(month), 0).getDate();
  const hasta = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(`${desde}T12:00:00${"-06:00"}`).toLocaleDateString("es-CR", {
    month: "long",
    year: "numeric",
    timeZone: CR_TIMEZONE,
  });
  return { desde, hasta, label };
}

function DailyTrend({ consumos }: { consumos: Consumo[] }) {
  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of consumos) map.set(c.fecha, (map.get(c.fecha) ?? 0) + c.costo_usd);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [consumos]);

  if (byDay.length === 0) return <p className="text-white/40 text-sm">Sin datos todavía este mes.</p>;

  const max = Math.max(...byDay.map(([, v]) => v), 0.01);

  return (
    <div className="flex items-end gap-1 h-28">
      {byDay.map(([day, total]) => (
        <div key={day} className="flex-1 flex flex-col items-center justify-end gap-1 group relative">
          <div
            className="w-full rounded-t bg-gradient-to-t from-electric-cyan/70 to-electric-cyan/20 min-h-[2px]"
            style={{ height: `${Math.max((total / max) * 100, 2)}%` }}
          />
          <div className="absolute -top-7 hidden group-hover:block bg-night-blue border border-electric-cyan/20 rounded px-1.5 py-0.5 text-[10px] text-white/80 whitespace-nowrap z-10">
            {day.slice(8)}: {formatUsd(total)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProviderBreakdown({ consumos }: { consumos: Consumo[] }) {
  const byProvider = useMemo(() => {
    const map = new Map<string, { total: number; categoria: Consumo["categoria"]; origenes: Set<Consumo["origen"]> }>();
    for (const c of consumos) {
      const entry = map.get(c.proveedor) ?? { total: 0, categoria: c.categoria, origenes: new Set() };
      entry.total += c.costo_usd;
      entry.origenes.add(c.origen);
      map.set(c.proveedor, entry);
    }
    return [...map.entries()].sort(([, a], [, b]) => b.total - a.total);
  }, [consumos]);

  if (byProvider.length === 0) return null;

  return (
    <div className="space-y-2">
      {byProvider.map(([proveedor, info]) => (
        <div key={proveedor} className="flex items-center justify-between gap-2 py-1.5 border-b border-white/5 last:border-0">
          <div className="min-w-0">
            <p className="text-sm text-white/85 font-medium truncate">{proveedor}</p>
            <p className="text-[11px] text-white/35">
              {CATEGORIA_LABEL[info.categoria]}
              {info.origenes.has("manual") && " · dato manual"}
            </p>
          </div>
          <p className="text-sm font-semibold text-electric-cyan flex-shrink-0">{formatUsd(info.total)}</p>
        </div>
      ))}
    </div>
  );
}

export function ConsumosPage() {
  const [range] = useState(() => currentMonthRangeCR());
  const [proveedor, setProveedor] = useState("");

  const { data: consumos, isLoading } = useQuery({
    queryKey: ["consumos", range.desde, range.hasta, proveedor],
    queryFn: () => api.listConsumos({ desde: range.desde, hasta: range.hasta, proveedor: proveedor || undefined }),
  });

  const totalMes = useMemo(() => (consumos ?? []).reduce((sum, c) => sum + c.costo_usd, 0), [consumos]);

  const manualEntries = useMemo(
    () => (consumos ?? []).filter((c) => c.origen === "manual"),
    [consumos],
  );
  const lastManualUpdate = useMemo(() => {
    if (manualEntries.length === 0) return null;
    return manualEntries.reduce((latest, c) => (c.created_at > latest ? c.created_at : latest), manualEntries[0].created_at);
  }, [manualEntries]);

  const providers = useMemo(
    () => [...new Set((consumos ?? []).map((c) => c.proveedor))].sort(),
    [consumos],
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Consumos</h1>
          <p className="text-sm text-white/40 capitalize">{range.label}</p>
        </div>
        {providers.length > 1 && (
          <select
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="bg-night-blue/60 border border-electric-cyan/15 rounded-lg px-2.5 py-1.5 text-xs text-white/80"
          >
            <option value="">Todos los proveedores</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}

      {!isLoading && (
        <>
          <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
            <p className="text-xs text-white/40 font-medium uppercase tracking-wide">Gasto total del mes</p>
            <p className="text-3xl font-bold text-white mt-1">{formatUsd(totalMes)}</p>
            {manualEntries.length > 0 && (
              <p className="text-[11px] text-amber-400/80 mt-2">
                Incluye datos cargados a mano — última actualización manual:{" "}
                {lastManualUpdate &&
                  new Date(lastManualUpdate).toLocaleDateString("es-CR", {
                    day: "2-digit",
                    month: "short",
                    timeZone: CR_TIMEZONE,
                  })}
                . No es un dato en vivo.
              </p>
            )}
          </div>

          {consumos && consumos.length === 0 && (
            <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
              <p className="text-white/40 text-sm">Sin consumos registrados este mes todavía.</p>
            </div>
          )}

          {consumos && consumos.length > 0 && (
            <>
              <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
                <p className="text-xs text-white/40 font-medium uppercase tracking-wide mb-3">Tendencia diaria</p>
                <DailyTrend consumos={consumos} />
              </div>

              <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
                <p className="text-xs text-white/40 font-medium uppercase tracking-wide mb-2">Por proveedor</p>
                <ProviderBreakdown consumos={consumos} />
              </div>

              <details className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
                <summary className="text-xs text-white/40 font-medium uppercase tracking-wide cursor-pointer">
                  Detalle ({consumos.length} registros)
                </summary>
                <div className="mt-3 space-y-1.5 max-h-96 overflow-y-auto">
                  {consumos.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-white/5 last:border-0">
                      <span className="text-white/40 flex-shrink-0">{c.fecha}</span>
                      <span className="text-white/70 truncate flex-1">{c.proveedor}</span>
                      <span className="text-white/30 flex-shrink-0">{ORIGEN_LABEL[c.origen]}</span>
                      <span className="text-electric-cyan font-medium flex-shrink-0">{formatUsd(c.costo_usd)}</span>
                    </div>
                  ))}
                </div>
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
}
