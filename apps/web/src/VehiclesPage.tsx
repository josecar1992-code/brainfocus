import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type NewMaintenance, type NewVehicle, type Vehicle, type VehicleMaintenance } from "./api";

const VEHICLE_TYPES = ["Sedán", "SUV", "Pickup", "Hatchback", "Moto", "Otro"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" });
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!brand.trim() || !model.trim()) return;
    onSubmit({
      brand: brand.trim(),
      model: model.trim(),
      year: year ? Number(year) : undefined,
      vehicle_type: vehicleType || undefined,
      plate: plate.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex gap-2">
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

      <div className="flex gap-2">
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
          className="flex-1 bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-2 disabled:opacity-50 hover:brightness-110 transition"
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
      <div className="w-full max-w-sm border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
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
        className="self-end bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-1.5 text-sm disabled:opacity-50 hover:brightness-110 transition"
      >
        {createMaintenance.isPending ? "Guardando..." : "Agregar"}
      </button>
    </form>
  );
}

function VehicleDetail({ vehicle, onClose }: { vehicle: Vehicle; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showAddMaintenance, setShowAddMaintenance] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: maintenance, isLoading } = useQuery({
    queryKey: ["vehicle-maintenance", vehicle.id],
    queryFn: () => api.listMaintenance(vehicle.id),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vehicle-maintenance", vehicle.id] }),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4 z-20 overflow-y-auto py-8">
      <div className="w-full max-w-md border border-electric-cyan/20 bg-night-blue rounded-2xl p-6 flex flex-col gap-4 shadow-[0_0_60px_-15px_rgba(0,210,255,0.25)]">
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
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/5"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex-1 border border-electric-cyan/40 text-electric-cyan rounded-lg px-3 py-2 text-sm hover:bg-electric-cyan/10 transition"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirm(`¿Borrar ${vehicle.brand} ${vehicle.model}? Esto borra también su historial.`))
                    deleteVehicle.mutate();
                }}
                disabled={deleteVehicle.isPending}
                className="flex-1 border border-red-400/40 text-red-400 rounded-lg px-3 py-2 text-sm hover:bg-red-400/10 transition disabled:opacity-50"
              >
                {deleteVehicle.isPending ? "Borrando..." : "Borrar"}
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
                        onClick={() => deleteMaintenance.mutate(m.id)}
                        aria-label="Borrar registro"
                        className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function VehiclesPage() {
  const [showForm, setShowForm] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const { data: vehicles, isLoading } = useQuery({ queryKey: ["vehicles"], queryFn: api.listVehicles });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Vehículos</h1>
          <p className="text-sm text-white/40">Tus vehículos y su historial de mantenimiento</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="bg-electric-cyan text-night-blue font-medium rounded-lg px-3 py-2 text-sm hover:brightness-110 transition"
        >
          + Agregar vehículo
        </button>
      </div>

      {isLoading && <p className="text-white/40 text-sm">Cargando...</p>}
      {vehicles && vehicles.length === 0 && !isLoading && (
        <div className="bg-white/5 rounded-2xl shadow-sm border border-white/10 p-5">
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
              className="text-left bg-white/5 rounded-2xl shadow-sm border border-white/10 p-4 hover:bg-white/10 transition-colors"
            >
              <p className="text-sm font-semibold text-white/90">
                {v.brand} {v.model}
              </p>
              <p className="text-xs text-white/40 mt-1">
                {[v.year, v.vehicle_type, v.plate].filter(Boolean).join(" · ") || "Sin más datos"}
              </p>
            </button>
          ))}
        </div>
      )}

      {showForm && <NewVehicleModal onClose={() => setShowForm(false)} />}
      {selectedVehicle && <VehicleDetail vehicle={selectedVehicle} onClose={() => setSelectedVehicle(null)} />}
    </div>
  );
}
