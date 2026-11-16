/* ==========================================================================
   exportCheck.js — что проверить перед экспортом (этап 4, пункт 4.3)
   ==========================================================================
   Экспорт в Minecraft — это долгая операция, и часть ошибок видно только
   в самом конце: карта из 20 тысяч блоков превращается в файл, который
   потом не открывается. Проверка до экспорта отвечает на вопросы, на
   которые иначе приходится отвечать постфактум:

     - есть ли вообще картинка;
     - выбрана ли палитра (без блоков экспортировать нечего);
     - готов ли предпросмотр (иначе в файл попадут старые пиксели);
     - доступны ли выбранные блоки в выбранной версии игры;
     - сколько файлов и блоков получится.

   Результат — список пунктов. Каждый пункт имеет уровень:

     error    экспорт в таком состоянии бессмыслен;
     warning  экспорт получится, но результат может не понравиться;
     info     просто цифры для спокойствия.

   Тексты не зашиты в модуль: у пунктов есть ключи локализации, а
   подставляются числа через params.
   ========================================================================== */

export const CHECK_LEVEL_ERROR = "error";
export const CHECK_LEVEL_WARNING = "warning";
export const CHECK_LEVEL_INFO = "info";

/* Сколько блоков в одной части карты: карта режется на куски 128x128. */
export const MAP_CHUNK_SIZE = 128;

/**
 * @param {object} state
 * @param {boolean} state.hasImage        загружена ли картинка (не плейсхолдер)
 * @param {object} state.selectedBlocks   выбранные блоки: colourSetId -> blockId
 * @param {object} state.coloursJSON      палитра с блоками
 * @param {object} state.optionValue_version  выбранная версия игры
 * @param {number} state.optionValue_mapSize_x
 * @param {number} state.optionValue_mapSize_y
 * @param {boolean} state.previewReady   готов ли предпросмотр
 * @returns {Array<{id: string, level: string, messageKey: string, params: object}>}
 */
export function checkExport({
  hasImage = false,
  selectedBlocks = {},
  coloursJSON = {},
  optionValue_version = null,
  optionValue_mapSize_x = 1,
  optionValue_mapSize_y = 1,
  previewReady = false,
} = {}) {
  const checks = [];

  if (!hasImage) {
    checks.push({
      id: "no-image",
      level: CHECK_LEVEL_ERROR,
      messageKey: "EXPORT-CHECK/NO-IMAGE",
      params: {},
    });
  }

  const selectedEntries = Object.entries(selectedBlocks || {}).filter(([, blockId]) => blockId !== "-1" && blockId !== undefined);
  if (selectedEntries.length === 0) {
    checks.push({
      id: "empty-palette",
      level: CHECK_LEVEL_ERROR,
      messageKey: "EXPORT-CHECK/EMPTY-PALETTE",
      params: {},
    });
  } else {
    /* Блок, которого нет в выбранной версии игры, в схему не попадёт —
       пользователь получит карту с дырками вместо этих блоков. */
    const version = optionValue_version && optionValue_version.MCVersion ? optionValue_version.MCVersion : null;
    const unavailable = [];
    for (const [colourSetId, blockId] of selectedEntries) {
      const colourSet = coloursJSON[colourSetId];
      const block = colourSet && colourSet.blocks ? colourSet.blocks[blockId] : null;
      if (!block) {
        unavailable.push(colourSetId);
        continue;
      }
      if (version && block.validVersions && !Object.keys(block.validVersions).includes(version)) {
        unavailable.push(colourSetId);
      }
    }
    if (unavailable.length > 0) {
      checks.push({
        id: "blocks-unavailable",
        level: CHECK_LEVEL_WARNING,
        messageKey: "EXPORT-CHECK/BLOCKS-UNAVAILABLE",
        params: { count: unavailable.length, version: version || "" },
      });
    }
  }

  if (hasImage && !previewReady) {
    checks.push({
      id: "preview-not-ready",
      level: CHECK_LEVEL_WARNING,
      messageKey: "EXPORT-CHECK/PREVIEW-NOT-READY",
      params: {},
    });
  }

  const sizeX = Math.max(1, Number(optionValue_mapSize_x) || 1);
  const sizeY = Math.max(1, Number(optionValue_mapSize_y) || 1);
  const fileCount = sizeX * sizeY;
  const blockCount = MAP_CHUNK_SIZE * sizeX * MAP_CHUNK_SIZE * sizeY;
  checks.push({
    id: "map-size",
    level: fileCount > 1 ? CHECK_LEVEL_INFO : CHECK_LEVEL_INFO,
    messageKey: fileCount > 1 ? "EXPORT-CHECK/MAP-SIZE-SPLIT" : "EXPORT-CHECK/MAP-SIZE-ONE",
    params: {
      files: fileCount,
      blocks: blockCount,
      millions: Math.round((blockCount / 1000000) * 10) / 10,
      sizeX: sizeX,
      sizeY: sizeY,
    },
  });

  return checks;
}

/* Есть ли среди пунктов такие, из-за которых экспорт лучше не начинать. */
export function hasBlockingCheck(checks) {
  return (checks || []).some((check) => check.level === CHECK_LEVEL_ERROR);
}

/* Только предупреждения и цифры — для панели «проверка перед экспортом». */
export function summariseChecks(checks) {
  const list = checks || [];
  return {
    errors: list.filter((check) => check.level === CHECK_LEVEL_ERROR).length,
    warnings: list.filter((check) => check.level === CHECK_LEVEL_WARNING).length,
    infos: list.filter((check) => check.level === CHECK_LEVEL_INFO).length,
    blocking: hasBlockingCheck(list),
  };
}
