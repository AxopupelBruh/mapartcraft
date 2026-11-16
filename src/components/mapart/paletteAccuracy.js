/* ==========================================================================
   paletteAccuracy.js — точность квантования (этап 4, пункт 4.4)

   Воркер считает, сколько пикселей картинки попали в палитру точно, без
   приближения. Остальные пиксели дизеринг размазывает между двумя тонами —
   это нормально, но по этой цифре видно, насколько сильно картинка
   «перекрашивается».

   Индикатор живёт под превью карты: он описывает именно превью, а внизу
   панели студии его перекрывала липкая полоса экспорта. Подробности — в
   подсказке, чтобы строка оставалась короткой.
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

export default function PaletteAccuracy({ accuracy, getLocaleString }) {
  const percent = accuracyPercent(accuracy);
  if (percent === null) return null;
  const label = getLocaleString("STUDIO/ACCURACY") || "Palette accuracy";
  const detail = accuracyDetail(
    accuracy,
    getLocaleString("STUDIO/ACCURACY-HINT") || "{exact} of {total} pixels hit the palette exactly"
  );
  return (
    <Tooltip tooltipText={detail}>
      <small className="mapAccuracyHint">
        {label}: {percent}%
      </small>
    </Tooltip>
  );
}
