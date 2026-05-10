# ⚖ CA Knowledge Base

**Kanhaiya Gautam & Associates — Chartered Accountants**

A production-grade knowledge base for Indian tax and corporate law — GST, Income Tax, Companies Act, and more.

## Tech Stack

- **Backend:** Node.js + Express
- **Database:** PostgreSQL 16
- **Reverse Proxy:** Nginx
- **Containerization:** Docker Compose

## Quick Start

```bash
# 1. Clone
git clone https://github.com/kgautamassociates/ca-knowledge-base.git
cd ca-knowledge-base

# 2. Configure
cp .env.example .env
# Edit .env with your passwords

# 3. Run
docker compose up -d --build

# 4. Open browser
# http://localhost  (via nginx)
# Login: admin / admin123
```

## Architecture

```
Client Browser
    │
    ▼
  Nginx (:80)
    │
    ▼
  Node.js App (:3000)
    │
    ▼
  PostgreSQL (:5432)
```

## Project Structure

```
ca-knowledge-base/
├── docker-compose.yml
├── .env.example
├── package.json
├── docker/
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── public/
│   └── index.html         # Frontend SPA
├── src/
│   ├── server.js           # App entry point
│   ├── db/
│   │   ├── init.sql        # Database schema
│   │   └── pool.js         # Connection pool
│   ├── middleware/
│   │   └── auth.js         # Auth middleware
│   └── routes/
│       ├── auth.js         # Login, users
│       ├── entries.js      # CRUD operations
│       └── data.js         # Notes, import, export, graph
```

## User Roles

| Feature | Admin | Viewer |
|---------|-------|--------|
| View & search entries | ✓ | ✓ |
| Personal notes | ✓ | ✓ |
| Create/Edit/Delete | ✓ | ✗ |
| Import data | ✓ | ✗ |
| Manage users | ✓ | ✗ |

## Import Data

Import JSON files via the web UI (⬆ Import) or API:

```bash
curl -X POST http://localhost/api/import \
  -H "Content-Type: application/json" \
  -H "Cookie: <session>" \
  -d @master_kb_import.json
```

## Backup

- **UI:** Settings → Download backup
- **Docker:** `docker exec ca-kb-db pg_dump -U ca_admin ca_knowledge_base > backup.sql`
- **Restore:** `cat backup.sql | docker exec -i ca-kb-db psql -U ca_admin ca_knowledge_base`

## License

Private — Kanhaiya Gautam & Associates
