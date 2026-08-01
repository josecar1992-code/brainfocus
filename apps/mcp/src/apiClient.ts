const BASE_URL = process.env.BRAINFOCUS_API_URL;
const API_KEY = process.env.BRAINFOCUS_API_KEY;

if (!BASE_URL) throw new Error("Falta BRAINFOCUS_API_URL");
if (!API_KEY) throw new Error("Falta BRAINFOCUS_API_KEY");

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": API_KEY as string,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BrainFocus API ${res.status} en ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
