import { getPool } from "./db";
import { hashPassword } from "./auth";

export type User = { id: number; email: string; name: string; role: "admin" | "collab"; created_at: string };

export async function getUserByEmail(email: string) {
  const { rows } = await getPool().query(
    `select id, email, name, role, password_hash from users where lower(email) = lower($1)`,
    [email.trim()],
  );
  return rows[0] as (User & { password_hash: string }) | undefined;
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await getPool().query(
    `select id, email, name, role, created_at from users order by role, name`,
  );
  return rows as User[];
}

export async function createUser(email: string, password: string, name: string, role: "admin" | "collab" = "collab"): Promise<User> {
  const { rows } = await getPool().query(
    `insert into users (email, password_hash, name, role) values ($1,$2,$3,$4)
     returning id, email, name, role, created_at`,
    [email.trim().toLowerCase(), hashPassword(password), name.trim(), role],
  );
  return rows[0] as User;
}

export async function deleteUser(id: number): Promise<void> {
  await getPool().query(`delete from users where id = $1 and role <> 'admin'`, [id]);
}
