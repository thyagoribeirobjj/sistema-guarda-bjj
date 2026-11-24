// Nightly checks of the published site, run by .github/workflows/nightly.yml.
// Read-only: nothing here changes the site, the database or the Google project.
import { readFileSync } from 'node:fs';
import tls from 'node:tls';

const project = 'sistema-guarda-515619';
const domain = 'sistemaguarda.com';
const repository = 'thyagoribeirobjj/sistema-guarda-bjj';
const site = `https://${domain}`;
const documents = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const dnsRecords = [
  ['A', domain, '199.36.158.100'],
  ['TXT', domain, `hosting-site=${project}`],
  ['CNAME', `www.${domain}`, `${project}.web.app`],
];
const mustNotBePublished = ['/.git/config', '/.github/workflows/deploy.yml', '/firebase.json', '/firestore.rules', '/CLAUDE.md', '/tests/rules.test.js', '/docs/translator.gs'];

let failures = 0;

// A check passes when run() returns nothing; what it returns (or throws) is the problem.
async function check(name, run) {
  let problem = '';
  try { problem = (await run()) || ''; } catch (error) { problem = error.message; }
  if (problem) failures += 1;
  console.log(`${problem ? 'FAIL' : 'PASS'}  ${name}${problem ? `: ${problem}` : ''}`);
}

const expected = (got, wanted) => (String(got) === String(wanted) ? '' : `expected ${wanted}, got ${got}`);
const status = async (url) => (await fetch(url, { redirect: 'manual' })).status;

async function google(url) {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${process.env.GOOGLE_TOKEN}`, 'X-Goog-User-Project': project } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} answered ${response.status}`);
  return response.json();
}

function certificateDaysLeft() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, domain, { servername: domain }, () => {
      const days = (new Date(socket.getPeerCertificate().valid_to) - Date.now()) / 86400000;
      socket.end();
      resolve(Math.floor(days));
    });
    socket.on('error', reject);
  });
}

// ---- it stays free, and what is published is what is in main ----

await check('the Google project has no billing account, so nothing can be charged', async () => {
  const billing = await google(`https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`);
  return expected(Boolean(billing.billingEnabled), false);
});

await check('the live database rules are main\'s firestore.rules', async () => {
  const api = 'https://firebaserules.googleapis.com/v1/';
  const release = await google(`${api}projects/${project}/releases/cloud.firestore`);
  const live = (await google(api + release.rulesetName)).source.files[0].content;
  return live === readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') ? '' : 'they differ';
});

await check('only site files are published', async () => {
  const hosting = 'https://firebasehosting.googleapis.com/v1beta1/';
  const { releases } = await google(`${hosting}sites/${project}/releases?pageSize=1`);
  const { files = [] } = await google(`${hosting}${releases[0].version.name}/files?pageSize=1000`);
  const unwanted = files.map((file) => file.path).filter((path) => /\/\.|gha-creds|^\/(docs|tests|node_modules)\/|AGENTS|CLAUDE|README|firebase\.json|firestore\.rules|package/.test(path));
  for (const path of mustNotBePublished) if (await status(site + path) !== 404) unwanted.push(path);
  return unwanted.length ? unwanted.join(' ') : '';
});

// ---- the site answers, safely ----

await check(`${site} answers`, async () => expected(await status(`${site}/`), 200));

await check('www sends people to the bare domain', async () => {
  const response = await fetch(`https://www.${domain}/`, { redirect: 'manual' });
  return expected(`${response.status} ${response.headers.get('location')}`, `301 ${site}/`);
});

await check('the security certificate has more than two weeks left', async () => {
  const days = await certificateDaysLeft();
  return days > 14 ? '' : `${days} days left`;
});

await check('pages are sent with the safety headers', async () => {
  const headers = (await fetch(`${site}/`)).headers;
  return expected(`${headers.get('x-content-type-options')} | ${headers.get('content-security-policy')}`, "nosniff | frame-ancestors 'none'");
});

// ---- signed out, people can read the week and nothing private ----

const { apiKey } = await (await fetch(`${site}/__/firebase/init.json`)).json();

await check('signed out: the week can be read', async () => expected(await status(`${documents}/site/week?key=${apiKey}`), 200));
await check('signed out: the admin list is refused', async () => expected(await status(`${documents}/admins/someone%40example.com?key=${apiKey}`), 403));
await check('signed out: people\'s settings are refused', async () => expected(await status(`${documents}/users/someone?key=${apiKey}`), 403));

await check('the translator refuses anyone who is not a signed-in admin', async () => {
  const config = await (await fetch(`${documents}/site/config?key=${apiKey}`)).json();
  const answer = await fetch(config.fields.translatorUrl.stringValue, { method: 'POST', body: JSON.stringify({ texts: ['Olá'], from: 'pt', to: 'en' }) });
  return expected(await answer.text(), '{"error":"Not allowed"}');
});

// ---- GitHub and DNS ----

await check('main only takes tested, up-to-date pull requests', async () => {
  const headers = process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {};
  const rules = await (await fetch(`https://api.github.com/repos/${repository}/rules/branches/main`, { headers })).json();
  const have = rules.map((rule) => rule.type + (rule.parameters?.strict_required_status_checks_policy ? ':strict' : '')).sort();
  return expected(have.join(' '), 'deletion non_fast_forward pull_request required_status_checks:strict');
});

for (const [type, host, wanted] of dnsRecords) {
  await check(`DNS ${type} ${host} is ${wanted}`, async () => {
    const { Answer = [] } = await (await fetch(`https://dns.google/resolve?name=${host}&type=${type}`)).json();
    const have = Answer.map((answer) => answer.data.replace(/^"|"$/g, '').replace(/\.$/, ''));
    return have.includes(wanted) ? '' : `got ${have.join(' ') || 'nothing'}`;
  });
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
