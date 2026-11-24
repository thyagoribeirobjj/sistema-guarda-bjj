# Sistema Guarda: how to work in this repo

A bilingual (PT/EN) jiu-jitsu curriculum site for Gracie Sports Fairfield, live at https://sistemaguarda.com.
The owner, Thyago, is a coach, not a programmer. Explain changes in plain words and show him the result.
This file is for every coding agent: `AGENTS.md` is a link to it, so edit `CLAUDE.md` only.

## Stay in sync with `main`

Other people and agents work in this repo too, and everything merged into `main` goes live. GitHub enforces this
(`docs/main-ruleset.json`): changes reach `main` only through a pull request, and only after the tests pass on a
branch that's up to date with `main`. Nobody can push to `main` directly or force-push it.

1. **Start from the latest `main`:** `git switch main && git pull --rebase origin main`, then
   `git switch -c <short-name>`. Read the files you're about to change *after* pulling.
2. **Open a pull request:** run `npm test`, push the branch, `gh pr create --fill`. The tests run on it.
3. **If GitHub says the branch is out of date** (someone merged first): `gh pr update-branch --rebase`, or
   `git pull --rebase origin main` and push. Then the tests run again on top of their work.
4. **Merge** once the tests pass: `gh pr merge --squash --delete-branch`. The site publishes about a minute later.

If an update brings changes to files you edited, keep both: merge the other work in, never overwrite it, and
never "fix" a conflict by replacing a whole file with your copy.

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
| `index.html`, `admin.html` | Markup only, plus the icon and share-preview tags. The header is the logo, title, search, PT/EN and the account button. `index.html` has empty slots the navigation fills (`#sidebar`, `#bottomBar`, `#switcher`); `admin.html` keeps its own two-link tab strip ("← Site", "Admin"). |
| `img/` | `logo.svg` (the logo and browser icon), `icon-180.png` (phone home screen), `share.png` (the 1200×630 picture shown when a link is shared). |
| `css/theme.css` | Every color and font: dark (the default), light, and four more themes people pick in the account menu. A new theme is one block here plus its name in `themes` (`js/settings.js`), its label in `js/strings.js` and its name in `firestore.rules`. **The only file with color values**, apart from the logo and the `theme-color` tag's first-paint default (`applyTheme()` sets it from `--surface`). |
| `css/app.css` | Components (and the admin page's tab strip). Uses the theme's variables (`var(--ink)`) only. On touch screens (`pointer: coarse`) everything people tap is at least 44px tall, and inputs are 16px so phones don't zoom in. |
| `css/nav.css` | The site's navigation and page layout (`index.html` only): the bottom bar and part switcher under 900px, the sidebar from 900px. |
| `js/app.js` | Starts the site: header, search box, navigation, links (`#curriculum`, `#top`, `#t-top-base`), clicks, sign-in. |
| `js/nav.js` | The navigation, described once (see Navigation below), and the menus (the account menu and the part switcher). |
| `js/account.js` | The header's account button (`#account`, the person's Google photo) and its menu (`#accountMenu`): sign in or out, the Coach section, the theme picker. The button always shows; without Firebase (a local preview) the menu has no sign-in. |
| `js/views.js` | The pages: Curriculum home, this week (and past weeks), each part of the fight, my tree (favorites), method; and the search results. |
| `js/panel.js` | The technique panel: details, share, notes, video, diagram, "where to go" links, next stage; admins attach media and set the belt level here. Previous / next (buttons, arrow keys, swiping) move through the list it was opened from. Opening it adds one step to the browser history and moving replaces it, so a phone's back button closes it in one press. |
| `js/notes.js` | Each person's private notes on techniques: in this browser, and in `users/{uid}/private/notes` once signed in (read the first time a technique opens, saved one note at a time). |
| `js/media.js` | YouTube links and player, and shrinking a diagram before it's saved. |
| `js/lesson.js` | The lesson builder. Its choices are saved in `settings.lesson`. |
| `js/admin.js` | The admin page: set this week's class, or prepare next week's with a start date; start from a past week. A new week moves the last one into past weeks. |
| `js/week.js` | Decides which class is "this week" on a given day (a prepared week takes over on its start date) and what the admin page writes when it does. Tested in `tests/week.test.js`. |
| `js/students.js`, `js/roster.js` | The admin page's Students section (read only when the coach taps "Show students"); `roster.js` counts, sorts, finds and groups (tested in `tests/roster.test.js`). Never shows notes. |
| `js/privacy.js` | The privacy page (`#privacy`) and "Delete my data". Its words must stay true to the code and `firestore.rules`. |
| `js/strings.js` | Every button and label, in PT and EN. |
| `js/settings.js` | Each person's language, theme, belt, favorites, progress ("Drilling" / "Got it" per move) and lesson builder choices. |
| `js/firebase.js` | Sign-in and **every** database call. Nothing else talks to Firebase. |
| `js/content.js`, `js/state.js` | Loads the curriculum and searches it (names first, then descriptions, key points, drills and steps); tracks which page and technique are showing. |
| `data/content.json` | The guard modules (top, bottom), drills and the method. |
| `data/curriculum.json` | The other parts of the fight, their order (`moduleOrder`) and the "where to go" links (`nx`). |
| `firestore.rules` | Who can read and change what in the database. |
| `js/translation.js` | Decides, on the admin page, which fields to translate, keep or ask about (see Translation). |
| `tests/` | `content.test.js` checks the curriculum; `translation.test.js` checks those translation decisions; `week.test.js` and `roster.test.js` check next week and the students list; `rules.test.js` checks the database rules; `smoke.mjs` uses the site in a real browser; `nightly.mjs` checks the published site every night. |
| `docs/translator.gs` | A copy of the translator that runs in the site's Google account (see Translation). |

