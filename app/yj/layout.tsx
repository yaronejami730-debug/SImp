import type { Metadata } from "next";

// Espace YJ Solutions : indépendant du CRM RDV, pas dans la sidebar Simplicicar.
export const metadata: Metadata = {
  title: "YJ Solutions",
  description: "YJ Solutions — Formation",
};

export default function YjLayout({ children }: { children: React.ReactNode }) {
  return children;
}
