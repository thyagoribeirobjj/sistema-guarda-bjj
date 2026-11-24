# Sistema Guarda: how to work in this repo

A bilingual (PT/EN) jiu-jitsu curriculum site for Gracie Sports Fairfield, live at https://sistemaguarda.com.
The owner, Thyago, is a coach, not a programmer. Explain changes in plain words and show him the result.
This file is for every coding agent: `AGENTS.md` is a link to it, so edit `CLAUDE.md` only.

## Stay in sync with `main`

Other people and agents push to this repo too, and every push to `main` goes live.

- **Before you start:** `git pull --rebase origin main`. Read the files you're about to change *after* pulling.
- **Right before you push:** pull again (`git pull --rebase origin main`), run `npm test`, then push.
- If the pull brings changes to files you edited, keep both: merge the other work in, never overwrite it.
- Never force-push `main`, and never "fix" a conflict by replacing a whole file with your copy.

## How the code should read

- **Plain words.** Name things for what they are: `techniquePage`, `saveWeek`, `favorites`. No abbreviations
  (`it`, `M`, `pd`), no clever one-liners. Someone new should follow any function on first read.
- **Few comments.** Only where the reason isn't obvious from the code. Never narrate what a line does.
- **Reuse before you write.** Look for an existing piece first: `techniqueChip`, `stageBlock`, `intro`, `gameCard`
  in `js/views.js`; `field` in `js/admin.js`; `.tech`, `.stage`, `.card`, `.field`, `.pill`, `.chipbtn` in `css/app.css`.
  If you write the same markup twice, make it a small function.
- **Templates, not string-building.** All markup goes through the `html` tag from `js/html.js`:
  `` html`<b>${text(technique.n)}</b>` ``. It escapes every value, which is what keeps the site safe.
  Never assign plain strings built from data to `innerHTML`.
- **Small files.** Keep each file under about 300 lines; split by page or feature when it grows.
- **Small changes.** Edit the piece that needs to change. Never replace a whole page or file in one go, and never
  copy data into the HTML: other people's work (sign-in, favorites, the database) lives in the same files.
- **No build step, no framework, no npm packages in the site.** Plain HTML, CSS and ES modules. The only
  outside code is the Firebase SDK, loaded from Google's CDN at the version pinned in `js/firebase.js`.

## Where things live

