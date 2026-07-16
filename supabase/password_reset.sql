-- Add password reset fields to users table
alter table users add column if not exists password_reset_token text;
alter table users add column if not exists password_reset_expiry timestamptz;

create index if not exists users_reset_token_idx on users(password_reset_token) where password_reset_token is not null;
