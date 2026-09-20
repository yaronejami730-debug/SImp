import { readFileSync } from "node:fs";
import { Pool } from "pg";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const pool = new Pool({
  connectionString: env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

const PROGRAMME = [
  "Présentation de YJ Solutions et du fonctionnement de la mission",
  "Présentation du partenaire avec lequel le téléprospecteur va travailler",
  "Attitude et posture au téléphone",
  "Comment établir rapidement un bon contact avec un prospect",
  "Comment présenter correctement la proposition",
  "Gestion des objections",
  "Réponses aux questions fréquentes",
  "Répartie et comportement pendant l'appel",
  "Qualification du prospect",
  "Prise de rendez-vous",
  "Utilisation des différents supports de prospection",
  "Évaluation pratique avant passage au niveau suivant",
].map((title) => ({ title }));

const SLOT_TEMPLATE = [1, 2, 3, 4].flatMap((weekday) => [
  { weekday, start: "10:00", end: "12:00", type: "individuel", capacity: 1 },
  { weekday, start: "16:00", end: "19:00", type: "individuel", capacity: 1 },
]);

const client = await pool.connect();
try {
  for (const file of ["formation_partners.sql", "formation_settings.sql", "formation_slots.sql", "formation_registrations.sql"]) {
    await client.query(readFileSync(`supabase/${file}`, "utf8"));
  }

  const { rows: existingPartner } = await client.query(`select id from formation_partners where name = $1`, ["SimpliciCar Paris 17"]);
  const partnerId = existingPartner[0]?.id ?? (
    await client.query(`insert into formation_partners (name) values ($1) returning id`, ["SimpliciCar Paris 17"])
  ).rows[0].id;

  await client.query(
    `insert into formation_settings (id, slot_template, default_partner_id, auto_send_enabled, programme)
     values (1, $1, $2, false, $3)
     on conflict (id) do nothing`,
    [JSON.stringify(SLOT_TEMPLATE), partnerId, JSON.stringify(PROGRAMME)],
  );

  console.log("OK: tables formation_* créées + seed (partenaire par défaut, modèle horaire, programme).");
} finally {
  client.release();
  await pool.end();
}
