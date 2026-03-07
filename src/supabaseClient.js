import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://auwqsmfuejhrqegfhzxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z9ijvJRNlZ8UKx7ktlFNdg_swR3jF0Z';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
