// Google Analytics, answered by the tests themselves (tests/smoke.mjs, tests/signed-in.mjs), so nothing ever reaches
// the real one. Every request to its hosts (and to the Firebase ones its code calls) is noted in `requests`; Tag
// Manager's gtag.js is a small stand-in that sends each event the site asks for to www.google-analytics.com as JSON,
// as long as gtag.js itself would (collection on, analytics_storage not denied), and sets a _ga cookie the way
// gtag.js does once it may.
const analyticsHosts = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|firebase\.googleapis\.com|firebaseinstallations\.googleapis\.com/;
const fakeGtag = `(() => {
  const layer = window.dataLayer = window.dataLayer || [];
  const consent = {};
  let id = '';
  let config = {};
  const allowed = () => id && !window['ga-disable-' + id] && consent.analytics_storage !== 'denied';
  const cookie = (name) => { document.cookie = name + '=GA1.1.made-up; path=/; max-age=600' + (location.hostname.includes('.') ? '; domain=' + location.hostname : ''); };
  const handle = (command) => {
    const [kind, first, second] = Array.from(command);
    if (kind === 'consent') Object.assign(consent, second);
    if (kind === 'config') { id = first; config = second || {}; }
    if (!allowed() || (kind !== 'event' && kind !== 'config')) return;
    cookie('_ga');
    cookie('_ga_' + id.replace(/^G-/, ''));
    if (kind !== 'event') return;
    const hit = { tid: id, en: first, dl: location.href, dt: document.title, ul: navigator.language, ...config, ...second };
    fetch('https://www.google-analytics.com/g/collect?v=2', { method: 'POST', mode: 'no-cors', body: JSON.stringify(hit) });
  };
  layer.forEach(handle);
  const push = layer.push.bind(layer);
  layer.push = (...commands) => { commands.forEach(handle); return push(...commands); };
})();`;

export async function routeAnalytics(context, requests, measurementId) {
  await context.route(analyticsHosts, (route) => {
    const request = route.request();
    requests.push({ url: request.url(), body: request.postData() || '' });
    const url = new URL(request.url());
    if (url.hostname.includes('googletagmanager')) return route.fulfill({ contentType: 'text/javascript', body: fakeGtag });
    if (url.pathname.endsWith('/webConfig')) return route.fulfill({ json: { measurementId, appId: '1:1:web:1' } });
    if (url.hostname.startsWith('firebaseinstallations')) {
      return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { name: 'installation', fid: 'cMadeUpInstallation1', refreshToken: 'made-up', authToken: { token: 'made-up', expiresIn: '604800s' } } });
    }
    return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
  });
}

// The events that reached the stand-in Google Analytics, as gtag.js would have sent them.
export const hits = (requests) => requests.filter((request) => request.url.includes('google-analytics.com/g/collect')).map((request) => JSON.parse(request.body));
