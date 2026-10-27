import React, { Component } from "react";

import CookieManager from "../../cookieManager";
import BlockSelection from "./blockSelection";
import GreenButtons from "./greenButtons";
import MapPreview from "./mapPreview";
import MapSettings from "./mapSettings";
import Materials from "./materials";
import StudioPanel from "./studioPanel";
import { getStylePreset } from "./stylePresets";
import { clearSession, loadSession, loadSettings, saveSession, saveSettings } from "../../studioStorage";
import coloursJSON from "./json/coloursJSON.json";
import ViewOnline2D from "./viewOnline2D/viewOnline2D";
import ViewOnline3D from "./viewOnline3D/viewOnline3D";

import BackgroundColourModes from "./json/backgroundColourModes.json";
import ColourMethods from "./json/colourMethods.json";
import CropModes from "./json/cropModes.json";
import DefaultPresets from "./json/defaultPresets.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import SupportedVersions from "./json/supportedVersions.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import IMG_Upload from "../../images/upload.png";

import "./mapartController.css";

class MapartController extends Component {
  state = {
    coloursJSON: null,
    selectedBlocks: {},
    disabledTones: {},
    optionValue_version: Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1], // default to the latest version supported
    optionValue_modeNBTOrMapdat: MapModes.SCHEMATIC_NBT.uniqueId,
    optionValue_mapSize_x: 1,
    optionValue_mapSize_y: 1,
    optionValue_cropImage: CropModes.CENTER.uniqueId,
    optionValue_cropImage_zoom: 10, // this gets scaled down by a factor of 10
    optionValue_cropImage_percent_x: 50,
    optionValue_cropImage_percent_y: 50,
    optionValue_showGridOverlay: false,
    optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
    optionValue_whereSupportBlocks: WhereSupportBlocksModes.NONE.uniqueId,
    optionValue_supportBlock: "air",
    optionValue_transparency: false,
    optionValue_transparencyTolerance: 128,
    optionValue_mapdatFilenameUseId: true,
    optionValue_mapdatFilenameIdStart: 0,
    optionValue_betterColour: ColourMethods.MapartCraftDefault.uniqueId,
    optionValue_dithering: DitherMethods.None.uniqueId,
    optionValue_dithering_propagation_red: 100,
    optionValue_dithering_propagation_green: 100,
    optionValue_dithering_propagation_blue: 100,
    optionValue_dithering_strength: 100,
    optionValue_cleanup_enabled: false,
    optionValue_cleanup_denoise: 40,
    optionValue_cleanup_denoiseMethod: "median",
    optionValue_cleanup_edges: 60,
    optionValue_cleanup_despeckle: 0,
    optionValue_cleanup_paletteIslands: true,
    optionValue_cleanup_colours: 0,
    optionValue_cleanup_adaptiveDither: true,
    optionValue_preprocessingEnabled: false,
    preProcessingValue_brightness: 100,
    preProcessingValue_contrast: 100,
    preProcessingValue_saturation: 100,
    preProcessingValue_backgroundColourSelect: BackgroundColourModes.OFF.uniqueId,
    preProcessingValue_backgroundColour: "#151515",
    optionValue_extras_moreStaircasingOptions: false,
    optionValue_pixelPerfect: true,
    optionValue_autoDetectPixelScale: true,
    optionValue_showPixelGrid: false,
    optionValue_previewScale: 2,
    optionValue_style: "clean",
    stylePreset: "clean",
    uploadedImage: null,
    uploadedImage_baseFilename: null,
    uploadedImage_isPlaceholder: true,
    pixelEdits: {},
    detectedPixelScale: 1,
    sessionStatus: "",
    presets: [],
    selectedPresetName: "None",
    currentMaterialsData: {
      pixelsData: null,
      pixelsWidth: 0,
      pixelsHeight: 0,
      maps: [[]], // entries are dictionaries with keys "materials", "supportBlockCount"
      currentSelectedBlocks: {}, // we keep this soley for materials.js
    },
    mapPreviewWorker_inProgress: false,
    viewOnline_NBT: null,
    viewOnline_3D: false,
  };

  constructor(props) {
    super(props);
    // update default presets to latest version; done via checking for localeString
    CookieManager.init();
    let cookiesPresets_loaded = this.loadStoredPresets();
    let cookiesPresets_updated = [];
    for (const cookiesPreset_loaded of cookiesPresets_loaded) {
      let cookiesPreset_updated = undefined;
      if ("localeKey" in cookiesPreset_loaded) {
        cookiesPreset_updated = DefaultPresets.find((defaultPreset) => defaultPreset.localeKey === cookiesPreset_loaded.localeKey);
      }
      if (cookiesPreset_updated === undefined) {
        cookiesPreset_updated = DefaultPresets.find((defaultPreset) => defaultPreset.name === cookiesPreset_loaded.name);
      }
      if (cookiesPreset_updated === undefined) {
        cookiesPreset_updated = cookiesPreset_loaded;
      }
      cookiesPresets_updated.push(cookiesPreset_updated);
    }
    // New built-in presets must appear for existing users too, while their
    // custom presets stay untouched.
    for (const defaultPreset of DefaultPresets) {
      if (!cookiesPresets_updated.some((preset) => preset.name === defaultPreset.name)) {
        cookiesPresets_updated.push(defaultPreset);
      }
    }
    this.persistPresets(cookiesPresets_updated);
    this.state.presets = cookiesPresets_updated;

    let cookie_customBlocks = JSON.parse(CookieManager.touchCookie("mapartcraft_customBlocks", JSON.stringify([])));
    this.state.coloursJSON = this.getMergedColoursJSON(cookie_customBlocks);

    for (const colourSetId of Object.keys(this.state.coloursJSON)) {
      this.state.selectedBlocks[colourSetId] = "-1";
      this.state.disabledTones[colourSetId] = new Set();
    }

    const cookieMCVersion = CookieManager.touchCookie("mapartcraft_mcversion", Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1].MCVersion);
    const supportedVersionFound = Object.values(SupportedVersions).find((supportedVersion) => supportedVersion.MCVersion === cookieMCVersion);
    if (supportedVersionFound !== undefined) {
      this.state.optionValue_version = supportedVersionFound;
    }

    // Start new users on the user's own 56-block palette. Saved settings win
    // below; custom presets are never touched.
    const defaultPalette = cookiesPresets_updated.find((preset) => preset.name === "Моя палитра");
    if (defaultPalette) {
      this.state.selectedPresetName = "Моя палитра";
      for (const [colourSetId, blockId] of defaultPalette.blocks) {
        const block = this.state.coloursJSON[colourSetId]?.blocks[blockId];
        if (block && block.validVersions && this.state.optionValue_version.MCVersion in block.validVersions) {
          this.state.selectedBlocks[colourSetId] = blockId;
        }
      }
    }

    const savedSettings = loadSettings();
    if (savedSettings) {
      Object.assign(this.state, this.getStateFromSettings(savedSettings));
    }

    const URLParams = new URL(window.location).searchParams;
    if (URLParams.has("preset")) {
      const decodedPresetBlocks = this.URLToPreset(URLParams.get("preset"));
      if (decodedPresetBlocks !== null) {
        this.state.selectedBlocks = decodedPresetBlocks;
      }
    }

    // The support-block field used to default to cobblestone. The default is
    // now air plus no support blocks; migrate old settings once.
    try {
      const supportDefaultKey = "mapartcraft_support_default_air_v1";
      if (!window.localStorage.getItem(supportDefaultKey)) {
        this.state.optionValue_whereSupportBlocks = WhereSupportBlocksModes.NONE.uniqueId;
        this.state.optionValue_supportBlock = "air";
        window.localStorage.setItem(supportDefaultKey, "1");
        saveSettings(this.getSettingsSnapshot());
      }
    } catch (error) {
      // localStorage can be unavailable; keep the in-memory defaults.
    }

    this.settingsReady = true;
    this.lastSavedSettingsJSON = JSON.stringify(this.getSettingsSnapshot());
    this.settingsSaveTimer = null;
    this.sessionSaveTimer = null;
    this.lastSessionSnapshot = null;
    this.lastSessionBlob = null;
    this.uploadedImageBlob = null;
    this.imageLoadId = 0;
    this.sessionRevision = 0;
    this.isMounted = false;
  }

  loadStoredPresets() {
    let serialized = null;
    try {
      serialized = window.localStorage.getItem("mapartcraft_presets");
    } catch (error) {
      // localStorage can be unavailable in strict privacy modes.
    }
    if (!serialized) {
      serialized = CookieManager.getCookie("mapartcraft_presets");
      if (serialized) {
        // Migrate old cookie-backed custom presets to the larger storage.
        try {
          window.localStorage.setItem("mapartcraft_presets", serialized);
        } catch (error) {
          // Keep using the cookie as a fallback.
        }
      }
    }
    try {
      const parsed = serialized ? JSON.parse(serialized) : null;
      return Array.isArray(parsed) ? parsed : DefaultPresets;
    } catch (error) {
      console.warn("Could not parse saved presets", error);
      return DefaultPresets;
    }
  }

  persistPresets(presets) {
    const serialized = JSON.stringify(presets);
    let stored = false;
    try {
      window.localStorage.setItem("mapartcraft_presets", serialized);
      stored = true;
    } catch (error) {
      console.warn("Could not save presets to localStorage", error);
    }
    // Keep the cookie for older builds, but cookies are limited to ~4 KB.
    // Clearing an oversized stale cookie prevents it from resurrecting deleted
    // presets when localStorage is unavailable.
    if (serialized.length < 3000) {
      CookieManager.setCookie("mapartcraft_presets", serialized);
    } else if (!stored) {
      CookieManager.setCookie("mapartcraft_presets", serialized);
    } else {
      document.cookie = "mapartcraft_presets=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    }
  }

  getStateFromSettings(settings, colourSource = this.state.coloursJSON) {
    const patch = {};
    const keys = [
      "optionValue_modeNBTOrMapdat",
      "optionValue_mapSize_x",
      "optionValue_mapSize_y",
      "optionValue_cropImage",
      "optionValue_cropImage_zoom",
      "optionValue_cropImage_percent_x",
      "optionValue_cropImage_percent_y",
      "optionValue_showGridOverlay",
      "optionValue_staircasing",
      "optionValue_whereSupportBlocks",
      "optionValue_supportBlock",
      "optionValue_transparency",
      "optionValue_transparencyTolerance",
      "optionValue_mapdatFilenameUseId",
      "optionValue_mapdatFilenameIdStart",
      "optionValue_betterColour",
      "optionValue_dithering",
      "optionValue_dithering_propagation_red",
      "optionValue_dithering_propagation_green",
      "optionValue_dithering_propagation_blue",
      "optionValue_dithering_strength",
      "optionValue_cleanup_enabled",
      "optionValue_cleanup_denoise",
      "optionValue_cleanup_denoiseMethod",
      "optionValue_cleanup_edges",
      "optionValue_cleanup_despeckle",
      "optionValue_cleanup_paletteIslands",
      "optionValue_cleanup_colours",
      "optionValue_cleanup_adaptiveDither",
      "optionValue_preprocessingEnabled",
      "preProcessingValue_brightness",
      "preProcessingValue_contrast",
      "preProcessingValue_saturation",
      "preProcessingValue_backgroundColourSelect",
      "preProcessingValue_backgroundColour",
      "optionValue_extras_moreStaircasingOptions",
      "optionValue_pixelPerfect",
      "optionValue_autoDetectPixelScale",
      "optionValue_showPixelGrid",
      "optionValue_previewScale",
      "optionValue_style",
      "stylePreset",
      "selectedPresetName",
    ];
    for (const key of keys) {
      if (settings[key] !== undefined) patch[key] = settings[key];
    }

    if (settings.optionValue_version) {
      const version =
        typeof settings.optionValue_version === "string"
          ? Object.values(SupportedVersions).find((v) => v.MCVersion === settings.optionValue_version)
          : Object.values(SupportedVersions).find((v) => v.MCVersion === settings.optionValue_version.MCVersion);
      if (version) patch.optionValue_version = version;
    }

    if (settings.selectedBlocks && typeof settings.selectedBlocks === "object") {
      const selectedBlocks = {};
      const version = patch.optionValue_version || this.state.optionValue_version;
      for (const colourSetId of Object.keys(colourSource)) {
        const blockId = settings.selectedBlocks[colourSetId];
        const block = blockId !== undefined && blockId !== "-1" ? colourSource[colourSetId].blocks[blockId] : null;
        if (block && Object.keys(block.validVersions).includes(version.MCVersion)) {
          selectedBlocks[colourSetId] = blockId;
        } else {
          selectedBlocks[colourSetId] = "-1";
        }
      }
      patch.selectedBlocks = selectedBlocks;
    }

    if (settings.disabledTones && typeof settings.disabledTones === "object") {
      const restoredDisabledTones = {};
      for (const colourSetId of Object.keys(colourSource)) {
        const tones = settings.disabledTones[colourSetId];
        restoredDisabledTones[colourSetId] = new Set(Array.isArray(tones) ? tones : []);
      }
      patch.disabledTones = restoredDisabledTones;
    }

    if (
      patch.selectedPresetName &&
      patch.selectedPresetName !== "None" &&
      !this.state.presets.some((preset) => preset.name === patch.selectedPresetName)
    ) {
      patch.selectedPresetName = "None";
    }

    if (patch.optionValue_style === undefined) {
      patch.optionValue_style = patch.stylePreset || this.state.optionValue_style || "clean";
    }
    if (!["clean", "retroGrid", "retro1bit", "softGradient", "lowBlock", "custom"].includes(patch.optionValue_style)) {
      patch.optionValue_style = "clean";
      patch.stylePreset = "clean";
    }
    if (!["clean", "retroGrid", "retro1bit", "softGradient", "lowBlock", "custom"].includes(patch.stylePreset)) {
      patch.stylePreset = patch.optionValue_style || "clean";
    }
    return patch;
  }

  getSettingsSnapshot() {
    const {
      selectedBlocks,
      disabledTones,
      selectedPresetName,
      optionValue_version,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
      optionValue_showGridOverlay,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_supportBlock,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_mapdatFilenameUseId,
      optionValue_mapdatFilenameIdStart,
      optionValue_betterColour,
      optionValue_dithering,
      optionValue_dithering_propagation_red,
      optionValue_dithering_propagation_green,
      optionValue_dithering_propagation_blue,
      optionValue_dithering_strength,
      optionValue_cleanup_enabled,
      optionValue_cleanup_denoise,
      optionValue_cleanup_denoiseMethod,
      optionValue_cleanup_edges,
      optionValue_cleanup_despeckle,
      optionValue_cleanup_paletteIslands,
      optionValue_cleanup_colours,
      optionValue_cleanup_adaptiveDither,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      optionValue_extras_moreStaircasingOptions,
      optionValue_pixelPerfect,
      optionValue_autoDetectPixelScale,
      optionValue_showPixelGrid,
      optionValue_previewScale,
      optionValue_style,
      stylePreset,
    } = this.state;
    return {
      selectedBlocks: { ...selectedBlocks },
      disabledTones: Object.fromEntries(
        Object.entries(disabledTones).map(([colourSetId, tones]) => [colourSetId, Array.from(tones || [])])
      ),
      selectedPresetName,
      optionValue_version,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
      optionValue_showGridOverlay,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_supportBlock,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_mapdatFilenameUseId,
      optionValue_mapdatFilenameIdStart,
      optionValue_betterColour,
      optionValue_dithering,
      optionValue_dithering_propagation_red,
      optionValue_dithering_propagation_green,
      optionValue_dithering_propagation_blue,
      optionValue_dithering_strength,
      optionValue_cleanup_enabled,
      optionValue_cleanup_denoise,
      optionValue_cleanup_denoiseMethod,
      optionValue_cleanup_edges,
      optionValue_cleanup_despeckle,
      optionValue_cleanup_paletteIslands,
      optionValue_cleanup_colours,
      optionValue_cleanup_adaptiveDither,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      optionValue_extras_moreStaircasingOptions,
      optionValue_pixelPerfect,
      optionValue_autoDetectPixelScale,
      optionValue_showPixelGrid,
      optionValue_previewScale,
      optionValue_style,
      stylePreset,
    };
  }

  getCustomBlocks() {
    try {
      const value = CookieManager.getCookie("mapartcraft_customBlocks");
      return value ? JSON.parse(value) : [];
    } catch (error) {
      return [];
    }
  }

  getMergedColoursJSON(customBlocks) {
    // this is how we currently merge custom blocks into coloursJSON at runtime / when custom blocks update. this may change if presets support for custom blocks is added
    let coloursJSON_custom = JSON.parse(JSON.stringify(coloursJSON)); // hmmm
    for (const [colourSetId, customBlock] of customBlocks) {
      coloursJSON_custom[colourSetId].blocks[Object.keys(coloursJSON_custom[colourSetId].blocks).length.toString()] = customBlock;
    }
    return coloursJSON_custom;
  }

  eventListener_dragover = function (e) {
    // this has to be here for drop event to work
    e.preventDefault();
    e.stopPropagation();
  };

  eventListener_drop = function (e) {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length) {
      this.loadImageFile(files[0]);
    }
  }.bind(this);

  eventListener_paste = function (e) {
    const target = e.target;
    const tag = target && (target.tagName || "").toLowerCase();
    if (["input", "textarea", "select"].includes(tag) || target?.isContentEditable) return;
    const files = e.clipboardData?.files;
    const imageFile = files && Array.from(files).find((file) => file.type.startsWith("image/"));
    if (!imageFile) return;
    e.preventDefault();
    e.stopPropagation();
    this.loadImageFile(imageFile);
  }.bind(this);

  componentDidMount() {
    this.isMounted = true;
    this.restoreLastSession().then((restored) => {
      if (!restored && this.isMounted) {
        this.loadUploadedImageFromURL(IMG_Upload, "MyArt", { placeholder: true });
      }
    });

    document.addEventListener("dragover", this.eventListener_dragover);
    document.addEventListener("drop", this.eventListener_drop);
    document.addEventListener("paste", this.eventListener_paste);
    window.addEventListener("pagehide", this.handlePageHide);
  }

  componentDidUpdate(prevProps, prevState) {
    if (!this.settingsReady) return;
    const settingsSnapshot = this.getSettingsSnapshot();
    const serialized = JSON.stringify(settingsSnapshot);
    const settingsChanged = serialized !== this.lastSavedSettingsJSON;
    if (settingsChanged) {
      this.lastSavedSettingsJSON = serialized;
      window.clearTimeout(this.settingsSaveTimer);
      this.settingsSaveTimer = window.setTimeout(() => saveSettings(settingsSnapshot), 250);
    }

    const sessionInputsChanged =
      settingsChanged ||
      prevState.pixelEdits !== this.state.pixelEdits ||
      prevState.coloursJSON !== this.state.coloursJSON ||
      prevState.uploadedImage_baseFilename !== this.state.uploadedImage_baseFilename ||
      prevState.uploadedImage_isPlaceholder !== this.state.uploadedImage_isPlaceholder ||
      this.uploadedImageBlob !== this.lastSessionBlob;
    if (sessionInputsChanged && !this.state.uploadedImage_isPlaceholder && this.uploadedImageBlob) {
      const sessionSnapshot = JSON.stringify({
        imageBaseFilename: this.state.uploadedImage_baseFilename,
        settings: settingsSnapshot,
        customBlocks: this.getCustomBlocks(),
        pixelEdits: this.state.pixelEdits,
      });
      if (sessionSnapshot !== this.lastSessionSnapshot || this.uploadedImageBlob !== this.lastSessionBlob) {
        this.sessionRevision += 1;
        this.lastSessionSnapshot = sessionSnapshot;
        this.lastSessionBlob = this.uploadedImageBlob;
        window.clearTimeout(this.sessionSaveTimer);
        if (this.state.sessionStatus !== "saving") this.setState({ sessionStatus: "saving" });
        this.sessionSaveTimer = window.setTimeout(() => this.saveSessionNow(), 600);
      }
    }
  }

  componentWillUnmount() {
    this.isMounted = false;
    document.removeEventListener("dragover", this.eventListener_dragover);
    document.removeEventListener("drop", this.eventListener_drop);
    document.removeEventListener("paste", this.eventListener_paste);
    window.removeEventListener("pagehide", this.handlePageHide);
    window.clearTimeout(this.settingsSaveTimer);
    window.clearTimeout(this.sessionSaveTimer);
    this.saveSessionNow();
  }

  handlePageHide = () => {
    this.saveSessionNow();
  };

  saveSessionNow() {
    if (this.state.uploadedImage_isPlaceholder || !this.uploadedImageBlob) return;
    const revision = this.sessionRevision;
    if (this.isMounted) this.setState({ sessionStatus: "saving" });
    saveSession({
      imageBlob: this.uploadedImageBlob,
      imageBaseFilename: this.state.uploadedImage_baseFilename,
      settings: this.getSettingsSnapshot(),
      customBlocks: this.getCustomBlocks(),
      pixelEdits: this.state.pixelEdits,
    })
      .then(() => {
        if (this.isMounted && revision === this.sessionRevision) this.setState({ sessionStatus: "saved" });
      })
      .catch((error) => {
        console.warn("Could not save the current session", error);
        if (this.isMounted && revision === this.sessionRevision) this.setState({ sessionStatus: "error" });
      });
  }

  onResetSession = async () => {
    const { getLocaleString } = this.props;
    if (!window.confirm(getLocaleString("STUDIO/RESET-SESSION-CONFIRM"))) return;
    this.sessionRevision += 1;
    window.clearTimeout(this.sessionSaveTimer);
    try {
      await clearSession();
    } catch (error) {
      console.warn("Could not clear the current session", error);
    }
    this.lastSessionSnapshot = null;
    this.lastSessionBlob = null;
    this.uploadedImageBlob = null;
    this.setState({ sessionStatus: "" });
    this.loadUploadedImageFromURL(IMG_Upload, "MyArt", { placeholder: true });
  };

  async restoreLastSession() {
    let session = null;
    try {
      session = await loadSession();
    } catch (error) {
      console.warn("Could not load the last session", error);
      return false;
    }
    if (!session || !session.imageBlob) return false;
    const customBlocks = Array.isArray(session.customBlocks) ? session.customBlocks : this.getCustomBlocks();
    let mergedColours = this.state.coloursJSON;
    if (customBlocks.length) {
      CookieManager.setCookie("mapartcraft_customBlocks", JSON.stringify(customBlocks));
      mergedColours = this.getMergedColoursJSON(customBlocks);
    }
    const patch = this.getStateFromSettings(session.settings || {}, mergedColours);
    patch.coloursJSON = mergedColours;
    patch.pixelEdits = session.pixelEdits && typeof session.pixelEdits === "object" ? session.pixelEdits : {};
    patch.uploadedImage_baseFilename = session.imageBaseFilename || "MyArt";
    patch.uploadedImage_isPlaceholder = false;
    this.uploadedImageBlob = session.imageBlob;
    this.setState(patch);

    const imageURL = URL.createObjectURL(session.imageBlob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(imageURL);
        if (!this.isMounted) {
          resolve(false);
          return;
        }
        this.setState({ uploadedImage: img, detectedPixelScale: 1, uploadedImage_isPlaceholder: false }, () => {
          this.lastSessionSnapshot = JSON.stringify({
            imageBaseFilename: this.state.uploadedImage_baseFilename,
            settings: this.getSettingsSnapshot(),
            customBlocks: this.getCustomBlocks(),
            pixelEdits: this.state.pixelEdits,
          });
          this.lastSessionBlob = this.uploadedImageBlob;
          resolve(true);
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(imageURL);
        resolve(false);
      };
      img.src = imageURL;
    });
  }

  onFileDialogEvent = (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) this.loadImageFile(file);
  };

  loadImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const baseFilename = file.name.replace(/\.[^/.]+$/, "");
    const imageURL = URL.createObjectURL(file);
    this.loadUploadedImageFromURL(imageURL, baseFilename, { placeholder: false, revokeObjectURL: true, imageBlob: file });
  }

  loadUploadedImageFromURL(imageURL, baseFilename, options = {}) {
    const { placeholder = false, revokeObjectURL = false, imageBlob = null } = options;
    const loadId = ++this.imageLoadId;
    const img = new Image();
    img.onload = () => {
      if (revokeObjectURL) URL.revokeObjectURL(imageURL);
      if (!this.isMounted || loadId !== this.imageLoadId) return;
      this.uploadedImageBlob = placeholder ? null : imageBlob;
      this.setState({
        uploadedImage: img,
        uploadedImage_baseFilename: baseFilename || "MyArt",
        uploadedImage_isPlaceholder: placeholder,
        detectedPixelScale: 1,
        pixelEdits: {},
      });
    };
    img.onerror = () => {
      if (revokeObjectURL) URL.revokeObjectURL(imageURL);
    };
    img.src = imageURL;
  }

  applyStylePreset = (styleId) => {
    const style = getStylePreset(styleId);
    this.setState({
      stylePreset: style.id,
      optionValue_style: style.id,
      optionValue_dithering: style.dithering,
      optionValue_betterColour: style.colourMethod,
      optionValue_dithering_propagation_red: style.propagation[0],
      optionValue_dithering_propagation_green: style.propagation[1],
      optionValue_dithering_propagation_blue: style.propagation[2],
      optionValue_dithering_strength: 100,
      optionValue_pixelPerfect: true,
    });
  };

  onOptionChange_pixelPerfect = () => {
    this.setState({ optionValue_pixelPerfect: !this.state.optionValue_pixelPerfect });
  };

  onOptionChange_autoDetectPixelScale = () => {
    this.setState({ optionValue_autoDetectPixelScale: !this.state.optionValue_autoDetectPixelScale });
  };

  onOptionChange_showPixelGrid = () => {
    this.setState({ optionValue_showPixelGrid: !this.state.optionValue_showPixelGrid });
  };

  onOptionChange_previewScale = (value) => {
    this.setState({ optionValue_previewScale: Math.max(1, Math.min(8, Math.round(value))) });
  };

  onPixelScaleDetected = (scale) => {
    if (scale !== this.state.detectedPixelScale) this.setState({ detectedPixelScale: scale });
  };

  handleChangeColourSetBlock = (colourSetId, blockId) => {
    let selectedBlocks = { ...this.state.selectedBlocks };
    selectedBlocks[colourSetId] = blockId;
    this.setState({
      selectedBlocks,
    });
  };

  handleChangeColourSetBlocks = (setsAndBlocks) => {
    const { coloursJSON, optionValue_version } = this.state;
    let selectedBlocks = {};
    for (const colourSetId of Object.keys(coloursJSON)) {
      selectedBlocks[colourSetId] = "-1";
    }
    for (const [int_colourSetId, presetIndex] of setsAndBlocks) {
      // we store presetIndex in the cookie, not blockId
      const colourSetId = int_colourSetId.toString();
      if (!(colourSetId in coloursJSON)) {
        continue;
      }
      const blockIdAndBlock = Object.entries(coloursJSON[colourSetId].blocks).find(([, block]) => block.presetIndex === presetIndex);
      if (blockIdAndBlock === undefined) {
        continue;
      }
      const blockId = blockIdAndBlock[0];
      if (Object.keys(coloursJSON[colourSetId].blocks[blockId].validVersions).includes(optionValue_version.MCVersion)) {
        selectedBlocks[colourSetId] = blockId;
      }
    }
    this.setState({
      selectedBlocks,
    });
  };

  handleToggleColourTone = (colourSetId, tone) => {
    let disabledTones = { ...this.state.disabledTones };

    const set = new Set(disabledTones[colourSetId] || []);
    disabledTones[colourSetId] = set;

    if (set.has(tone))
      set.delete(tone);
    else
      set.add(tone);

    this.setState({
      disabledTones,
    });
  };

  onOptionChange_modeNBTOrMapdat = (e) => {
    const mode = parseInt(e.target.value);
    this.setState({ optionValue_modeNBTOrMapdat: mode });
    if (mode === MapModes.SCHEMATIC_NBT.uniqueId) {
      this.setState({ optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId });
    } else {
      this.setState({ optionValue_staircasing: MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId });
    }
  };

  onOptionChange_version = (e) => {
    const { coloursJSON } = this.state;
    const mcVersion = e.target.value;
    CookieManager.setCookie("mapartcraft_mcversion", mcVersion);
    const supportedVersionFound = Object.values(SupportedVersions).find((supportedVersion) => supportedVersion.MCVersion === mcVersion);
    this.setState((currentState) => {
      let selectedBlocks = { ...currentState.selectedBlocks };
      for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
        if (selectedBlocks[colourSetId] !== "-1" && !Object.keys(colourSet.blocks[selectedBlocks[colourSetId]].validVersions).includes(mcVersion)) {
          selectedBlocks[colourSetId] = "-1";
        }
      }
      return { optionValue_version: supportedVersionFound, selectedBlocks };
    });
  };

  onOptionChange_mapSize_x = (value) => {
    if (value === this.state.optionValue_mapSize_x) return;
    this.setState({
      optionValue_mapSize_x: value,
      pixelEdits: {},
    });
  };

  onOptionChange_mapSize_y = (value) => {
    if (value === this.state.optionValue_mapSize_y) return;
    this.setState({
      optionValue_mapSize_y: value,
      pixelEdits: {},
    });
  };

  onOptionChange_cropImage = (e) => {
    const cropValue = parseInt(e.target.value);
    // CENTER is a special case of MANUAL
    // reset cropImage variables any time we change
    this.setState({
      optionValue_cropImage: cropValue,
      optionValue_cropImage_zoom: 10,
      optionValue_cropImage_percent_x: 50,
      optionValue_cropImage_percent_y: 50,
    });
  };

  onOptionChange_cropImage_zoom = (value) => {
    this.setState({
      optionValue_cropImage_zoom: value,
    });
  };

  onOptionChange_cropImage_percent_x = (value) => {
    this.setState({
      optionValue_cropImage_percent_x: value,
    });
  };

  onOptionChange_cropImage_percent_y = (value) => {
    this.setState({
      optionValue_cropImage_percent_y: value,
    });
  };

  onOptionChange_showGridOverlay = () => {
    this.setState({
      optionValue_showGridOverlay: !this.state.optionValue_showGridOverlay,
    });
    // "updatePreviewScale(0)"
  };

  onOptionChange_staircasing = (e) => {
    const staircasingValue = parseInt(e.target.value);
    this.setState({ optionValue_staircasing: staircasingValue });
  };

  onOptionChange_transparency = () => {
    this.setState({
      optionValue_transparency: !this.state.optionValue_transparency,
    });
  };

  onOptionChange_transparencyTolerance = (value) => {
    this.setState({
      optionValue_transparencyTolerance: value,
    });
  };

  onOptionChange_mapdatFilenameUseId = () => {
    this.setState((currentState) => {
      return {
        optionValue_mapdatFilenameUseId: !currentState.optionValue_mapdatFilenameUseId,
      };
    });
  };

  onOptionChange_mapdatFilenameIdStart = (value) => {
    this.setState({
      optionValue_mapdatFilenameIdStart: value,
    });
  };

  onOptionChange_BetterColour = (e) => {
    const colourValue = parseInt(e.target.value);
    this.setState({ optionValue_betterColour: colourValue });
  };

  onOptionChange_dithering = (e) => {
    const ditheringValue = parseInt(e.target.value);
    this.setState({
      optionValue_dithering: ditheringValue,
      optionValue_style: "custom",
      stylePreset: "custom",
    });
  };

  onOptionChange_dithering_propagation_red = (value) => {
    this.setState({ optionValue_dithering_propagation_red: value });
  };

  onOptionChange_dithering_propagation_green = (value) => {
    this.setState({ optionValue_dithering_propagation_green: value });
  };

  onOptionChange_dithering_propagation_blue = (value) => {
    this.setState({ optionValue_dithering_propagation_blue: value });
  };

  onOptionChange_dithering_strength = (value) => {
    this.setState({ optionValue_dithering_strength: value });
  };

  onOptionChange_cleanup_enabled = () => {
    this.setState({ optionValue_cleanup_enabled: !this.state.optionValue_cleanup_enabled });
  };

  onOptionChange_cleanup_denoise = (value) => {
    this.setState({ optionValue_cleanup_denoise: value });
  };

  onOptionChange_cleanup_denoiseMethod = (e) => {
    this.setState({ optionValue_cleanup_denoiseMethod: e.target.value });
  };

  onOptionChange_cleanup_edges = (value) => {
    this.setState({ optionValue_cleanup_edges: value });
  };

  onOptionChange_cleanup_despeckle = (e) => {
    this.setState({ optionValue_cleanup_despeckle: parseInt(e.target.value) });
  };

  onOptionChange_cleanup_paletteIslands = () => {
    this.setState({ optionValue_cleanup_paletteIslands: !this.state.optionValue_cleanup_paletteIslands });
  };

  onOptionChange_cleanup_colours = (e) => {
    this.setState({ optionValue_cleanup_colours: parseInt(e.target.value) });
  };

  onOptionChange_cleanup_adaptiveDither = () => {
    this.setState({ optionValue_cleanup_adaptiveDither: !this.state.optionValue_cleanup_adaptiveDither });
  };

  applyCleanupPreset = (preset) => {
    const presets = {
      off: { optionValue_cleanup_enabled: false },
      clean: {
        optionValue_cleanup_enabled: true,
        optionValue_cleanup_denoise: 55,
        optionValue_cleanup_denoiseMethod: "median",
        optionValue_cleanup_edges: 55,
        optionValue_cleanup_despeckle: 2,
        optionValue_cleanup_paletteIslands: true,
        optionValue_cleanup_colours: 32,
        optionValue_cleanup_adaptiveDither: true,
      },
      soft: {
        optionValue_cleanup_enabled: true,
        optionValue_cleanup_denoise: 30,
        optionValue_cleanup_denoiseMethod: "bilateral",
        optionValue_cleanup_edges: 75,
        optionValue_cleanup_despeckle: 1,
        optionValue_cleanup_paletteIslands: true,
        optionValue_cleanup_colours: 48,
        optionValue_cleanup_adaptiveDither: true,
      },
      detail: {
        optionValue_cleanup_enabled: true,
        optionValue_cleanup_denoise: 10,
        optionValue_cleanup_denoiseMethod: "guided",
        optionValue_cleanup_edges: 90,
        optionValue_cleanup_despeckle: 0,
        optionValue_cleanup_paletteIslands: true,
        optionValue_cleanup_colours: 0,
        optionValue_cleanup_adaptiveDither: true,
      },
    };
    if (presets[preset]) this.setState(presets[preset]);
  };

  onOptionChange_WhereSupportBlocks = (e) => {
    const newValue = parseInt(e.target.value);
    this.setState({ optionValue_whereSupportBlocks: newValue });
  };

  setOption_SupportBlock = (text) => {
    this.setState({ optionValue_supportBlock: text });
  };

  onOptionChange_PreProcessingEnabled = () => {
    this.setState({
      optionValue_preprocessingEnabled: !this.state.optionValue_preprocessingEnabled,
    });
  };

  onOptionChange_PreProcessingBrightness = (value) => {
    this.setState({
      preProcessingValue_brightness: value,
    });
  };

  onOptionChange_PreProcessingContrast = (value) => {
    this.setState({
      preProcessingValue_contrast: value,
    });
  };

  onOptionChange_PreProcessingSaturation = (value) => {
    this.setState({
      preProcessingValue_saturation: value,
    });
  };

  onOptionChange_PreProcessingBackgroundColourSelect = (e) => {
    const newValue = parseInt(e.target.value);
    this.setState({ preProcessingValue_backgroundColourSelect: newValue });
  };

  onOptionChange_PreProcessingBackgroundColour = (e) => {
    const newValue = e.target.value;
    this.setState({ preProcessingValue_backgroundColour: newValue });
  };

  onOptionChange_extras_moreStaircasingOptions = () => {
    const { optionValue_modeNBTOrMapdat, optionValue_extras_moreStaircasingOptions } = this.state;
    this.setState({ optionValue_extras_moreStaircasingOptions: !optionValue_extras_moreStaircasingOptions });
    if (optionValue_extras_moreStaircasingOptions) {
      if (optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId) {
        this.setState({ optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId });
      } else {
        this.setState({ optionValue_staircasing: MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId });
      }
    }
  };

  onGetViewOnlineNBT = (viewOnline_NBT) => {
    this.setState({ viewOnline_NBT });
  };

  downloadBlobFile(downloadBlob, filename) {
    const downloadURL = window.URL.createObjectURL(downloadBlob);
    const downloadElt = document.createElement("a");
    downloadElt.style = "display: none";
    downloadElt.href = downloadURL;
    downloadElt.download = filename;
    document.body.appendChild(downloadElt);
    downloadElt.click();
    window.URL.revokeObjectURL(downloadURL);
    document.body.removeChild(downloadElt);
  }

  handleGetPDNPaletteClicked = () => {
    const { getLocaleString } = this.props;
    const { coloursJSON, selectedBlocks, optionValue_modeNBTOrMapdat, optionValue_staircasing } = this.state;
    let paletteText =
      "; paint.net Palette File\n; Generated by MapartCraft\n; Link to preset: " +
      this.selectedBlocksToURL() +
      (Object.entries(selectedBlocks).some(([colourSetId, blockId]) => blockId !== "-1" && coloursJSON[colourSetId].blocks[blockId].presetIndex === "CUSTOM")
        ? "\n; Custom blocks not listed!"
        : "") +
      "\n; staircasing: " +
      ([
        MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId,
        MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
        MapModes.MAPDAT.staircaseModes.ON.uniqueId,
        MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId,
      ].includes(optionValue_staircasing)
        ? "enabled"
        : "disabled") +
      "\n; unobtainable colours: " +
      ([MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId, MapModes.MAPDAT.staircaseModes.FULL_UNOBTAINABLE.uniqueId].includes(optionValue_staircasing)
        ? "enabled"
        : "disabled") +
      "\n";
    let numberOfColoursExported = 0;
    const toneKeysToExport = Object.values(Object.values(MapModes).find((mapMode) => mapMode.uniqueId === optionValue_modeNBTOrMapdat).staircaseModes).find(
      (staircaseMode) => staircaseMode.uniqueId === optionValue_staircasing
    ).toneKeys; // this .find stuff is annoying.
    // TODO change from uniqueId to key
    for (const [selectedBlock_colourSetId, selectedBlock_blockId] of Object.entries(selectedBlocks)) {
      if (selectedBlock_blockId !== "-1") {
        let colours = coloursJSON[selectedBlock_colourSetId].tonesRGB;
        for (const toneKeyToExport of toneKeysToExport) {
          numberOfColoursExported += 1;
          paletteText += "FF";
          for (let i = 0; i < 3; i++) {
            paletteText += Number(colours[toneKeyToExport][i]).toString(16).padStart(2, "0").toUpperCase();
          }
          paletteText += "\n";
        }
      }
    }
    if (numberOfColoursExported === 0) {
      alert(getLocaleString("BLOCK-SELECTION/PRESETS/DOWNLOAD-WARNING-NONE-SELECTED"));
      return;
    } else if (numberOfColoursExported > 96) {
      alert(
        `${getLocaleString("BLOCK-SELECTION/PRESETS/DOWNLOAD-WARNING-MAX-COLOURS-1")}${numberOfColoursExported.toString()}${getLocaleString(
          "BLOCK-SELECTION/PRESETS/DOWNLOAD-WARNING-MAX-COLOURS-2"
        )}`
      );
    }
    const downloadBlob = new Blob([paletteText], { type: "text/plain" });
    this.downloadBlobFile(downloadBlob, "MapartcraftPalette.txt");
  };

  handlePresetChange = (e) => {
    const presetName = e.target.value;
    const { presets } = this.state;

    this.setState({ selectedPresetName: presetName });

    if (presetName === "None") {
      this.handleChangeColourSetBlocks([]);
    } else {
      const selectedPreset = presets.find((preset) => preset.name === presetName);
      if (selectedPreset !== undefined) {
        this.handleChangeColourSetBlocks(selectedPreset.blocks);
      }
    }
  };

  canDeletePreset = () => {
    const { selectedPresetName } = this.state;
    return selectedPresetName !== "None" && !DefaultPresets.find((defaultPreset) => defaultPreset.name === selectedPresetName);
  };

  handleDeletePreset = () => {
    const { getLocaleString } = this.props;
    const { presets, selectedPresetName } = this.state;
    if (!this.canDeletePreset()) return;
    if (!window.confirm(`${getLocaleString("BLOCK-SELECTION/PRESETS/DELETE-CONFIRM")} ${selectedPresetName}`)) return;
    const presets_new = presets.filter((preset) => preset.name !== selectedPresetName);
    this.setState(
      {
        presets: presets_new,
        selectedPresetName: "None",
      },
      () => this.handleChangeColourSetBlocks([])
    );
    this.persistPresets(presets_new);
  };

  handleSavePreset = () => {
    const { getLocaleString } = this.props;
    const { coloursJSON, presets, selectedBlocks } = this.state;

    let presetToSave_name = prompt(getLocaleString("BLOCK-SELECTION/PRESETS/SAVE-PROMPT-ENTER-NAME"), "");
    if (presetToSave_name === null) {
      return;
    }

    const otherPresets = presets.filter((preset) => preset.name !== presetToSave_name);
    let newPreset = { name: presetToSave_name, blocks: [] };
    Object.keys(selectedBlocks).forEach((key) => {
      if (selectedBlocks[key] !== "-1" && coloursJSON[key].blocks[selectedBlocks[key]].presetIndex !== "CUSTOM") {
        newPreset.blocks.push([parseInt(key), parseInt(coloursJSON[key].blocks[selectedBlocks[key]].presetIndex)]);
      }
    });
    const presets_new = [...otherPresets, newPreset];
    this.setState({
      presets: presets_new,
      selectedPresetName: presetToSave_name,
    });
    this.persistPresets(presets_new);
  };

  selectedBlocksToURL = () => {
    // colourSetId encoded in base 36 as [0-9a-z]
    // blockId encoded in modified base 26 as [Q-ZA-P]
    const { coloursJSON, selectedBlocks } = this.state;
    let presetQueryString = "";
    for (const [colourSetId, blockId] of Object.entries(selectedBlocks)) {
      if (blockId !== "-1" && coloursJSON[colourSetId].blocks[blockId].presetIndex !== "CUSTOM") {
        presetQueryString += parseInt(colourSetId).toString(36);
        presetQueryString += coloursJSON[colourSetId].blocks[blockId].presetIndex
          .toString(26)
          .toUpperCase()
          .replace(/[0-9]/g, (match) => {
            return {
              0: "Q",
              1: "R",
              2: "S",
              3: "T",
              4: "U",
              5: "V",
              6: "W",
              7: "X",
              8: "Y",
              9: "Z",
            }[match];
          });
      }
    }
    return "https://mike2b2t.github.io/mapartcraft/?preset=" + presetQueryString;
  };

  handleSharePreset = () => {
    const { getLocaleString } = this.props;
    const { coloursJSON, selectedBlocks } = this.state;
    if (Object.keys(selectedBlocks).every((colourSetId) => selectedBlocks[colourSetId] === "-1")) {
      alert(getLocaleString("BLOCK-SELECTION/PRESETS/SHARE-WARNING-NONE-SELECTED"));
    } else {
      if (
        Object.entries(selectedBlocks).some(([colourSetId, blockId]) => blockId !== "-1" && coloursJSON[colourSetId].blocks[blockId].presetIndex === "CUSTOM")
      ) {
        alert(getLocaleString("BLOCK-SELECTION/ADD-CUSTOM/NO-EXPORT"));
      }
      prompt(getLocaleString("BLOCK-SELECTION/PRESETS/SHARE-LINK"), this.selectedBlocksToURL());
    }
  };

  URLToPreset = (encodedPreset) => {
    const { onCorruptedPreset } = this.props;
    const { coloursJSON, optionValue_version } = this.state;
    switch (encodedPreset) {
      case "dQw4w9WgXcQ":
        window.location.replace("https://www.youtube.com/watch?v=cZ5wOPinZd4");
        return null;
      case "mares":
        document.body.style.backgroundSize="100%";
        fetch("https://derpibooru.org/api/v1/json/search/images?q=scenery,score.gte:1000,safe&sf=random&per_page=1").then(req=>req.json()).then(derp=>document.body.style.backgroundImage=`url(${derp.images[0].representations.full})`);
        return null;
      default:
        break;
    }
    if (!/^[0-9a-zQ-ZA-P]*$/g.test(encodedPreset)) {
      onCorruptedPreset();
      return null;
    }
    let selectedBlocks = { ...this.state.selectedBlocks };
    let presetRegex = /([0-9a-z]+)(?=([Q-ZA-P]+))/g;
    let match;
    while ((match = presetRegex.exec(encodedPreset)) !== null) {
      const encodedColourSetId = match[1];
      const encodedBlockId = match[2];
      const decodedColourSetId = parseInt(encodedColourSetId, 36).toString();
      const decodedPresetIndex = parseInt(
        encodedBlockId
          .replace(/[Q-Z]/g, (match) => {
            return {
              Q: "0",
              R: "1",
              S: "2",
              T: "3",
              U: "4",
              V: "5",
              W: "6",
              X: "7",
              Y: "8",
              Z: "9",
            }[match];
          })
          .toLowerCase(),
        26
      );
      if (!(decodedColourSetId in coloursJSON)) {
        continue;
      }
      const decodedBlock = Object.entries(coloursJSON[decodedColourSetId].blocks).find((elt) => elt[1].presetIndex === decodedPresetIndex);
      if (decodedBlock === undefined) {
        continue;
      }
      const decodedBlockId = decodedBlock[0].toString();
      if (Object.keys(coloursJSON[decodedColourSetId].blocks[decodedBlockId].validVersions).includes(optionValue_version.MCVersion)) {
        selectedBlocks[decodedColourSetId] = decodedBlockId;
      }
    }
    return selectedBlocks;
  };

  onMapPreviewWorker_begin = () => {
    this.setState({ mapPreviewWorker_inProgress: true });
  };

  handleSetMapMaterials = (currentMaterialsData) => {
    this.setState({ currentMaterialsData: currentMaterialsData, mapPreviewWorker_inProgress: false });
  };

  handlePixelEditsChange = (pixelEdits) => {
    this.setState({ pixelEdits: pixelEdits || {}, mapPreviewWorker_inProgress: true });
  };

  onChooseViewOnline3D = () => {
    this.setState({ viewOnline_3D: true });
  };

  handleViewOnline3DEscape = () => {
    this.setState({
      viewOnline_NBT: null,
      viewOnline_3D: false,
    });
  };

  handleAddCustomBlock = (block_colourSetId, block_name, block_nbtTags, block_versions, block_needsSupport, block_flammable) => {
    const { getLocaleString } = this.props;
    // const {coloursJSON} = this.state;
    const block_name_trimmed = block_name.trim();
    if (block_name_trimmed === "") {
      alert(getLocaleString("BLOCK-SELECTION/ADD-CUSTOM/ERROR-NO-NAME"));
      return;
    }
    if (Object.values(block_versions).every((t) => !t)) {
      alert(getLocaleString("BLOCK-SELECTION/ADD-CUSTOM/ERROR-NONE-SELECTED"));
      return;
    }
    let blockToAdd = {
      displayName: block_name_trimmed,
      validVersions: {},
      supportBlockMandatory: block_needsSupport,
      flammable: block_flammable,
      presetIndex: "CUSTOM",
    };
    let addedFirstVersion = false;
    for (const [block_version, block_version_isSelected] of Object.entries(block_versions)) {
      if (!block_version_isSelected) {
        continue;
      }
      if (addedFirstVersion) {
        blockToAdd.validVersions[SupportedVersions[block_version].MCVersion] = `&${Object.keys(blockToAdd.validVersions)[0]}`;
      } else {
        blockToAdd.validVersions[SupportedVersions[block_version].MCVersion] = {
          NBTName: block_name_trimmed,
          NBTArgs: {},
        };
        for (const [nbtTag_key, nbtTag_value] of block_nbtTags) {
          const nbtTag_key_trimmed = nbtTag_key.trim();
          const nbtTag_value_trimmed = nbtTag_value.trim();
          if (!(nbtTag_key_trimmed === "" && nbtTag_value_trimmed === "")) {
            blockToAdd.validVersions[SupportedVersions[block_version].MCVersion].NBTArgs[nbtTag_key_trimmed] = nbtTag_value_trimmed;
          }
        }
        addedFirstVersion = true;
      }
    }

    const customBlocks = JSON.parse(CookieManager.getCookie("mapartcraft_customBlocks"));
    let customBlocks_new = customBlocks.filter(
      (customBlock) =>
        customBlock[0] !== block_colourSetId ||
        customBlock[1].displayName !== block_name_trimmed ||
        !Object.values(SupportedVersions).some(
          (supportedVersion_value) =>
            supportedVersion_value.MCVersion in customBlock[1].validVersions && supportedVersion_value.MCVersion in blockToAdd.validVersions
        )
    ); // filter removes customBlocks that have the same colourSet, name, and some versions in common as the one we are adding. For example this allows us to add different 1.12.2 and 1.13+ versions of a block
    customBlocks_new.push([block_colourSetId, blockToAdd]);

    this.setState((currentState) => {
      return { coloursJSON: this.getMergedColoursJSON(customBlocks_new), selectedBlocks: { ...currentState.selectedBlocks, [block_colourSetId]: "-1" } };
    });
    CookieManager.setCookie("mapartcraft_customBlocks", JSON.stringify(customBlocks_new));
  };

  handleDeleteCustomBlock = (block_colourSetId, block_name, block_versions) => {
    const block_name_trimmed = block_name.trim();
    if (block_name_trimmed === "" || Object.values(block_versions).every((t) => !t)) {
      return;
    }

    let validVersions = [];
    for (const [block_version, block_version_isSelected] of Object.entries(block_versions)) {
      if (block_version_isSelected) {
        validVersions.push(SupportedVersions[block_version].MCVersion);
      }
    }

    const customBlocks = JSON.parse(CookieManager.getCookie("mapartcraft_customBlocks"));
    let customBlocks_new = customBlocks.filter(
      (customBlock) =>
        customBlock[0] !== block_colourSetId ||
        customBlock[1].displayName !== block_name_trimmed ||
        !Object.values(SupportedVersions).some(
          (supportedVersion_value) =>
            supportedVersion_value.MCVersion in customBlock[1].validVersions && validVersions.includes(supportedVersion_value.MCVersion)
        )
    );

    this.setState((currentState) => {
      return {
        coloursJSON: this.getMergedColoursJSON(customBlocks_new),
        selectedBlocks: { ...currentState.selectedBlocks, [block_colourSetId]: "-1" },
        currentMaterialsData: {
          // reset currentMaterialsData as materials.js uses a cached version of materials which could contain blocks which no longer exist
          pixelsData: null,
          maps: [[]],
          currentSelectedBlocks: {},
        },
      };
    });
    CookieManager.setCookie("mapartcraft_customBlocks", JSON.stringify(customBlocks_new));
  };

  render() {
    const { getLocaleString } = this.props;
    const {
      coloursJSON,
      selectedBlocks,
      disabledTones,
      optionValue_version,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
      optionValue_showGridOverlay,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_supportBlock,
      optionValue_transparency,
      optionValue_transparencyTolerance,
      optionValue_mapdatFilenameUseId,
      optionValue_mapdatFilenameIdStart,
      optionValue_betterColour,
      optionValue_dithering,
      optionValue_dithering_propagation_red,
      optionValue_dithering_propagation_green,
      optionValue_dithering_propagation_blue,
      optionValue_dithering_strength,
      optionValue_cleanup_enabled,
      optionValue_cleanup_denoise,
      optionValue_cleanup_denoiseMethod,
      optionValue_cleanup_edges,
      optionValue_cleanup_despeckle,
      optionValue_cleanup_paletteIslands,
      optionValue_cleanup_colours,
      optionValue_cleanup_adaptiveDither,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      optionValue_extras_moreStaircasingOptions,
      optionValue_pixelPerfect,
      optionValue_autoDetectPixelScale,
      optionValue_showPixelGrid,
      optionValue_previewScale,
      optionValue_style,
      stylePreset,
      detectedPixelScale,
      uploadedImage,
      uploadedImage_baseFilename,
      pixelEdits,
      presets,
      selectedPresetName,
      currentMaterialsData,
      mapPreviewWorker_inProgress,
      viewOnline_NBT,
      viewOnline_3D,
    } = this.state;
    return (
      <React.Fragment>
        <StudioPanel
          getLocaleString={getLocaleString}
          stylePreset={stylePreset}
          optionValue_style={optionValue_style}
          onApplyStyle={this.applyStylePreset}
          optionValue_pixelPerfect={optionValue_pixelPerfect}
          onOptionChange_pixelPerfect={this.onOptionChange_pixelPerfect}
          optionValue_autoDetectPixelScale={optionValue_autoDetectPixelScale}
          onOptionChange_autoDetectPixelScale={this.onOptionChange_autoDetectPixelScale}
          optionValue_showPixelGrid={optionValue_showPixelGrid}
          onOptionChange_showPixelGrid={this.onOptionChange_showPixelGrid}
          optionValue_dithering={optionValue_dithering}
          optionValue_dithering_strength={optionValue_dithering_strength}
          onOptionChange_dithering_strength={this.onOptionChange_dithering_strength}
          optionValue_cleanup_enabled={optionValue_cleanup_enabled}
          optionValue_cleanup_denoise={optionValue_cleanup_denoise}
          optionValue_cleanup_denoiseMethod={optionValue_cleanup_denoiseMethod}
          optionValue_cleanup_edges={optionValue_cleanup_edges}
          optionValue_cleanup_despeckle={optionValue_cleanup_despeckle}
          optionValue_cleanup_paletteIslands={optionValue_cleanup_paletteIslands}
          optionValue_cleanup_colours={optionValue_cleanup_colours}
          optionValue_cleanup_adaptiveDither={optionValue_cleanup_adaptiveDither}
          onOptionChange_cleanup_enabled={this.onOptionChange_cleanup_enabled}
          onOptionChange_cleanup_denoise={this.onOptionChange_cleanup_denoise}
          onOptionChange_cleanup_denoiseMethod={this.onOptionChange_cleanup_denoiseMethod}
          onOptionChange_cleanup_edges={this.onOptionChange_cleanup_edges}
          onOptionChange_cleanup_despeckle={this.onOptionChange_cleanup_despeckle}
          onOptionChange_cleanup_paletteIslands={this.onOptionChange_cleanup_paletteIslands}
          onOptionChange_cleanup_colours={this.onOptionChange_cleanup_colours}
          onOptionChange_cleanup_adaptiveDither={this.onOptionChange_cleanup_adaptiveDither}
          onApplyCleanupPreset={this.applyCleanupPreset}
          detectedPixelScale={detectedPixelScale}
          sessionStatus={this.state.sessionStatus}
          onResetSession={this.onResetSession}
          sessionResetAvailable={!this.state.uploadedImage_isPlaceholder}
        />
        <div className="mapartController">
        <BlockSelection
          getLocaleString={getLocaleString}
          coloursJSON={coloursJSON}
          disabledTones={disabledTones}
          onChangeColourSetBlock={this.handleChangeColourSetBlock}
          onToggleColourTone={this.handleToggleColourTone}
          optionValue_version={optionValue_version}
          optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
          optionValue_staircasing={optionValue_staircasing}
          selectedBlocks={selectedBlocks}
          presets={presets}
          selectedPresetName={selectedPresetName}
          canDeletePreset={this.canDeletePreset}
          onPresetChange={this.handlePresetChange}
          onDeletePreset={this.handleDeletePreset}
          onSavePreset={this.handleSavePreset}
          onSharePreset={this.handleSharePreset}
          onGetPDNPaletteClicked={this.handleGetPDNPaletteClicked}
          handleAddCustomBlock={this.handleAddCustomBlock}
          handleDeleteCustomBlock={this.handleDeleteCustomBlock}
        />
        <div className="sectionsPreviewSettingsMaterials">
          <MapPreview
            getLocaleString={getLocaleString}
            coloursJSON={coloursJSON}
            selectedBlocks={selectedBlocks}
            disabledTones={disabledTones}
            optionValue_version={optionValue_version}
            optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
            optionValue_mapSize_x={optionValue_mapSize_x}
            optionValue_mapSize_y={optionValue_mapSize_y}
            optionValue_cropImage={optionValue_cropImage}
            optionValue_cropImage_zoom={optionValue_cropImage_zoom}
            optionValue_cropImage_percent_x={optionValue_cropImage_percent_x}
            optionValue_cropImage_percent_y={optionValue_cropImage_percent_y}
            optionValue_showGridOverlay={optionValue_showGridOverlay}
            optionValue_staircasing={optionValue_staircasing}
            optionValue_whereSupportBlocks={optionValue_whereSupportBlocks}
            optionValue_transparency={optionValue_transparency}
            optionValue_transparencyTolerance={optionValue_transparencyTolerance}
            optionValue_betterColour={optionValue_betterColour}
            optionValue_dithering={optionValue_dithering}
            optionValue_dithering_propagation_red={optionValue_dithering_propagation_red}
            optionValue_dithering_propagation_green={optionValue_dithering_propagation_green}
            optionValue_dithering_propagation_blue={optionValue_dithering_propagation_blue}
            optionValue_dithering_strength={optionValue_dithering_strength}
            optionValue_cleanup_enabled={optionValue_cleanup_enabled}
            optionValue_cleanup_denoise={optionValue_cleanup_denoise}
            optionValue_cleanup_denoiseMethod={optionValue_cleanup_denoiseMethod}
            optionValue_cleanup_edges={optionValue_cleanup_edges}
            optionValue_cleanup_despeckle={optionValue_cleanup_despeckle}
            optionValue_cleanup_paletteIslands={optionValue_cleanup_paletteIslands}
            optionValue_cleanup_colours={optionValue_cleanup_colours}
            optionValue_cleanup_adaptiveDither={optionValue_cleanup_adaptiveDither}
            optionValue_preprocessingEnabled={optionValue_preprocessingEnabled}
            preProcessingValue_brightness={preProcessingValue_brightness}
            preProcessingValue_contrast={preProcessingValue_contrast}
            preProcessingValue_saturation={preProcessingValue_saturation}
            preProcessingValue_backgroundColourSelect={preProcessingValue_backgroundColourSelect}
            preProcessingValue_backgroundColour={preProcessingValue_backgroundColour}
            optionValue_pixelPerfect={optionValue_pixelPerfect}
            optionValue_autoDetectPixelScale={optionValue_autoDetectPixelScale}
            optionValue_showPixelGrid={optionValue_showPixelGrid}
            optionValue_previewScale={optionValue_previewScale}
            optionValue_style={optionValue_style}
            onOptionChange_previewScale={this.onOptionChange_previewScale}
            onPixelScaleDetected={this.onPixelScaleDetected}
            pixelEdits={pixelEdits}
            onPixelEditsChange={this.handlePixelEditsChange}
            editorHotkeysEnabled={viewOnline_NBT === null}
            uploadedImage={uploadedImage}
            onFileDialogEvent={this.onFileDialogEvent}
            onGetMapMaterials={this.handleSetMapMaterials}
            onMapPreviewWorker_begin={this.onMapPreviewWorker_begin}
          />
          <div style={{ display: "block" }}>
            <MapSettings
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              onOptionChange_version={this.onOptionChange_version}
              optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
              onOptionChange_modeNBTOrMapdat={this.onOptionChange_modeNBTOrMapdat}
              optionValue_mapSize_x={optionValue_mapSize_x}
              onOptionChange_mapSize_x={this.onOptionChange_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              onOptionChange_mapSize_y={this.onOptionChange_mapSize_y}
              optionValue_cropImage={optionValue_cropImage}
              onOptionChange_cropImage={this.onOptionChange_cropImage}
              optionValue_cropImage_zoom={optionValue_cropImage_zoom}
              onOptionChange_cropImage_zoom={this.onOptionChange_cropImage_zoom}
              optionValue_cropImage_percent_x={optionValue_cropImage_percent_x}
              onOptionChange_cropImage_percent_x={this.onOptionChange_cropImage_percent_x}
              optionValue_cropImage_percent_y={optionValue_cropImage_percent_y}
              onOptionChange_cropImage_percent_y={this.onOptionChange_cropImage_percent_y}
              optionValue_showGridOverlay={optionValue_showGridOverlay}
              onOptionChange_showGridOverlay={this.onOptionChange_showGridOverlay}
              optionValue_staircasing={optionValue_staircasing}
              onOptionChange_staircasing={this.onOptionChange_staircasing}
              optionValue_whereSupportBlocks={optionValue_whereSupportBlocks}
              onOptionChange_WhereSupportBlocks={this.onOptionChange_WhereSupportBlocks}
              optionValue_supportBlock={optionValue_supportBlock}
              setOption_SupportBlock={this.setOption_SupportBlock}
              optionValue_transparency={optionValue_transparency}
              onOptionChange_transparency={this.onOptionChange_transparency}
              optionValue_transparencyTolerance={optionValue_transparencyTolerance}
              onOptionChange_transparencyTolerance={this.onOptionChange_transparencyTolerance}
              optionValue_mapdatFilenameUseId={optionValue_mapdatFilenameUseId}
              onOptionChange_mapdatFilenameUseId={this.onOptionChange_mapdatFilenameUseId}
              optionValue_mapdatFilenameIdStart={optionValue_mapdatFilenameIdStart}
              onOptionChange_mapdatFilenameIdStart={this.onOptionChange_mapdatFilenameIdStart}
              optionValue_betterColour={optionValue_betterColour}
              onOptionChange_BetterColour={this.onOptionChange_BetterColour}
              optionValue_dithering={optionValue_dithering}
              onOptionChange_dithering={this.onOptionChange_dithering}
              optionValue_dithering_propagation_red={optionValue_dithering_propagation_red}
              onOptionChange_dithering_propagation_red={this.onOptionChange_dithering_propagation_red}
              optionValue_dithering_propagation_green={optionValue_dithering_propagation_green}
              onOptionChange_dithering_propagation_green={this.onOptionChange_dithering_propagation_green}
              optionValue_dithering_propagation_blue={optionValue_dithering_propagation_blue}
              onOptionChange_dithering_propagation_blue={this.onOptionChange_dithering_propagation_blue}
              optionValue_preprocessingEnabled={optionValue_preprocessingEnabled}
              onOptionChange_PreProcessingEnabled={this.onOptionChange_PreProcessingEnabled}
              preProcessingValue_brightness={preProcessingValue_brightness}
              onOptionChange_PreProcessingBrightness={this.onOptionChange_PreProcessingBrightness}
              preProcessingValue_contrast={preProcessingValue_contrast}
              onOptionChange_PreProcessingContrast={this.onOptionChange_PreProcessingContrast}
              preProcessingValue_saturation={preProcessingValue_saturation}
              onOptionChange_PreProcessingSaturation={this.onOptionChange_PreProcessingSaturation}
              preProcessingValue_backgroundColourSelect={preProcessingValue_backgroundColourSelect}
              onOptionChange_PreProcessingBackgroundColourSelect={this.onOptionChange_PreProcessingBackgroundColourSelect}
              preProcessingValue_backgroundColour={preProcessingValue_backgroundColour}
              onOptionChange_PreProcessingBackgroundColour={this.onOptionChange_PreProcessingBackgroundColour}
              optionValue_extras_moreStaircasingOptions={optionValue_extras_moreStaircasingOptions}
              onOptionChange_extras_moreStaircasingOptions={this.onOptionChange_extras_moreStaircasingOptions}
            />
            <GreenButtons
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              selectedBlocks={selectedBlocks}
              optionValue_version={optionValue_version}
              optionValue_modeNBTOrMapdat={optionValue_modeNBTOrMapdat}
              optionValue_mapSize_x={optionValue_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              optionValue_cropImage={optionValue_cropImage}
              optionValue_cropImage_zoom={optionValue_cropImage_zoom}
              optionValue_cropImage_percent_x={optionValue_cropImage_percent_x}
              optionValue_cropImage_percent_y={optionValue_cropImage_percent_y}
              optionValue_staircasing={optionValue_staircasing}
              optionValue_whereSupportBlocks={optionValue_whereSupportBlocks}
              optionValue_supportBlock={optionValue_supportBlock}
              optionValue_transparency={optionValue_transparency}
              optionValue_transparencyTolerance={optionValue_transparencyTolerance}
              optionValue_mapdatFilenameUseId={optionValue_mapdatFilenameUseId}
              optionValue_mapdatFilenameIdStart={optionValue_mapdatFilenameIdStart}
              optionValue_betterColour={optionValue_betterColour}
              optionValue_dithering={optionValue_dithering}
              optionValue_dithering_propagation_red={optionValue_dithering_propagation_red}
              optionValue_dithering_propagation_green={optionValue_dithering_propagation_green}
              optionValue_dithering_propagation_blue={optionValue_dithering_propagation_blue}
              optionValue_preprocessingEnabled={optionValue_preprocessingEnabled}
              preProcessingValue_brightness={preProcessingValue_brightness}
              preProcessingValue_contrast={preProcessingValue_contrast}
              preProcessingValue_saturation={preProcessingValue_saturation}
              preProcessingValue_backgroundColourSelect={preProcessingValue_backgroundColourSelect}
              preProcessingValue_backgroundColour={preProcessingValue_backgroundColour}
              uploadedImage={uploadedImage}
              uploadedImage_baseFilename={uploadedImage_baseFilename}
              currentMaterialsData={currentMaterialsData}
              mapPreviewWorker_inProgress={mapPreviewWorker_inProgress}
              downloadBlobFile={this.downloadBlobFile}
              onGetViewOnlineNBT={this.onGetViewOnlineNBT}
            />
          </div>
          {optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId ? (
            <Materials
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              optionValue_supportBlock={optionValue_supportBlock}
              currentMaterialsData={currentMaterialsData}
              onChangeColourSetBlock={this.handleChangeColourSetBlock}
            />
          ) : null}
        </div>
        {viewOnline_NBT !== null &&
          (viewOnline_3D ? (
            <ViewOnline3D
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              optionValue_mapSize_x={optionValue_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              viewOnline_NBT={viewOnline_NBT}
              handleViewOnline3DEscape={this.handleViewOnline3DEscape}
            />
          ) : (
            <ViewOnline2D
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              optionValue_version={optionValue_version}
              optionValue_mapSize_x={optionValue_mapSize_x}
              optionValue_mapSize_y={optionValue_mapSize_y}
              optionValue_staircasing={optionValue_staircasing}
              viewOnline_NBT={viewOnline_NBT}
              onGetViewOnlineNBT={this.onGetViewOnlineNBT}
              onChooseViewOnline3D={this.onChooseViewOnline3D}
            />
          ))}
        </div>
      </React.Fragment>
    );
  }
}

export default MapartController;
