import { createClient } from "@supabase/supabase-js";
import { createLearningSync } from "./learning-sync";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
/** Only a public/publishable key belongs in the browser. Access is enforced by RLS. */
export const cloud = url && key ? createClient(url, key) : null;
export const syncLearning = cloud ? createLearningSync(cloud) : async () => {
  throw new Error("Cloud backup is not connected yet.");
};
