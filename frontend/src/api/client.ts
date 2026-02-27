const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

export function getApiBase(): string {
  return API_BASE;
}

export function getDefaultApiKey(): string {
  return localStorage.getItem("cookops_api_key") ?? "dev-api-key";
}

export function setDefaultApiKey(value: string): void {
  localStorage.setItem("cookops_api_key", value);
}

export async function apiFetch(path: string, init: RequestInit = {}, includeJson = true): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  headers.set("X-API-Key", getDefaultApiKey());
  if (includeJson && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}
