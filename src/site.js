/* Адрес сайта.
   В ссылке «поделиться палитрой» должен стоять наш домен, а не тот, что
   остался от upstream: ссылку открывают другие люди, и она ведёт на
   чужую страницу. */

/* Канонический адрес — на нём живёт опубликованная версия. */
export const SITE_URL = "https://axopupelbruh.github.io/mapartcraft";

/* Локальные и служебные адреса: открытая с такого адреса ссылка никому
   не пригодится — получатель её не откроет. Для них берётся канонический
   SITE_URL. */
const LOCAL_HOST_PATTERN = /^(localhost|127(\.\d+){3}|0\.0\.0\.0|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|\[?::1\]?|.*\.local)$/i;

/**
 * Адрес, по которому реально открыто приложение.
 *
 * Ссылка «поделиться палитрой» должна вести на ту же копию студии, на
 * которой её нажали. Раньше здесь была жёстко прописанная строка, и любая
 * другая публикация (зеркало, другой домен, форк) отдавала ссылку на
 * GitHub Pages. Теперь адрес берётся из документа, а канонический
 * SITE_URL остаётся запасным вариантом — для локальных запусков и для
 * случаев, когда document.baseURI недоступен.
 */
export function getSiteUrl() {
  try {
    if (typeof document === "undefined" || !document.baseURI) return SITE_URL;
    const base = new URL(".", document.baseURI);
    if (!/^https?:$/.test(base.protocol)) return SITE_URL;
    if (LOCAL_HOST_PATTERN.test(base.hostname)) return SITE_URL;
    return base.href.replace(/\/+$/, "");
  } catch (error) {
    return SITE_URL;
  }
}

/** Ссылка на приложение с параметром пресета. */
export function siteUrlWithQuery(query) {
  return `${getSiteUrl()}/?${query}`;
}
