import DitherMethods from "../components/mapart/json/ditherMethods.json";
import ColourMethods from "../components/mapart/json/colourMethods.json";
import { makePreset, PRESET_KIND } from "./presetFormat";

/*
 * Style presets. These are intentionally settings presets, not palette
 * presets: the selected block palette is never silently replaced.
 *
 * The common format of every preset (kind, id, name, nameKey, settings) is
 * described in presetFormat.js. The parameters of the style live in
 * settings.
 *
 * paletteStrategy and maxTones say how many tones of the palette the style
 * may use. The worker works with these numbers, not with the style name, so
 * a new style does not need changes in the worker:
 *   "all"       - the whole palette
 *   "twoTones"  - the darkest and the lightest tone
 *   "luminance" - maxTones tones picked by luminance
 */
export const STYLE_PRESETS = [
  makePreset({
    kind: PRESET_KIND.STYLE,
    id: "clean",
    name: "Clean Pixel",
    nameKey: "STUDIO/STYLE-NAME-CLEAN",
    description: "No dithering. Clean blocks and hard edges.",
    descriptionKey: "STUDIO/STYLE-CLEAN",
    settings: {
      dithering: DitherMethods.None.uniqueId,
      colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
      propagation: [100, 100, 100],
      paletteStrategy: "all",
      maxTones: 0,
    },
  }),
  makePreset({
    kind: PRESET_KIND.STYLE,
    id: "retroGrid",
    name: "Retro Grid",
    nameKey: "STUDIO/STYLE-NAME-RETRO-GRID",
    description: "Bayer 4x4. Retro grid without smoothing.",
    descriptionKey: "STUDIO/STYLE-RETRO-GRID",
    settings: {
      dithering: DitherMethods.Bayer44.uniqueId,
      colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
      propagation: [100, 100, 100],
      improvedPattern: true,
      patternPairMode: "nearest",
      paletteStrategy: "all",
      maxTones: 0,
    },
  }),
  makePreset({
    kind: PRESET_KIND.STYLE,
    id: "retro1bit",
    name: "Retro 1-bit",
    nameKey: "STUDIO/STYLE-NAME-RETRO-1BIT",
    description: "Two tones and Bayer 2x2. Shows where dithering is actually needed.",
    descriptionKey: "STUDIO/STYLE-RETRO-1BIT",
    settings: {
      dithering: DitherMethods.Bayer22.uniqueId,
      colourMethod: ColourMethods.Euclidian.uniqueId,
      propagation: [100, 100, 100],
      // Without the improved pattern the two-tone threshold is not normalised,
      // which leaves the halftone invisible in the mid tones.
      improvedPattern: true,
      patternPairMode: "nearest",
      paletteStrategy: "twoTones",
      maxTones: 2,
    },
  }),
  makePreset({
    kind: PRESET_KIND.STYLE,
    id: "softGradient",
    name: "Soft Gradient",
    nameKey: "STUDIO/STYLE-NAME-SOFT",
    description: "Gentle Floyd-Steinberg for soft transitions.",
    descriptionKey: "STUDIO/STYLE-SOFT",
    settings: {
      dithering: DitherMethods.FloydSteinberg_24.uniqueId,
      colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
      propagation: [62, 62, 62],
      paletteStrategy: "all",
      maxTones: 0,
    },
  }),
  makePreset({
    kind: PRESET_KIND.STYLE,
    id: "lowBlock",
    name: "Low-Block",
    nameKey: "STUDIO/STYLE-NAME-LOW-BLOCK",
    description: "No more than 16 tones from the selected palette.",
    descriptionKey: "STUDIO/STYLE-LOW-BLOCK",
    settings: {
      dithering: DitherMethods.Bayer33.uniqueId,
      colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
      propagation: [100, 100, 100],
      improvedPattern: true,
      patternPairMode: "nearest",
      paletteStrategy: "luminance",
      maxTones: 16,
    },
  }),
];

/**
 * The ids that may appear in the saved settings. Derived from STYLE_PRESETS so
 * that adding a preset only needs one edit; a hard coded list silently reset
 * unknown styles back to "clean" after a reload.
 */
export const STYLE_PRESET_IDS = STYLE_PRESETS.map((preset) => preset.id).concat("custom");

export function getStylePreset(id) {
  return STYLE_PRESETS.find((preset) => preset.id === id) || STYLE_PRESETS[0];
}
