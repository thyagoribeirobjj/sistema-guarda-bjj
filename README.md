# Sistema Guarda BJJ

The guard system and the rest of the fight for Gracie Sports Fairfield, in Portuguese and English. Students who miss
a class open the site, see this week's techniques, and study them step by step.

Live site: <https://sistemaguarda.com>

## What people can do

| | Anyone | Signed in with Google | Admin |
|---|---|---|---|
| Browse every tab: the parts of the fight, the lesson builder, the method | ✓ | ✓ | ✓ |
| See this week's class ("Esta semana") | ✓ | ✓ | ✓ |
| Switch language (PT / EN) and dark / light mode | ✓ in this browser | ✓ on every device | ✓ |
| Build "Minha árvore" (♥ favorite techniques, in their own order) | ✓ in this browser | ✓ on every device | ✓ |
| Change this week's class (`admin.html`) | | | ✓ |

When someone signs in for the first time, the settings and favorites from their browser are saved to their account.

**Adding an admin:** Firebase console → Firestore → `admins` → Add document. The document ID is their Google email
in lowercase; add a text field `name`. Delete the document to remove them.

## How it fits together

```
sistemaguarda.com (static files on Firebase Hosting)
  ├─ data/content.json        guard modules (top, bottom), drills, method
  ├─ data/curriculum.json     the other parts of the fight, tab order, "where to go" links
  ├─ Firebase Authentication  "Sign in with Google"
  └─ Firestore database       site/week · admins/{email} · users/{uid}
                              firestore.rules decides who reads and writes what
```

| Path | What it is |
|---|---|
| `index.html`, `admin.html` | Markup only |
| `css/theme.css` | Colors and fonts for dark and light mode. Change the look here. |
| `css/app.css` | Layout and components |
| `js/` | The site's code, one file per job (see `CLAUDE.md`) |
| `js/strings.js` | Button and label text in PT and EN |
| `data/` | The curriculum |
| `firestore.rules` | Database access rules |
| `tests/` | Checks for the curriculum and the database rules |
| `CLAUDE.md` (and `AGENTS.md`, a link to it) | How coding agents (Claude, Muse and others) should work in this repo |

## Editing the curriculum

Edit the files in `data/`. Every technique and game has an `id` such as `top-standing-pass`. Never change an existing
id (favorites, the week's class and the "where to go" links point at it); give new techniques a new, unique one.
`CLAUDE.md` explains shared techniques, links and adding a tab.

## Run it on your computer

```bash
npm start          # http://localhost:8000
npm test           # needs Node 22 and Java 21
```

Locally there is no sign-in or database, so "Esta semana" and the admin page only work on the live site.
Everything else works the same.

## Publishing

Every push to `main` runs the tests (`.github/workflows/deploy.yml`). If they pass, the site and the database rules are
published, and they're live at <https://sistemaguarda.com> about a minute later. Pull requests run the same tests without
publishing.

- **Undo a bad publish:** revert the commit, or Firebase console → Hosting → Release history → Roll back.
- **No keys in this repo:** GitHub signs in to Google with a short-lived token that only works for `main` of this
  repository. The site's Firebase settings come from the hosting itself (`/__/firebase/init.json`).
- **Cost:** the Google Cloud project is on the free plan with no billing account, so it can't be charged. Past the free
  limits (for example 50,000 database reads a day) a feature pauses until the next day.

## Later

- An admin page for editing the curriculum itself, so changes don't need a code change.
- Past weeks ("Missed a class?") and separate weeks for beginner and advanced classes.
