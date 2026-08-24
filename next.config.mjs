/** @type {import('next').NextConfig} */
const nextConfig = {
  // Dossier de compilation. Permet de vérifier un build (NEXT_DIST_DIR=.next-verif)
  // sans écraser le .next du serveur de développement en cours d'exécution.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
