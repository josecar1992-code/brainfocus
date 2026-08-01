export type AuthContext =
  | { type: "user"; userId: string }
  | { type: "agent"; userId: string; apiKeyId: string; scopes: string[] };

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
