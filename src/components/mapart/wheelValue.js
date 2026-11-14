/* Колесо мыши меняет значение поля.

   Слушатель ставится вручную через attachWheel, а не через React: React
   подписывается на wheel как на passive-событие, и preventDefault внутри
   обработчика не сработал бы — страница прокручивалась бы вместо
   изменения значения. */

/* Новое значение под колесо: вверх — прибавить шаг, вниз — отнять.
   Возвращает null, если менять нечего (значение уже на краю). */
export const wheelValue = (event, current, min, max, step) => {
  const increment = step || 1;
  const parsed = parseInt(current, 10);
  const base = isNaN(parsed) ? (min !== undefined ? min : 0) : parsed;
  let next = base + (event.deltaY < 0 ? increment : -increment);
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  if (next === base) return null;
  return next;
};

/* Вешает обработчик колеса на элемент. Возвращает функцию снятия. */
export const attachWheel = (node, handler) => {
  if (!node) return () => {};
  const onWheel = (event) => {
    event.preventDefault();
    handler(event);
  };
  node.addEventListener("wheel", onWheel, { passive: false });
  return () => node.removeEventListener("wheel", onWheel);
};
