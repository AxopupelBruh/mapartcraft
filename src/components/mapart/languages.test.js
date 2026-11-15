import fs from "fs";
import path from "path";

/* ==========================================================================
   Тесты переключателя языка.
   ========================================================================== */

const readFile = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf-8");

test("переключатель языка предлагает только русский и английский", () => {
  const languages = readFile("../languages.js");
  expect(languages).toContain("LANGUAGES");
  expect(languages).toContain('"ru"');
  expect(languages).toContain('"en"');
  /* Остальные языки в выборе не показываются. */
  for (const language of ["de", "es", "fr", "it", "ja", "pl", "tr", "ua", "zh-Hans"]) {
    expect(languages).not.toContain(`"${language}"`);
  }
  /* Флагов в шапке больше нет. */
  expect(languages).not.toContain("<img");
});
