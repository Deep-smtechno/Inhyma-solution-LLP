# INHYMA Solutions — Dynamic Website + CMS

The INHYMA marketing site rebuilt as a **fully dynamic, database-driven application** with an **admin panel (CMS)**. Site managers can add/edit products, categories, industries, solutions, blog posts, team, stats, leads and site settings — no code changes required.

## Stack

| Layer        | Technology                                              |
|--------------|--------------------------------------------------------|
| Runtime      | Node.js + Express                                      |
| Database     | Microsoft SQL Server (`InhymaDB`)                     |
| DB driver    | `mssql` (TDS protocol)                                 |
| Data access  | **Stored procedures only** — no raw/inline SQL        |
| Templates    | Nunjucks (Jinja2-compatible) — server-side rendered   |
| Auth         | express-session + bcrypt                               |
| Images       | Stored as **files on disk** (`public/uploads/`), **paths in DB** |

## Project structure

```
.
├── sql/
│   ├── 01_schema.sql        # tables
│   ├── 02_procedures.sql    # all stored procedures (CRUD)
│   └── 03_seed.sql          # migrates the original static content
├── src/
│   ├── server.js            # Express entry
│   ├── db.js                # connection pool + execProc() helper (SP calls)
│   ├── middleware/auth.js
│   ├── routes/
│   │   ├── public.js        # public website
│   │   ├── admin.js         # admin panel CRUD
│   │   └── api.js           # JSON API
│   ├── utils/               # upload, helpers
│   └── scripts/setup-db.js  # runs the SQL files + creates admin user
├── views/
│   ├── layout.njk           # public layout (header/footer, dynamic)
│   ├── public/*.njk         # public pages
│   └── admin/**/*.njk       # admin panel
└── public/                  # static assets (css, js, logo, uploads)
```

## Setup

### 1. Prerequisites
- Node.js 18+
- A reachable SQL Server instance (the `.env` is pre-filled for `192.168.0.3\SQLEXPRESS`)
- For named instances, make sure the **SQL Server Browser** service is running and TCP/IP is enabled.

### 2. Configure
Edit `.env` if needed (DB host, credentials, port, seed admin password).

### 3. Install
```bash
npm install
```

### 4. Create the database (schema + procedures + seed data + admin user)
```bash
npm run db:setup
```
This creates `InhymaDB` if missing, runs all three SQL files, and creates the seed admin:
- **Username:** `admin`  **Password:** `Admin@123`  (change these in `.env` before running, or change the password after first login)

> You can also run the three `sql/*.sql` files manually in SSMS (in order) — then the app's first login still works because `db:setup` only adds the admin if no users exist. To create the admin without re-running everything, just run `npm run db:setup` again (it's idempotent).

### 5. Import the real product catalog from inhyma.com
```bash
npm run import:inhyma          # add to existing data
npm run import:inhyma -- --fresh   # wipe products/categories first, then import
```
This reads the bundled dataset [data/inhyma-products.json](data/inhyma-products.json) (scraped from the live site — **20 categories, 139 products, full specifications**), creates the categories and products via stored procedures, parses each product's spec sheet into spec rows, and **downloads every product image** from Cloudinary into `public/uploads/products/` (storing the path in the DB). Idempotent — re-running skips products that already exist.

> Re-scrape later: the dataset is a static JSON bundle, so imports are reproducible and don't depend on the live site being up.

### 6. Run
```bash
npm start        # production
npm run dev      # auto-reload (nodemon)
```
- Public site → http://localhost:5050  (default; macOS reserves 5000 for AirPlay)
- Admin panel → http://localhost:5050/admin
- If the port is busy the server automatically tries the next one (5051, 5052, …).

## How it works

### Stored-procedure-only data access
Every query goes through `execProc('usp_Name', params)` in `src/db.js`, which calls `request.execute()`. There are **no inline SQL strings** anywhere in the app code. All logic lives in `sql/02_procedures.sql` (`usp_*`).

### Images
Admin uploads are saved to `public/uploads/<section>/` by multer; only the **web path** is stored in the DB (`ImagePath` / `ProductImages.FilePath`). Products support multiple images with a designated **primary** image.

### What the admin can manage
- **Products** — name, category, descriptions, badge, feature chips, spec table, application chips, multiple images, featured/active flags
- **Categories**, **Industries** (+ tags), **Solutions** (+ features)
- **Blog posts** (with publish state + date)
- **About page**: Team members, Core values, Stats/counters
- **Leads** — every contact/quote/industry form submission, with status workflow
- **Site Settings** — company info, contact details, social links, hero & footer text (key/value CMS)

## Notes
- The original static `*.html` files were converted into the `views/` templates and removed from the repo root (preserved in git history).
- To add another admin user, insert via `usp_User_Create` with a bcrypt hash (see `src/scripts/setup-db.js`).
