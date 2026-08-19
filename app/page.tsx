import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page indisponible",
  description: "",
  robots: { index: false, follow: false },
};

// Charte reprise de l'espace DDE (beige + encre), sans marque : cette page ne mène nulle part.
const INK = "#1a1a1a";
const BG = "#faf8f5";
const LINE = "#b8b3ac";
const MUTED = "#a8a39a";

/**
 * Racine du domaine : page volontairement sans issue.
 * Aucun lien, aucune mention des espaces internes — on y accède par une URL connue (/simplicicar, /dde).
 */
export default function Racine() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(24px, 6vw, 64px) 20px",
        background: BG,
        color: INK,
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
      }}
    >
      <style>{`
        @keyframes racine-sway { 0%,100% { transform: rotate(-2.5deg); } 50% { transform: rotate(2.5deg); } }
        @keyframes racine-bob  { 0%,100% { transform: translateY(0); }   50% { transform: translateY(-4px); } }
        .racine-bras  { animation: racine-sway 4.5s ease-in-out infinite; transform-origin: 180px 150px; }
        .racine-corps { animation: racine-bob 4.5s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .racine-bras, .racine-corps { animation: none; } }
      `}</style>

      <div style={{ width: "100%", maxWidth: 560, textAlign: "center" }}>
        {/* Bulle de dialogue */}
        <div style={{ display: "inline-block", position: "relative", marginBottom: 26 }}>
          <div
            style={{
              background: "#fff",
              border: `1px solid ${LINE}`,
              borderRadius: 24,
              padding: "16px 24px",
              fontSize: "clamp(15px, 3.6vw, 18px)",
              fontWeight: 700,
            }}
          >
            « Je ne peux rien faire pour vous. »
          </div>
          <div
            style={{
              position: "absolute", left: "50%", bottom: -9, width: 16, height: 16,
              marginLeft: -8, background: "#fff",
              borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`,
              transform: "rotate(45deg)",
            }}
          />
        </div>

        {/* Bonhomme avec deux prises débranchées */}
        <svg viewBox="0 0 360 300" width="100%" style={{ maxWidth: 340, height: "auto", display: "block", margin: "0 auto 34px" }} aria-hidden="true">
          <g fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            {/* Sol */}
            <line x1="72" y1="272" x2="288" y2="272" stroke={LINE} strokeWidth="2" />

            <g className="racine-corps">
              {/* Tête */}
              <circle cx="180" cy="96" r="32" fill="#fff" />
              <path d="M168 88h.01M192 88h.01" strokeWidth="7" />
              <path d="M158 78c5-4 11-4 15-1M187 77c4-3 10-3 15 1" strokeWidth="2.4" />
              <path d="M167 112c4-5 9-5 13 0s9 5 13 0" strokeWidth="2.4" />

              {/* Corps + jambes */}
              <path d="M180 128v14" />
              <rect x="154" y="142" width="52" height="66" rx="24" fill="#fff" />
              <path d="M166 208l-6 44M194 208l6 44M148 254h20M192 254h20" />

              {/* Bras levés, une prise débranchée dans chaque main */}
              <g className="racine-bras">
                <path d="M158 156c-22 6-38-6-48-26M202 156c22 6 38-6 48-26" />

                {/* Prise gauche : corps + fiches solidaires */}
                <g transform="rotate(-18 95 105)">
                  <rect x="76" y="88" width="38" height="34" rx="10" fill="#fff" />
                  <path d="M88 88v-15M102 88v-15" strokeWidth="6" />
                </g>
                <circle cx="105" cy="124" r="6" fill="#fff" />
                <path d="M100 121c-4 24-20 30-30 44" strokeWidth="2.4" />

                {/* Prise droite */}
                <g transform="rotate(18 265 105)">
                  <rect x="246" y="88" width="38" height="34" rx="10" fill="#fff" />
                  <path d="M258 88v-15M272 88v-15" strokeWidth="6" />
                </g>
                <circle cx="255" cy="124" r="6" fill="#fff" />
                <path d="M260 121c4 24 20 30 30 44" strokeWidth="2.4" />
              </g>
            </g>

            {/* Petites étincelles de déconnexion */}
            <g stroke={MUTED} strokeWidth="2.4">
              <path d="M74 62l-9-7M90 48l-3-11M62 82l-12-3" />
              <path d="M286 62l9-7M270 48l3-11M298 82l12-3" />
            </g>
          </g>
        </svg>

        <h1
          style={{
            fontSize: "clamp(26px, 6vw, 38px)",
            fontWeight: 800,
            letterSpacing: "-0.01em",
            lineHeight: 1.2,
            margin: "0 0 16px",
          }}
        >
          Cette page n’est pas disponible
        </h1>

        <p style={{ fontSize: "clamp(15px, 3.6vw, 17px)", lineHeight: 1.6, color: MUTED, margin: 0 }}>
          Rien à voir ici, rien à brancher. Vraiment rien.
        </p>
      </div>
    </main>
  );
}
