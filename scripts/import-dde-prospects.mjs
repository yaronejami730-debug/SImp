// Importe un export CSV du CRM d'origine dans le fichier d'appel DDE (table dde_prospects).
//
//   node scripts/import-dde-prospects.mjs <fichier.csv> <email-du-compte-dde>
//
// L'import est rejouable : chaque ligne est identifiée par son `id` d'origine (crm_id).
// Relancer met la fiche à jour au lieu de créer un doublon, et ne touche jamais au
// travail déjà fait dans le DDE (statut d'appel, commentaire, compteur d'appels).

import { readFileSync } from "node:fs";
import { Pool } from "pg";

const [fichier, compte] = process.argv.slice(2);
if (!fichier || !compte) {
  console.error("Usage : node scripts/import-dde-prospects.mjs <fichier.csv> <email-du-compte-dde>");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);

// ---------- Lecture CSV (guillemets doublés, retours à la ligne dans les cellules) ----------

function parseCsv(texte) {
  const t = texte.replace(/^﻿/, "");
  const lignes = [];
  let champ = "", ligne = [], guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"') { if (t[i + 1] === '"') { champ += '"'; i++; } else guillemets = false; }
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ",") { ligne.push(champ); champ = ""; }
    else if (c === "\n") { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else if (c !== "\r") champ += c;
  }
  if (champ !== "" || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  const entetes = lignes.shift();
  return lignes.filter((l) => l.some((v) => v !== "")).map((l) => Object.fromEntries(entetes.map((h, i) => [h, l[i] ?? ""])));
}

// ---------- Normalisations ----------

/** Mobile français au format « 06 12 34 56 78 », ou null si ce n'en est pas un. */
function mobileFR(brut) {
  let d = String(brut ?? "").replace(/\D/g, "");
  if (d.startsWith("0033")) d = d.slice(4);
  else if (d.startsWith("33") && d.length > 10) d = d.slice(2);
  if (d.length === 9 && /^[67]/.test(d)) d = "0" + d;
  return /^0[67]\d{8}$/.test(d) ? d.replace(/(\d{2})(?=\d)/g, "$1 ").trim() : null;
}

const propre = (v) => String(v ?? "").replace(/\s+/g, " ").trim();

/** Le CRM d'origine mettait parfois le nom complet dans les deux colonnes. */
function nomPrenom(row) {
  const a = propre(row.last_name), b = propre(row.first_name);
  if (a && b && a.toLowerCase() !== b.toLowerCase()) return { nom: a, prenom: b };
  const entier = a || b;
  const mots = entier.split(" ").filter(Boolean);
  if (mots.length < 2) return { nom: entier, prenom: "" };
  return { nom: mots.slice(1).join(" "), prenom: mots[0] };
}

const MOIS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8,
  september: 9, october: 10, november: 11, december: 12,
  janvier: 1, "février": 2, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  "août": 8, aout: 8, septembre: 9, octobre: 10, novembre: 11, "décembre": 12, decembre: 12,
};

/** Journal du CRM : dédoublonné (chaque action y figurait deux fois) et remis à plat. */
function journal(brut) {
  let liste = [];
  try { liste = JSON.parse(brut || "[]"); } catch { return []; }
  const vues = new Set();
  const out = [];
  for (const e of Array.isArray(liste) ? liste : []) {
    const action = propre(e?.action);
    const date = e?.timestamp ?? null;
    const cle = `${date}|${action}`;
    if (!action || vues.has(cle)) continue;
    vues.add(cle);
    out.push({ date, action });
  }
  return out;
}

/** Dates de rendez-vous lisibles dans le journal, dans l'ordre où elles ont été posées. */
function rendezVous(entrees) {
  const out = [];
  for (const { action } of entrees) {
    let m = action.match(/pour le (\d{1,2})\/(\d{1,2})\/(\d{4}) à (\d{1,2})h(\d{2})/);
    if (m) {
      const [, j, mo, a, h, mi] = m;
      out.push({ date: `${a}-${String(+mo).padStart(2, "0")}-${String(+j).padStart(2, "0")}`, heure: `${String(+h).padStart(2, "0")}:${mi}` });
      continue;
    }
    m = action.match(/pour le (\d{1,2})\s+([A-Za-zÀ-ÿ]+)\s+(\d{4}) à (\d{1,2})h(\d{2})/);
    if (m) {
      const mo = MOIS[m[2].toLowerCase()];
      if (mo) out.push({ date: `${m[3]}-${String(mo).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`, heure: `${String(+m[4]).padStart(2, "0")}:${m[5]}` });
    }
  }
  return out;
}

