import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  api,
  type NewMaintenance,
  type NewMileageLog,
  type NewVehicle,
  type Vehicle,
  type VehicleMaintenance,
  type VehicleMileageLog,
} from "./api";
import { ConfirmDialog } from "./ConfirmDialog";
import { CornerBrackets } from "./CornerBrackets";
import { IconX } from "./icons";
import { QuickBadge } from "./QuickBadge";

const VEHICLE_TYPES = ["Sedán", "SUV", "Pickup", "Hatchback", "Moto", "Otro"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
}

// Sin lectura de odómetro en vivo, el mejor proxy de "kilometraje actual" es
// el mayor mileage ya registrado entre el historial de mantenimiento y las
// lecturas sueltas de vehicle_mileage_logs — por eso esto es un indicador
// visual, no un aviso automático como el de fecha.
function MaintenanceAlerts({ vehicle, maxLoggedMileage }: { vehicle: Vehicle; maxLoggedMileage: number | null }) {
  const dateSoon = vehicle.next_maintenance_date && new Date(vehicle.next_maintenance_date).getTime() < Date.now();
  const mileageDue =
    vehicle.next_maintenance_mileage != null &&
    maxLoggedMileage != null &&
    maxLoggedMileage >= vehicle.next_maintenance_mileage;

  if (!vehicle.next_maintenance_date && vehicle.next_maintenance_mileage == null) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {vehicle.next_maintenance_date && (
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            dateSoon ? "bg-red-400/15 text-red-400" : "bg-electric-cyan/10 text-electric-cyan"
          }`}
        >
          {dateSoon ? "Mantenimiento vencido" : `Próximo: ${formatDate(vehicle.next_maintenance_date)}`}
        </span>
      )}
      {vehicle.next_maintenance_mileage != null && (
        <span
          className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
            mileageDue ? "bg-red-400/15 text-red-400" : "bg-white/5 text-white/50"
          }`}
        >
          {mileageDue
            ? `Ya pasó los ${vehicle.next_maintenance_mileage.toLocaleString("es-CR")} km`
            : `Próximo a los ${vehicle.next_maintenance_mileage.toLocaleString("es-CR")} km`}
        </span>
      )}
    </div>
  );
}

function VehicleForm({
  initial,
  onSubmit,
  onCancel,
  pending,
  error,
  submitLabel,
}: {
  initial?: Partial<NewVehicle>;
  onSubmit: (input: NewVehicle) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  submitLabel: string;
}) {
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [year, setYear] = useState(initial?.year ? String(initial.year) : "");
  const [vehicleType, setVehicleType] = useState(initial?.vehicle_type ?? "");
  const [plate, setPlate] = useState(initial?.plate ?? "");
  const [nextDate, setNextDate] = useState(
    initial?.next_maintenance_date ? initial.next_maintenance_date.slice(0, 10) : "",
  );
  const [nextMileage, setNextMileage] = useState(
    initial?.next_maintenance_mileage != null ? String(initial.next_maintenance_mileage) : "",
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim() || !model.trim()) return;
    onSubmit({
      brand: brand.trim(),
      model: model.trim(),
      year: year ? Number(year) : undefined,
      vehicle_type: vehicleType || undefined,
      plate: plate.trim() || undefined,
      next_maintenance_date: nextDate ? `${nextDate}T12:00:00-06:00` : null,
      next_maintenance_mileage: nextMileage ? Number(nextMileage) : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Marca</label>
          <input
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            placeholder="ej. Toyota"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Modelo</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="ej. Corolla"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Año</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2020"
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs text-white/50">Tipo</label>
          <select
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
          >
            <option value="">Sin especificar</option>
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-white/50">Placa</label>
        <input
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          placeholder="Opcional"
          className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
        />
      </div>

      <div className="border-t border-white/8 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">
          Próximo mantenimiento (opcional)
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Fecha</label>
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark]"
            />
            <p className="text-[11px] text-white/30">Si la ponés, te avisamos ese día por WhatsApp/Telegram.</p>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label className="text-xs text-white/50">Kilometraje</label>
            <input
              type="number"
              value={nextMileage}
              onChange={(e) => setNextMileage(e.target.value)}
              placeholder="ej. 55000"
              className="border border-deep-blue/40 bg-black/20 rounded-lg px-3 py-2 placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
            />
            <p className="text-[11px] text-white/30">Solo indicador visual — no hay aviso automático por km.</p>
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2 mt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-white/70 hover:bg-white/5"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
        >
          {pending ? "Guardando..." : submitLabel}
        </button>
      </div>
    </form>
  );
}

function NewVehicleModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const createVehicle = useMutation({
    mutationFn: api.createVehicle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo crear el vehículo"),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20">
      <div className="relative w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        <h2 className="text-lg font-medium mb-3">Nuevo vehículo</h2>
        <VehicleForm
          onSubmit={(input) => {
            setError(null);
            createVehicle.mutate(input);
          }}
          onCancel={onClose}
          pending={createVehicle.isPending}
          error={error}
          submitLabel="Crear vehículo"
        />
      </div>
    </div>
  );
}

function AddMaintenanceForm({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [mileage, setMileage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMaintenance = useMutation({
    mutationFn: (input: NewMaintenance) => api.createMaintenance(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-maintenance", vehicleId] });
      setDescription("");
      setMileage("");
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar el mantenimiento"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!date || !description.trim()) {
      setError("Completa fecha y qué mantenimiento se hizo.");
      return;
    }
    createMaintenance.mutate({
      vehicle_id: vehicleId,
      date: `${date}T12:00:00-06:00`,
      description: description.trim(),
      mileage: mileage ? Number(mileage) : undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 bg-black/20 rounded-xl p-3 border border-white/10">
      <div className="flex gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-electric-cyan/70 [color-scheme:dark] flex-1"
        />
        <input
          type="number"
          value={mileage}
          onChange={(e) => setMileage(e.target.value)}
          placeholder="Km"
          className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 w-24"
        />
      </div>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="ej. Cambio de aceite"
        className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={createMaintenance.isPending}
        className="self-end bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
      >
        {createMaintenance.isPending ? "Guardando..." : "Agregar"}
      </button>
    </form>
  );
}

// Lectura de odómetro suelta — distinta de un mantenimiento (no implica que
// se hizo un servicio). Mismo mecanismo que usa Quicks mensualmente vía
// registrar_kilometraje, solo que acá es manual.
function AddMileageForm({ vehicleId, onDone }: { vehicleId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [mileage, setMileage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createLog = useMutation({
    mutationFn: (input: NewMileageLog) => api.createMileageLog(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-mileage", vehicleId] });
      setMileage("");
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo guardar el kilometraje"),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!mileage) {
      setError("Poné el kilometraje actual.");
      return;
    }
    createLog.mutate({ vehicle_id: vehicleId, mileage: Number(mileage) });
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 bg-black/20 rounded-xl p-3 border border-white/10">
      <input
        type="number"
        value={mileage}
        onChange={(e) => setMileage(e.target.value)}
        placeholder="Kilometraje actual"
        autoFocus
        className="border border-deep-blue/40 bg-black/20 rounded-lg px-2 py-1.5 text-sm placeholder:text-white/30 focus:outline-none focus:border-electric-cyan/70 flex-1"
      />
      {error && <p className="text-xs text-red-400 self-center">{error}</p>}
      <button
        type="submit"
        disabled={createLog.isPending}
        className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition flex-shrink-0"
      >
        {createLog.isPending ? "Guardando..." : "Agregar"}
      </button>
    </form>
  );
}

function VehicleDetail({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [showAddMileage, setShowAddMileage] = useState(false);
  const [confirmingDeleteVehicle, setConfirmingDeleteVehicle] = useState(false);
  const [maintenanceToDelete, setMaintenanceToDelete] = useState<VehicleMaintenance | null>(null);
  const [mileageToDelete, setMileageToDelete] = useState<VehicleMileageLog | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: maintenance, isLoading } = useQuery({
    queryKey: ["vehicle-maintenance", vehicle.id],
    queryFn: () => api.listMaintenance(vehicle.id),
  });
  const { data: mileageLogs, isLoading: loadingMileage } = useQuery({
    queryKey: ["vehicle-mileage", vehicle.id],
    queryFn: () => api.listMileageLogs(vehicle.id),
  });

  const updateVehicle = useMutation({
    mutationFn: (input: NewVehicle) => api.updateVehicle(vehicle.id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo actualizar el vehículo"),
  });

  const deleteVehicle = useMutation({
    mutationFn: () => api.deleteVehicle(vehicle.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "No se pudo borrar el vehículo"),
  });

  const deleteMaintenance = useMutation({
    mutationFn: (id: string) => api.deleteMaintenance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-maintenance", vehicle.id] });
      setMaintenanceToDelete(null);
    },
  });

  const deleteMileageLog = useMutation({
    mutationFn: (id: string) => api.deleteMileageLog(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vehicle-mileage", vehicle.id] });
      setMileageToDelete(null);
    },
  });

  // Kilometraje recorrido en el último mes: diferencia entre la lectura más
  // reciente y la más reciente de hace >= 30 días — no un promedio ni un
  // corte de calendario exacto, solo una idea rápida de "cuánto se usó".
  const sortedMileage = [...(mileageLogs ?? [])].sort(
    (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime(),
  );
  const latestReading = sortedMileage[0];
  const monthAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const priorReading = sortedMileage.find((m) => new Date(m.logged_at).getTime() <= monthAgoMs) ?? sortedMileage[1];
  const monthlyUsage =
    latestReading && priorReading && latestReading.id !== priorReading.id
      ? latestReading.mileage - priorReading.mileage
      : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="relative w-full max-w-md border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-4 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
        <CornerBrackets />
        {editing ? (
          <>
            <h2 className="text-lg font-medium">Editar vehículo</h2>
            <VehicleForm
              initial={{
                brand: vehicle.brand,
                model: vehicle.model,
                year: vehicle.year ?? undefined,
                vehicle_type: vehicle.vehicle_type ?? undefined,
                plate: vehicle.plate ?? undefined,
                next_maintenance_date: vehicle.next_maintenance_date,
                next_maintenance_mileage: vehicle.next_maintenance_mileage,
              }}
              onSubmit={(input) => {
                setError(null);
                updateVehicle.mutate(input);
              }}
              onCancel={() => setEditing(false)}
              pending={updateVehicle.isPending}
              error={error}
              submitLabel="Guardar"
            />
          </>
        ) : (
          <>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {vehicle.brand} {vehicle.model}
              </h2>
              <p className="text-sm text-white/50 mt-0.5">
                {[vehicle.year, vehicle.vehicle_type, vehicle.plate].filter(Boolean).join(" · ") || "Sin más datos"}
              </p>
              <MaintenanceAlerts
                vehicle={vehicle}
                maxLoggedMileage={
                  [...(maintenance ?? []).map((m) => m.mileage), ...(mileageLogs ?? []).map((m) => m.mileage)].reduce<
                    number | null
                  >((max, km) => (km != null && (max == null || km > max) ? km : max), null)
                }
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border border-white/10 rounded-lg px-2 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="border border-electric-cyan/40 text-electric-cyan rounded-lg px-2 py-2 text-sm hover:bg-electric-cyan/10 transition"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDeleteVehicle(true)}
                disabled={deleteVehicle.isPending}
                className="border border-red-400/40 text-red-400 rounded-lg px-2 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteVehicle.isPending ? "..." : "Borrar"}
              </button>
            </div>

            <div className="border-t border-white/8 pt-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Historial de mantenimiento</p>
                <button
                  type="button"
                  onClick={() => setShowAddMaintenance((v) => !v)}
                  className="text-xs text-electric-cyan hover:brightness-110"
                >
                  {showAddMaintenance ? "Cancelar" : "+ Agregar"}
                </button>
              </div>

              {showAddMaintenance && (
                <div className="mb-3">
                  <AddMaintenanceForm vehicleId={vehicle.id} onDone={() => setShowAddMaintenance(false)} />
                </div>
              )}

              {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}
              {maintenance && maintenance.length === 0 && !isLoading && (
                <p className="text-white/40 text-sm">Sin registros todavía.</p>
              )}

              {maintenance && maintenance.length > 0 && (
                <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                  {maintenance.map((m: VehicleMaintenance) => (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm group"
                    >
                      <div className="min-w-0">
                        <p className="text-white/90">{m.description}</p>
                        <p className="text-white/40 text-xs mt-0.5">
                          {formatDate(m.date)}
                          {m.mileage != null ? ` · ${m.mileage.toLocaleString("es-CR")} km` : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMaintenanceToDelete(m)}
                        aria-label="Borrar registro"
                        className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        <IconX className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-white/8 pt-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/40">Kilometraje</p>
                  {monthlyUsage != null && (
                    <p className="text-[11px] text-white/40 mt-0.5">
                      ~{monthlyUsage.toLocaleString("es-CR")} km en el último mes
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddMileage((v) => !v)}
                  className="text-xs text-electric-cyan hover:brightness-110"
                >
                  {showAddMileage ? "Cancelar" : "+ Agregar"}
                </button>
              </div>

              {showAddMileage && (
                <div className="mb-3">
                  <AddMileageForm vehicleId={vehicle.id} onDone={() => setShowAddMileage(false)} />
                </div>
              )}

              {loadingMileage && <p className="text-white/40 text-sm">Cargando...</p>}
              {sortedMileage.length === 0 && !loadingMileage && (
                <p className="text-white/40 text-sm">
                  Sin lecturas todavía — activá el aviso mensual en Configuración para que Quicks te lo
                  pregunte solo.
                </p>
              )}

              {sortedMileage.length > 0 && (
                <ul className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                  {sortedMileage.map((m, i) => {
                    const prev = sortedMileage[i + 1];
                    const delta = prev ? m.mileage - prev.mileage : null;
                    return (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm group"
                      >
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="text-white/90">{m.mileage.toLocaleString("es-CR")} km</span>
                          {m.created_by === "agent" && <QuickBadge iconOnly />}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-white/40 text-xs">
                            {formatDate(m.logged_at)}
                            {delta != null && delta > 0 ? ` · +${delta.toLocaleString("es-CR")} km` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMileageToDelete(m)}
                            aria-label="Borrar lectura"
                            className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <IconX className="w-4 h-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {confirmingDeleteVehicle && (
        <ConfirmDialog
          message={`¿Borrar ${vehicle.brand} ${vehicle.model}? Esto borra también su historial.`}
          pending={deleteVehicle.isPending}
          onCancel={() => setConfirmingDeleteVehicle(false)}
          onConfirm={() => deleteVehicle.mutate()}
        />
      )}
      {maintenanceToDelete && (
        <ConfirmDialog
          message={`¿Borrar el registro "${maintenanceToDelete.description}"?`}
          pending={deleteMaintenance.isPending}
          onCancel={() => setMaintenanceToDelete(null)}
          onConfirm={() => deleteMaintenance.mutate(maintenanceToDelete.id)}
        />
      )}
      {mileageToDelete && (
        <ConfirmDialog
          message={`¿Borrar la lectura de ${mileageToDelete.mileage.toLocaleString("es-CR")} km?`}
          pending={deleteMileageLog.isPending}
          onCancel={() => setMileageToDelete(null)}
          onConfirm={() => deleteMileageLog.mutate(mileageToDelete.id)}
        />
      )}
    </div>
  );
}

export function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { data: vehicles, isLoading } = useQuery({ queryKey: ["vehicles"], queryFn: api.listVehicles });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehículos</h1>
          <p className="text-sm text-white/40">Tus vehículos y su historial de mantenimiento</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-br from-deep-blue via-electric-cyan to-electric-cyan text-night-blue font-semibold rounded-lg shadow-[0_0_18px_-4px_rgba(0,210,255,0.55)] px-3 py-2 text-sm hover:brightness-110 transition flex-shrink-0"
        >
          + Agregar vehículo
        </button>
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}
      {vehicles && vehicles.length === 0 && !isLoading && (
        <div className="bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-5">
          <p className="text-white/40 text-sm">No hay vehículos todavía.</p>
        </div>
      )}

      {vehicles && vehicles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {vehicles.map((v: Vehicle) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVehicle(v)}
              className="text-left bg-night-blue/40 backdrop-blur-md rounded-2xl border border-electric-cyan/10 shadow-[0_0_40px_-24px_rgba(0,210,255,0.35)] p-4 hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-semibold text-white/90 flex items-center gap-2">
                {v.brand} {v.model}
                {v.created_by === "agent" && <QuickBadge iconOnly />}
              </p>
              <p className="text-xs text-white/40 mt-1">
                {[v.year, v.vehicle_type, v.plate].filter(Boolean).join(" · ") || "Sin más datos"}
              </p>
              {v.next_maintenance_date && new Date(v.next_maintenance_date).getTime() < Date.now() && (
                <span className="inline-block mt-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-400/15 text-red-400">
                  Mantenimiento vencido
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {showForm && <NewVehicleModal onClose={() => setShowForm(false)} />}
      {selectedVehicle && <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />}
    </div>
  );
}
