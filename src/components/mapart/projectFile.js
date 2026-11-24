/* ==========================================================================
   projectFile.js — проект студии в одном файле (этап 4, пункт 4.1)
   ==========================================================================
   Что это такое:

   До этапа 4 работа жила только в IndexedDB одного браузера. Почистил кэш,
   сменил браузер — и работа потеряна: ни картинки, ни настроек, ни правок
   пикселей.

   Теперь проект можно выгрузить в один файл `.mapartstudio.json` и открыть
   обратно на другой машине. Внутри файла:

     format        "mapartstudio" — по нему файл опознаётся
     version       версия формата, чтобы старый файл можно было отличить
     appVersion    версия приложения, записавшая файл (для справки)
     savedAt       время сохранения
     image         картинка-исходник: имя, mime-тип и данные в base64
     settings      все настройки (те же ключи, что и в снимке сессии)
     customBlocks  пользовательские блоки
     pixelEdits    правки пикселей: индекс пикселя -> "mask" | "protect" | "#rrggbb"

   Файл — обычный JSON в текстовом виде: его можно открыть в редакторе,
   посмотреть, что внутри, и даже подправить руками.
   ========================================================================== */

export const PROJECT_FORMAT = "mapartstudio";
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = ".mapartstudio.json";

/* Ошибка проекта с ключом локали: текст переводится в контроллере,
   поэтому пользователю не показывается английский текст.
   Английский текст остаётся в message — он нужен как запасной вариант
   (и для тестов, которые проверяют понятность ошибки). */
export function projectError(localeKey, englishText, params = {}) {
  const error = new Error(englishText);
  error.localeKey = localeKey;
  error.params = params;
  return error;
}

/* Имя файла проекта по имени картинки. */
export function projectFileName(baseFilename, fallback = "project") {
  const cleaned = String(baseFilename || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "");
  return `${cleaned || fallback}${PROJECT_EXTENSION}`;
}

/* Blob -> строка с данными в base64 ("data:image/png;base64,...."). */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    if (!blob) {
      reject(projectError("PROJECT/ERR/NO-IMAGE-TO-SAVE", "There is no image to save"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || projectError("PROJECT/ERR/CANNOT-READ-IMAGE", "Could not read the image"));
    reader.readAsDataURL(blob);
  });
}

/* Строка с данными в base64 -> Blob. */
export function dataUrlToBlob(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw projectError("PROJECT/ERR/NO-IMAGE", "The project file has no image");
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) throw projectError("PROJECT/ERR/IMAGE-DAMAGED", "The image in the project file is damaged");
  const header = dataUrl.slice(0, commaIndex);
  const mimeMatch = /data:([^;,]+)/.exec(header);
  const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const payload = dataUrl.slice(commaIndex + 1);
  let binary;
  if (header.includes(";base64")) {
    binary = atob(payload);
  } else {
    binary = decodeURIComponent(payload);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

/* Правки пикселей — простой словарь, но в файле он может быть чем угодно.
   Оставляем только то, что воркер понимает. */
function sanitisePixelEdits(pixelEdits) {
  const result = {};
  if (!pixelEdits || typeof pixelEdits !== "object") return result;
  for (const [index, value] of Object.entries(pixelEdits)) {
    if (!/^\d+$/.test(index)) continue;
    if (typeof value !== "string") continue;
    if (value === "mask" || value === "protect" || /^#[0-9a-fA-F]{6}$/.test(value)) {
      result[index] = value;
    }
  }
  return result;
}

/**
 * Собирает файл проекта.
 *
 * @param {object} project
 * @param {Blob}   project.imageBlob        картинка-исходник
 * @param {string} project.imageBaseFilename имя картинки без расширения
 * @param {object} project.settings         снимок настроек
 * @param {Array}  project.customBlocks     пользовательские блоки
 * @param {object} project.pixelEdits       правки пикселей
 * @returns {Promise<Blob>} файл `.mapartstudio.json`
 */
export async function buildProjectFile({ imageBlob, imageBaseFilename, settings, customBlocks, pixelEdits }) {
  const imageDataUrl = await blobToDataUrl(imageBlob);
  const project = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    image: {
      name: imageBaseFilename || "MyArt",
      dataUrl: imageDataUrl,
    },
    settings: settings && typeof settings === "object" ? settings : {},
    customBlocks: Array.isArray(customBlocks) ? customBlocks : [],
    pixelEdits: sanitisePixelEdits(pixelEdits),
  };
  return new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
}

/**
 * Разбирает файл проекта.
 *
 * Бросает Error с понятным сообщением, если файл не наш или повреждён:
 * пустой файл, чужой формат, слишком новая версия, нет картинки.
 *
 * @returns {{imageBlob: Blob, imageBaseFilename: string, settings: object, customBlocks: Array, pixelEdits: object}}
 */
export function parseProjectFile(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw projectError("PROJECT/ERR/NOT-JSON", "The project file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw projectError("PROJECT/ERR/EMPTY", "The project file is empty");
  }
  if (parsed.format !== PROJECT_FORMAT) {
    throw projectError("PROJECT/ERR/WRONG-FILE", "This is not a MapArtCraft project file");
  }
  const version = Number(parsed.version);
  if (!Number.isInteger(version) || version < 1) {
    throw projectError("PROJECT/ERR/NO-VERSION", "The project file has no version");
  }
  if (version > PROJECT_VERSION) {
    throw projectError("PROJECT/ERR/NEWER-VERSION", `The project file was made by a newer version of the app (format ${version})`, { version });
  }
  if (!parsed.image || typeof parsed.image !== "object" || !parsed.image.dataUrl) {
    throw projectError("PROJECT/ERR/NO-IMAGE", "The project file has no image");
  }
  const imageBlob = dataUrlToBlob(parsed.image.dataUrl);
  return {
    imageBlob,
    imageBaseFilename: typeof parsed.image.name === "string" && parsed.image.name ? parsed.image.name : "MyArt",
    settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {},
    customBlocks: Array.isArray(parsed.customBlocks) ? parsed.customBlocks : [],
    pixelEdits: sanitisePixelEdits(parsed.pixelEdits),
  };
}

/* Читает файл проекта из File. */
export function readProjectFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(projectError("PROJECT/ERR/NO-FILE", "There is no file to open"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(parseProjectFile(String(reader.result || "")));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(reader.error || projectError("PROJECT/ERR/CANNOT-READ-FILE", "Could not read the file"));
    reader.readAsText(file);
  });
}
