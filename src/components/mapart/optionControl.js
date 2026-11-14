/* Идентификатор контрола для опции настройки.

   Живёт в отдельном модуле, потому что нужен и рендереру поля
   (optionField.js), и кастомным полям (optionCustomFields.js): если
  optionField тянет optionCustomFields (для кастомных контролов), а тот
   тянет optionField обратно, получается циклический импорт и падение
   при инициализации модулей. */
export const optionControlId = (option, suffix) => `opt-${option.key}${suffix ? `-${suffix}` : ""}`;
