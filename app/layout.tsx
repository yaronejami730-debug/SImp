import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prise de rendez-vous — Simplisicar",
  description: "Crée un rendez-vous dans Google Agenda et envoie le mail.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
