import type { Metadata } from "next";

// Aperçu du lien /dde quand il est partagé (WhatsApp, SMS, mail) : titre neutre, sans marque auto.
export const metadata: Metadata = {
  title: "Prise de rendez-vous",
  description: "Prise de rendez-vous",
  openGraph: {
    title: "Prise de rendez-vous",
    description: "Prise de rendez-vous",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Prise de rendez-vous",
    description: "Prise de rendez-vous",
  },
};

export default function DdeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
