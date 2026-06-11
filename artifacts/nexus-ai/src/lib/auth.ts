import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "nxs-access-token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Attach the stored token to every generated API hook call. */
export function initAuth(): void {
  setAuthTokenGetter(getToken);
}

/** Headers for raw fetch calls (e.g. the SSE chat stream) that bypass the generated client. */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Probe whether the API accepts our current credentials.
 * Returns "ok" when no token is required or the stored one works.
 */
export async function probeAuth(): Promise<"ok" | "unauthorized" | "error"> {
  try {
    const resp = await fetch("/api/chat/messages?limit=1", { headers: authHeaders() });
    if (resp.status === 401) return "unauthorized";
    return resp.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
