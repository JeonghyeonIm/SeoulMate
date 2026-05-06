import { createClient } from "@supabase/supabase-js";

import { env } from "./env";

const missingSupabaseConfigMessage =
  "Supabase client requires SUPABASE_URL and a valid API key in the environment.";

const createSupabaseInstance = (apiKey: string) => {
  if (!env.SUPABASE_URL || !apiKey) {
    throw new Error(missingSupabaseConfigMessage);
  }

  return createClient(env.SUPABASE_URL, apiKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

export const getSupabaseAdmin = () => createSupabaseInstance(env.SUPABASE_SERVICE_ROLE_KEY);

export const getSupabaseClient = () => createSupabaseInstance(env.SUPABASE_ANON_KEY);