| Path | What it is |
|---|---|
| `index.html`, `admin.html` | Markup only. |
| `css/theme.css` | Every color and font: dark (the default) and light. **The only file with color values.** |
| `css/app.css` | Layout and components. Uses the theme's variables (`var(--ink)`) only. |
| `js/app.js` | Starts the site: header, tabs, links (`#top`, `#t-top-base`), clicks, sign-in. |
| `js/views.js` | The tabs: this week, each module, my tree (favorites), method. |
| `js/panel.js` | The technique panel: details, video, diagram, "where to go" links, next stage; admins attach media here. |
| `js/media.js` | YouTube links and player, and shrinking a diagram before it's saved. |
| `js/lesson.js` | The lesson builder. |
| `js/admin.js` | The admin page (set this week's class). |
| `js/strings.js` | Every button and label, in PT and EN. |
| `js/settings.js` | Each person's language, theme and favorites. |
| `js/firebase.js` | Sign-in and **every** database call. Nothing else talks to Firebase. |
| `js/content.js`, `js/state.js` | Loads the curriculum; tracks which tab and technique are showing. |
| `data/content.json` | The guard modules (top, bottom), drills and the method. |
| `data/curriculum.json` | The other parts of the fight, the tab order (`moduleOrder`) and the "where to go" links (`nx`). |
| `firestore.rules` | Who can read and change what in the database. |
| `tests/` | `content.test.js` checks the curriculum; `rules.test.js` checks the database rules. |
| `docs/translator.gs` | A copy of the translator that runs in John's Google account (see Translation). |

## Text

- Curriculum wording goes in the `data/` files. Button and label wording goes in `js/strings.js`.
- Every text has both languages: `{ "pt": "…", "en": "…" }`. Show it with `text(value)`; show a label with `t('key')`.
- Thyago may give you text in one language only. Write it in that language and fill in the other yourself.

## Content (`data/content.json`, `data/curriculum.json`)

- Every technique and game has an `id` made from its module and English name: `top-standing-pass`,
  `top-game-posture-keeper`. **Never change an existing id.** People's favorites, the week's lesson and the
  "where to go" links point at ids, so a changed id silently breaks them. A new technique gets a new, unique id.
- A technique that belongs in two tabs is written once; the other tab lists `{ "ref": "<id>" }` in its place.
- "Where to go" links live in `curriculum.json` → `nx`: `"<from id>": [["<to id>", "next" | "chain" | "combo" | "counter"]]`.
- A new tab is a new module in either file, added to `moduleOrder`.
- Keep the files formatted with 2-space indents, and never paste data into the HTML. `npm test` checks ids,
  references, links, tab order, names and levels.

## The database (Firestore)

| Document | Holds | Who can read | Who can change |
|---|---|---|---|
| `site/week` | This week's class (the "Esta semana" tab): `weekOf`, `title`, `note`, `techniques` (ids) | everyone | admins |
| `admins/{email}` | One document per admin, named by their lowercase email | that person | nobody from the site; add in the Firebase console |
| `site/media` | Each move's video (a YouTube id) and whether it has a diagram: `techniques.<id>.video`, `.diagram` | everyone | admins |
| `diagrams/{id}` | A move's diagram, as a small image (`data:image/webp;base64,…`, under 900 KB) | everyone | admins |
| `site/config` | `translatorUrl`: where the translator lives | everyone | admins |
| `users/{uid}` | A person's `language`, `theme`, `favorites` (their "Minha árvore", in their order) | that person | that person |

- `firestore.rules` is the only thing that protects data. The page hiding a button protects nothing.
- Any change to `firestore.rules` needs a matching test in `tests/rules.test.js`: one that shows the
  allowed case works and one that shows the blocked case is refused.
- **To add an admin:** Firebase console → Firestore → `admins` → Add document. Document ID: their Google
  email in lowercase. Field `name` (text). Remove the document to remove the admin.
- Students' settings and favorites are private. Never add a rule that lets one person read another's.

## Videos, diagrams and translation

- **Videos are YouTube links, never files.** Upload to YouTube as *Unlisted*, then paste the link on the move's
  panel (admins see the controls). Never put video files in this repo or in Firebase: the free hosting allows
  360 MB a day, and file storage needs billing.
- **Diagrams** are uploaded from the move's panel too. The browser shrinks them and stores them in
  `diagrams/<id>`. Don't add big images to the repo either.
- **Translation.** On the admin page, the admin picks the language they write in; the other is translated
  automatically when they save (`translate()` in `js/firebase.js`) and they can correct it. The translator is
  `docs/translator.gs`, running free in John's Google account; its address is in `site/config`. Changing it
  means redeploying it there, which is John's.

## Checking and publishing

- `npm test` runs every test (it needs Node 22 and Java 21). `npm start` serves the site at http://localhost:8000.
  Locally there is no sign-in or database: every tab works except "Esta semana" and the admin page.
- Every push to `main` runs the tests. If they pass, it publishes the site **and** `firestore.rules`
  about a minute later. Pull requests run the tests without publishing.
- Before you push: pull, run `npm test`, open the changed pages locally in both languages and both themes,
  and check a phone-width window.

## Never

- **Never anything that needs billing.** The Google Cloud project is on the free plan with billing off, on
  purpose, so it can never cost money. That rules out Cloud Functions, Cloud Run, Cloud SQL, Cloud Storage
  uploads and the "Blaze" plan. If a feature seems to need one, stop and ask John.
- Never remove entries from the `ignore` list in `firebase.json`. They keep the git folder and the deploy's
  temporary Google credentials (`gha-creds-*.json`) off the public site.
- Never commit keys, passwords or service-account files. The Firebase web settings are public and come from
  the hosting itself; deploys sign in to Google without keys.
- Google Cloud setup (sign-in providers, the database, permissions, the domain) is John's. Ask him rather
  than changing it.
