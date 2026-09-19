const TOKEN_KEY = "token";
const ROLE_CLAIM = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";

export interface Session {
  token: string;
  userId: string | null;
  isAdmin: boolean;
}

function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function loadSession(): Session | null {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const payload = decodePayload(token);
  const exp = payload?.exp;
  if (!payload || (typeof exp === "number" && exp * 1000 <= Date.now())) {
    clearSession();
    return null;
  }

  const roles = [payload[ROLE_CLAIM] ?? payload.role ?? []].flat();
  return {
    token,
    userId: typeof payload.sub === "string" ? payload.sub : null,
    isAdmin: roles.includes("Admin"),
  };
}

export function saveSession(token: string): Session | null {
  localStorage.setItem(TOKEN_KEY, token);
  return loadSession();
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("role");
}
