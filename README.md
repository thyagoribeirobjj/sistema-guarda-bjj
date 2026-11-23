# Sistema Guarda BJJ

Interactive guard-system site for Gracie Sports Fairfield. If a student misses class, they open the site, sign in, and catch up on the week's techniques.

Live site: <https://thyagoribeirobjj.github.io/sistema-guarda-bjj/>

## Architecture

Everything is static files (GitHub Pages, no build step, no server).

```
index.html          App shell: fetches the JSON below, renders the UI
admin.html          Interim admin: edits the week's content, downloads week.json
data/content.json   ALL static content (UI strings, drills, both guard modules,
                    every technique with steps/tips/levels, games, method)
data/users.json     File-based user database: email -> configuration
                    { language, level, myTechs[], progress{}, notes }
data/week.json      Current week's content: { week_of, class_du_jour,
                    featured technique ids, note }
.env.example        DATABASE_URL config string (see below)
```

Flow:

1. **Content** lives in `data/content.json`. The app loads it at startup and renders the same modules, stages, technique detail panel, lesson builder and method tab as before.
2. **Sign-in** comes first: social buttons (Google, GitHub, Apple) are **demo mode** — real OAuth needs hosting. For now, entering an email (or the demo account `demo@example.com`) loads that user's config from `data/users.json`, or creates a default one. No passwords anywhere; in demo mode the config is saved in the browser only.
3. **User -> config** is the mapping `email -> configuration` in `data/users.json`. The signed-in user's language, level filter and "my system" technique ids personalize the render: their language is applied, their level becomes the default filter, and their techniques get a ★.
4. **This week** comes from `data/week.json` and is bubbled up in a card at the top of the module views: the class of the day plus the featured techniques (click one to open its detail panel).
5. **Admin** (`admin.html`) picks the week's featured module/stage/techniques and note. With no backend yet it downloads an updated `data/week.json`; commit that file to the repo and Pages rebuilds in about a minute.

## Run locally

Any static server works (opening the file directly does **not** — `fetch` needs HTTP):

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Database: now and later

Today the "database" is the JSON files in `data/`. The configuration mechanism is already the final one: a single `DATABASE_URL` string (see `.env.example`).

```bash
DATABASE_URL=sqlite:./data/app.db
```

To move to a real database, swap the value — same mechanism, no data-model change:

```bash
DATABASE_URL=postgres://user:password@host:5432/sistema_guarda
DATABASE_URL=spanner://projects/my-project/instances/main/databases/sistema_guarda
```

The tables mirror the JSON: `users(email PK, config JSON)` and `weeks(week_of PK, class_du_jour, featured, note)`.

## Still needs real hosting

- **Real OAuth** for the Google / GitHub / Apple buttons (currently demo-only labels).
- **A real database** behind `DATABASE_URL`, plus a small write API so sign-in, "my system" toggles and admin edits persist for everyone instead of in one browser.
- **Admin write API + admin auth**, so `admin.html` can save `week.json` directly instead of downloading it.
- **Privacy**: user configs currently ship in a public JSON file — fine for demo data, not for real student data. Move users to the database before onboarding real students.
