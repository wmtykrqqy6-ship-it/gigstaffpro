import { createClient } from '@supabase/supabase-js'

// REPLACE THESE WITH YOUR ACTUAL VALUES FROM SUPABASE
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ycsauzvkrbcynifkawuw.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inljc2F1enZrcmJjeW5pZmthd3V3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg3MDQ4NTcsImV4cCI6MjA4NDI4MDg1N30.07H2LXdn2XKfpcrSmrp7_G0KXIJMH27fmJpCok10lrc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)