/*
 * Добавляет ключи локализации этапа 4 в файлы переводов.
 * Запуск: node src/tools/addStage4Locales.js
 */
const fs = require("fs");
const path = require("path");

const localeDir = path.join(__dirname, "..", "locale");

const additions = {
  en: {
    "MAP-PREVIEW": {
      COMPARE: "Before/after",
      "COMPARE-TT": "Hold to see the picture before the cleanup filters",
    },
    STUDIO: {
      ACCURACY: "Palette accuracy",
      "ACCURACY-HINT": "{exact} of {total} pixels hit the palette exactly",
      "ACCURACY-EMPTY": "No render yet",
    },
    PROJECT: {
      SAVE: "Save project",
      OPEN: "Open project",
      SAVED: "Project saved",
      OPENED: "Project opened",
      "ERROR-NO-IMAGE": "Load an image first — a project needs the source picture.",
      "ERROR-SAVE": "Could not save the project:",
      "ERROR-OPEN": "Could not open the project:",
    },
    "EXPORT-CHECK": {
      TITLE: "Check before export",
      "NO-IMAGE": "No image loaded.",
      "EMPTY-PALETTE": "The palette is empty — pick at least one block.",
      "BLOCKS-UNAVAILABLE": "{count} selected blocks are not available in version {version}.",
      "PREVIEW-NOT-READY": "The preview is not ready yet — wait for it before exporting.",
      "MAP-SIZE-SPLIT": "Map {sizeX}×{sizeY} = {files} files, {blocks} blocks.",
      "MAP-SIZE-ONE": "Map {sizeX}×{sizeY} = 1 file, {blocks} blocks.",
    },
  },
  ru: {
    "MAP-PREVIEW": {
      COMPARE: "Было/стало",
      "COMPARE-TT": "Удерживайте, чтобы увидеть картинку до фильтров очистки",
    },
    STUDIO: {
      ACCURACY: "Точность палитры",
      "ACCURACY-HINT": "{exact} из {total} пикселей попали в палитру точно",
      "ACCURACY-EMPTY": "Рендера ещё не было",
    },
    PROJECT: {
      SAVE: "Сохранить проект",
      OPEN: "Открыть проект",
      SAVED: "Проект сохранён",
      OPENED: "Проект открыт",
      "ERROR-NO-IMAGE": "Сначала загрузите картинку — проекту нужна исходная картинка.",
      "ERROR-SAVE": "Не удалось сохранить проект:",
      "ERROR-OPEN": "Не удалось открыть проект:",
    },
    "EXPORT-CHECK": {
      TITLE: "Проверка перед экспортом",
      "NO-IMAGE": "Картинка не загружена.",
      "EMPTY-PALETTE": "Палитра пустая — выберите хотя бы один блок.",
      "BLOCKS-UNAVAILABLE": "{count} выбранных блоков недоступны в версии {version}.",
      "PREVIEW-NOT-READY": "Превью ещё не готово — дождитесь его перед экспортом.",
      "MAP-SIZE-SPLIT": "Карта {sizeX}×{sizeY} = {files} файлов, {blocks} блоков.",
      "MAP-SIZE-ONE": "Карта {sizeX}×{sizeY} = 1 файл, {blocks} блоков.",
    },
  },
};

for (const [language, sections] of Object.entries(additions)) {
  const file = path.join(localeDir, language, "strings.json");
  const strings = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [section, values] of Object.entries(sections)) {
    if (!strings[section]) strings[section] = {};
    for (const [key, value] of Object.entries(values)) {
      strings[section][key] = value;
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(strings, null, 2)}\n`);
  console.log(`${language}: updated`);
}
