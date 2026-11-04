import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import MapSettings from "./mapSettings";

const t = (key) => key;

function renderSettings(props = {}) {
  cleanup();
  const fullProps = {
    getLocaleString: t,
    coloursJSON: {},
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
    onOptionChange_version: () => {},
    onOptionChange_modeNBTOrMapdat: () => {},
    onOptionChange_mapSize_x: () => {},
    onOptionChange_mapSize_y: () => {},
    onOptionChange_cropImage: () => {},
    onOptionChange_cropImage_zoom: () => {},
    onOptionChange_cropImage_percent_x: () => {},
    onOptionChange_cropImage_percent_y: () => {},
    onOptionChange_showGridOverlay: () => {},
    onOptionChange_staircasing: () => {},
    onOptionChange_WhereSupportBlocks: () => {},
    setOption_SupportBlock: () => {},
    onOptionChange_transparency: () => {},
    onOptionChange_transparencyTolerance: () => {},
    onOptionChange_mapdatFilenameUseId: () => {},
    onOptionChange_mapdatFilenameIdStart: () => {},
    onOptionChange_BetterColour: () => {},
    onOptionChange_dithering: () => {},
    onOptionChange_dithering_propagation_red: () => {},
    onOptionChange_dithering_propagation_green: () => {},
    onOptionChange_dithering_propagation_blue: () => {},
    onOptionChange_improvedPatternDithering: () => {},
    onOptionChange_patternPairMode: () => {},
    onOptionChange_PreProcessingEnabled: () => {},
    onOptionChange_PreProcessingBrightness: () => {},
    onOptionChange_PreProcessingContrast: () => {},
    onOptionChange_PreProcessingSaturation: () => {},
    onOptionChange_PreProcessingBackgroundColourSelect: () => {},
    onOptionChange_PreProcessingBackgroundColour: () => {},
    onOptionChange_PreProcessingGamma: () => {},
    onOptionChange_PreProcessingAutoLevels: () => {},
    onOptionChange_extras_moreStaircasingOptions: () => {},
    ...props,
  };
  return render(<MapSettings {...fullProps} />);
}

test("improved checkbox shows for pattern dither, hidden for None and diffusion", () => {
  expect(renderSettings({ optionValue_dithering: 2 }).queryByText("MAP-SETTINGS/DITHERING/IMPROVED")).toBeTruthy();
  expect(renderSettings({ optionValue_dithering: 0 }).queryByText("MAP-SETTINGS/DITHERING/IMPROVED")).toBeNull();
  expect(renderSettings({ optionValue_dithering: 1 }).queryByText("MAP-SETTINGS/DITHERING/IMPROVED")).toBeNull(); // Floyd-Steinberg
});

test("pair select appears only when improved is enabled on a pattern method", () => {
  expect(
    renderSettings({ optionValue_dithering: 2, optionValue_improvedPatternDithering: false }).queryByText(
      "MAP-SETTINGS/DITHERING/PAIR-NEAREST"
    )
  ).toBeNull();
  const rendered = renderSettings({ optionValue_dithering: 2, optionValue_improvedPatternDithering: true });
  expect(rendered.queryByText("MAP-SETTINGS/DITHERING/PAIR-NEAREST")).toBeTruthy();
  expect(rendered.queryByText("MAP-SETTINGS/DITHERING/PAIR-REFLECT")).toBeTruthy();
});

test("checkbox change fires handler and select change fires handler", () => {
  const onImproved = jest.fn();
  const onPair = jest.fn();
  const rendered = renderSettings({
    optionValue_dithering: 2,
    optionValue_improvedPatternDithering: true,
    onOptionChange_improvedPatternDithering: onImproved,
    onOptionChange_patternPairMode: onPair,
  });
  const label = rendered.getByText("MAP-SETTINGS/DITHERING/IMPROVED").closest("label");
  fireEvent.click(label.querySelector('input[type="checkbox"]'));
  expect(onImproved).toHaveBeenCalled();
  const pairSelect = Array.from(rendered.container.querySelectorAll("select")).find((s) =>
    Array.from(s.options).some((o) => o.value === "reflect")
  );
  fireEvent.change(pairSelect, { target: { value: "reflect" } });
  expect(onPair).toHaveBeenCalled();
});
