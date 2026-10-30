// Módulos opcionales que se pueden habilitar o no por usuario. Hoy, Agenda,
// Tareas, Asistente, Resumen y Configuración son el núcleo y siempre están
// disponibles; el resto se enciende por usuario en `profiles.enabled_modules`
// (null = todos, que es lo que tiene el dueño). Los nombres coinciden con los
// `ModuleKey` de apps/web/src/Sidebar.tsx.
export const OPTIONAL_MODULES = ["proyectos", "rutinas", "notas", "listas", "documentos", "vehiculos"] as const;

// resourceName (el de createResourceRouter / requireScope) → módulo que lo gobierna.
const MODULE_BY_RESOURCE: Record<string, string> = {
  projects: "proyectos",
  routines: "rutinas",
  routine_completions: "rutinas",
  notes: "notas",
  checklists: "listas",
  checklist_items: "listas",
  documents: "documentos",
  vehicles: "vehiculos",
  vehicle_maintenance: "vehiculos",
  vehicle_mileage: "vehiculos",
};

export function moduleForResource(resource: string): string | null {
  return MODULE_BY_RESOURCE[resource] ?? null;
}

export function isModuleAllowed(modules: string[] | null, moduleKey: string): boolean {
  return modules === null || modules.includes(moduleKey);
}
