/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dossier de compilation. Permet de vérifier un build (NEXT_DIST_DIR=.next-verif)
  // sans écraser le .next du serveur de développement en cours d'exécution.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    // /simplicicar renommé en /simplicicar-paris-17 — garde les anciens liens déjà envoyés
    // aux leads (SMS/mail) fonctionnels.
    return [{ source: "/simplicicar", destination: "/simplicicar-paris-17", permanent: true }];
  },
};

export default nextConfig;
