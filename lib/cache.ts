// Cache court des réponses d'API côté navigateur : l'écran s'affiche instantanément
// avec les dernières données connues, puis se rafraîchit en arrière-plan.

type Entry = { at: number; value: unknown };

const mem = new Map<string, Entry>();
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

function storageKey(key: string) {
  return `cache:${key}`;
}

/** Dernière valeur connue pour cette clé (mémoire, puis sessionStorage), ou null si trop ancienne. */
export function getCached<T>(key: string, ttlMs: number = DEFAULT_TTL): T | null {
  let e = mem.get(key);
  if (!e && typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(storageKey(key));
      if (raw) { e = JSON.parse(raw) as Entry; mem.set(key, e); }
    } catch { /* quota ou JSON invalide : on ignore */ }
  }
  if (!e || Date.now() - e.at > ttlMs) return null;
  return e.value as T;
}

export function setCached(key: string, value: unknown): void {
  const e: Entry = { at: Date.now(), value };
  mem.set(key, e);
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(storageKey(key), JSON.stringify(e)); } catch { /* quota dépassé */ }
}

/** Vide le cache (déconnexion, changement de compte). */
export function clearCache(): void {
  mem.clear();
  if (typeof window === "undefined") return;
  try {
    for (const k of Object.keys(sessionStorage)) if (k.startsWith("cache:")) sessionStorage.removeItem(k);
  } catch { /* rien à faire */ }
}
