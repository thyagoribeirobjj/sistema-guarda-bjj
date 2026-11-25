// Answers for the site's own files from a checkout, the way Firebase Hosting answers once that checkout is published:
// only the files firebase.json publishes (its "ignore" list left out), with the headers it sets, and 404 for the rest.
// `tests/smoke.mjs --code-from <folder>` uses it to try a pull request's code at the real site's address before a merge.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml',
};

// The patterns firebase.json uses, as regular expressions: ** (any folders), * and ? (within one name), @(a|b) (one of).
function globPattern(glob) {
  let pattern = '';
  let choices = 0;
  for (let at = 0; at < glob.length; at++) {
    const character = glob[at];
    if (glob.startsWith('**/', at)) { pattern += '(?:.*/)?'; at += 2; }
    else if (glob.startsWith('**', at)) { pattern += '.*'; at += 1; }
    else if (character === '*') pattern += '[^/]*';
    else if (character === '?') pattern += '[^/]';
    else if (glob.startsWith('@(', at)) { pattern += '(?:'; choices++; at += 1; }
    else if (choices && character === '|') pattern += '|';
    else if (choices && character === ')') { pattern += ')'; choices--; }
    else pattern += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

async function isFile(file) {
  return (await stat(file).catch(() => null))?.isFile() ?? false;
}

// checkout(folder) gives answer(pathname): { status, headers, body } for a request to the site.
export async function checkout(folder) {
  const root = path.resolve(folder);
  const hosting = JSON.parse(await readFile(path.join(root, 'firebase.json'), 'utf8')).hosting;
  const ignored = (hosting.ignore || []).map(globPattern);
  const rules = (hosting.headers || []).map((rule) => ({ source: globPattern(rule.source), headers: rule.headers }));

  const published = async (name) => {
    if (name.startsWith('..') || path.isAbsolute(name) || ignored.some((pattern) => pattern.test(name))) return null;
    const file = path.join(root, name);
    return (await isFile(file)) ? file : null;
  };

  return async function answer(pathname) {
    let name;
    try { name = path.posix.normalize(decodeURIComponent(pathname)).replace(/^\/+/, ''); } catch { name = '..'; }
    if (name === '' || name.endsWith('/')) name += 'index.html';
    let file = await published(name);
    let status = 200;
    if (!file) {
      status = 404;
      file = await published('404.html');
    }
    // Every rule whose source matches applies; a later rule's value for the same header wins.
    const headers = { 'content-type': file ? types[path.extname(file)] || 'application/octet-stream' : 'text/html; charset=utf-8' };
    for (const rule of rules) {
      if (!rule.source.test(pathname)) continue;
      for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
    }
    return { status, headers, body: file ? await readFile(file) : 'Not found' };
  };
}
