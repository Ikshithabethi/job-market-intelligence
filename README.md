# Web-Based Job Market Intelligence and Career Path Analytics Using Knowledge Graphs

A full-stack web application that turns a job-posting dataset into three things a
student actually needs:

1. **Market intelligence** — which roles, skills and companies are in demand, and what they pay.
2. **A knowledge graph** — roles, skills and companies as nodes; `SKILL_REQUIRED_FOR`, `LEADS_TO`, `SIMILAR_TO` and `USED_BY` as edges, explorable in the browser.
3. **Career path analytics** — give a current role, a target role and the skills you already have, and get a ranked multi-hop route with the missing skills, a learning order and a step-by-step roadmap.

> **Data disclaimer.** Every figure in this project comes from a **synthetic sample dataset**
> generated for academic use. Company names are fictional and salaries are illustrative
> (annual, INR). Nothing here is live job market data, and no script contacts a real job
> board. Every page that shows figures also says so on screen.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. Database](#1-database)
  - [2. Backend](#2-backend)
  - [3. Load the sample dataset](#3-load-the-sample-dataset)
  - [4. Frontend](#4-frontend)
  - [5. Python analysis (optional)](#5-python-analysis-optional)
- [Commands to start every component](#commands-to-start-every-component)
- [Environment variables](#environment-variables)
- [API endpoints](#api-endpoints)
- [The knowledge graph model](#the-knowledge-graph-model)
- [Career path algorithm](#career-path-algorithm)
- [Authentication](#authentication)
- [Verification performed](#verification-performed)
- [Troubleshooting](#troubleshooting)

---

## Features

| # | Feature | Where it lives |
|---|---------|----------------|
| 1 | Dashboard with backend-aggregated totals, trending skills, popular roles, top companies and salary insights | `frontend/src/pages/Dashboard.jsx`, `backend/services/analyticsService.js` |
| 2 | Job Market Intelligence: search and filter by role, location, salary, experience and skills; skill demand analysis; emerging-skill detection; paginated results | `frontend/src/pages/JobMarket.jsx`, `backend/services/jobService.js` |
| 3 | Knowledge graph rendered with Cytoscape.js, generated from the dataset (not hand-written) | `frontend/src/pages/KnowledgeGraph.jsx`, `backend/services/graphService.js` |
| 4 | Career path analytics: multi-hop route search, missing skills, learning priorities, roadmap phases | `frontend/src/pages/CareerPath.jsx`, `backend/services/careerService.js` |
| 5 | Skill recommendations that explain **why** each skill is suggested and rank the gaps | `frontend/src/pages/SkillRecommendations.jsx`, `backend/services/recommendationService.js` |
| 6 | Job role comparison across skills, salary, experience and demand, with charts and tables | `frontend/src/pages/RoleComparison.jsx`, `backend/services/roleService.js` |
| 7 | Authentication: registration, login, logout, bcrypt hashing, JWT, profile, saved skills and saved roadmaps | `backend/services/authService.js`, `backend/middleware/auth.js`, `frontend/src/context/AuthContext.jsx` |
| 8 | MySQL schema with primary keys, foreign keys, indexes, sample records and env-var credentials | `database.sql` |
| 9 | Layered REST API (routes → controllers → services → config) with validation, error handling and correct status codes | `backend/` |
| 10 | Python data analysis with pandas and scikit-learn | `python-analysis/` |
| 11 | Responsive React UI: sidebar navigation, dashboard cards, interactive charts, searchable tables, graph visualisation | `frontend/src/` |
| 12 | Integration and testing: consistent API URLs, loading states, error messages, empty-data handling | throughout |

**Frontend pages:** Dashboard (`/`), Job Market Intelligence (`/jobs`), Job Role Comparison
(`/roles`), Knowledge Graph (`/graph`), Career Path Analytics (`/career`),
Skill Recommendations (`/skills`), Profile (`/profile`, requires an account),
Login (`/login`), Register (`/register`).

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 5, JavaScript (no TypeScript), CSS, React Router 6, Chart.js, Cytoscape.js |
| Backend | Node.js, Express 4, mysql2/promise, jsonwebtoken, bcryptjs, dotenv, cors |
| Database | MySQL 8+ (InnoDB, utf8mb4) |
| Data analysis | Python 3, pandas, numpy, scikit-learn |

---

## Project structure

```
job-market-intelligence/
├── backend/
│   ├── config/          env.js (validated config), db.js (pool + helpers), analytics.js
│   ├── controllers/     request parsing and response shaping, one file per resource
│   ├── middleware/      auth.js (requireAuth / optionalAuth), validate.js, errorHandler.js
│   ├── routes/           index.js mounts every resource under /api
│   ├── scripts/         seed.js  (loads the CSVs into MySQL)
│   ├── services/        SQL and business logic, one file per resource
│   ├── utils/           ApiError, asyncHandler, respond, jwt, password, csv, graphAlgorithms
│   ├── app.js           Express wiring, CORS, /api/health, 404 + error handler
│   ├── server.js        starts the HTTP server
│   ├── .env.example     copy to .env
│   └── package.json
├── data/                the CSV dataset (kept in git so the app runs out of the box)
├── database.sql         schema + indexes + a small sample subset
├── frontend/
│   ├── src/
│   │   ├── components/  Layout, Charts, DataTable, Surface, StateBlocks, etc.
│   │   ├── context/     AuthContext.jsx
│   │   ├── hooks/       useApiData.js
│   │   ├── pages/       one file per page
│   │   ├── services/    api.js (typed request helpers), session.js (token storage)
│   │   ├── styles/      global.css
│   │   ├── utils/       format.js
│   │   ├── App.jsx      route table
│   │   └── main.jsx     entry point
│   ├── .env.example
│   ├── vite.config.js   dev-server proxy /api -> http://127.0.0.1:5050
│   └── package.json
├── python-analysis/
│   ├── generate_seed.py  creates the synthetic dataset in ../data
│   ├── preprocess.py     cleans it into ./output
│   ├── analyze.py        clustering, similarity, salary model
│   ├── output/           generated analysis artefacts
│   └── requirements.txt
├── .gitignore
└── README.md
```

---

## Prerequisites

- **Node.js 18+** (`node -v`) and npm
- **MySQL 8+** server, running locally (`mysql --version`)
- **Python 3.9+** — only needed if you want to regenerate the dataset or run the analysis
- A modern browser (Chrome, Edge, Firefox or Safari)

---

## Setup

### 1. Database

Create the schema and a small sample subset:

```bash
mysql -u root -p < database.sql
```

This creates the `job_market_intelligence` database with all eleven tables, their keys and
indexes, plus a handful of internally consistent sample rows so the API returns data
immediately. The full dataset (45 roles, 147 skills, 40 companies, 8000 postings) is loaded
in step 3.

### 2. Backend

```bash
cd backend
cp .env.example .env      # then edit .env (see Environment variables)
npm install
```

Set at least `DB_USER`, `DB_PASSWORD` and a real `JWT_SECRET` in `backend/.env`. Generate a
secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start the API:

```bash
npm run dev     # nodemon, restarts on change
# or
npm start
```

The server listens on **http://localhost:5050**. Confirm it can reach MySQL:

```bash
curl http://localhost:5050/api/health
# {"success":true,"data":{"status":"ok","database":"connected",...}}
```

Port **5050** is used instead of 5000 because macOS AirPlay Receiver occupies 5000 by default.

### 3. Load the sample dataset

The CSVs in `data/` are committed, so you can seed straight away:

```bash
cd backend
npm run seed              # reload dataset tables, keep user accounts
# or
npm run seed:truncate     # also wipe users/skills/roadmaps, then recreate the demo account
```

`npm run seed` prints the demo account's email and password to the terminal when it creates
it — that is the account you can log in with (see [Authentication](#authentication)).

If `data/` is ever missing or you want a different size:

```bash
cd python-analysis
python3 -m pip install -r requirements.txt
python3 generate_seed.py --jobs 8000      # writes ../data/*.csv deterministically (seed 42)
cd ../backend && npm run seed
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` to `http://127.0.0.1:5050`, so no
CORS configuration is needed during development.

For a production build:

```bash
npm run build     # writes frontend/dist
npm run preview   # serves the built bundle locally
```

If you serve the built bundle without the Vite proxy, set `VITE_API_BASE_URL` in
`frontend/.env` to the full API URL, e.g. `http://127.0.0.1:5050/api`.

### 5. Python analysis (optional)

The analysis reads the cleaned tables and writes its reports to `python-analysis/output/`:

```bash
cd python-analysis
python3 -m pip install -r requirements.txt

python3 generate_seed.py --jobs 8000   # 1. create the dataset in ../data
python3 preprocess.py                  # 2. clean + feature-engineer into ./output
python3 analyze.py                     # 3. cluster, similarity, salary model
```

`analyze.py` performs:

- **Skill demand** — most requested skills and their share of postings.
- **Trend validation** — recomputes the baseline-vs-recent share change and a two-proportion
  z-test, then cross-checks the growth rates stored in the dataset.
- **Role clustering** — KMeans over the standardised role × skill importance matrix.
- **Role similarity** — cosine similarity between role skill vectors, the same relationship the
  graph labels `SIMILAR_TO`.
- **Salary model** — linear regression predicting a posting's salary midpoint, reported with
  R² and MAE so the fit is not oversold.

Outputs land in `python-analysis/output/` as `analysis_*.csv` and `analysis_report.json`.

---

## Commands to start every component

Run each in its own terminal, from the project root:

| Terminal | Command | URL |
|----------|---------|-----|
| 1 | `mysql -u root -p < database.sql` | once, to create the schema |
| 2 | `cd backend && npm install && cp .env.example .env && npm run seed && npm run dev` | http://localhost:5050 |
| 3 | `cd frontend && npm install && npm run dev` | http://localhost:5173 |
| 4 *(optional)* | `cd python-analysis && python3 preprocess.py && python3 analyze.py` | writes `python-analysis/output/` |

Health check once both servers are up:

```bash
curl http://localhost:5050/api/health
curl http://localhost:5050/api/analytics/dashboard
```

To stop a component press `Ctrl+C` in its terminal.

---

## Environment variables

### `backend/.env` (copy from `.env.example`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `5050` | HTTP port for the API |
| `NODE_ENV` | `development` | Environment name |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed browser origins |
| `DB_HOST` | `localhost` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | *(empty)* | MySQL password |
| `DB_NAME` | `job_market_intelligence` | Database name |
| `DB_CONNECTION_LIMIT` | `10` | Pool size |
| `JWT_SECRET` | *(example value)* | HMAC secret for signing tokens — **change this** |
| `JWT_EXPIRES_IN` | `8h` | Token lifetime |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost |

The API logs a warning at startup if `JWT_SECRET` is still the example value.

### `frontend/.env` (optional, copy from `.env.example`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_BASE_URL` | `/api` | Leave unset to use the Vite dev-server proxy; set it when the backend runs elsewhere |

---

## API endpoints

All responses use one envelope:

```jsonc
// success
{ "success": true, "data": { }, "meta": { } }
// failure
{ "success": false, "error": { "message": "…", "code": "…", "details": [ ] } }
```

`GET /api` returns a self-describing index of every route below.

### Health and index

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/health` | – | Liveness + database connectivity (503 if MySQL is down) |
| GET | `/api` | – | Endpoint index and data disclaimer |

### Authentication

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/register` | – | `{ fullName, email, password, currentRoleId?, targetRoleId? }` |
| POST | `/api/auth/login` | – | `{ email, password }` → `{ token, user }` |
| POST | `/api/auth/logout` | yes | Stateless; clears the client session |
| GET | `/api/auth/me` | yes | Current user, re-validated on page load |

### Jobs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/jobs` | `?q&roleId&role&location&companyId&employmentType&experienceMin&experienceMax&salaryMin&salaryMax&skills&page&pageSize&sortBy&sortDir` |
| GET | `/api/jobs/filters` | Distinct values for the filter dropdowns |
| GET | `/api/jobs/:id` | One posting with its skills |

### Skills

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/skills` | `?q&category&page&pageSize&sortBy&sortDir` |
| GET | `/api/skills/categories` | Category list with counts |
| GET | `/api/skills/trending` | `?limit` — rising skills |
| GET | `/api/skills/demand` | `?limit&category` — demand share per skill |
| GET | `/api/skills/:id` | One skill with the roles that need it |

### Roles

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/roles` | `?q&family&seniority&limit` |
| GET | `/api/roles/families` | Role families |
| GET | `/api/roles/compare` | `?roles=1,2,3` — side-by-side comparison |
| GET | `/api/roles/:id` | One role with required skills |

### Analytics

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/analytics/dashboard` | Everything the dashboard needs in one call |
| GET | `/api/analytics/overview` | Totals: postings, roles, skills, companies |
| GET | `/api/analytics/salary` | Salary bands by role family and seniority |
| GET | `/api/analytics/demand` | Demand statistics and emerging/declining skills |
| GET | `/api/analytics/roles` | `?limit` — most advertised roles |
| GET | `/api/analytics/companies` | `?limit` — companies hiring most |

### Knowledge graph

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/graph` | `?similarityThreshold&usedByLimit&includeCompanies&includeSimilarTo&minImportance` |
| GET | `/api/graph/stats` | Node/edge counts per type |
| GET | `/api/graph/neighbours` | `?type=role\|skill\|company&id&depth` |

### Career path

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/career/options` | – | Roles, skills and role families used to populate the pickers |
| GET | `/api/career/map` | – | All `LEADS_TO` transitions as a map |
| POST | `/api/career/path` | optional | `{ fromRoleId, toRoleId, currentSkills? }` |

`/career/path` uses optional authentication: when `currentSkills` is omitted and a valid token
is sent, the user's saved profile skills are used instead.

### Recommendations

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/recommendations/popular-skills` | – | `?limit` |
| POST | `/api/recommendations/skills` | optional | `{ targetRoleId, currentSkills?, limit? }` |
| POST | `/api/recommendations/roles` | optional | `{ currentSkills?, limit? }` — roles that fit your skills |

### Profile and saved skills (all require a token)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/users/profile` | Profile, saved skills, career goals |
| PUT | `/api/users/profile` | `{ fullName, location, experienceYears, currentRoleId, targetRoleId }` |
| GET | `/api/users/skill-catalogue` | Every skill available to add |
| GET | `/api/users/skills` | The user's saved skills |
| POST | `/api/users/skills` | `{ skillId \| skillName, proficiency }` (409 if already saved) |
| PUT | `/api/users/skills` | `{ skills: [...] }` — replace the whole set |
| PUT | `/api/users/skills/:id` | `{ proficiency }` |
| DELETE | `/api/users/skills/:id` | Remove one saved skill |

### Saved roadmaps (all require a token)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/roadmaps` | List the user's saved roadmaps |
| POST | `/api/roadmaps` | Full computed payload, or just `{ fromRoleId, toRoleId }` to recompute |
| GET | `/api/roadmaps/:id` | One roadmap |
| DELETE | `/api/roadmaps/:id` | Remove it |

**Status codes used:** `200` OK, `201` created, `400` validation error, `401` missing/invalid
token, `404` not found, `409` conflict (e.g. duplicate skill), `503` database unreachable,
`500` unexpected error. `ApiError.forbidden()` (403) is available in `backend/utils/ApiError.js`
for future ownership checks but is not returned by any current route.

---

## The knowledge graph model

Nodes are built from the dataset, never hand-written:

- `role:{id}` — a job role (size follows posting volume, colour follows role family)
- `skill:{id}` — a skill (size follows how many roles require it)
- `company:{id}` — a hiring company

Edges:

| Type | Direction | Source | Meaning |
|------|-----------|--------|---------|
| `SKILL_REQUIRED_FOR` | role → skill | `role_skills` (importance ≥ `minImportance`) | the role requires this skill |
| `LEADS_TO` | role → role | `career_paths` | the transition is a documented career step |
| `SIMILAR_TO` | role ↔ role | computed Jaccard similarity between role skill sets ≥ `similarityThreshold` | the roles need overlapping skills |
| `USED_BY` | skill → company | `job_skills` × `jobs` | the top `usedByLimit` employers asking for that skill |

Query parameters let you trade density for readability, e.g.
`/api/graph?minImportance=3&similarityThreshold=0.45&usedByLimit=3`. Selecting a node in the UI
uses `/api/graph/neighbours` to reveal its immediate neighbourhood instead of redrawing everything.

---

## Career path algorithm

`backend/services/careerService.js` +

`backend/utils/graphAlgorithms.js` (dependency-free, so the logic is easy to follow):

1. **Build the graph** from `career_paths` (`LEADS_TO`) and, when a direct transition does not
   exist, from `SIMILAR_TO` pairs as a fallback — flagged in the response as `fallbackUsed`.
2. **Weight every edge** as `difficulty × 1.0 + avg_years × 0.5`. Similarity fallback edges use
   `1 + (1 − similarity) × 3`, so a weaker similarity costs more.
3. **Rank routes** with Dijkstra, then order the alternatives by total cost.
4. **Score the gap** for each hop: which required skills are already held (`transferableSkills`)
   versus missing (`missingSkills`), with an `importance`, demand share, trend and a priority
   score per missing skill.
5. **Produce the roadmap**: cumulative years per hop, a `readinessBeforeMove` percentage, ordered
   learning phases with concrete actions, and a top-level learning-priority list.

The response also includes `reachable: false` plus a plain-language explanation when no route
exists, so the UI can show something useful instead of an empty table.

---

## Authentication

- Passwords are hashed with **bcryptjs** (`BCRYPT_ROUNDS`); the hash is never returned by the API.
- Login/registration return a **JWT** signed with HS256 (`{ sub, email }`, lifetime
  `JWT_EXPIRES_IN`). The client stores it in `localStorage` and sends it as
  `Authorization: Bearer <token>`.
- On page load the client re-validates the stored token against `GET /api/auth/me`; an expired
  or invalid token is discarded silently.
- `requireAuth` rejects a missing/invalid token with `401`. `optionalAuth` is used by
  `/career/path` and the recommendation endpoints so they work anonymously but can also fall
  back to your saved profile skills when you are signed in.

**Demo account.** `npm run seed` creates a demo user and prints its email and password to the
terminal. The email is `demo@example.com`; the password is generated at runtime by the seeder
and written to the console — copy it from there. (It is also documented in the comment header
of `database.sql`.) Market analysis pages work without signing in; only `/profile` needs an account.

---

## Verification performed

Everything listed here was actually executed against the running application, not assumed:

- **Backend API smoke test** — 33 checks covering every endpoint the UI calls, including
  negative paths (missing `toRoleId` → 400, malformed email → 400, duplicate skill → 409,
  wrong password → 401, no token → 401) and the full auth → profile → skill CRUD → roadmap
  save/read/delete lifecycle. All 33 passed against the seeded 8000-posting dataset.
- **Frontend production build** — `npm run build` completed successfully.
- **Frontend render check** — all ten routes were loaded in headless Chrome and their live DOM
  text inspected, including `/profile` with a real authenticated session seeded into
  `localStorage`. No Vite error overlay appeared on any route.
- **Proxy check** — `curl http://localhost:5173/api/health` returned
  `{"success":true,...,"database":"connected"}`, confirming the dev-server proxy.

---

## Troubleshooting

**`Port 5000` problems.** The backend deliberately uses **5050**; port 5000 is taken by macOS
AirPlay Receiver.

**`curl http://127.0.0.1:<port>` fails but `http://localhost:<port>` works.** Vite's dev server
may bind to IPv6 (`[::1]`) only. Use `localhost` rather than `127.0.0.1` in the browser and in
`curl`.

**Port 5173 already in use.** Vite automatically picks the next free port (e.g. 5174) and prints
it. Either use the printed URL or stop the process holding 5173 (`lsof -nP -iTCP:5173 -sTCP:LISTEN`).

**"The API is running but the MySQL database is unreachable" (503).** Check that MySQL is
running, that `backend/.env` has the right `DB_USER` / `DB_PASSWORD` / `DB_PORT`, and that
`database.sql` was executed. The frontend surfaces this as a red banner at the top of every page.

**Pages render but tables are empty.** Run the seeder: `cd backend && npm run seed`. The dataset
CSVs must exist in `data/` — regenerate them with
`cd python-analysis && python3 generate_seed.py --jobs 8000`.

**`401` on `/api/users/*` or `/api/roadmaps/*`.** Those routes require a token; log in first.

---

## License

MIT — created as an academic project.