## Navigation

Four groups: **This week** (`#semana`, only when there is a week), **Curriculum** (`#curriculum`, a card per part of
the fight, and each part: `#fund`, `#top`…), **My tree** (`#meu`) and **Coach** (`#lesson`, `#method`, and Admin for
admins). Coach tools are open to everyone; they just live in a quieter place. Without a week the site opens on Curriculum.

- **One description.** `students` and `coach` in `js/nav.js` list the entries. The bottom bar, the sidebar and the
  account menu's Coach section are all drawn from them; never write a navigation link by hand.
- **Phones and tablets (under 900px):** a bar fixed to the bottom (This week, Curriculum, My tree, Search). Inside a
  part, a slim bar stuck to the top: "‹ Curriculum" and the part's name, which opens a menu of every part. Coach tools
  are in the account menu. `main` has bottom padding so nothing sits under the bar; the technique panel covers it.
- **Desktop (900px and wider):** a sidebar left of the page, the parts listed under Curriculum (folding them away is
  remembered in this browser, `sg-nav-parts`), Coach at the bottom. The account menu has the Coach section too.
- **A new part of the fight** is only content (see below): Curriculum, the sidebar and the switcher list `content.order`.
- **A new coach tool:** one entry in `coach` (`js/nav.js`), its page function in `pages` (`js/app.js`), its label in
  `js/strings.js`, and `intro(title, lead, '', t('coach'))` so the page shows the "Coach" line above its title.
- Every page has its own link (`#<view>`); old links keep working, so never rename a view.
- **Privacy** (`#privacy`) is linked from the foot of the sidebar and the account menu (with "Signing in lets your coaches
  see your progress" under the sign-in button). Change its words whenever what is kept, or who can read it, changes.

## Text

- Curriculum wording goes in the `data/` files. Button and label wording goes in `js/strings.js`.
- Every text has both languages: `{ "pt": "…", "en": "…" }`. Show it with `text(value)`; show a label with `t('key')`.
- Thyago may give you text in one language only. Write it in that language and fill in the other yourself.

## Content (`data/content.json`, `data/curriculum.json`)

- Every technique and game has an `id` made from its module and English name: `top-standing-pass`,
  `top-game-posture-keeper`. **Never change an existing id.** People's favorites, the week's lesson and the
  "where to go" links point at ids, so a changed id silently breaks them. A new technique gets a new, unique id.
- A technique that belongs in two parts is written once; the other part lists `{ "ref": "<id>" }` in its place.
- "Where to go" links live in `curriculum.json` → `nx`: `"<from id>": [["<to id>", "next" | "chain" | "combo" | "counter"]]`.
- A new part of the fight is a new module in either file, added to `moduleOrder`. It shows up in Curriculum, the
  sidebar and the part switcher by itself.
- Keep the files formatted with 2-space indents, and never paste data into the HTML. `npm test` checks ids,
  references, links, the order of the parts, names and levels.

## The database (Firestore)

| Document | Holds | Who can read | Who can change |
|---|---|---|---|
| `site/week` | This week's class (the "Esta semana" page): `weekOf`, `title`, `note`, `techniques` (ids), `from` (the language the admin last wrote in), `written` (`{ title: 'pt', note: 'en' }`: the language each field's original was typed in) and `handFixed` (`'title'` and/or `'note'`: translations the admin corrected by hand; missing means none). Optionally `next`: a prepared class with the same fields, whose `weekOf` is the day it takes over (see below) | everyone | admins |
| `site/weeks` | Past weeks, newest first, at most 52: `weeks: [{ weekOf, title, note, techniques, from, written, handFixed }]` (older entries have only the first four). Saving a new week on the admin page adds the previous one. Read only when someone taps "Past weeks" or "Start from a past week". | everyone | admins |
| `admins/{email}` | One document per admin, named by their lowercase email | that person | nobody from the site; add in the Firebase console |
| `site/media` | Each move's video (a YouTube id), whether it has a diagram and, where an admin changed it, its belt level: `techniques.<id>.video`, `.diagram`, `.level` | everyone | admins |
| `diagrams/{id}` | A move's diagram, as a small image (`data:image/webp;base64,…`, under 900 KB) | everyone | admins |
| `site/config` | `translatorUrl`: where the translator lives | everyone | admins |
| `users/{uid}` | A person's `email`, `name` (from Google), `language`, `theme`, `belt` (`''` or `white`…`black`, picked by them), `favorites` (their "Minha árvore", in their order), `progress` (`<id>: "learning" \| "done"`) and `lesson` (the lesson builder's choices: `mod`, `dur`, `items`, `game`) | that person and admins (coaches) | that person |
| `users/{uid}/private/notes` | Their notes: `notes: { <id>: text }` (at most 500, each under 2,000 characters), `changed` (the note the last save changed: each save changes one) | that person only, not admins | that person |

