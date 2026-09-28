import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Local scanning is available without a Supabase connection.
let client = null;
if (supabaseUrl && supabaseKey) {
  try { client = createClient(supabaseUrl, supabaseKey); } catch { /* Invalid configuration: use local mode. */ }
}
export const supabase = client;
