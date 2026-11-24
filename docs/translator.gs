// Translates text for Sistema Guarda admins, for free, with Google Translate (LanguageApp).
// Lives in John's Google account as an Apps Script web app (Execute as: me, Who has access: Anyone).
// The site finds it through the database: site/config.translatorUrl.
// Only admins can use it: their Firebase sign-in token must be able to read their own admins/<email> entry,
// which firestore.rules allows only for that person, and only if they are an admin.
const PROJECT = 'sistema-guarda-515619';
const LANGUAGES = ['pt', 'en'];

function doPost(event) {
  try {
    const request = JSON.parse(event.postData.contents);
    if (!isAdmin(request.idToken, request.email)) return reply({ error: 'Not allowed' });
    if (!LANGUAGES.includes(request.from) || !LANGUAGES.includes(request.to)) return reply({ error: 'Unknown language' });
    const texts = (request.texts || []).slice(0, 20)
      .map((text) => (text ? LanguageApp.translate(String(text).slice(0, 5000), request.from, request.to) : ''));
    return reply({ texts });
  } catch (error) {
    return reply({ error: String(error) });
  }
}

function isAdmin(idToken, email) {
  if (!idToken || !email) return false;
  const url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
    '/databases/(default)/documents/admins/' + encodeURIComponent(String(email).toLowerCase());
  const response = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + idToken }, muteHttpExceptions: true });
  return response.getResponseCode() === 200;
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
