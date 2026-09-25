/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dossier de compilation. Permet de vérifier un build (NEXT_DIST_DIR=.next-verif)
  // sans écraser le .next du serveur de développement en cours d'exécution.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    // /simplicicar renommé en /simplicicar-paris-17 — garde les anciens liens déjà envoyés
    // aux leads (SMS/mail) fonctionnels.
    // /prospection-agence/comptes déplacé vers /comptes : c'est de l'admin CRM générique, pas
    // du démarchage B2B YJ Solutions — ne devait jamais vivre sous ce préfixe.
    return [
      { source: "/simplicicar", destination: "/simplicicar-paris-17", permanent: true },
      { source: "/prospection-agence/comptes", destination: "/comptes", permanent: true },
    ];
  },
};

export default nextConfig;
