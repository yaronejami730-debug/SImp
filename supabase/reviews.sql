create table if not exists reviews (
  id bigserial primary key,
  first_name text default '',
  last_name text default '',
  email text default '',
  rating integer not null check (rating between 1 and 5),
  q_accueil text default '',
  q_recommande text default '',
  commentaire text default '',
  created_at timestamptz default now()
);

create table if not exists referrals (
  id bigserial primary key,
  referrer_email text default '',
  referrer_name text default '',
  friend_name text default '',
  friend_phone text default '',
  created_at timestamptz default now()
);
