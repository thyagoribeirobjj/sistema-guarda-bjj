import { html } from './html.js';
import { t, text } from './strings.js';
import { pageAt, lessonItemsLimit } from './game-clock.js';

// A lesson plan's techniques block on the TV: every technique, in the largest type that fits (sizes in --u, a share
// of the screen), with their tips while they fit, then names only, in up to four columns. Never smaller than 1.7 u,
// about 3% of the screen's height, which reads from across the room: what doesn't fit at that size shows in pages
// that turn by themselves with the block's clock (pageAt(), js/game-clock.js), "1 / 3" beside the block's name.
const listSizes = [[1, 2.6, true], [2, 2.2, true], [1, 2.6, false], [2, 2.4, false], [2, 2, false], [3, 1.9, false], [3, 1.7, false], [4, 1.7, false]];
const pageLayout = [3, 2, false];

// Only a list longer than any lesson can name (lessonItemsLimit) ends with "+N more".
export function techniqueList(step) {
  if (!step?.list) return '';
  const shown = step.list.slice(0, lessonItemsLimit);
  const beyond = step.list.length - shown.length;
  return html`<ol class="tvs-list" id="tvsList">${shown.map((each) => html`<li><b>${text(each.n)}</b>${each.t ? html`<span class="tvs-tip">: ${text(each.t)}</span>` : ''}</li>`)}${beyond ? html`<li class="tvs-more">+${beyond} ${t('tvMore')}</li>` : ''}</ol>`;
}

function useLayout(list, [columns, size, tips]) {
  list.style.setProperty('--columns', columns);
  list.style.setProperty('--size', size);
  list.dataset.tips = tips;
}

// Sizes the list to the screen as it is now; called again when the screen changes size.
export function fitList() {
  const list = document.getElementById('tvsList');
  const mark = document.getElementById('tvsPages');
  if (!list) return;
  const items = [...list.children];
  for (const item of items) {
    item.hidden = false;
    delete item.dataset.page;
  }
  delete list.dataset.page;
  list.dataset.pages = 1;
  mark.hidden = true;
  const fits = () => list.scrollHeight <= list.clientHeight + 1 && list.scrollWidth <= list.clientWidth + 1;
  for (const layout of listSizes) {
    useLayout(list, layout);
    if (fits()) return;
  }
  // The page mark takes its line above the list before the pages are measured.
  mark.hidden = false;
  mark.textContent = `${items.length} / ${items.length}`;
  useLayout(list, pageLayout);
  for (const item of items) item.hidden = true;
  let page = 0;
  let first = 0;
  items.forEach((item, index) => {
    item.hidden = false;
    if (index > first && !fits()) {
      for (const before of items.slice(first, index)) before.hidden = true;
      page += 1;
      first = index;
    }
    item.dataset.page = page;
  });
  list.dataset.pages = page + 1;
}

// The page the block's clock is on: shown, with its mark.
export function turnPage(steps, position) {
  const list = document.getElementById('tvsList');
  const mark = document.getElementById('tvsPages');
  if (!list || !mark) return;
  const pages = Number(list.dataset.pages) || 1;
  const page = String(pageAt(steps, position, pages));
  if (list.dataset.page === page) return;
  list.dataset.page = page;
  for (const item of list.children) item.hidden = pages > 1 && item.dataset.page !== page;
  mark.hidden = pages < 2;
  mark.textContent = `${Number(page) + 1} / ${pages}`;
}
