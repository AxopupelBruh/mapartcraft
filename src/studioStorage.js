/*
 * Local-first persistence for MapartCraft Local Studio.
 * Settings live in localStorage; the export folder handle lives in IndexedDB.
 * Nothing is uploaded anywhere.
 */

const SETTINGS_KEY = "mapartcraft_studio_settings_v1";
const DB_NAME = "mapartcraft-studio";
const DB_VERSION = 2;
const HANDLES_STORE = "handles";
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
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        db.createObjectStore(HANDLES_STORE, { keyPath: "key" });
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

export async function saveFolderHandle(handle) {
  const db = await openStudioDB();
  const tx = db.transaction(HANDLES_STORE, "readwrite");
  tx.objectStore(HANDLES_STORE).put({ key: "exportFolder", handle });
  await transactionDone(tx);
  db.close();
}

export async function getFolderHandle() {
  const db = await openStudioDB();
  const tx = db.transaction(HANDLES_STORE, "readonly");
  const record = await requestToPromise(tx.objectStore(HANDLES_STORE).get("exportFolder"));
  db.close();
  return record ? record.handle : null;
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

export async function verifyFolderPermission(handle, readWrite = true) {
  if (!handle?.queryPermission) return false;
  const options = { mode: readWrite ? "readwrite" : "read" };
  if ((await handle.queryPermission(options)) === "granted") return true;
  if ((await handle.requestPermission(options)) === "granted") return true;
  return false;
}

export async function getOrPickExportFolder() {
  if (typeof window.showDirectoryPicker !== "function") return null;

  // A stored handle can become stale (folder moved/deleted) or lose its
  // permission. Neither case should prevent exporting: ignore the handle and
  // ask the user for a folder again.
  try {
    const existing = await getFolderHandle();
    if (existing && (await verifyFolderPermission(existing, true))) return existing;
  } catch (error) {
    console.warn("Could not restore the export folder handle", error);
  }

  // Cancelling the picker is not the same as the API being unavailable.
  // Let the export UI report that nothing was written instead of silently
  // downloading a ZIP the user did not ask for.
  const picked = await window.showDirectoryPicker({ mode: "readwrite" });

  // Saving the handle is a convenience for the next export. Some browsers
  // cannot structured-clone it (or block IndexedDB in private mode), so a
  // failure here must not discard the folder the user just chose.
  try {
    await saveFolderHandle(picked);
  } catch (error) {
    console.warn("Could not remember the export folder handle", error);
  }
  return picked;
}

export async function uniqueDirectoryName(rootHandle, requestedName) {
  const base = sanitizeFilename(requestedName);
  for (let i = 1; i <= 999; i++) {
    const candidate = i === 1 ? base : `${base} (${i})`;
    try {
      await rootHandle.getDirectoryHandle(candidate, { create: false });
    } catch (error) {
      return candidate;
    }
  }
  return `${base} (${Date.now()})`;
}

async function writeBytesToDirectory(directory, filename, bytes) {
  const fileHandle = await directory.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(bytes);
  await writable.close();
}

/**
 * Write one art folder:
 *   Arts&litematic/Name/Name.litematic
 *   Arts&litematic/Name/Name.png
 * If the directory picker is unavailable, download a ZIP with the same layout.
 */
export async function exportArtFolder({ artName, litematicFiles, pngBlob, pngName }) {
  const rootHandle = await getOrPickExportFolder();
  const folderName = await (async () => {
    if (rootHandle) return uniqueDirectoryName(rootHandle, artName);
    return sanitizeFilename(artName);
  })();

  if (rootHandle) {
    try {
      const directory = await rootHandle.getDirectoryHandle(folderName, { create: true });
      for (const file of litematicFiles) {
        await writeBytesToDirectory(directory, file.name, file.bytes);
      }
      if (pngBlob) {
        await writeBytesToDirectory(directory, pngName || `${folderName}.png`, pngBlob);
      }
      return { mode: "folder", folderName };
    } catch (error) {
      // Permission can be revoked between picking and writing, or a handle
      // restored from IndexedDB can point at a folder that no longer exists.
      // Keep the export usable by falling through to the ZIP fallback.
      console.warn("Could not write the export folder; using ZIP instead", error);
    }
  }

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const folder = zip.folder(folderName);
  for (const file of litematicFiles) {
    folder.file(file.name, file.bytes);
  }
  if (pngBlob) {
    folder.file(pngName || `${folderName}.png`, pngBlob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  downloadBlob(blob, `${folderName}.zip`);
  return { mode: "zip", folderName };
}
