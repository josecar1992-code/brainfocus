# Reglas del proyecto (Focusbrain / FocusbrainCR)

## Fechas y horas: siempre Costa Rica explícito, nunca la hora del entorno

Costa Rica es `UTC-6` fijo, sin horario de verano. **Nunca** construir una fecha/hora confiando en
la zona horaria del navegador, del sistema operativo o del proceso donde corre el código (`new
Date(str).toISOString()`, `Date.now()` sin offset, `toLocaleString()` sin `timeZone` explícito,
etc.) — el dispositivo del usuario o el contenedor donde corre la API pueden estar en cualquier
zona horaria, y eso produce desfases silenciosos (confirmado en producción: un aviso puesto para
las 10:51am quedó guardado para las 11:51am por esto, ver `PENDIENTES.md`).

**Regla:** toda fecha/hora que involucre "la hora real en Costa Rica" tiene que construirse o
mostrarse con el offset `-06:00` explícito, o con `timeZone: "America/Costa_Rica"` explícito si se
usa `Intl`/`toLocaleString`. Ya existe infraestructura para esto, usarla en vez de reinventar:

- `packages/shared-time` (`CR_OFFSET`, `horaActualCR()`, `isoACostaRica()`,
  `canRemindTwoHoursBefore()`) — paquete compartido entre `apps/web`, `apps/api` y `apps/mcp`.
- Al combinar un `<input type="date">` + `<input type="time">` (o `datetime-local`) del usuario en
  un ISO string para mandar a la API: `` `${fecha}T${hora}:00${CR_OFFSET}` ``, nunca
  `new Date(valor).toISOString()`.
- Al mostrarle una fecha al usuario con `toLocaleString`/`toLocaleDateString`: pasar siempre
  `timeZone: "America/Costa_Rica"` en las options.
- Al necesitar "la hora de ahora mismo" del lado del servidor (para inyectarla en un prompt de
  Quicks, por ejemplo): usar `horaActualCR()` de `shared-time`, no `new Date()` a secas.

Antes de agregar cualquier código nuevo que arme, compare o muestre una fecha/hora, revisar que no
esté dependiendo implícitamente de la zona horaria del entorno donde corre.

## Todo cambio en la app queda documentado, sin que haga falta pedirlo

Cualquier cambio real hecho en este repo (feature nueva, fix de bug, cambio de comportamiento,
migración de datos, cambio de infraestructura/deploy) se documenta en `PENDIENTES.md` (o
`README.md` si es algo permanente de cara a cómo funciona la app) **como parte del mismo trabajo**,
no como un paso aparte que el usuario tiene que pedir. Esto aplica siempre, no solo cuando el
usuario dice "documenta" o "revisa que no quede nada sin documentar".

- Se documenta antes o junto con el commit, nunca "después, si da tiempo".
- Incluye: qué cambió, por qué (el motivo real, no solo la mecánica), y en qué archivo(s) vive.
- Si el cambio corrige algo mal hecho antes (como el bug de zona horaria de arriba), documentar
  también la causa raíz — para que quede el aprendizaje, no solo el fix.
- Esto no reemplaza preguntarle al usuario cuando una decisión de producto/diseño no está clara
  (eso sigue siendo necesario) — es específicamente sobre no dejar trabajo ya hecho sin registrar.
