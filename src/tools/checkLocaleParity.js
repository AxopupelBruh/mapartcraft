/*
 * Проверка паритета ключей локализации (этап 4, пункт 4.5).
 *
 * Ключи из en/strings.json — эталон. У каждого другого языка должен быть
 * тот же набор ключей: иначе часть интерфейса молча показывается
 * по-английски (или вообще пустой строкой) без всякого предупреждения.
 *
 * Запуск:
 *   node src/tools/checkLocaleParity.js          — отчёт, код возврата 0
 *   node src/tools/checkLocaleParity.js --strict — код возврата 1, если
 *                                                 есть несовпадения
 */
const fs = require("fs");
const path = require("path");

const localeDir = path.join(__dirname, "..", "locale");
const referenceLanguage = "en";

/* Все ключи эталона в виде плоского списка "SECTION/KEY". */
function flattenKeys(object, prefix = "") {
  const keys = [];
  for (const [key, value] of Object.entries(object || {})) {
    const fullKey = prefix ? `${prefix}/${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function loadStrings(language) {
  const file = path.join(localeDir, language, "strings.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function valueAtKey(object, fullKey) {
  const parts = fullKey.split("/");
  let current = object;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

const reference = loadStrings(referenceLanguage);
const referenceKeys = flattenKeys(reference);
const referenceSet = new Set(referenceKeys);

const languages = fs
  .readdirSync(localeDir)
  .filter((entry) => fs.existsSync(path.join(localeDir, entry, "strings.json")))
  .filter((entry) => entry !== referenceLanguage && entry !== "locale.js")
  .sort();

let totalMissing = 0;
const report = [];

for (const language of languages) {
  const strings = loadStrings(language);
  const keys = new Set(flattenKeys(strings));
  const missing = referenceKeys.filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !referenceSet.has(key));
  /* Пустое значение — это не перевод, а отсутствие перевода. */
  const empty = referenceKeys.filter((key) => {
    if (!keys.has(key)) return false;
    const value = valueAtKey(strings, key);
    return value === null || value === undefined || value === "";
  });
  totalMissing += missing.length + empty.length;
  report.push({ language, missing, empty, extra });
}

console.log(`Reference: ${referenceLanguage} (${referenceKeys.length} keys)`);
for (const entry of report) {
  console.log(
    `${entry.language.padEnd(8)} missing: ${String(entry.missing.length).padStart(3)}  empty: ${String(entry.empty.length).padStart(3)}  extra: ${String(
      entry.extra.length
    ).padStart(3)}`
  );
}

if (process.argv.includes("--verbose")) {
  for (const entry of report) {
    if (entry.missing.length === 0 && entry.empty.length === 0) continue;
    console.log(`\n--- ${entry.language} ---`);
    for (const key of entry.missing) console.log(`  missing: ${key}`);
    for (const key of entry.empty) console.log(`  empty:   ${key}`);
    for (const key of entry.extra) console.log(`  extra:   ${key}`);
  }
}

console.log(`\nTotal missing or empty keys across ${languages.length} languages: ${totalMissing}`);

if (process.argv.includes("--strict") && totalMissing > 0) {
  process.exitCode = 1;
}
