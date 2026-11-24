/*
 * Local-first persistence for MapartCraft Local Studio.
 * Settings live in localStorage; the current editing session lives in
 * IndexedDB. Exports are ordinary ZIP downloads. Nothing is uploaded anywhere.
 */

const SETTINGS_KEY = "mapartcraft_studio_settings_v1";
const DB_NAME = "mapartcraft-studio";
const DB_VERSION = 3;
const SESSION_STORE = "session";

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("Could not load MapartCraft settings", error);
    return null;
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Could not save MapartCraft settings", error);
  }
}

export function openStudioDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Folder exports were removed. Clean up the old handle store without
      // touching the single recovery session.
      if (db.objectStoreNames.contains("handles")) {
        db.deleteObjectStore("handles");
      }
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open IndexedDB"));
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

/* Ошибка IndexedDB без читаемого сообщения (transaction.error бывает null)
   бесполезна пользователю: он видит «ошибка сохранения» и ничего больше.
   Поэтому текст собирается вручную из name и message. */
function describeStorageError(error, fallbackText) {
  if (!error) return fallbackText;
  const name = error.name || "Error";
  const message = error.message || "";
  if (!message) return `${name}: ${fallbackText}`;
  return `${name}: ${message}`;
}

export async function saveSession(session) {
  /* Картинку в базу кладём байтами, а не как Blob.

     Firefox не даёт записать в IndexedDB Blob, который сам же только что
     оттуда прочитали: вторая запись падает с UnknownError, и сохранение
     сессии перестаёт работать после восстановления (любая смена
     настройки). Сырые байты такой проблемы не имеют, а Blob из них
     собирается на лету при чтении. */
  const record = { ...session };
  if (record.imageBlob instanceof Blob) {
    record.imageType = record.imageBlob.type || "image/png";
    record.imageBuffer = await record.imageBlob.arrayBuffer();
    delete record.imageBlob;
  }

  const db = await openStudioDB();
  try {
    const tx = db.transaction(SESSION_STORE, "readwrite");
    /* Ошибку записи ловим по запросу, а не по транзакции: у транзакции
       error бывает null, и причина теряется. */
    const request = tx.objectStore(SESSION_STORE).put({ ...record, id: "current", savedAt: Date.now() });
    await requestToPromise(request);
    await transactionDone(tx);
  } catch (error) {
    throw new Error(describeStorageError(error, "Could not write the session to the browser database"));
  } finally {
    db.close();
  }
}

export async function loadSession() {
  const db = await openStudioDB();
  const tx = db.transaction(SESSION_STORE, "readonly");
  const result = await requestToPromise(tx.objectStore(SESSION_STORE).get("current"));
  db.close();
  if (!result) return null;

  /* Собираем Blob из байтов (см. saveSession). Старые сессии, где картинка
     лежала как Blob, читаем как есть. */
  if (result.imageBuffer && !result.imageBlob) {
    result.imageBlob = new Blob([result.imageBuffer], { type: result.imageType || "image/png" });
  }
  return result;
}

export async function clearSession() {
  const db = await openStudioDB();
  const tx = db.transaction(SESSION_STORE, "readwrite");
  tx.objectStore(SESSION_STORE).delete("current");
  await transactionDone(tx);
  db.close();
}

export function sanitizeFilename(name, fallback = "MyArt") {
  const cleaned = String(name || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/g, "");
  return cleaned || fallback;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToBlob(canvas, type = "image/png", quality = 1) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create image"));
    }, type, quality);
  });
}

export function pixelsToCanvas(pixelsData, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const pixels = pixelsData instanceof Uint8ClampedArray ? pixelsData : new Uint8ClampedArray(pixelsData);
  const imageData = new ImageData(pixels, width, height);
  context.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Download one shared ZIP containing the .litematic files and PNG preview.
 * The files are placed at the ZIP root, so extracting it leaves them directly
 * in the Downloads folder without an extra art folder.
 */
export async function exportArtZip({ artName, litematicFiles, pngBlob, pngName }) {
  const baseName = sanitizeFilename(artName);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const file of litematicFiles) {
    zip.file(file.name, file.bytes);
  }
  if (pngBlob) {
    zip.file(pngName || `${baseName}.png`, pngBlob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const filename = `${baseName}.zip`;
  downloadBlob(blob, filename);
  return { filename };
}
