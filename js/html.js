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

// false shows nothing (${open && html`…`}), except as a whole attribute value: aria-pressed="${on}" must say "false".
const attributeValue = /="$/;

export function html(strings, ...values) {
  return new Html(strings.reduce((out, part, i) => {
    if (i >= values.length) return out + part;
    const value = values[i] === false && attributeValue.test(part) && strings[i + 1].startsWith('"') ? 'false' : values[i];
    return out + part + show(value);
  }, ''));
}
