import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing in .env')
}

// Default client
export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// Client for Finnegans schema views
export const supabaseFinnegans = createClient(supabaseUrl || '', supabaseKey || '', {
    db: { schema: 'Finnegans' },
    auth: { persistSession: false }
})
