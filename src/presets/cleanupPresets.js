import { makePreset, PRESET_KIND } from "./presetFormat";

/*
 * Cleanup presets: the filters that clean the map before it is exported.
 * They are the third kind of preset (the others are palettes and styles)
 * and now have the same format as them - the filters live in settings and
 * can be put into setState as they are.
 */
export const CLEANUP_PRESETS = [
  makePreset({
    kind: PRESET_KIND.CLEANUP,
    id: "off",
    name: "Off",
    nameKey: "STUDIO/CLEANUP-OFF",
    settings: {
      optionValue_cleanup_enabled: false,
    },
  }),
  makePreset({
    kind: PRESET_KIND.CLEANUP,
    id: "clean",
    name: "Clean",
    nameKey: "STUDIO/CLEANUP-CLEAN",
    settings: {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_denoise: 55,
      optionValue_cleanup_denoiseMethod: "median",
      optionValue_cleanup_edges: 55,
      optionValue_cleanup_despeckle: 2,
      optionValue_cleanup_paletteIslands: true,
      optionValue_cleanup_colours: 32,
      optionValue_cleanup_adaptiveDither: true,
    },
  }),
  makePreset({
    kind: PRESET_KIND.CLEANUP,
    id: "soft",
    name: "Soft",
    nameKey: "STUDIO/CLEANUP-SOFT",
    settings: {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_denoise: 30,
      optionValue_cleanup_denoiseMethod: "bilateral",
      optionValue_cleanup_edges: 75,
      optionValue_cleanup_despeckle: 1,
      optionValue_cleanup_paletteIslands: true,
      optionValue_cleanup_colours: 48,
      optionValue_cleanup_adaptiveDither: true,
    },
  }),
  makePreset({
    kind: PRESET_KIND.CLEANUP,
    id: "detail",
    name: "Detail",
    nameKey: "STUDIO/CLEANUP-DETAIL",
    settings: {
      optionValue_cleanup_enabled: true,
      optionValue_cleanup_denoise: 10,
      optionValue_cleanup_denoiseMethod: "guided",
      optionValue_cleanup_edges: 90,
      optionValue_cleanup_despeckle: 0,
      optionValue_cleanup_paletteIslands: true,
      optionValue_cleanup_colours: 0,
      optionValue_cleanup_adaptiveDither: true,
    },
  }),
];

export const getCleanupPreset = (id) => CLEANUP_PRESETS.find((preset) => preset.id === id) || null;
