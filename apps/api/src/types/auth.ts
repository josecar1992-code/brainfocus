interface AccessInfo {
  /** Solo el administrador ve módulos de operación del servidor (ej. Consumos). */
  isAdmin: boolean;
  /** Módulos opcionales habilitados para este usuario; null = todos (ver utils/modules.ts). */
  modules: string[] | null;
}

export type AuthContext =
  | ({ type: "user"; userId: string } & AccessInfo)
  | ({ type: "agent"; userId: string; apiKeyId: string | null; scopes: string[] } & AccessInfo);

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
