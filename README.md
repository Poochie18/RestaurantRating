# Restaurant Rater

Small production-like React + Supabase app to rate restaurants.

## Stack
- Vite + React + TypeScript
- Supabase Authentication, Postgres, Storage
- React Router
- GitHub Pages deploy (Actions)

## Local setup
1. `npm install`
2. Create `.env` from `.env.example`
3. `npm run dev`

## Deploy (GitHub Pages)
1. Add repo secrets: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Push to `main` and enable GitHub Pages (Actions).

## Supabase
- Run SQL in `supabase.sql` (Schema + RLS + Storage bucket).
- Enable Auth provider: Email/Password.
