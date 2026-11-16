/* ==========================================================================
   compareView.js — сравнение «было/стало» (этап 4, пункт 4.2)
   ==========================================================================
   Фильтры очистки (шумоподавление, края, островки) применяются мгновенно,
   и сравнивать не с чем: результат сразу становится новой картинкой.

   Здесь две картинки:
     «до» — то, что было до очистки: та же картинка после масштабирования
            и предобработки, но до фильтров. Она уже лежит в скрытом
            холсте источника, поэтому показывается мгновенно — второй
            рендер не нужен;
     «после» — пиксели последнего рендера.

   Функции вынесены отдельно от компонента, чтобы их можно было
   проверить без браузера.
   ========================================================================== */

/**
 * Показывает картинку до очистки.
 *
 * @param {CanvasRenderingContext2D} context контекст видимого холста
 * @param {HTMLCanvasElement} source        холст-источник (до очистки)
 * @param {number} width  ширина видимого холста
 * @param {number} height высота видимого холста
 * @returns {boolean} получилось ли нарисовать
 */
export function drawCompareBefore(context, source, width, height) {
  if (!context || !source) return false;
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return true;
}

/**
 * Возвращает картинку после очистки.
 *
 * @param {CanvasRenderingContext2D} context контекст видимого холста
 * @param {ImageData} imageData пиксели последнего рендера
 * @returns {boolean} получилось ли нарисовать
 */
export function drawCompareAfter(context, imageData) {
  if (!context || !imageData) return false;
  context.putImageData(imageData, 0, 0);
  return true;
}
