const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1")
  .toString()
  .trim();

const ACCESS_TOKEN_KEY = "cookops_access_token";

export function getApiBase(): string {
  return API_BASE;
}

export function getAccessToken(): string {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? "";
}

export function clearAccessToken(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const accessToken = getAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}

export async function loginWithPassword(password: string): Promise<void> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) {
    throw new Error(response.status === 429 ? "rate_limited" : "invalid_credentials");
  }
  const payload = (await response.json()) as { token?: unknown };
  if (typeof payload.token !== "string" || !payload.token) {
    throw new Error("invalid_response");
  }
  sessionStorage.setItem(ACCESS_TOKEN_KEY, payload.token);
  localStorage.removeItem("cookops_api_key");
}

export async function apiFetch(path: string, init: RequestInit = {}, includeJson = true): Promise<Response> {
  const headers = new Headers(init.headers ?? {});
  Object.entries(getAuthHeaders()).forEach(([name, value]) => headers.set(name, value));
  if (includeJson && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if ((response.status === 401 || response.status === 403) && getAccessToken()) {
    clearAccessToken();
    window.location.reload();
  }
  return response;
}
