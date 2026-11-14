import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import MapSettings from "./mapSettings";
import { OPTION_SCHEMA } from "./optionSchema";

const t = (key) => key;

const DEFAULT_VALUES = {
  optionValue_version: { MCVersion: "1.21.4" },
  optionValue_modeNBTOrMapdat: 0,
  optionValue_mapSize_x: 1,
  optionValue_mapSize_y: 1,
  optionValue_cropImage: 0,
  optionValue_cropImage_zoom: 10,
  optionValue_cropImage_percent_x: 50,
  optionValue_cropImage_percent_y: 50,
  optionValue_showGridOverlay: false,
  optionValue_staircasing: 0,
  optionValue_whereSupportBlocks: 0,
  optionValue_supportBlock: "air",
  optionValue_transparency: false,
  optionValue_transparencyTolerance: 128,
  optionValue_mapdatFilenameUseId: true,
  optionValue_mapdatFilenameIdStart: 0,
  optionValue_betterColour: 0,
  optionValue_dithering: 2,
  optionValue_dithering_strength: 100,
  optionValue_dithering_propagation_red: 100,
  optionValue_dithering_propagation_green: 100,
  optionValue_dithering_propagation_blue: 100,
  optionValue_improvedPatternDithering: false,
  optionValue_patternPairMode: "nearest",
  optionValue_preprocessingEnabled: false,
  preProcessingValue_brightness: 100,
  preProcessingValue_contrast: 100,
  preProcessingValue_saturation: 100,
  preProcessingValue_backgroundColourSelect: 0,
  preProcessingValue_backgroundColour: "#151515",
  preProcessingValue_gamma: 100,
  preProcessingValue_autoLevels: false,
  optionValue_extras_moreStaircasingOptions: false,
  optionValue_cleanup_enabled: false,
  optionValue_cleanup_denoise: 40,
  optionValue_cleanup_denoiseMethod: "median",
  optionValue_cleanup_edges: 60,
  optionValue_cleanup_despeckle: 0,
  optionValue_cleanup_paletteIslands: true,
  optionValue_cleanup_colours: 0,
  optionValue_cleanup_coloursPerceptual: false,
  optionValue_cleanup_islandsSmart: false,
  optionValue_cleanup_adaptiveDither: true,
};

/* Обработчики в новом API приходят ключом опции. Собираем их по схеме,
   чтобы тест проверял и саму схему. */
const DEFAULT_HANDLERS = OPTION_SCHEMA.reduce((handlers, option) => {
  handlers[option.key] = () => {};
  return handlers;
}, {});

function renderSettings(props = {}) {
  cleanup();
  const { values = {}, handlers = {} } = props;
  const optionValues = { ...DEFAULT_VALUES, ...values };
  const optionHandlers = { ...DEFAULT_HANDLERS, ...handlers };
  return render(
    <MapSettings
      getLocaleString={t}
      optionValues={optionValues}
      optionHandlers={optionHandlers}
      context={{ coloursJSON: {}, onApplyCleanupPreset: () => {} }}
    />
  );
}

/* В форме настройки разбиты по табам — переключаем на нужный. */
function openTab(rendered, tabKey) {
  fireEvent.click(rendered.getByText(tabKey));
}

test("improved checkbox shows for pattern dither, hidden for None and diffusion", () => {
  const pattern = renderSettings({ values: { optionValue_dithering: 2 } });
  openTab(pattern, "MAP-SETTINGS/TAB/DITHERING");
  expect(pattern.queryByText("MAP-SETTINGS/DITHERING/IMPROVED")).toBeTruthy();

  const none = renderSettings({ values: { optionValue_dithering: 0 } });
  openTab(none, "MAP-SETTINGS/TAB/DITHERING");
  expect(none.queryByText("MAP-SETTINGS/DITHERING/IMPROVED")).toBeNull();

  const diffusion = renderSettings({ values: { optionValue_dithering: 1 } });
  openTab(diffusion, "MAP-SETTINGS/TAB/DITHERING");
  expect(diffusion.queryByText("MAP-SETTINGS/DITHERING/IMPROVED")).toBeNull(); // Floyd-Steinberg
});

test("pair select appears only when improved is enabled on a pattern method", () => {
  const withoutImproved = renderSettings({
    values: { optionValue_dithering: 2, optionValue_improvedPatternDithering: false },
  });
  openTab(withoutImproved, "MAP-SETTINGS/TAB/DITHERING");
  expect(withoutImproved.queryByText("MAP-SETTINGS/DITHERING/PAIR-NEAREST")).toBeNull();

  const rendered = renderSettings({
    values: { optionValue_dithering: 2, optionValue_improvedPatternDithering: true },
  });
  openTab(rendered, "MAP-SETTINGS/TAB/DITHERING");
  expect(rendered.queryByText("MAP-SETTINGS/DITHERING/PAIR-NEAREST")).toBeTruthy();
  expect(rendered.queryByText("MAP-SETTINGS/DITHERING/PAIR-REFLECT")).toBeTruthy();
});

test("checkbox change fires handler and select change fires handler", () => {
  const onImproved = jest.fn();
  const onPair = jest.fn();
  const rendered = renderSettings({
    values: { optionValue_dithering: 2, optionValue_improvedPatternDithering: true },
    handlers: {
      optionValue_improvedPatternDithering: onImproved,
      optionValue_patternPairMode: onPair,
    },
  });
  openTab(rendered, "MAP-SETTINGS/TAB/DITHERING");
  const label = rendered.getByText("MAP-SETTINGS/DITHERING/IMPROVED").closest("label");
  fireEvent.click(label.querySelector('input[type="checkbox"]'));
  expect(onImproved).toHaveBeenCalled();
  const pairSelect = Array.from(rendered.container.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === "reflect")
  );
  fireEvent.change(pairSelect, { target: { value: "reflect" } });
  expect(onPair).toHaveBeenCalled();
});