/** Dernier état de présence constaté : venu, absent, ou rien de tranché. */
function presence(entrees) {
  let etat = "";
  for (const { action } of entrees) {
    if (action.includes("présent au RDV")) etat = "present";
    else if (action.includes("absent au RDV")) etat = "absent";
    else if (action.includes("réinitialisé")) etat = "";
  }
  return etat;
}

/** Questionnaire du CRM d'origine, remis en français lisible. Les colonnes vides disparaissent. */
const PROFIL = [
  ["Nature de la demande", "nature_precise_demande"],
  ["Objet de la demande", "objet_demande"],
  ["Document administratif actuel", "document_administratif_actuel"],
  ["Expiration du document", "expiration_documents_actuel"],
  ["Demande en cours", "demande_en_cours_text"],
  ["Type de dépôt", "type_depot"],
  ["Préfecture de la demande", "prefecture_demande"],
  ["Date de dépôt en préfecture", "date_depot_prefecture"],
  ["Arrivée en France", "date_arrivee_france"],
  ["Années de présence en France", "nombre_annees_france"],
  ["Présence en France", "presence_france"],
  ["Situation familiale", "family_situation"],
  ["Nationalité du conjoint", "nationalite_conjoint"],
  ["Nombre d'enfants", "children_count"],
  ["Enfants scolarisés", "nombre_enfants_scolarise"],
  ["Enfants à l'étranger", "nombre_enfants_etranger"],
  ["Activité professionnelle", "professional_activity"],
  ["Métier", "metier"],
  ["Salaire", "salaire"],
  ["Travail sur les 5 dernières années", "travaille_5_dernieres_annees"],
  ["Diplôme obtenu en France", "diplome_obtenu_france"],
  ["Casier judiciaire", "casier_judiciaire"],
  ["A déjà reçu une OQTF", "deja_recu_oqtf"],
  ["Numéro de sécurité sociale", "numero_securite_sociale"],
];

const LISIBLE = {
  naturalisation: "Naturalisation", renouvellement: "Renouvellement de titre",
  obtention_tds: "Obtention d'un titre de séjour", formation_b1: "Formation B1",
  tds_1_an: "Titre de séjour 1 an", tds_2_ans: "Titre de séjour 2 ans", tds_3_ans: "Titre de séjour 3 ans",
  tds_4_ans: "Titre de séjour 4 ans", tds_10_ans: "Titre de séjour 10 ans", carte_europeenne: "Carte européenne",
  celibataire: "Célibataire", marie: "Marié(e)", divorce: "Divorcé(e)", veuf: "Veuf/veuve",
  concubinage: "Concubinage", pacse: "Pacsé(e)",
  plus_de_5_ans_: "Plus de 5 ans", "3_à_5_ans_": "3 à 5 ans", en_activité: "En activité", sans_emploi: "Sans emploi",
};

