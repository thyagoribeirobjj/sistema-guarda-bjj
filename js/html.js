// html`<p>${name}</p>` escapes every value unless it is another html`` result (or a list of them).
class Html {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function show(value) {
  if (value instanceof Html) return value.value;
  if (Array.isArray(value)) return value.map(show).join('');
  if (value == null || value === false) return '';
  return String(value).replace(/[&<>"']/g, (c) => escapes[c]);
}

export function html(strings, ...values) {
  return new Html(strings.reduce((out, part, i) => out + part + (i < values.length ? show(values[i]) : ''), ''));
}
