"use client";

import AppShell from "./layout/AppShell";

/** Enveloppe des pages internes du CRM.
 *  Toute la mise en page (navigation latérale, bandeau, connexion) vit dans AppShell :
 *  les pages n'ont rien à changer, elles gardent <Shell active="..." />. */
export default function Shell({ active, children, wide }: { active: string; children: React.ReactNode; wide?: boolean }) {
  return <AppShell active={active} wide={wide}>{children}</AppShell>;
}
