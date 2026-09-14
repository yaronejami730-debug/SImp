-- Slug d'URL par agence/call center (ex: "simplicicar-paris-17") : permet d'accéder au CRM via
-- agenda-rdv.vercel.app/<slug>/... — le préfixe détermine automatiquement l'agence (branding),
-- sans changer de compte. Voir middleware.ts.
alter table call_centers add column if not exists slug text;
create unique index if not exists call_centers_slug_idx on call_centers (slug) where slug is not null;
