import { html } from './html.js';
import { t } from './strings.js';

// Videos live on YouTube (unlisted), so they cost this site nothing to store or play.
const validId = /^[A-Za-z0-9_-]{11}$/;

// Accepts a YouTube link in any common form (youtu.be/…, watch?v=…, shorts/…, embed/…) or a bare id.
export function youtubeId(text) {
  const value = String(text || '').trim();
  if (validId.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^(www\.|m\.)/, '');
    const id = host === 'youtu.be'
      ? url.pathname.slice(1)
      : host === 'youtube.com' && (url.searchParams.get('v') || url.pathname.split('/')[2]);
    return validId.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

// A thumbnail first; the YouTube player only loads when someone taps play.
export function videoPreview(videoId) {
  if (!validId.test(videoId || '')) return '';
  return html`<button type="button" class="video" data-play="${videoId}" aria-label="${t('playVideo')}">
    <img src="https://i.ytimg.com/vi/${videoId}/hqdefault.jpg" alt="" loading="lazy"><span class="play" aria-hidden="true">▶</span></button>`;
}

export function videoPlayer(videoId) {
  if (!validId.test(videoId || '')) return '';
  return html`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0" title="${t('video')}"
    allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
}

// Shrinks a photo or drawing to fit comfortably in one database document (well under 1 MB).
export async function shrinkImage(file, maxSide = 1400, maxLength = 850000) {
  const bitmap = await createImageBitmap(file);
  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let image = canvas.toDataURL('image/webp', 0.82);
    if (!image.startsWith('data:image/webp')) image = canvas.toDataURL('image/jpeg', 0.82);
    if (image.length < maxLength) return image;
    scale *= 0.75;
  }
  throw new Error('Image too large');
}
