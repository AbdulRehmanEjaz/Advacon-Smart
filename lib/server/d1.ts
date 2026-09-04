import { env } from 'cloudflare:workers';

export function database() {
  const binding = env.DB;
  if (!binding) throw Error('SETUP_REQUIRED');
  return binding;
}

export const statement = (sql: string, ...values: unknown[]) =>
  database()
    .prepare(sql)
    .bind(...values);

export async function first<T>(sql: string, ...values: unknown[]) {
  return statement(sql, ...values).first<T>();
}

export async function all<T>(sql: string, ...values: unknown[]) {
  return (await statement(sql, ...values).all<T>()).results;
}

export function id() {
  return crypto.randomUUID();
}

export function now() {
  return new Date().toISOString();
}

export function json(value: unknown) {
  return value === undefined ? null : JSON.stringify(value);
}
