import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ Supabase credentials missing in .env')
}

// Default client
export const supabase = createClient(supabaseUrl || '', supabaseKey || '')

// Client for Mobile schema tables
export const supabaseMobile = createClient(supabaseUrl || '', supabaseKey || '', {
    db: { schema: 'Mobile' },
    auth: { persistSession: false }
})
