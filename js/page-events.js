import { saveDiagram, saveMinBelt } from './firebase.js';
import { state } from './state.js';
import { t } from './strings.js';
import { closeMenus, openedMenu, moveInMenu } from './nav.js';
import { redrawPanel, closePanel, panelOpen, stepPanel, typing } from './panel.js';
import { changeNote } from './notes.js';
import { shrinkImage } from './media.js';
import { changeLesson, redrawPlan } from './lesson.js';
import { designerInput, designerChange } from './designer.js';
import { $, drawn, adoptMain, render, search, route } from './page.js';
import { clickActions, changeMedia } from './actions.js';

// The site's page listening: clicks, changes, typing, keys, the menus' focus and the address. Set up once, when
// js/app.js loads.

// A tap outside an open menu only closes it; it doesn't also press what is under the finger.
// Noted on pointerdown, because the focus leaving the menu closes it before the click arrives.
let closingTap = false;
const outsideMenus = (target) => !target.closest('[role="menu"], [aria-haspopup="menu"]');
document.addEventListener('pointerdown', (event) => { closingTap = Boolean(openedMenu()) && outsideMenus(event.target); });
document.addEventListener('pointercancel', () => { closingTap = false; });

document.addEventListener('click', (event) => {
  const dismiss = closingTap;
  closingTap = false;
  // detail is 0 for a click made with the keyboard.
  if (dismiss && event.detail) {
    closeMenus();
    event.preventDefault();
    return;
  }
  if (outsideMenus(event.target)) closeMenus();
  for (const [selector, action] of clickActions) {
    const element = event.target.closest(selector);
    if (element) { action(element); return; }
  }
});

document.addEventListener('change', (event) => {
  if ($('main').contains(event.target)) drawn.delete($('main'));
  const id = event.target.dataset?.diagramFile;
  if (id && event.target.files[0]) {
    changeMedia(id, 'diagram', async () => { await saveDiagram(id, await shrinkImage(event.target.files[0])); return true; });
    return;
  }
  const minBeltId = event.target.dataset?.minBelt;
  if (minBeltId) {
    changeMedia(minBeltId, 'minBelt', async () => { await saveMinBelt(minBeltId, event.target.value); return event.target.value || null; });
    return;
  }
  if (designerChange(event.target)) {
    render();
    return;
  }
  const redraw = changeLesson(event.target);
  if (redraw === true) render();
  else if (redraw === false) redrawPlan();
});

document.addEventListener('input', (event) => {
  if (event.target.id === 'search') search(event.target.value);
  if (event.target.dataset.note) changeNote(event.target.dataset.note, event.target.value);
  if (designerInput(event.target)) adoptMain();
});

// The notes were replaced other than by typing here (another tab, forgotten): an open note box shows them now.
document.addEventListener('notes-changed', () => redrawPanel(null));

document.addEventListener('note-not-saved', (event) => {
  const box = $('noteBox');
  if (box?.dataset.note === event.detail) $('noteStatus').textContent = t('noteNotSaved');
});

document.addEventListener('keydown', (event) => {
  // The TV sheet is a <dialog>: Escape closes it by itself, and nothing behind it.
  if ($('tvSheet').open) return;
  const menuOpen = Boolean(openedMenu());
  if (menuOpen && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    moveInMenu(event.key === 'ArrowDown' ? 1 : -1);
    return;
  }
  if (!menuOpen && panelOpen() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !typing(event.target)) {
    event.preventDefault();
    stepPanel(event.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (event.key !== 'Escape') return;
  if (menuOpen) closeMenus(true);
  else if (panelOpen()) closePanel();
  else if (state.search) search('');
});

// Tabbing out of a menu closes it.
document.addEventListener('focusout', (event) => {
  const menu = event.target.closest?.('[role="menu"]');
  const to = event.relatedTarget;
  if (menu && to && !menu.contains(to) && to.getAttribute('aria-controls') !== menu.id) closeMenus();
});
window.addEventListener('hashchange', route);
// A Google photo that doesn't load leaves the letter under it showing.
document.addEventListener('error', (event) => { if (event.target.matches?.('#account img')) event.target.remove(); }, true);
