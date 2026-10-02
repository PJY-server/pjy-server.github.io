# FriendsChat Cloudflare API (migration-safe starter)

This adds a Cloudflare backend without overwriting the current Supabase-powered messenger page. Keep the current page and Supabase project untouched until export/import and testing are complete.

## Services
- Workers: API
- D1: accounts, sessions, friends, rooms, messages, read receipts, file metadata
- R2: private file objects; downloads pass through the authenticated Worker

## Setup
1. Install Node.js LTS from https://nodejs.org/.
2. Open a terminal in this directory and run: npm install --save-dev wrangler
3. In Cloudflare Dashboard create a D1 database named friendschat-db. Copy its database ID into wrangler.jsonc.
4. Create an R2 bucket named friendschat-files.
5. Run: npx wrangler d1 execute friendschat-db --remote --file=./schema.sql
6. Run: npx wrangler deploy. Copy the resulting Worker URL, such as https://friendschat-api.YOUR-SUBDOMAIN.workers.dev.
7. Test GET /health. The existing frontend still uses Supabase until it is separately switched to this API.

## Make the first account an administrator
1. Sign up the account through POST /auth/signup.
2. In Cloudflare D1 Console run: UPDATE users SET is_admin=1 WHERE username='your_admin_username';
Do this immediately after signup. Do not put an admin password or API secret in GitHub.

## API endpoints
- POST /auth/signup { username, displayName, password }
- POST /auth/login { username, password }
- GET /auth/me
- POST /auth/logout
- PATCH /profile { display_name }
- GET /users?q=
- GET /friends; POST /friends { username }
- GET /rooms; POST /rooms { name, usernames: ["friend1"], is_group: false }
- GET /rooms/:id/messages?limit=50
- POST /rooms/:id/messages { content }
- POST /rooms/:id/read
- POST /rooms/:id/files (multipart field "file", optional "message_id"; max 20 MB)
- GET /files/:id (authenticated room member only)
- GET /admin/users
- PATCH /admin/users/:id/admin { is_admin: true|false }

The current GitHub Pages frontend is not yet connected to these endpoints. Do not replace its Supabase code until the D1 import and API checks are complete.

## Existing data and passwords
Nothing in Supabase is deleted by these files. Before switching the frontend, export and back up the existing profiles, chat_rooms, chat_members, messages, chat_files, and any friend/read tables. Supabase Auth password hashes cannot be exported for reuse through the normal client API, so users will need to set new passwords or re-register. Message/room/user rows can be migrated after matching their actual columns and IDs. Do not delete the Supabase project or its data until row counts and sample messages have been verified in D1.
