import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "placeholder-anon-key";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    "Supabase não configurado: defina NEXT_PUBLIC_SUPABASE_URL e " +
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY em apps/admin/.env.local.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
