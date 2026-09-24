// Botón compartido de "Cargar más" para las listas paginadas (ver
// usePaginatedList.ts) — mismo estilo en Tareas y Proyectos.
export function LoadMoreButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <div className="px-5 py-3 border-t border-white/8">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="w-full text-center text-sm text-electric-cyan/80 hover:text-electric-cyan py-1.5 disabled:opacity-50 transition-colors"
      >
        {loading ? "Cargando..." : "Cargar más"}
      </button>
    </div>
  );
}
