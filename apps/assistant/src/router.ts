// A quién le toca cada mensaje entrante. La decisión depende SOLO del número del
// remitente (que viene firmado por Kapso), nunca de lo que diga el texto ni de
// lo que decida el modelo: de aquí sale el user_id que se fija en cada llamada.
export type Route =
  | { kind: "user"; userId: string }
  | { kind: "forward" } // se reenvía a OpenClaw (dueño en transición)
  | { kind: "drop" } // se descarta sin responder (personal de QuickWash)
  | { kind: "unregistered" }; // número desconocido o cuenta no activa: solo invitación a registrarse

export interface RouteDeps {
  dropNumbers: ReadonlySet<string>;
  forwardNumbers: ReadonlySet<string>;
  /** Perfil vinculado a ese número, o null. */
  lookupUser: (phone: string) => Promise<{ userId: string; status: string } | null>;
}

// Precedencia: descartar > reenviar > usuario registrado > desconocido. El
// reenvío va antes que el registro para que el dueño siga con su Quicks de
// OpenClaw aunque algún día vincule su número también aquí.
export async function resolveRoute(phone: string, deps: RouteDeps): Promise<Route> {
  if (deps.dropNumbers.has(phone)) return { kind: "drop" };
  if (deps.forwardNumbers.has(phone)) return { kind: "forward" };
  const user = await deps.lookupUser(phone);
  if (user && user.status === "active") return { kind: "user", userId: user.userId };
  return { kind: "unregistered" };
}

export function parseNumberList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((n) => n.replace(/[^\d]/g, ""))
      .filter((d) => d.length >= 8)
      .map((d) => `+${d}`),
  );
}
