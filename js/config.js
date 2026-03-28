const SUPABASE_URL = 'https://vxevjkgetmgeovmefens.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4ZXZqa2dldG1nZW92bWVmZW5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTA4OTAsImV4cCI6MjA5MDI2Njg5MH0.CF5tbijTP2cNlnxMiaZYJdjcncFhwEB9yCjCcayBYEM';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