- `firestore.rules` is the only thing that protects data. The page hiding a button protects nothing.
- Any change to `firestore.rules` needs a matching test in `tests/rules.test.js`: one that shows the
  allowed case works and one that shows the blocked case is refused.
- **To add an admin:** Firebase console → Firestore → `admins` → Add document. Document ID: their Google
  email in lowercase. Field `name` (text). Remove the document to remove the admin.
- Coaches (admins) can read every student's `users/{uid}` (name, email, belt, favorites, progress) to follow them; the
  privacy page says so. Nobody else can, and notes stay readable by their owner only. Never widen either.
- **Belt levels.** Every technique is basic (`"lv": "b"`, white belt) or advanced (`"a"`, blue belt) in the `data/`
  files; an admin can set another belt on the technique's panel, saved in `site/media` (no extra read). `levelOf()` in
  `js/content.js` decides.
- **Next week.** A prepared week lives inside `site/week` as `next`, so it costs no extra read. Each browser shows it as
  this week from its start date on (by that browser's own date), with the old class as the newest past week. The
  database itself is switched (the old class filed in `site/weeks`, `next` becomes the week) the next time an admin
  opens or saves the admin page. `js/week.js` decides all of this.
- **Students.** The admin page lists every `users/{uid}` only when the coach taps "Show students": one read per
  student, so it is never loaded by itself.
- **Keep database reads low.** The free plan allows 50,000 reads a day. `site/week`, `site/media` and `site/weeks` are kept
  in each browser for 15 minutes (`site()` in `js/firebase.js`), so a change can take that long to reach a student
  who just visited; admin pages always read fresh. Don't add a database read that runs on every visit.

## Videos, diagrams and translation

- **Videos are YouTube links, never files.** Upload to YouTube as *Unlisted*, then paste the link on the move's
  panel (admins see the controls). Never put video files in this repo or in Firebase: the free hosting allows
  360 MB a day, and file storage needs billing.
- **Diagrams** are uploaded from the move's panel too. The browser shrinks them and stores them in
  `diagrams/<id>`. Don't add big images to the repo either.
- **Translation.** On the admin page, the admin picks the language they write in and sees only that language's
  fields; the other is translated automatically when they save (`translate()` in `js/firebase.js`). The
  translation shows as a quiet line under each field, with "Edit translation" to correct it by hand, and a word saying
whether it was translated automatically or corrected by hand (nothing when that line is the original someone typed:
`translationLabel()`, using `written`). A corrected
  field is listed in `handFixed` and is never translated over silently: if its original text changes, the page
  asks first. What happens to each field on save is decided in `js/translation.js` (tested in
  `tests/translation.test.js`); `js/admin.js` carries it out. The translator is
  `docs/translator.gs`, running free in the site's own Google account (sistemaguarda@gmail.com); its address is
  in `site/config`. Changing it means redeploying it there, which is John's.

## Checking and publishing

- `npm test` runs every test (it needs Node 22 and Java 21). `npm start` serves the site at http://localhost:8000.
  Locally there is no sign-in or database: every page works except "Esta semana" and the admin page.
- Every pull request runs the tests, then opens the site in Chrome and uses it (`tests/smoke.mjs`: the sidebar,
  Curriculum home, a technique, search, progress, the tree, sharing, the coach's tools from the account menu, the
  phone's bottom bar and part switcher, previous / next in a technique, notes, the "new" dot on This week, the belt filter, the privacy page and "Clear this
  browser", a prepared next week taking over on its date, both languages, the admin page). Once a pull request is merged, `main`
  publishes the site **and** `firestore.rules` about a minute later, then runs the same browser check on the
  published site. When you add a feature people click, add a step for it to `tests/smoke.mjs`.
- Every night `.github/workflows/nightly.yml` checks the published site (`tests/nightly.mjs`): up, safe, still
  free, and the same as `main`. A failure opens one issue named "Nightly check failed", which closes itself on
  the next night that passes. If you see that issue open, fix what it names before other work. GitHub switches
  scheduled workflows off after 60 days with no activity in the repo; turn it back on from the Actions tab
  (or `gh workflow enable nightly.yml`).
- Signing out clears the tree, progress, belt and notes from that device (they stay in the account), so a shared tablet
  never mixes two students' marks.
- Before you open or update a pull request: run `npm test`, open the changed pages locally in both languages and
  a dark and a light theme, and check a phone-width window and a desktop-width one.

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
