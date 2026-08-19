import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simplicicar — Connexion",
  description: "Espace interne Simplicicar.",
  robots: { index: false, follow: false },
};

export default function SimplicicarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