/** Valeurs du CRM remises en français : codes traduits, dates en JJ/MM/AAAA. */
function lisible(v) {
  if (LISIBLE[v]) return LISIBLE[v];
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

function profil(row) {
  return PROFIL
    .map(([label, col]) => ({ label, valeur: lisible(propre(row[col])) }))
    .filter((l) => l.valeur !== "" && l.valeur !== "false" && l.valeur !== "null");
}

/** Tout ce que le CRM appelait « commentaire », en un seul bloc. */
function commentaire(row) {
  return [
    propre(row.notes),
    propre(row.comments),
    propre(row.commercial_report) && `Compte rendu commercial : ${propre(row.commercial_report)}`,
  ].filter(Boolean).join("\n");
}

// ---------- Import ----------

const pool = new Pool({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });

const { rows: comptes } = await pool.query(
  `select email, name from dde_users where lower(email) = lower($1)`, [compte],
);
if (!comptes[0]) { console.error(`Compte DDE introuvable : ${compte}`); await pool.end(); process.exit(1); }
const telepro = comptes[0];

const lignes = parseCsv(readFileSync(fichier, "utf8"));
console.log(`${lignes.length} lignes lues, destination : ${telepro.name} <${telepro.email}>`);

let crees = 0, majs = 0, ignores = 0;

for (const row of lignes) {
  const telephone = mobileFR(row.phone_1) ?? mobileFR(row.phone_2);
  if (!telephone) { ignores++; console.warn(`  ignoré (téléphone inexploitable) : ${propre(row.first_name)} ${propre(row.last_name)} — ${row.phone_1}`); continue; }

  const { nom, prenom } = nomPrenom(row);
  const entrees = journal(row.history);
  const rdvs = rendezVous(entrees);
  const dernier = rdvs[rdvs.length - 1] ?? null;

  const valeurs = [
    propre(row.id) || null,                                   // 1  crm_id
    nom, prenom, telephone,                                   // 2-4
    mobileFR(row.phone_2) ?? "",                              // 5  telephone_2
    propre(row.email).toLowerCase(),                          // 6
    propre(row.address), propre(row.postal_code), propre(row.city), propre(row.department), // 7-10
    telepro.email, telepro.name,                              // 11-12
    propre(row.status),                                       // 13 crm_statut
    propre(row.campaign),                                     // 14
    propre(row.assigned_telepro),                             // 15
    propre(row.assigned_sales),                               // 16
    propre(row.resultat_rdv),                                 // 17
    commentaire(row),                                         // 18
    propre(row.import_source),                                // 19
    propre(row.created_at) || null,                           // 20
    propre(row.updated_at) || null,                           // 21
    dernier?.date ?? null,                                    // 22
    dernier?.heure ?? "",                                     // 23
    presence(entrees),                                        // 24
    rdvs.length,                                              // 25
    JSON.stringify(profil(row)),                              // 26
    JSON.stringify(entrees),                                  // 27
  ];

  const { rows } = await pool.query(
    `insert into dde_prospects (
       crm_id, nom, prenom, telephone, telephone_2, email, adresse, code_postal, ville, departement,
       telepro_email, telepro_name,
       crm_statut, crm_campagne, crm_telepro, crm_commercial, crm_resultat_rdv, crm_commentaire, crm_source,
       crm_cree_le, crm_maj_le, dernier_rdv_date, dernier_rdv_heure, dernier_rdv_presence, nb_rdv, profil, historique)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
     on conflict (crm_id) do update set
       nom = excluded.nom, prenom = excluded.prenom, telephone = excluded.telephone,
       telephone_2 = excluded.telephone_2, email = excluded.email, adresse = excluded.adresse,
       code_postal = excluded.code_postal, ville = excluded.ville, departement = excluded.departement,
       crm_statut = excluded.crm_statut, crm_campagne = excluded.crm_campagne, crm_telepro = excluded.crm_telepro,
       crm_commercial = excluded.crm_commercial, crm_resultat_rdv = excluded.crm_resultat_rdv,
       crm_commentaire = excluded.crm_commentaire, crm_source = excluded.crm_source,
       crm_cree_le = excluded.crm_cree_le, crm_maj_le = excluded.crm_maj_le,
       dernier_rdv_date = excluded.dernier_rdv_date, dernier_rdv_heure = excluded.dernier_rdv_heure,
       dernier_rdv_presence = excluded.dernier_rdv_presence, nb_rdv = excluded.nb_rdv,
       profil = excluded.profil, historique = excluded.historique, updated_at = now()
     returning (xmax = 0) as cree`,
    valeurs,
  );
  rows[0].cree ? crees++ : majs++;
}

console.log(`Terminé : ${crees} créés, ${majs} mis à jour, ${ignores} ignorés.`);
const { rows: bilan } = await pool.query(
  `select statut, count(*)::int as n from dde_prospects where lower(telepro_email) = lower($1) group by 1 order by 2 desc`,
  [telepro.email],
);
console.log(bilan);
await pool.end();
