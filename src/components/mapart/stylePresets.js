import DitherMethods from "./json/ditherMethods.json";
import ColourMethods from "./json/colourMethods.json";

/*
 * Studio style presets. These are intentionally settings presets, not palette
 * presets: the selected block palette is never silently replaced.
 */
export const STYLE_PRESETS = [
  {
    id: "clean",
    name: "Clean Pixel",
    description: "No dithering. Clean blocks and hard edges.",
    descriptionKey: "STUDIO/STYLE-CLEAN",
    dithering: DitherMethods.None.uniqueId,
    colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
    propagation: [100, 100, 100],
  },
  {
    id: "retroGrid",
    name: "Retro Grid",
    description: "Bayer 4x4. Retro grid without smoothing.",
    descriptionKey: "STUDIO/STYLE-RETRO-GRID",
    dithering: DitherMethods.Bayer44.uniqueId,
    colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
    propagation: [100, 100, 100],
  },
  {
    id: "retro1bit",
    name: "Retro 1-bit",
    description: "Two tones and Bayer 2x2. Shows where dithering is actually needed.",
    descriptionKey: "STUDIO/STYLE-RETRO-1BIT",
    dithering: DitherMethods.Bayer22.uniqueId,
    colourMethod: ColourMethods.Euclidian.uniqueId,
    propagation: [100, 100, 100],
  },
  {
    id: "softGradient",
    name: "Soft Gradient",
    description: "Gentle Floyd-Steinberg for soft transitions.",
    descriptionKey: "STUDIO/STYLE-SOFT",
    dithering: DitherMethods.FloydSteinberg_24.uniqueId,
    colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
    propagation: [62, 62, 62],
  },
  {
    id: "lowBlock",
    name: "Low-Block",
    description: "No more than 16 tones from the selected palette.",
    descriptionKey: "STUDIO/STYLE-LOW-BLOCK",
    dithering: DitherMethods.Bayer33.uniqueId,
    colourMethod: ColourMethods.MapartCraftDefault.uniqueId,
    propagation: [100, 100, 100],
  },
];

export function getStylePreset(id) {
  return STYLE_PRESETS.find((preset) => preset.id === id) || STYLE_PRESETS[0];
}
