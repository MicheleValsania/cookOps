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

export type AuthFailureReason =
  | "invalid_credentials"
  | "invalid_invite"
  | "invalid_registration"
  | "account_exists"
  | "registration_disabled"
  | "rate_limited"
  | "offline"
  | "invalid_response";

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailureReason };

export type AuthOptions = {
  registrationEnabled: boolean;
  legacyLoginEnabled: boolean;
};

async function authenticate(path: string, payload: Record<string, string>): Promise<AuthResult> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({})) as { token?: unknown; code?: unknown };
    if (!response.ok) {
      const code = typeof body.code === "string" ? body.code : "";
      const knownReasons: AuthFailureReason[] = [
        "invalid_invite",
        "invalid_registration",
        "account_exists",
        "registration_disabled",
      ];
      if (knownReasons.includes(code as AuthFailureReason)) {
        return { ok: false, reason: code as AuthFailureReason };
      }
      return { ok: false, reason: response.status === 429 ? "rate_limited" : "invalid_credentials" };
    }
    if (typeof body.token !== "string" || !body.token) {
      return { ok: false, reason: "invalid_response" };
    }
    sessionStorage.setItem(ACCESS_TOKEN_KEY, body.token);
    localStorage.removeItem("cookops_api_key");
    return { ok: true };
  } catch {
    return { ok: false, reason: "offline" };
  }
}

export async function getAuthOptions(): Promise<AuthOptions> {
  try {
    const response = await fetch(`${API_BASE}/auth/options`);
    if (!response.ok) throw new Error("options_unavailable");
    const body = await response.json() as Record<string, unknown>;
    return {
      registrationEnabled: body.registration_enabled === true,
      legacyLoginEnabled: body.legacy_login_enabled !== false,
    };
  } catch {
    return { registrationEnabled: false, legacyLoginEnabled: true };
  }
}

export function loginWithAccount(email: string, password: string): Promise<AuthResult> {
  return authenticate("/auth/login", { email, password });
}

export function loginWithLegacyPassword(password: string): Promise<AuthResult> {
  return authenticate("/auth/login", { password });
}

export function registerOrganization(payload: {
  email: string;
  password: string;
  displayName: string;
  organizationName: string;
  inviteCode: string;
}): Promise<AuthResult> {
  return authenticate("/auth/register", {
    email: payload.email,
    password: payload.password,
    display_name: payload.displayName,
    organization_name: payload.organizationName,
    invite_code: payload.inviteCode,
  });
}

export async function loginWithPassword(password: string): Promise<void> {
  const result = await loginWithLegacyPassword(password);
  if (!result.ok) throw new Error(result.reason);
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
