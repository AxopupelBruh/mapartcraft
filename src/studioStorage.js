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
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

export async function saveSession(session) {
  const db = await openStudioDB();
  const tx = db.transaction(SESSION_STORE, "readwrite");
  tx.objectStore(SESSION_STORE).put({ ...session, id: "current", savedAt: Date.now() });
  await transactionDone(tx);
  db.close();
}

export async function loadSession() {
  const db = await openStudioDB();
  const tx = db.transaction(SESSION_STORE, "readonly");
  const result = await requestToPromise(tx.objectStore(SESSION_STORE).get("current"));
  db.close();
  return result || null;
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
  const imageData = new ImageData(new Uint8ClampedArray(pixelsData), width, height);
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
