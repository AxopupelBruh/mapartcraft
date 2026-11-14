import React from "react";
import { render, fireEvent } from "@testing-library/react";

import BlockSelection from "./blockSelection";
import StudioPanel from "./studioPanel";
import coloursJSON from "./json/coloursJSON.json";
import enStrings from "../../locale/en/strings.json";
import SupportedVersions from "./json/supportedVersions.json";
import MapModes from "./json/mapModes.json";

/* Превью стилей рисует воркер, а в jsdom воркеров нет — рендерер
   превью подменяется заглушкой, которая только запоминает вызовы. */
const previewCalls = { contexts: [], canvases: [] };

jest.mock("./stylePreview", () => ({
  __esModule: true,
  default: class StylePreviewRendererStub {
    setContext(context, styles) {
      previewCalls.contexts.push({ context, styles });
    }
    setCanvas(styleId, canvas) {
      previewCalls.canvases.push({ styleId, canvas });
    }
    dispose() {}
  },
  PREVIEW_SIZE: 128,
  THUMB_SIZE: 32,
  sampleImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
}));

/* ==========================================================================
   Тесты интерфейса этапа 3: галерея пресетов с превью, автопалитра,
   сортировка и диаграмма палитры.
   ========================================================================== */

const lookup = (strings, key) => key.split("/").reduce((folder, part) => (folder ? folder[part] : undefined), strings);
const getLocaleString = (key) => lookup(enStrings, key) || key;

const mcVersion = Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1].MCVersion;

const disabledTonesForAll = () =>
  Object.fromEntries(Object.keys(coloursJSON).map((colourSetId) => [colourSetId, new Set()]));

const baseBlockSelectionProps = (overrides) => ({
  getLocaleString,
  coloursJSON,
  disabledTones: disabledTonesForAll(),
  onChangeColourSetBlock: jest.fn(),
  onToggleColourTone: jest.fn(),
  optionValue_version: { MCVersion: mcVersion },
  optionValue_modeNBTOrMapdat: MapModes.SCHEMATIC_NBT.uniqueId,
  optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
  selectedBlocks: {},
  presets: [],
  selectedPresetName: "None",
  canDeletePreset: () => false,
  onPresetChange: jest.fn(),
  onDeletePreset: jest.fn(),
  onSavePreset: jest.fn(),
  onSharePreset: jest.fn(),
  onGetPDNPaletteClicked: jest.fn(),
  onExportPresets: jest.fn(),
  onImportPresets: jest.fn(),
  handleAddCustomBlock: jest.fn(),
  handleDeleteCustomBlock: jest.fn(),
  imageColourSetIds: new Set(),
  imageColours: [],
  autoPaletteResult: null,
  onAutoPalette: jest.fn(),
  ...overrides,
});

/* ------------------------------------------ 3.2 галерея пресетов */

test("3.2 у каждого пресета стиля есть миниатюра", () => {
  previewCalls.canvases.length = 0;
  const { container } = render(
    <StudioPanel
      getLocaleString={getLocaleString}
      stylePreset="clean"
      optionValue_style="clean"
      activeStyleId="clean"
      styleModified={false}
      onApplyStyle={jest.fn()}
      optionValue_resizeMethod="pixel"
      onOptionChange_resizeMethod={jest.fn()}
      optionValue_autoDetectPixelScale={true}
      onOptionChange_autoDetectPixelScale={jest.fn()}
      optionValue_showPixelGrid={false}
      onOptionChange_showPixelGrid={jest.fn()}
      optionValue_dithering={1}
      optionValue_dithering_strength={100}
      optionValue_dithering_propagation_red={100}
      optionValue_dithering_propagation_green={100}
      optionValue_dithering_propagation_blue={100}
      onOptionChange_dithering_strength={jest.fn()}
      detectedPixelScale={1}
      sessionStatus=""
      onResetSession={jest.fn()}
      sessionResetAvailable={false}
      coloursJSON={coloursJSON}
      selectedBlocks={{}}
      disabledTones={{}}
      uploadedImage={null}
    />
  );
  const thumbs = container.querySelectorAll("canvas.studioStyleThumb");
  expect(thumbs.length).toBeGreaterThan(0);
  /* Холсты должны быть отданы рендереру превью — иначе миниатюры останутся
     пустыми. */
  const registered = previewCalls.canvases.filter((call) => call.canvas);
  expect(registered.length).toBe(thumbs.length);
});

/* ------------------------------------------ 3.6 / 3.7 модалка палитры */

const openPalette = () => {
  const button = document.querySelector(".blockSelectionOpenButton");
  fireEvent.click(button);
};

test("3.6 в модалке палитры есть автопалитра и поле числа цветов", () => {
  render(<BlockSelection {...baseBlockSelectionProps()} />);
  openPalette();
  expect(document.querySelector(".paletteModalAutoButton")).toBeTruthy();
  expect(document.querySelector(".paletteModalAutoCount input")).toBeTruthy();
});

test("3.6 без картинки автопалитра недоступна", () => {
  render(<BlockSelection {...baseBlockSelectionProps()} />);
  openPalette();
  expect(document.querySelector(".paletteModalAutoButton").disabled).toBe(true);
});

test("3.6 автопалитра подбирает блоки под заданное число цветов", () => {
  const onAutoPalette = jest.fn();
  const props = baseBlockSelectionProps({
    onAutoPalette,
    imageColours: [{ rgb: [200, 30, 30], share: 0.5 }],
  });
  render(<BlockSelection {...props} />);
  openPalette();
  const button = document.querySelector(".paletteModalAutoButton");
  expect(button.disabled).toBe(false);
  fireEvent.click(button);
  expect(onAutoPalette).toHaveBeenCalledWith(8);
});

test("3.7 в модалке есть сортировка и диаграмма палитры", () => {
  render(<BlockSelection {...baseBlockSelectionProps()} />);
  openPalette();
  expect(document.querySelector(".paletteModalSort select")).toBeTruthy();
  const points = document.querySelectorAll(".paletteDiagramPoint");
  expect(points.length).toBeGreaterThan(10);
});

test("3.7 нажатие на точку диаграммы выбирает набор блоков", () => {
  const onChangeColourSetBlock = jest.fn();
  render(<BlockSelection {...baseBlockSelectionProps({ onChangeColourSetBlock })} />);
  openPalette();
  const point = document.querySelector(".paletteDiagramPoint");
  fireEvent.click(point);
  expect(onChangeColourSetBlock).toHaveBeenCalled();
  const [colourSetId, blockId] = onChangeColourSetBlock.mock.calls[0];
  expect(coloursJSON[colourSetId]).toBeTruthy();
  expect(blockId).toBeTruthy();
});

test("3.7 сортировка по яркости меняет порядок в списке", () => {
  render(<BlockSelection {...baseBlockSelectionProps()} />);
  openPalette();
  const names = () =>
    Array.from(document.querySelectorAll(".colourSetLabel")).map((node) => node.textContent.trim());
  const byName = names();
  const select = document.querySelector(".paletteModalSort select");
  fireEvent.change(select, { target: { value: "brightness" } });
  const byBrightness = names();
  expect(byBrightness.length).toBe(byName.length);
  expect(byBrightness.join("|")).not.toBe(byName.join("|"));
});

test("3.7 наборы, встречающиеся в картинке, помечаются", () => {
  const firstColourSetId = Object.keys(coloursJSON)[1];
  render(<BlockSelection {...baseBlockSelectionProps({ imageColourSetIds: new Set([firstColourSetId]) })} />);
  openPalette();
  const marked = document.querySelectorAll(".colourSet.presentInImage");
  expect(marked.length).toBe(1);
});
