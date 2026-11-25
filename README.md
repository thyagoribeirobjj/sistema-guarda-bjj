# Sistema Guarda BJJ

The guard system and the rest of the fight for Gracie Sports Fairfield, in Portuguese and English. Students who miss
a class open the site, see this week's techniques, and study them step by step.

Live site: <https://sistemaguarda.com>

## What people can do

| | Anyone | Signed in with Google | Admin |
|---|---|---|---|
| Browse the curriculum (every part of the fight), and the coach's tools: the lesson builder and the method | ✓ | ✓ | ✓ |
| See this week's class ("Esta semana") and past weeks | ✓ | ✓ | ✓ |
| Share a technique (the phone's share sheet, or the link is copied) | ✓ | ✓ | ✓ |
| Search techniques by name or by a word in their description | ✓ | ✓ | ✓ |
| Switch language (PT / EN) and theme (six, in the account menu) | ✓ in this browser | ✓ on every device | ✓ |
| Build "Minha árvore" (♥ favorite techniques, in their own order) | ✓ in this browser | ✓ on every device | ✓ |
| Plan a class in the lesson builder | ✓ in this browser | ✓ on every device | ✓ |
| Watch a move's video and see its diagram | ✓ | ✓ | ✓ |
| Change this week's class (`admin.html`); the previous week moves into past weeks | | | ✓ |
| Attach a video or diagram to a move (from the move's panel) | | | ✓ |

When someone signs in for the first time, the settings and favorites from their browser are saved to their account.

**Finding your way:** This week, Curriculum (a card for each part of the fight) and My tree. On a phone they sit in a
bar at the bottom of the screen, with Search; inside a part, the bar at the top jumps to another part. On a computer
they're in a sidebar on the left. The coach's tools (lesson builder, method, and Admin for admins) are in the account
menu (the round button at the top right), and at the bottom of the sidebar on a computer.

**Admins write in one language.** On the admin page, pick PT or EN and fill each field once; the other language is
translated automatically when you save, and you can correct it.

**Adding a video to a move:** upload it to YouTube as *Unlisted*, copy the link, open the move on the site and paste
it under "Admin · Vídeo". Videos never use this site's free storage. Diagrams are added the same way ("Adicionar
imagem"); the image is shrunk before it's saved.

**Adding an admin:** Firebase console → Firestore → `admins` → Add document. The document ID is their Google email
in lowercase; add a text field `name`. Delete the document to remove them.

## How it fits together

```
sistemaguarda.com (static files on Firebase Hosting)
  ├─ data/content.json        guard modules (top, bottom), drills, method
  ├─ data/curriculum.json     the other parts of the fight, their order, "where to go" links
  ├─ Firebase Authentication  "Sign in with Google"
  └─ Firestore database       site/week · site/weeks · admins/{email} · users/{uid}
                              firestore.rules decides who reads and writes what
```

| Path | What it is |
|---|---|
| `index.html`, `admin.html` | Markup, plus the icon and share-preview tags |
| `img/` | The logo (also the browser icon), the phone home-screen icon and the picture shown when a link is shared |
| `css/theme.css` | Colors and fonts for every theme. Change the look here. |
| `css/app.css`, `css/nav.css` | Components; the navigation and page layout |
| `js/` | The site's code, one file per job (see `CLAUDE.md`) |
| `js/strings.js` | Button and label text in PT and EN |
| `data/` | The curriculum |
| `firestore.rules` | Database access rules |
| `tests/` | Checks for the curriculum and the database rules, a browser check of the whole site, and the nightly checks of the published site |
| `CLAUDE.md` (and `AGENTS.md`, a link to it) | How coding agents (Claude, Muse and others) should work in this repo |

## Editing the curriculum

Edit the files in `data/`. Every technique and game has an `id` such as `top-standing-pass`. Never change an existing
id (favorites, the week's class and the "where to go" links point at it); give new techniques a new, unique one.
`CLAUDE.md` explains shared techniques, links, adding a part of the fight and adding a coach tool.

## Run it on your computer

```bash
npm ci             # once: the test tools
npm start          # http://localhost:8000
npm test           # needs Node 22 and Java 21
npm run smoke -- http://localhost:8000   # uses the site in Chrome (while npm start runs)
npm run smoke:real # the same at https://sistemaguarda.com, with this folder's files and the real (signed-out) database
npm run signed-in  # uses it signed in, against local copies of sign-in and the database
```

Locally there is no sign-in or database, so "Esta semana" and the admin page only work on the live site.
Everything else works the same.

## Publishing

Changes reach `main` through pull requests. Each pull request runs the tests (`.github/workflows/deploy.yml`), and
GitHub only allows the merge once they pass on a branch that's up to date with `main`. That way, everything that goes
live was tested together with everyone else's latest work. After a merge, the site and the database rules are
published and live at <https://sistemaguarda.com> about a minute later.

- **The rule on `main`** lives in `docs/main-ruleset.json`. The repo owner applies it once (Settings → Rules, or
  `gh api -X POST repos/thyagoribeirobjj/sistema-guarda-bjj/rulesets --input docs/main-ruleset.json`). To change it,
  edit the file and update the ruleset the same way.

- **Undo a bad publish:** revert the commit, or Firebase console → Hosting → Release history → Roll back.
- **No keys in this repo:** GitHub signs in to Google with a short-lived token that only works for `main` of this
  repository. The site's Firebase settings come from the hosting itself (`/__/firebase/init.json`).
- **Cost:** the Google Cloud project is on the free plan with no billing account, so it can't be charged. Past the free
  limits (for example 50,000 database reads a day) a feature pauses until the next day.

## Later

- An admin page for editing the curriculum itself, so changes don't need a code change.
- Separate weeks for beginner and advanced classes.
