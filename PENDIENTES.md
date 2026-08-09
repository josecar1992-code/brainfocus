# Pendientes

Barrido general de la app (08-ago-2026): bugs, mejoras y funciones nuevas propuestas.
No implementado todavía — este documento es la lista de trabajo, no un changelog.

## 1. Bugs / correcciones

- ~~**[ALTO] Borrar una tarea deja el evento asociado huérfano.**~~ ✅ Resuelto — `tasks.ts` `beforeDelete`
  ahora borra también el/los eventos ligados y cancela sus recordatorios.
- ~~**[ALTO] `crear_evento` del MCP rompe el invariante "todo evento tiene tarea".**~~ ✅ Resuelto —
  `crear_evento` crea primero la tarea, igual que la web.
- ~~**[ALTO] `fields=` en `GET /:resource` acepta sintaxis de embed de Supabase sin validar.**~~ ✅ Resuelto
  — se valida a una lista simple de columnas (regex), si no cumple se ignora y usa `*`.
- ~~**[MEDIO] CORS abierto a cualquier origen si falta `CORS_ORIGINS`.**~~ ✅ Resuelto — ahora falla cerrado
  (sin origins configurados, ningún origen de navegador pasa) y loguea advertencia.
- ~~**[MEDIO] `errorHandler` filtra `err.message` crudo de Postgres al cliente.**~~ ✅ Resuelto — errores con
  `code` (PostgrestError) devuelven "Error interno" genérico; los `Error` de aplicación (mensajes pensados
  para el caller) se dejan pasar igual.
- **[MEDIO] Anti-duplicado de recordatorios es frágil ante variaciones de texto.**
  `apps/api/src/routes/reminders.ts` compara título exacto; una reformulación mínima del LLM se cuela como
  duplicado real. _(pendiente)_
- ~~**[BAJO] `routine_completions` expone escritura completa.**~~ ✅ Resuelto — nuevo flag `readOnly` en
  `createResourceRouter`, aplicado a `routine_completions` (solo GET).

## 2. Mejoras a funciones existentes

- **[MEDIO]** Editar una rutina no reprograma la ocurrencia pendiente actual
  (`apps/web/src/RoutinesPage.tsx`) — falta opción "aplicar también a hoy".
- **[MEDIO]** Fallo de `scheduleReminderCron` se maneja distinto en `reminders.ts` (falla dura, borra la
  fila) vs `apps/api/src/services/routines.ts` (se traga el error y solo loguea) — deja recordatorios de
  rutina sin aviso real, invisibles en la UI.
- **[MEDIO]** `GET /:resource` no soporta filtros por rango de fecha ni orden custom — Agenda trae hasta
  200 filas y filtra en cliente, no escala.
- **[BAJO]** `documents.ts` no valida tipo de archivo, solo tamaño (25MB).
- **[BAJO]** Sin paginación real (cursor) en ningún endpoint — límite fijo de 200.
- **[BAJO]** `AHORA_CR` en `apps/mcp/src/index.ts` se calcula una sola vez al cargar el módulo — si el
  proceso MCP vive más de una invocación, las descripciones de tools quedan con hora vieja mientras
  `hora_actual` sí es dinámica. Vale confirmar el ciclo de vida real en producción.

## 3. Funciones nuevas sugeridas

- **Módulo de proyectos** — agrupar tareas/eventos/notas/documentos bajo un proyecto con su propio
  progreso agregado (similar a `lists`, pero cross-recurso: hoy `lists` solo aplica a tareas). Encaja bien
  con el patrón ya usado en subtareas/`subtaskProgress` para mostrar % de avance, y con `created_by` para
  diferenciar iniciativa de usuario vs agente.
- Recordatorios recurrentes independientes de rutinas ("cada 2 horas", sin crear una rutina completa).
- Indicador en la UI cuando un recordatorio quedó "sin aviso real" por fallo silencioso del cron.
- Vista "Hoy" consolidada (tareas vencen hoy + eventos hoy + próxima ocurrencia de rutina) — el dato ya
  existe, falta la vista.
- Búsqueda global (Ctrl+K) — hoy `q` solo existe en notas/documentos.
- Alertas de mantenimiento vehicular por km/fecha (ya existe historial, falta el aviso proactivo).
- Multiusuario/compartido — `supabase/schema.sql` ya insinúa "single-user hoy, multi-tenant mañana".

## 4. Deuda técnica / limpieza

- **[MEDIO]** Lógica de fecha/hora CR duplicada casi idéntica entre `apps/web/src/api.ts` y
  `apps/mcp/src/index.ts` — ya empezó a divergir; candidato a paquete compartido en el monorepo.
- **[BAJO]** `trackCreatedBy` inconsistente: vehículos, ejercicio, nutrición, listas, subtareas,
  `routine_completions` no lo usan — sin badge "creado por Quicks" ahí aunque el agente sí puede escribir.
- **[BAJO]** Sin tests automatizados en ninguna app — `routineSchedule.ts` está escrito como función pura
  pensada para testear, pero nada la ejerce.
- **[BAJO]** Parseo de `limit` duplicado en `resourceRouter.ts` y `documents.ts` — centralizar en un
  helper.
