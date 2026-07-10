// Helpers d'auth côté client (localStorage). À n'utiliser que dans des composants client.

export type ClientUser = { email: string; name: string; role: "admin" | "responsable" | "collab"; callCenterId?: number; isCommercial?: boolean; isTeleprospector?: boolean };

export function getToken(): string | null {
  return typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
}

export function getUser(): ClientUser | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(localStorage.getItem("auth_user") || "null");
  } catch {
    return null;
  }
}

export type BrandTheme = { name: string; primary: string; dark: string; logo: string; headerDark?: boolean };

export function setAuth(token: string, user: ClientUser, theme?: BrandTheme | null) {
  localStorage.setItem("auth_token", token);
  localStorage.setItem("auth_user", JSON.stringify(user));
  if (theme) localStorage.setItem("auth_theme", JSON.stringify(theme));
  else localStorage.removeItem("auth_theme");
  applyTheme();
}

export function getTheme(): BrandTheme | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem("auth_theme") || "null"); } catch { return null; }
}

/** Applique le thème de la franchise (couleurs CSS) sur tout le CRM. */
export function applyTheme() {
  if (typeof document === "undefined") return;
  const t = getTheme();
  const root = document.documentElement;
  if (t?.primary) root.style.setProperty("--brand-primary", t.primary); else root.style.removeProperty("--brand-primary");
  if (t?.dark) root.style.setProperty("--brand-dark", t.dark); else root.style.removeProperty("--brand-dark");
}

export function clearAuth() {
  localStorage.removeItem("auth_token");
  localStorage.removeItem("auth_user");
  localStorage.removeItem("auth_theme");
  applyTheme();
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const t = getToken();
  return t ? { ...extra, Authorization: `Bearer ${t}` } : extra;
}
