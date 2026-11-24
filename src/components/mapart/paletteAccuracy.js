/* ==========================================================================
   paletteAccuracy.js — точность квантования (этап 4, пункт 4.4)

   Воркер считает, сколько пикселей картинки попали в палитру точно, без
   приближения. Остальные пиксели дизеринг размазывает между двумя тонами —
   это нормально, но по этой цифре видно, насколько сильно картинка
   «перекрашивается».

   Индикатор живёт под превью карты: он описывает именно превью, а внизу
   панели студии его перекрывала липкая полоса экспорта. Подробности — в
   подсказке, чтобы строка оставалась короткой.

   Подсказка не просто повторяет процент, а объясняет, откуда взялись
   промахи: какие оттенки не попали и насколько они отличаются от
   ближайших блоков. Чаще всего виновата предобработка: насыщенность 103%
   сдвигает цвет на единицу, и точное попадание в палитру пропадает.
   ========================================================================== */

import React from "react";

import Tooltip from "../tooltip";

import "./paletteAccuracy.css";

/* Процент пикселей, попавших в палитру точно. null — рендера ещё не было. */
export function accuracyPercent(accuracy) {
  if (!accuracy || !accuracy.total) return null;
  return Math.round((accuracy.share || 0) * 100);
}

/* Подробности для подсказки: «2081 из 2496 пикселей попали в палитру точно». */
export function accuracyDetail(accuracy, template) {
  if (!accuracy || !accuracy.total) return null;
  return template
    .replace("{exact}", String(accuracy.exact))
    .replace("{total}", String(accuracy.total));
}

/* Название оттенка по ключу тона. */
export function toneName(tone, getLocaleString) {
  if (!tone) return "";
  const names = {
    dark: "STUDIO/TONE/DARK",
    normal: "STUDIO/TONE/NORMAL",
    light: "STUDIO/TONE/LIGHT",
    unobtainable: "STUDIO/TONE/UNOBTAINABLE",
  };
  const key = names[tone];
  if (!key) return tone;
  return getLocaleString(key) || tone;
}

/* Список промахов: «Clay (светлый) — 3 605 px, отличие 1». */
export function accuracyMissList(accuracy, getLocaleString, template) {
  if (!accuracy || !accuracy.misses || accuracy.misses.length === 0) return null;
  return accuracy.misses.map((miss) =>
    template
      .replace("{block}", miss.blockName || "?")
      .replace("{tone}", toneName(miss.tone, getLocaleString))
      .replace("{count}", String(miss.count))
      .replace("{difference}", String(miss.difference === null ? "?" : miss.difference))
  );
}

/* Цвета отличаются от палитры на единицы — значит, их сдвинула обработка.
   Настоящие «чужие» цвета отстоят от палитры десятками единиц. */
export function accuracyShifted(accuracy) {
  if (!accuracy || !accuracy.misses || accuracy.misses.length === 0) return false;
  return accuracy.misses.every((miss) => miss.difference !== null && miss.difference <= 4);
}

export default function PaletteAccuracy({ accuracy, getLocaleString }) {
  const percent = accuracyPercent(accuracy);
  if (percent === null) return null;
  const label = getLocaleString("STUDIO/ACCURACY") || "Palette accuracy";
  const detail = accuracyDetail(
    accuracy,
    getLocaleString("STUDIO/ACCURACY-HINT") || "{exact} of {total} pixels hit the palette exactly"
  );
  const missList = accuracyMissList(
    accuracy,
    getLocaleString,
    getLocaleString("STUDIO/ACCURACY-MISS-ITEM") || "{block} ({tone}) — {count} px, off by {difference}"
  );
  const missesTitle = (getLocaleString("STUDIO/ACCURACY-MISSES") || "{missed} pixels miss the palette:").replace(
    "{missed}",
    String(accuracy.missed === undefined ? accuracy.total - accuracy.exact : accuracy.missed)
  );
  const shiftHint = accuracyShifted(accuracy)
    ? getLocaleString("STUDIO/ACCURACY-SHIFT-HINT") ||
      "The colours are off by only a few units — preprocessing probably shifted them."
    : null;

  const tooltipText = (
    <React.Fragment>
      <span>{detail}</span>
      {missList ? (
        <React.Fragment>
          <br />
          <span>
            {missesTitle} {missList.join("; ")}
          </span>
        </React.Fragment>
      ) : null}
      {shiftHint ? (
        <React.Fragment>
          <br />
          <span>{shiftHint}</span>
        </React.Fragment>
      ) : null}
    </React.Fragment>
  );

  return (
    <Tooltip tooltipText={tooltipText}>
      <small className="mapAccuracyHint">
        {label}: {percent}%
      </small>
    </Tooltip>
  );
}
