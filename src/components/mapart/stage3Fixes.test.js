import fs from "fs";
import path from "path";

/* ==========================================================================
   Тесты правок, найденных при проверке этапа 3 (15.11.2026).
   ========================================================================== */

const readFile = (relativePath) => fs.readFileSync(path.join(__dirname, relativePath), "utf-8");

test("плейсхолдер не анализируется: автопалитра не строит палитру по иконке", () => {
  const controller = readFile("mapartController.js");
  /* Плейсхолдер — это картинка «загрузите файл». Анализ её приводил к
     тому, что автопалитра предлагала блоки под иконкой загрузки, а в
     списке палитры помечались цвета, которых в работе нет. */
  expect(controller).toContain("uploadedImage_isPlaceholder");
  const analysis = controller.slice(controller.indexOf("updateImageAnalysis = "), controller.indexOf("updateImageAnalysis = ") + 900);
  expect(analysis).toContain("uploadedImage_isPlaceholder");
  /* Плейсхолдер должен проверяться до анализа. */
  expect(analysis.indexOf("uploadedImage_isPlaceholder")).toBeLessThan(analysis.indexOf("findDominantColours("));
});

test("число ищемых цветов совпадает с тем, что можно попросить в модалке", () => {
  const controller = readFile("mapartController.js");
  const selection = readFile("blockSelection.js");
  const clusters = Number(controller.match(/IMAGE_ANALYSIS_CLUSTERS = (\d+);/)[1]);
  /* Поле «Цветов» в модалке палитры: сколько максимум можно попросить. */
  const max = Number(selection.match(/paletteModalAutoCount[\s\S]{0,600}?max="(\d+)"/)[1]);
  expect(clusters).toBeGreaterThanOrEqual(max);
});
