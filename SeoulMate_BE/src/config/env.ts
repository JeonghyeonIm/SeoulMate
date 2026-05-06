import dotenv from "dotenv";

dotenv.config();

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["true", "1", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: parsePort(process.env.PORT, 3000),
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  DATABASE_SSL: parseBoolean(process.env.DATABASE_SSL, true),
  POSTGRES_HOST: process.env.POSTGRES_HOST ?? "localhost",
  POSTGRES_PORT: parsePort(process.env.POSTGRES_PORT, 5432),
  POSTGRES_DB: process.env.POSTGRES_DB ?? "seoulmate",
  POSTGRES_USER: process.env.POSTGRES_USER ?? "postgres",
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? "",
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
} as const;
