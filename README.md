# ⚖ CA Knowledge Base

**Kanhaiya Gautam & Associates — Chartered Accountants**

A searchable internal knowledge base for Indian tax and corporate law — GST,
Income Tax, Companies Act, and more. An internal staff tool, not client-facing.

**Live**: `knowledge.internal.kgautam.in` (Railway).

## Auth

This app has **no login of its own**. Identity comes from the separate
`internal-kga-platform` repo's Clerk application ("KGA Internal Portal") via
`portal.internal.kgautam.in` — sign in there, then open this tool from the
hub's dashboard. There is no `admin/admin123` default anymore; that local
username/password system (`bcryptjs`, a `users` table, a hardcoded default
credential seeded on first boot) was removed entirely, along with the
hardcoded Postgres password that used to sit in `docker-compose.yml` — both
were real, live exposures in this repo while it was public with local auth.

Roles (`admin` / `viewer`, mapped from Clerk's `org:admin` / `org:member`)
come from Clerk Organization membership in the "KGA Staff" org, managed from
the hub's `/admin/employees` screen — not from anything in this repo.

### How the token gets here

This app can't be a Clerk "satellite domain" (Clerk's cross-subdomain shared
session feature) — that only supports Next.js/TanStack Start/Nuxt, and this
is a plain Express + static-HTML app. Instead: the hub mints a short-lived
Clerk session token and hands it off via a URL fragment
(`#token=...`) when you open this tool from its dashboard.
`public/index.html` reads that once, stores it in `sessionStorage`, and
sends it as an `Authorization: Bearer <token>` header on every API call.
The backend (`src/middleware/auth.js`) verifies it via `@clerk/express`'s
`clerkMiddleware()` + `getAuth(req)`, checking KGA Staff org membership
before allowing any request through.

If you land on this app directly without a token (e.g. a bookmarked link),
you'll see a "Go to KGA Staff Hub" prompt — there's no other way in.

## Tech Stack

- **Backend:** Node.js + Express, `@clerk/express` for auth
- **Database:** PostgreSQL (Railway-managed in production; Postgres 16 via
  Docker Compose for local dev)
- **Containerization:** Docker Compose (local dev only — production runs on
  Railway's own build/deploy pipeline, not this repo's `docker-compose.yml`)

## Local Development

```bash
# 1. Clone
git clone https://github.com/kgautamassociates/ca-knowledge-base.git
cd ca-knowledge-base

# 2. Configure
cp .env.example .env
# Fill in POSTGRES_PASSWORD and the Clerk vars (CLERK_SECRET_KEY,
# CLERK_PUBLISHABLE_KEY, CLERK_ORGANIZATION_ID) — get the Clerk values from
# the internal-kga-platform repo's "KGA Internal Portal" Clerk app, NOT the
# client-facing platform's Clerk instance.

# 3. Run
docker compose up -d --build

# 4. Open browser
# http://localhost:3000
```

Note: `docker-compose.yml`'s Postgres vars require real values now (no
hardcoded fallback password) — the compose file fails loudly if
`POSTGRES_PASSWORD`/`CLERK_*` aren't set in `.env`, rather than silently
using a known-public default.

## Production Deployment (Railway)

The live deployment does **not** use `docker/Dockerfile` — Railway's own
auto-builder (Railpack) builds directly from `package.json`'s `start`
script, ignoring the Dockerfile entirely. This was unplanned (the original
intent was Docker-based deploy) but works fine in practice, since the app
has no unusual build requirements.

Two services in the Railway project:
- **Postgres** — Railway's managed Postgres plugin, not a container this
  repo defines.
- **App** — built from this repo via Railway's GitHub integration,
  env vars set directly in Railway (not read from `.env`/`docker-compose.yml`
  in production): `DATABASE_URL` (references the Postgres service via
  `${{Postgres.DATABASE_URL}}`), `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`,
  `CLERK_ORGANIZATION_ID`, `NODE_ENV=production`, `PORT=3000`.

**`src/db/init.sql` does not auto-run on Railway** — Railway's Postgres
plugin doesn't mount/execute init scripts the way local Docker Compose does
(`docker-compose.yml`'s `db` service mounts `init.sql` into
`docker-entrypoint-initdb.d/`, but that's a Compose-specific mechanism).
After provisioning a fresh Railway Postgres instance, `init.sql` needs to be
applied manually once (e.g. via a one-off script using the `pg` package and
Railway's `DATABASE_PUBLIC_URL`) before the app will have its schema.

DNS: `knowledge.internal.kgautam.in` is a Cloudflare CNAME (DNS-only, not
proxied) pointing at Railway's provided target, plus a `_railway-verify`
TXT record for domain ownership verification — both under the `kgautam.in`
zone.

## Project Structure

```
ca-knowledge-base/
├── docker-compose.yml       # Local dev only
├── .env.example
├── package.json
├── docker/
│   └── Dockerfile           # Not used by the Railway production deploy
├── nginx/
│   └── nginx.conf           # Local dev only (docker-compose's nginx service)
├── public/
│   └── index.html           # Frontend SPA — no login UI, token-handoff auth
├── src/
│   ├── server.js             # App entry point, clerkMiddleware() wired here
│   ├── db/
│   │   ├── init.sql          # Schema — does NOT auto-run on Railway, see above
│   │   └── pool.js           # Connection pool
│   ├── middleware/
│   │   └── auth.js           # Clerk session verification, org-role mapping
│   └── routes/
│       ├── entries.js        # CRUD operations
│       └── data.js           # Notes, settings, import, export, graph, /api/me
```

(`src/routes/auth.js` — the old local login/logout/user-management routes —
was deleted entirely; there is no local auth route left in this app.)

## User Roles

| Feature | Admin | Viewer |
|---------|-------|--------|
| View & search entries | ✓ | ✓ |
| Personal notes | ✓ | ✓ |
| Create/Edit/Delete | ✓ | ✗ |
| Import data | ✓ | ✗ |
| Manage employee access | via the hub's `/admin/employees`, not this app | ✗ |

## Import Data

Import JSON files via the web UI (⬆ Import) or API (needs a valid Clerk
Bearer token, obtained the same way the frontend does — via the hub):

```bash
curl -X POST https://knowledge.internal.kgautam.in/api/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-session-token>" \
  -d @master_kb_import.json
```

## Backup

- **UI:** Settings → Download backup
- **Local Docker:** `docker exec ca-kb-db pg_dump -U ca_admin ca_knowledge_base > backup.sql`
- **Railway:** use `railway connect Postgres` (needs `psql` installed
  locally) or pull `DATABASE_PUBLIC_URL` from Railway's variables and run
  `pg_dump` against it directly.

## License

Private — Kanhaiya Gautam & Associates
