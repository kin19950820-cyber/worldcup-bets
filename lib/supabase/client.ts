import { createBrowserClient } from "@supabase/ssr";
import { cleanEnvValue } from "@/lib/env";

export function createClient() {
  return createBrowserClient(
    cleanEnvValue(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL
    ),
    cleanEnvValue(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  );
}
