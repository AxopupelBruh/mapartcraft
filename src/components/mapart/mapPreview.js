import React, { Component, createRef } from "react";

import Tooltip from "../tooltip";
import WorkerBuilder from './workers/worker-builder';
import MapCanvasWorker from "./workers/mapCanvas";

import BackgroundColourModes from "./json/backgroundColourModes.json";
import ColourMethods from "./json/colourMethods.json";
import CropModes from "./json/cropModes.json";
import DitherMethods from "./json/ditherMethods.json";
import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import IMG_Null from "../../images/null.png";
import IMG_Textures from "../../images/textures.png";
import IMG_GridOverlay from "../../images/gridOverlay.png";

import { detectPixelScale } from "./pixelPerfect";

import "./mapPreview.css";

const EDITOR_TOOLS = [
  ["paint", "PIXEL-EDITOR/TOOL-BRUSH", "Brush", "B"],
  ["erase", "PIXEL-EDITOR/TOOL-ERASER", "Eraser", "E"],
  ["pick", "PIXEL-EDITOR/TOOL-PICK", "Eyedropper", "I"],
  ["mask", "PIXEL-EDITOR/TOOL-MASK", "Mask", "M"],
  ["fill", "PIXEL-EDITOR/TOOL-FILL", "Fill", "F"],
  ["line", "PIXEL-EDITOR/TOOL-LINE", "Line", "L"],
  ["rect", "PIXEL-EDITOR/TOOL-RECT", "Rectangle", "U"],
  ["ellipse", "PIXEL-EDITOR/TOOL-ELLIPSE", "Ellipse", "O"],
  ["wand", "PIXEL-EDITOR/TOOL-WAND", "Magic wand", "W"],
  ["lasso", "PIXEL-EDITOR/TOOL-LASSO", "Lasso", "S"],
  ["select", "PIXEL-EDITOR/TOOL-SELECT", "Select", "R"],
  ["move", "PIXEL-EDITOR/TOOL-MOVE", "Move", "V"],
];

const EDITOR_TOOL_KEYS = {
  b: "paint",
  e: "erase",
  i: "pick",
  m: "mask",
  f: "fill",
  l: "line",
  u: "rect",
  o: "ellipse",
  w: "wand",
  s: "lasso",
  r: "select",
  v: "move",
};

const EDITOR_SHAPE_TOOLS = ["line", "rect", "ellipse"];

const EDITOR_BRUSH_SIZES = [1, 2, 3, 5];

class MapPreview extends Component {
  state = {
    workerProgress: 0,
    detectedPixelScale: 1,
    editorEnabled: false,
    editorTool: "paint",
    editorColour: null,
    editorColours: [],
    editorHistoryDepth: 0,
    editorRedoDepth: 0,
    editorBrushSize: 1,
    editorShapeFilled: false,
    editorWandTolerance: 0,
    editorSelection: null,
    editorClipboardInfo: null,
    editorStatus: "",
  };

  mapCanvasWorker = new WorkerBuilder(MapCanvasWorker);

  constructor(props) {
    super(props);
    this.canvasRef_source = createRef(); // hidden source canvas that at all times contains the uploaded image
    this.canvasRef_display = createRef(); // display canvas that displays to the user, may be pixels, may be image
    this.canvasRef_editor = createRef(); // transient overlay for immediate brush feedback
    this.canvasRef_selection = createRef(); // rectangular selection outline
    this.coordsRef = createRef();
    this.fileInputRef = createRef();
    this.editorUndo = [];
    this.editorRedo = [];
    this.editorMap = { ...(props.pixelEdits || {}) };
    this.strokeMap = null;
    this.strokeStartMap = null;
    this.strokeLast = null;
    this.strokeChanged = false;
    this.strokeTool = "paint";
    this.strokePointerId = null;
    this.selectionStartPoint = null;
    this.selectionPointerId = null;
    this.shapeStartPoint = null;
    this.shapePointerId = null;
    this.shapeStartMap = null;
    this.shapeMap = null;
    this.shapeChanged = false;
    this.shapeLastPoint = null;
    this.shapeShift = false;
    this.lassoPoints = null;
    this.lassoPointerId = null;
    this.moveStartPoint = null;
    this.movePointerId = null;
    this.moveStartSelection = null;
    this.moveStartMap = null;
    this.moveContent = null;
    this.moveDelta = { x: 0, y: 0 };
    this.editorClipboard = null;
  }

  t(key, fallback) {
    const { getLocaleString } = this.props;
    const value = getLocaleString ? getLocaleString(key) : null;
    return value || fallback;
  }

  shouldCanvasUpdate_source(prevProps, newProps, prevState, newState) {
    const propChanges = [
      prevProps.coloursJSON === newProps.coloursJSON,
      prevProps.selectedBlocks === newProps.selectedBlocks,
      prevProps.disabledTones === newProps.disabledTones,
      prevProps.optionValue_mapSize_x === newProps.optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y === newProps.optionValue_mapSize_y,
      prevProps.optionValue_cropImage === newProps.optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom === newProps.optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x === newProps.optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y === newProps.optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing === newProps.optionValue_staircasing,
      prevProps.optionValue_preprocessingEnabled === newProps.optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness === newProps.preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast === newProps.preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation === newProps.preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect === newProps.preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour === newProps.preProcessingValue_backgroundColour,
      prevProps.optionValue_pixelPerfect === newProps.optionValue_pixelPerfect,
      prevProps.optionValue_autoDetectPixelScale === newProps.optionValue_autoDetectPixelScale,
      prevProps.uploadedImage === newProps.uploadedImage,
    ];
    return (
      newProps.uploadedImage !== null &&
      prevState.workerProgress === newState.workerProgress &&
      !propChanges.every((elt) => {
        return elt === true;
      })
    );
  }

  shouldCanvasUpdate_display(prevProps, newProps, prevState, newState) {
    // ugly but useful method to determine whether map canvas contents should be redrawn on component update
    const propChanges = [
      prevProps.coloursJSON === newProps.coloursJSON,
      prevProps.selectedBlocks === newProps.selectedBlocks,
      prevProps.disabledTones === newProps.disabledTones,
      prevProps.optionValue_modeNBTOrMapdat === newProps.optionValue_modeNBTOrMapdat,
      prevProps.optionValue_mapSize_x === newProps.optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y === newProps.optionValue_mapSize_y,
      prevProps.optionValue_cropImage === newProps.optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom === newProps.optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x === newProps.optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y === newProps.optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing === newProps.optionValue_staircasing,
      prevProps.optionValue_whereSupportBlocks === newProps.optionValue_whereSupportBlocks,
      prevProps.optionValue_transparency === newProps.optionValue_transparency,
      prevProps.optionValue_transparencyTolerance === newProps.optionValue_transparencyTolerance,
      prevProps.optionValue_betterColour === newProps.optionValue_betterColour,
      prevProps.optionValue_dithering === newProps.optionValue_dithering,
      prevProps.optionValue_dithering_propagation_red === newProps.optionValue_dithering_propagation_red,
      prevProps.optionValue_dithering_propagation_green === newProps.optionValue_dithering_propagation_green,
      prevProps.optionValue_dithering_propagation_blue === newProps.optionValue_dithering_propagation_blue,
      prevProps.optionValue_dithering_strength === newProps.optionValue_dithering_strength,
      prevProps.optionValue_cleanup_enabled === newProps.optionValue_cleanup_enabled,
      prevProps.optionValue_cleanup_denoise === newProps.optionValue_cleanup_denoise,
      prevProps.optionValue_cleanup_denoiseMethod === newProps.optionValue_cleanup_denoiseMethod,
      prevProps.optionValue_cleanup_edges === newProps.optionValue_cleanup_edges,
      prevProps.optionValue_cleanup_despeckle === newProps.optionValue_cleanup_despeckle,
      prevProps.optionValue_cleanup_paletteIslands === newProps.optionValue_cleanup_paletteIslands,
      prevProps.optionValue_cleanup_colours === newProps.optionValue_cleanup_colours,
      prevProps.optionValue_cleanup_adaptiveDither === newProps.optionValue_cleanup_adaptiveDither,
      prevProps.optionValue_preprocessingEnabled === newProps.optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness === newProps.preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast === newProps.preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation === newProps.preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect === newProps.preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour === newProps.preProcessingValue_backgroundColour,
      prevProps.optionValue_pixelPerfect === newProps.optionValue_pixelPerfect,
      prevProps.optionValue_autoDetectPixelScale === newProps.optionValue_autoDetectPixelScale,
      prevProps.optionValue_style === newProps.optionValue_style,
      prevProps.uploadedImage === newProps.uploadedImage,
      prevProps.pixelEdits === newProps.pixelEdits,
    ];
    return (
      newProps.uploadedImage !== null &&
      prevState.workerProgress === newState.workerProgress &&
      !propChanges.every((elt) => {
        return elt === true;
      })
    );
  }

  componentDidMount() {
    window.addEventListener("keydown", this.handleEditorKeyDown, true);
    const canvas = this.canvasRef_display.current;
    if (canvas) {
      canvas.addEventListener("wheel", this.handleEditorWheel, { passive: false });
      canvas.addEventListener("pointermove", this.handleEditorCoordinateMove);
      canvas.addEventListener("pointerleave", this.handleEditorCoordinateLeave);
    }
  }

  componentDidUpdate(prevProps, prevState) {
    if (
      prevProps.uploadedImage !== this.props.uploadedImage ||
      prevProps.optionValue_mapSize_x !== this.props.optionValue_mapSize_x ||
      prevProps.optionValue_mapSize_y !== this.props.optionValue_mapSize_y
    ) {
      this.resetEditorHistory();
    }
    if (prevProps.pixelEdits !== this.props.pixelEdits) {
      this.editorMap = { ...(this.props.pixelEdits || {}) };
    }
    if (prevState.editorEnabled !== this.state.editorEnabled) {
      this.drawEditorSelection();
    }
    if (this.shouldCanvasUpdate_source(prevProps, this.props, prevState, this.state)) {
      this.updateCanvas_source(); // draw uploaded image on source canvas
    }
    if (this.shouldCanvasUpdate_display(prevProps, this.props, prevState, this.state)) {
      this.updateCanvas_display(); // draw pixelart of image on display canvas
    }
  }

  handleEditorKeyDown = (event) => {
    if (!this.state.editorEnabled || this.props.editorHotkeysEnabled === false) return;
    const target = event.target;
    if (target) {
      const tag = (target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) return;
    }

    const key = (event.key || "").toLowerCase();
    // Use the physical letter key when a non-Latin layout is active, so
    // shortcuts keep working with Russian/other keyboard layouts.
    const shortcutKey = event.code && event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : key;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier) {
      if (shortcutKey === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) this.redoEditor();
        else this.undoEditor();
      } else if (shortcutKey === "y") {
        event.preventDefault();
        event.stopPropagation();
        this.redoEditor();
      } else if (shortcutKey === "c" && this.state.editorSelection) {
        event.preventDefault();
        event.stopPropagation();
        this.copyEditorSelection();
      } else if (shortcutKey === "v" && this.state.editorSelection && this.editorClipboard) {
        event.preventDefault();
        event.stopPropagation();
        this.pasteEditorSelection();
      }
      return;
    }
    if (event.altKey || event.repeat) return;

    if (key === "escape") {
      if (this.state.editorSelection) {
        event.preventDefault();
        this.clearEditorSelection();
      }
      return;
    }
    if ((key === "delete" || key === "backspace") && this.state.editorSelection) {
      event.preventDefault();
      event.stopPropagation();
      this.eraseEditorSelection();
      return;
    }
    const tool = EDITOR_TOOL_KEYS[shortcutKey];
    if (tool) {
      event.preventDefault();
      event.stopPropagation();
      this.setEditorTool(tool);
    }
  };

  handleEditorCoordinateMove = (event) => {
    if (!this.coordsRef.current) return;
    const point = this.getCanvasPixel(event);
    this.coordsRef.current.textContent = point ? `X: ${point.x} Y: ${point.y}` : "X: – Y: –";
  };

  handleEditorCoordinateLeave = () => {
    if (this.coordsRef.current) this.coordsRef.current.textContent = "X: – Y: –";
  };

  handleEditorWheel = (event) => {
    if (!this.state.editorEnabled || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const canvas = this.canvasRef_display.current;
    if (!canvas) return;
    const oldScale = Math.max(1, Math.round(this.props.optionValue_previewScale || 2));
    const nextScale = Math.max(1, Math.min(8, oldScale + (event.deltaY < 0 ? 1 : -1)));
    if (nextScale === oldScale || !this.props.onOptionChange_previewScale) return;
    const rect = canvas.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const ratio = nextScale / oldScale;
    this.props.onOptionChange_previewScale(nextScale);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const newRect = canvas.getBoundingClientRect();
        window.scrollBy(newRect.left + localX * ratio - event.clientX, newRect.top + localY * ratio - event.clientY);
      });
    });
  };

  setEditorSelection = (editorSelection) => {
    this.setState({ editorSelection }, this.drawEditorSelection);
  };

  clearEditorSelection = () => {
    if (!this.state.editorSelection) return;
    this.setState({ editorSelection: null, editorStatus: "" }, this.drawEditorSelection);
  };

  drawEditorSelection = () => {
    const canvas = this.canvasRef_selection.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    const selection = this.state.editorSelection;
    if (!selection) return;
    context.fillStyle = "rgba(123, 174, 127, 0.18)";
    if (selection.mask) {
      for (let row = 0; row < selection.height; row++) {
        for (let col = 0; col < selection.width; col++) {
          if (selection.mask[row * selection.width + col]) {
            context.fillRect(selection.x + col, selection.y + row, 1, 1);
          }
        }
      }
    } else {
      context.fillRect(selection.x, selection.y, selection.width, selection.height);
    }
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = "rgba(0, 0, 0, 0.9)";
    context.strokeRect(selection.x + 0.5, selection.y + 0.5, Math.max(1, selection.width - 1), Math.max(1, selection.height - 1));
    context.setLineDash([2, 2]);
    context.strokeStyle = "#fff";
    context.strokeRect(selection.x + 0.5, selection.y + 0.5, Math.max(1, selection.width - 1), Math.max(1, selection.height - 1));
    context.restore();
  };

  getNormalizedSelection = (from, to) => {
    const canvas = this.canvasRef_display.current;
    if (!canvas) return null;
    const x0 = Math.max(0, Math.min(from.x, to.x));
    const y0 = Math.max(0, Math.min(from.y, to.y));
    const x1 = Math.min(canvas.width - 1, Math.max(from.x, to.x));
    const y1 = Math.min(canvas.height - 1, Math.max(from.y, to.y));
    return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  };

  selectMagicWand = (point) => {
    const canvas = this.canvasRef_display.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
    const startIndex = point.y * width + point.x;
    const startOffset = startIndex * 4;
    const target = [data[startOffset], data[startOffset + 1], data[startOffset + 2], data[startOffset + 3]];
    const tolerance = Math.max(0, this.state.editorWandTolerance || 0);
    const seen = new Uint8Array(width * height);
    const stack = [startIndex];
    const region = [];
    let minX = width, minY = height, maxX = 0, maxY = 0;
    while (stack.length) {
      const index = stack.pop();
      if (seen[index]) continue;
      seen[index] = 1;
      const offset = index * 4;
      if (
        Math.abs(data[offset] - target[0]) > tolerance ||
        Math.abs(data[offset + 1] - target[1]) > tolerance ||
        Math.abs(data[offset + 2] - target[2]) > tolerance ||
        Math.abs(data[offset + 3] - target[3]) > tolerance
      ) {
        continue;
      }
      const x = index % width;
      const y = (index - x) / width;
      region.push({ x, y });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (x > 0) stack.push(index - 1);
      if (x + 1 < width) stack.push(index + 1);
      if (y > 0) stack.push(index - width);
      if (y + 1 < height) stack.push(index + width);
    }
    if (!region.length) return;
    const selectionWidth = maxX - minX + 1;
    const selectionHeight = maxY - minY + 1;
    const mask = new Uint8Array(selectionWidth * selectionHeight);
    for (const { x, y } of region) mask[(y - minY) * selectionWidth + (x - minX)] = 1;
    this.setEditorSelection({
      x: minX,
      y: minY,
      width: selectionWidth,
      height: selectionHeight,
      mask,
    });
  };

  drawLassoPreview = () => {
    const canvas = this.canvasRef_selection.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!this.lassoPoints || this.lassoPoints.length < 2) return;
    context.save();
    context.lineWidth = 1;
    context.strokeStyle = "rgba(0, 0, 0, 0.9)";
    context.beginPath();
    context.moveTo(this.lassoPoints[0].x + 0.5, this.lassoPoints[0].y + 0.5);
    for (let i = 1; i < this.lassoPoints.length; i++) {
      context.lineTo(this.lassoPoints[i].x + 0.5, this.lassoPoints[i].y + 0.5);
    }
    context.stroke();
    context.setLineDash([2, 2]);
    context.strokeStyle = "#fff";
    context.beginPath();
    context.moveTo(this.lassoPoints[0].x + 0.5, this.lassoPoints[0].y + 0.5);
    for (let i = 1; i < this.lassoPoints.length; i++) {
      context.lineTo(this.lassoPoints[i].x + 0.5, this.lassoPoints[i].y + 0.5);
    }
    context.stroke();
    context.restore();
  };

  lassoContains = (x, y) => {
    let inside = false;
    const points = this.lassoPoints;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i].x + 0.5, yi = points[i].y + 0.5;
      const xj = points[j].x + 0.5, yj = points[j].y + 0.5;
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };

  finishLasso = (event) => {
    if (this.lassoPointerId !== null && event && event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(this.lassoPointerId);
      } catch (error) {
        // Ignore an already-released pointer.
      }
    }
    const points = this.lassoPoints || [];
    let selection = null;
    if (points.length >= 3) {
      const minX = Math.max(0, Math.min(...points.map((p) => p.x)));
      const maxX = Math.min(this.canvasRef_display.current.width - 1, Math.max(...points.map((p) => p.x)));
      const minY = Math.max(0, Math.min(...points.map((p) => p.y)));
      const maxY = Math.min(this.canvasRef_display.current.height - 1, Math.max(...points.map((p) => p.y)));
      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      if (width > 0 && height > 0) {
        const mask = new Uint8Array(width * height);
        let hasPixels = false;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            if (this.lassoContains(x + 0.5, y + 0.5)) {
              mask[(y - minY) * width + (x - minX)] = 1;
              hasPixels = true;
            }
          }
        }
        if (hasPixels) selection = { x: minX, y: minY, width, height, mask };
      }
    }
    this.lassoPoints = null;
    this.lassoPointerId = null;
    this.setEditorSelection(selection);
  };

  copyEditorSelection = () => {
    const selection = this.state.editorSelection;
    const canvas = this.canvasRef_display.current;
    if (!selection || !canvas) return false;
    const data = canvas.getContext("2d").getImageData(selection.x, selection.y, selection.width, selection.height).data;
    const colours = new Array(selection.width * selection.height).fill(null);
    for (let i = 0; i < colours.length; i++) {
      if (selection.mask && !selection.mask[i]) continue;
      const offset = i * 4;
      if (data[offset + 3] < 128) continue;
      colours[i] = `#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2]
        .toString(16)
        .padStart(2, "0")}`;
    }
    this.editorClipboard = {
      width: selection.width,
      height: selection.height,
      colours,
      mask: selection.mask ? selection.mask.slice() : null,
    };
    this.setState({
      editorClipboardInfo: { width: selection.width, height: selection.height },
      editorStatus: `${this.t("PIXEL-EDITOR/STATUS-COPIED", "Copied")} ${selection.width}×${selection.height}`,
    });
    return true;
  };

  pasteEditorSelection = () => {
    const clipboard = this.editorClipboard;
    const selection = this.state.editorSelection;
    const canvas = this.canvasRef_display.current;
    if (!clipboard || !selection || !canvas) return false;

    const nextMap = { ...this.editorMap };
    const maxWidth = Math.min(clipboard.width, canvas.width - selection.x);
    const maxHeight = Math.min(clipboard.height, canvas.height - selection.y);
    let changed = false;
    let pastedMask = null;
    if (clipboard.mask) pastedMask = new Uint8Array(maxWidth * maxHeight);
    for (let row = 0; row < maxHeight; row++) {
      for (let col = 0; col < maxWidth; col++) {
        const clipboardIndex = row * clipboard.width + col;
        if (clipboard.mask && !clipboard.mask[clipboardIndex]) continue;
        const index = (selection.y + row) * canvas.width + selection.x + col;
        const colour = clipboard.colours[clipboardIndex];
        if (pastedMask) pastedMask[row * maxWidth + col] = 1;
        if (colour) {
          if (nextMap[index] !== colour) {
            nextMap[index] = colour;
            changed = true;
          }
        } else if (nextMap[index] !== undefined) {
          delete nextMap[index];
          changed = true;
        }
      }
    }
    if (!changed) {
      this.setState({ editorStatus: this.t("PIXEL-EDITOR/STATUS-PASTE-NOCHANGE", "Paste made no changes") });
      return true;
    }
    this.commitEditorMap(nextMap, `${this.t("PIXEL-EDITOR/STATUS-PASTED", "Pasted")} ${maxWidth}×${maxHeight}`);
    this.setState(
      {
        editorSelection: {
          x: selection.x,
          y: selection.y,
          width: maxWidth,
          height: maxHeight,
          mask: pastedMask,
        },
      },
      this.drawEditorSelection
    );
    return true;
  };

  fillEditorSelection = () => {
    const selection = this.state.editorSelection;
    const colour = this.state.editorColour || this.state.editorColours[0];
    const canvas = this.canvasRef_display.current;
    if (!selection || !colour || !canvas) return;
    const nextMap = { ...this.editorMap };
    let changed = false;
    for (let row = 0; row < selection.height; row++) {
      for (let col = 0; col < selection.width; col++) {
        if (selection.mask && !selection.mask[row * selection.width + col]) continue;
        const sx = selection.x + col, sy = selection.y + row;
        if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
        const index = sy * canvas.width + sx;
        if (nextMap[index] !== colour) {
          nextMap[index] = colour;
          changed = true;
        }
      }
    }
    if (changed) this.commitEditorMap(nextMap, `${this.t("PIXEL-EDITOR/STATUS-FILLED", "Filled")} ${selection.width}×${selection.height}`);
    else this.setState({ editorStatus: this.t("PIXEL-EDITOR/STATUS-SAME", "Colour already matches") });
  };

  eraseEditorSelection = () => {
    const selection = this.state.editorSelection;
    const canvas = this.canvasRef_display.current;
    if (!selection || !canvas) return;
    const nextMap = { ...this.editorMap };
    let changed = false;
    for (let row = 0; row < selection.height; row++) {
      for (let col = 0; col < selection.width; col++) {
        if (selection.mask && !selection.mask[row * selection.width + col]) continue;
        const sx = selection.x + col, sy = selection.y + row;
        if (sx < 0 || sy < 0 || sx >= canvas.width || sy >= canvas.height) continue;
        const index = sy * canvas.width + sx;
        if (nextMap[index] !== undefined) {
          delete nextMap[index];
          changed = true;
        }
      }
    }
    if (changed) this.commitEditorMap(nextMap, `${this.t("PIXEL-EDITOR/STATUS-CLEARED", "Cleared")} ${selection.width}×${selection.height}`);
    else this.setState({ editorStatus: this.t("PIXEL-EDITOR/STATUS-NO-EDITS", "No edits in selection") });
  };

  getSelectionContent = () => {
    const selection = this.state.editorSelection;
    const canvas = this.canvasRef_display.current;
    if (!selection || !canvas) return null;
    const data = canvas.getContext("2d").getImageData(selection.x, selection.y, selection.width, selection.height).data;
    const colours = new Array(selection.width * selection.height).fill(null);
    for (let i = 0; i < colours.length; i++) {
      if (selection.mask && !selection.mask[i]) continue;
      const offset = i * 4;
      if (data[offset + 3] < 128) continue;
      colours[i] = `#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2]
        .toString(16)
        .padStart(2, "0")}`;
    }
    return {
      selection,
      colours,
      mask: selection.mask ? selection.mask.slice() : null,
      width: selection.width,
      height: selection.height,
    };
  };

  getSelectionBackgroundColour = (selection) => {
    const canvas = this.canvasRef_display.current;
    if (!selection || !canvas) return null;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    const counts = new Map();
    const add = (x, y) => {
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;
      const offset = (y * canvas.width + x) * 4;
      if (data[offset + 3] < 128) return;
      const colour = `#${data[offset].toString(16).padStart(2, "0")}${data[offset + 1].toString(16).padStart(2, "0")}${data[offset + 2]
        .toString(16)
        .padStart(2, "0")}`;
      counts.set(colour, (counts.get(colour) || 0) + 1);
    };
    const x0 = selection.x, y0 = selection.y;
    const x1 = selection.x + selection.width - 1, y1 = selection.y + selection.height - 1;
    for (let x = x0 - 1; x <= x1 + 1; x++) { add(x, y0 - 1); add(x, y1 + 1); }
    for (let y = y0; y <= y1; y++) { add(x0 - 1, y); add(x1 + 1, y); }
    let best = null, bestCount = -1;
    for (const [colour, count] of counts.entries()) {
      if (count > bestCount) { best = colour; bestCount = count; }
    }
    return best;
  };

  clearSelectionSource = (nextMap, selection, canvas, background) => {
    for (let row = 0; row < selection.height; row++) {
      for (let col = 0; col < selection.width; col++) {
        if (selection.mask && !selection.mask[row * selection.width + col]) continue;
        const index = (selection.y + row) * canvas.width + selection.x + col;
        if (background) nextMap[index] = background;
        else if (nextMap[index] !== undefined) delete nextMap[index];
      }
    }
  };

  transformEditorSelection = (kind) => {
    const content = this.getSelectionContent();
    if (!content) return;
    const canvas = this.canvasRef_display.current;
    const { selection, colours, mask, width, height } = content;
    const nextMap = { ...this.editorMap };
    // Replace the vacated area with the dominant colour just outside the
    // fragment, so a moved/transformed piece does not leave the source image
    // visible underneath it.
    const background = this.getSelectionBackgroundColour(selection);
    this.clearSelectionSource(nextMap, selection, canvas, background);

    let newWidth = width;
    let newHeight = height;
    if (kind === "rotate") {
      newWidth = height;
      newHeight = width;
    }
    const anchorX = Math.max(0, Math.min(canvas.width - Math.max(1, newWidth), selection.x + Math.floor((width - newWidth) / 2)));
    const anchorY = Math.max(0, Math.min(canvas.height - Math.max(1, newHeight), selection.y + Math.floor((height - newHeight) / 2)));
    const newMask = mask ? new Uint8Array(newWidth * newHeight) : null;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const sourceIndex = row * width + col;
        if (mask && !mask[sourceIndex]) continue;
        let destCol = col;
        let destRow = row;
        if (kind === "flip-h") destCol = width - 1 - col;
        else if (kind === "flip-v") destRow = height - 1 - row;
        else if (kind === "rotate") {
          destCol = height - 1 - row;
          destRow = col;
        }
        const destX = anchorX + destCol;
        const destY = anchorY + destRow;
        if (destX < 0 || destY < 0 || destX >= canvas.width || destY >= canvas.height) continue;
        if (newMask) newMask[destRow * newWidth + destCol] = 1;
        const destIndex = destY * canvas.width + destX;
        const colour = colours[sourceIndex];
        if (colour) nextMap[destIndex] = colour;
        else delete nextMap[destIndex];
      }
    }

    this.commitEditorMap(
      nextMap,
      this.t(
        kind === "rotate" ? "PIXEL-EDITOR/STATUS-ROTATED" : "PIXEL-EDITOR/STATUS-FLIPPED",
        kind === "rotate" ? "Selection rotated" : "Selection flipped"
      )
    );
    this.setState(
      {
        editorSelection: { x: anchorX, y: anchorY, width: newWidth, height: newHeight, mask: newMask },
      },
      this.drawEditorSelection
    );
  };

  beginMoveSelection = (point, event) => {
    const selection = this.state.editorSelection;
    if (!selection) return;
    const content = this.getSelectionContent();
    if (!content) return;
    this.moveStartPoint = { x: point.x, y: point.y };
    this.movePointerId = event.pointerId;
    this.moveStartSelection = {
      ...selection,
      mask: selection.mask ? selection.mask.slice() : null,
    };
    this.moveStartMap = { ...this.editorMap };
    this.moveContent = content;
    this.moveDelta = { x: 0, y: 0 };
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
  };

  updateMoveSelection = (point) => {
    if (!this.moveStartPoint || !this.moveStartSelection) return;
    const canvas = this.canvasRef_display.current;
    const maxX = Math.max(0, canvas.width - this.moveStartSelection.width);
    const maxY = Math.max(0, canvas.height - this.moveStartSelection.height);
    const x = Math.max(0, Math.min(maxX, this.moveStartSelection.x + point.x - this.moveStartPoint.x));
    const y = Math.max(0, Math.min(maxY, this.moveStartSelection.y + point.y - this.moveStartPoint.y));
    this.moveDelta = { x: x - this.moveStartSelection.x, y: y - this.moveStartSelection.y };
    this.setEditorSelection({
      ...this.moveStartSelection,
      x,
      y,
      mask: this.moveStartSelection.mask ? this.moveStartSelection.mask.slice() : null,
    });
  };

  finishMoveSelection = (event) => {
    if (this.movePointerId !== null && event && event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(this.movePointerId);
      } catch (error) {
        // Ignore an already-released pointer.
      }
    }
    const dx = this.moveDelta.x;
    const dy = this.moveDelta.y;
    if ((dx !== 0 || dy !== 0) && this.moveContent && this.moveStartSelection && this.moveStartMap) {
      const canvas = this.canvasRef_display.current;
      const { width, height, colours, mask } = this.moveContent;
      const nextMap = { ...this.moveStartMap };
      const background = this.getSelectionBackgroundColour(this.moveStartSelection);
      this.clearSelectionSource(nextMap, this.moveStartSelection, canvas, background);
      const destX = this.moveStartSelection.x + dx;
      const destY = this.moveStartSelection.y + dy;
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const sourceIndex = row * width + col;
          if (mask && !mask[sourceIndex]) continue;
          const x = destX + col;
          const y = destY + row;
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const destIndex = y * canvas.width + x;
          const colour = colours[sourceIndex];
          if (colour) nextMap[destIndex] = colour;
          else delete nextMap[destIndex];
        }
      }
      this.commitEditorMap(nextMap, this.t("PIXEL-EDITOR/STATUS-MOVED", "Selection moved"));
      this.setState({
        editorSelection: {
          ...this.moveStartSelection,
          x: destX,
          y: destY,
          mask: this.moveStartSelection.mask ? this.moveStartSelection.mask.slice() : null,
        },
      }, this.drawEditorSelection);
    }
    this.moveStartPoint = null;
    this.movePointerId = null;
    this.moveStartSelection = null;
    this.moveStartMap = null;
    this.moveContent = null;
    this.moveDelta = { x: 0, y: 0 };
  };

  fillEditorAtPoint = (point) => {
    const colour = this.state.editorColour || this.state.editorColours[0];
    const canvas = this.canvasRef_display.current;
    if (!colour || !canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const context = canvas.getContext("2d");
    const imageData = context.getImageData(0, 0, width, height);
    const data = imageData.data;
    const startIndex = point.y * width + point.x;
    const startOffset = startIndex * 4;
    const target = [data[startOffset], data[startOffset + 1], data[startOffset + 2], data[startOffset + 3]];
    const seen = new Uint8Array(width * height);
    const stack = [startIndex];
    const nextMap = { ...this.editorMap };
    let changed = false;
    while (stack.length) {
      const index = stack.pop();
      if (seen[index]) continue;
      seen[index] = 1;
      const offset = index * 4;
      if (
        data[offset] !== target[0] ||
        data[offset + 1] !== target[1] ||
        data[offset + 2] !== target[2] ||
        data[offset + 3] !== target[3]
      ) {
        continue;
      }
      if (nextMap[index] !== colour) {
        nextMap[index] = colour;
        changed = true;
      }
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0) stack.push(index - 1);
      if (x + 1 < width) stack.push(index + 1);
      if (y > 0) stack.push(index - width);
      if (y + 1 < height) stack.push(index + width);
    }
    if (changed) this.commitEditorMap(nextMap, this.t("PIXEL-EDITOR/STATUS-FILL-APPLIED", "Fill applied"));
    else this.setState({ editorStatus: this.t("PIXEL-EDITOR/STATUS-FILL-NOCHANGE", "Fill made no changes") });
  };

  commitEditorMap = (nextMap, editorStatus) => {
    this.editorUndo.push({ ...this.editorMap });
    if (this.editorUndo.length > 40) this.editorUndo.shift();
    this.editorRedo = [];
    this.editorMap = { ...nextMap };
    this.clearEditorOverlay();
    if (this.props.onPixelEditsChange) this.props.onPixelEditsChange({ ...nextMap });
    this.setState({
      editorHistoryDepth: this.editorUndo.length,
      editorRedoDepth: 0,
      editorStatus,
    });
  };

  closestSmoothColourTo(colourHex) {
    const { coloursJSON, selectedBlocks, disabledTones, optionValue_modeNBTOrMapdat, optionValue_staircasing } = this.props;
    const rgbGroups_input = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(colourHex);
    const colourRGB_input = [parseInt(rgbGroups_input[1], 16), parseInt(rgbGroups_input[2], 16), parseInt(rgbGroups_input[3], 16)];
    const mapMode = Object.values(MapModes).find((mode) => mode.uniqueId === optionValue_modeNBTOrMapdat);
    const staircaseMode = mapMode && Object.values(mapMode.staircaseModes).find((mode) => mode.uniqueId === optionValue_staircasing);
    const toneKeys = staircaseMode ? staircaseMode.toneKeys : [];
    let smallestDistance = 9999999;
    let colourRGB_return = null;
    for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
      if (selectedBlocks[colourSetId] === "-1") continue;
      for (const toneKey of toneKeys) {
        if (disabledTones[colourSetId]?.has(toneKey)) continue;
        const colourRGB_colourSet = colourSet.tonesRGB[toneKey];
        const colourDistance =
          Math.pow(colourRGB_input[0] - colourRGB_colourSet[0], 2) +
          Math.pow(colourRGB_input[1] - colourRGB_colourSet[1], 2) +
          Math.pow(colourRGB_input[2] - colourRGB_colourSet[2], 2);
        if (colourDistance < smallestDistance) {
          smallestDistance = colourDistance;
          colourRGB_return = colourRGB_colourSet;
        }
      }
    }
    if (colourRGB_return === null) return colourHex.startsWith("#") ? colourHex : `#${colourHex}`;
    return `#${colourRGB_return.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
  }

  updateCanvas_source() {
    const {
      selectedBlocks,
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      uploadedImage,
      optionValue_pixelPerfect,
      optionValue_autoDetectPixelScale,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
      onPixelScaleDetected,
    } = this.props;
    if (!uploadedImage) return;

    const { canvasRef_source } = this;
    const ctx_source = canvasRef_source.current.getContext("2d");
    const detectedScale =
      optionValue_pixelPerfect && optionValue_autoDetectPixelScale ? detectPixelScale(uploadedImage) : 1;
    if (this.state.detectedPixelScale !== detectedScale) {
      this.setState({ detectedPixelScale: detectedScale });
      if (onPixelScaleDetected) onPixelScaleDetected(detectedScale);
    } else if (onPixelScaleDetected) {
      onPixelScaleDetected(detectedScale);
    }

    // Pixel-perfect uses nearest-neighbour everywhere. Smooth is an explicit
    // opt-in for photos and deliberately keeps the old high-quality path.
    const useNearest = optionValue_pixelPerfect;
    ctx_source.imageSmoothingEnabled = !useNearest;
    ctx_source.imageSmoothingQuality = useNearest ? "low" : "high";
    ctx_source.clearRect(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);

    let drawSource = uploadedImage;
    let sourceWidth = uploadedImage.width;
    let sourceHeight = uploadedImage.height;
    if (useNearest && detectedScale > 1) {
      // Collapse the source's repeated pixel blocks to native art pixels first,
      // then let the canvas scale those native pixels to the map resolution.
      const nativeCanvas = document.createElement("canvas");
      nativeCanvas.width = Math.max(1, Math.round(uploadedImage.width / detectedScale));
      nativeCanvas.height = Math.max(1, Math.round(uploadedImage.height / detectedScale));
      const nativeContext = nativeCanvas.getContext("2d");
      nativeContext.imageSmoothingEnabled = false;
      nativeContext.drawImage(uploadedImage, 0, 0, nativeCanvas.width, nativeCanvas.height);
      drawSource = nativeCanvas;
      sourceWidth = nativeCanvas.width;
      sourceHeight = nativeCanvas.height;
    }

    if (optionValue_preprocessingEnabled) {
      if (preProcessingValue_backgroundColourSelect !== BackgroundColourModes.OFF.uniqueId && /^#?[a-f\d]{6}$/i.test(preProcessingValue_backgroundColour)) {
        let backgroundColour;
        if (
          preProcessingValue_backgroundColourSelect === BackgroundColourModes.SMOOTH.uniqueId &&
          !Object.values(selectedBlocks).every((selectedBlockId) => selectedBlockId === "-1")
        ) {
          backgroundColour = this.closestSmoothColourTo(preProcessingValue_backgroundColour);
        } else {
          backgroundColour = preProcessingValue_backgroundColour;
        }
        ctx_source.filter = "none"; // this needs to be present to stop filters affecting background colour
        ctx_source.fillStyle = backgroundColour;
        ctx_source.fillRect(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
      }
      ctx_source.filter = `brightness(${preProcessingValue_brightness}%) contrast(${preProcessingValue_contrast}%) saturate(${preProcessingValue_saturation}%)`;
    } else {
      ctx_source.filter = "none";
    }

    switch (optionValue_cropImage) {
      case CropModes.OFF.uniqueId: {
        ctx_source.drawImage(drawSource, 0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
        break;
      }
      case CropModes.CENTER.uniqueId:
      case CropModes.MANUAL.uniqueId: {
        const img_width = sourceWidth;
        const img_height = sourceHeight;
        let samplingWidth;
        let samplingHeight;
        let samplingOffset_x;
        let samplingOffset_y;
        if (img_width * optionValue_mapSize_y > img_height * optionValue_mapSize_x) {
          // image w/h greater than canvas w/h
          samplingWidth = Math.floor((10 * img_height * optionValue_mapSize_x) / (optionValue_mapSize_y * optionValue_cropImage_zoom));
          // the 10 is because the input is from 10 to 50 in steps of 1; scale down by 10
          samplingHeight = Math.floor((10 * img_height) / optionValue_cropImage_zoom);
          samplingOffset_x = Math.floor((optionValue_cropImage_percent_x * (img_width - samplingWidth)) / 100);
          samplingOffset_y = Math.floor((optionValue_cropImage_percent_y * (img_height - samplingHeight)) / 100);
        } else {
          // image w/h leq canvas w/h
          samplingWidth = Math.floor((10 * img_width) / optionValue_cropImage_zoom);
          samplingHeight = Math.floor((10 * img_width * optionValue_mapSize_y) / (optionValue_mapSize_x * optionValue_cropImage_zoom));
          samplingOffset_x = Math.floor((optionValue_cropImage_percent_x * (img_width - samplingWidth)) / 100);
          samplingOffset_y = Math.floor((optionValue_cropImage_percent_y * (img_height - samplingHeight)) / 100);
        }
        ctx_source.drawImage(
          drawSource,
          samplingOffset_x,
          samplingOffset_y,
          samplingWidth,
          samplingHeight,
          0,
          0,
          ctx_source.canvas.width,
          ctx_source.canvas.height
        );
        break;
      }
      default: {
        throw new Error("Unknown optionValue_cropImage");
      }
    }
  }

  updateCanvas_display() {
    this.mapCanvasWorker.terminate();
    const { canvasRef_source, canvasRef_display } = this;
    const {
      coloursJSON,
      selectedBlocks,
      disabledTones,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_transparency,
      optionValue_transparencyTolerance,
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
      optionValue_style,
      pixelEdits,
      onGetMapMaterials,
      onMapPreviewWorker_begin,
    } = this.props;
    const ctx_source = canvasRef_source.current.getContext("2d");
    const canvasImageData = ctx_source.getImageData(0, 0, ctx_source.canvas.width, ctx_source.canvas.height);
    const t0 = performance.now();
    this.mapCanvasWorker = new WorkerBuilder(MapCanvasWorker);
    this.mapCanvasWorker.onmessage = (e) => {
      if (e.data.head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") {
        const t1 = performance.now();
        console.log(`Calculated map preview data in ${(t1 - t0).toString()}ms`);
        const ctx_display = canvasRef_display.current.getContext("2d");
        ctx_display.imageSmoothingEnabled = false;
        ctx_display.putImageData(e.data.body.pixels, 0, 0);
        this.clearEditorOverlay();
        if (this.state.editorEnabled) this.refreshEditorColours(e.data.body.pixels.data);
        this.setState({ workerProgress: 1 });
        onGetMapMaterials({
          pixelsData: e.data.body.pixels.data,
          pixelsWidth: canvasRef_display.current.width,
          pixelsHeight: canvasRef_display.current.height,
          maps: e.data.body.maps,
          currentSelectedBlocks: e.data.body.currentSelectedBlocks,
        });
      } else if (e.data.head === "PROGRESS_REPORT") {
        this.setState({ workerProgress: e.data.body });
      }
    };
    onMapPreviewWorker_begin();
    this.mapCanvasWorker.postMessage({
      head: "PIXELS",
      body: {
        coloursJSON: coloursJSON,
        MapModes: MapModes,
        WhereSupportBlocksModes: WhereSupportBlocksModes,
        ColourMethods: ColourMethods,
        DitherMethods: DitherMethods,
        canvasImageData: canvasImageData,
        selectedBlocks: selectedBlocks,
        disabledTones: disabledTones,
        optionValue_modeNBTOrMapdat: optionValue_modeNBTOrMapdat,
        optionValue_mapSize_x: optionValue_mapSize_x,
        optionValue_mapSize_y: optionValue_mapSize_y,
        optionValue_staircasing: optionValue_staircasing,
        optionValue_whereSupportBlocks: optionValue_whereSupportBlocks,
        optionValue_transparency: optionValue_transparency,
        optionValue_transparencyTolerance: optionValue_transparencyTolerance,
        optionValue_betterColour: optionValue_betterColour,
        optionValue_dithering: optionValue_dithering,
        optionValue_dithering_propagation_red: optionValue_dithering_propagation_red,
        optionValue_dithering_propagation_green: optionValue_dithering_propagation_green,
        optionValue_dithering_propagation_blue: optionValue_dithering_propagation_blue,
        optionValue_dithering_strength: optionValue_dithering_strength,
        optionValue_cleanup_enabled: optionValue_cleanup_enabled,
        optionValue_cleanup_denoise: optionValue_cleanup_denoise,
        optionValue_cleanup_denoiseMethod: optionValue_cleanup_denoiseMethod,
        optionValue_cleanup_edges: optionValue_cleanup_edges,
        optionValue_cleanup_despeckle: optionValue_cleanup_despeckle,
        optionValue_cleanup_paletteIslands: optionValue_cleanup_paletteIslands,
        optionValue_cleanup_colours: optionValue_cleanup_colours,
        optionValue_cleanup_adaptiveDither: optionValue_cleanup_adaptiveDither,
        optionValue_style: optionValue_style,
        pixelEdits: pixelEdits || {},
      },
    });
  }

  resetEditorHistory = () => {
    this.editorUndo = [];
    this.editorRedo = [];
    this.editorMap = { ...(this.props.pixelEdits || {}) };
    this.strokeMap = null;
    this.strokeStartMap = null;
    this.strokeLast = null;
    this.strokeChanged = false;
    this.selectionStartPoint = null;
    this.selectionPointerId = null;
    this.shapeStartPoint = null;
    this.shapePointerId = null;
    this.shapeStartMap = null;
    this.shapeMap = null;
    this.shapeChanged = false;
    this.shapeLastPoint = null;
    this.shapeShift = false;
    this.moveStartPoint = null;
    this.movePointerId = null;
    this.moveStartSelection = null;
    this.moveStartMap = null;
    this.moveContent = null;
    this.moveDelta = { x: 0, y: 0 };
    this.lassoPoints = null;
    this.lassoPointerId = null;
    const hadSelection = this.state.editorSelection !== null;
    if (this.state.editorHistoryDepth !== 0 || this.state.editorRedoDepth !== 0 || hadSelection) {
      this.setState(
        {
          editorHistoryDepth: 0,
          editorRedoDepth: 0,
          editorSelection: null,
          editorStatus: "",
        },
        this.drawEditorSelection
      );
    }
  };

  clearEditorOverlay = () => {
    const canvas = this.canvasRef_editor.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  };

  refreshEditorColours = (pixelsData = null) => {
    const canvas = this.canvasRef_display.current;
    if (!canvas) return;
    let pixels = pixelsData;
    if (!pixels) {
      try {
        pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      } catch (error) {
        return;
      }
    }
    const unique = new Set();
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 128) continue;
      unique.add((pixels[i] << 16) + (pixels[i + 1] << 8) + pixels[i + 2]);
      if (unique.size > 2048) break;
    }
    const colours = Array.from(unique, (colour) => `#${colour.toString(16).padStart(6, "0")}`).sort();
    if (colours.join(",") === this.state.editorColours.join(",")) return;
    const current = this.state.editorColour;
    this.setState({
      editorColours: colours,
      editorColour: current && colours.includes(current) ? current : colours[0] || null,
    });
  };

  onToggleEditor = () => {
    const editorEnabled = !this.state.editorEnabled;
    this.clearEditorOverlay();
    if (editorEnabled) this.refreshEditorColours();
    this.setState({ editorEnabled, editorStatus: "" }, this.drawEditorSelection);
  };

  setEditorTool = (editorTool) => {
    this.setState({ editorTool, editorStatus: "" });
  };

  getCanvasPixel = (event) => {
    const canvas = this.canvasRef_display.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
    return { x, y, index: y * canvas.width + x };
  };

  getDisplayColour = (x, y) => {
    const canvas = this.canvasRef_display.current;
    if (!canvas) return null;
    const data = canvas.getContext("2d").getImageData(x, y, 1, 1).data;
    if (data[3] < 128) return null;
    return `#${data[0].toString(16).padStart(2, "0")}${data[1].toString(16).padStart(2, "0")}${data[2].toString(16).padStart(2, "0")}`;
  };

  drawEditorPreviewPixel = (x, y, colour) => {
    const canvas = this.canvasRef_editor.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.clearRect(x, y, 1, 1);
    if (colour === "mask") {
      context.fillStyle = "rgba(255, 255, 255, 0.45)";
      context.fillRect(x, y, 1, 1);
      return;
    }
    if (colour) {
      context.fillStyle = colour;
      context.fillRect(x, y, 1, 1);
      return;
    }
    // For the eraser, show the source pixel immediately. The real dithered
    // result replaces this approximation as soon as the preview worker finishes.
    const source = this.canvasRef_source.current;
    if (!source) return;
    const pixel = source.getContext("2d").getImageData(x, y, 1, 1).data;
    if (pixel[3] === 0) return;
    context.fillStyle = `rgba(${pixel[0]}, ${pixel[1]}, ${pixel[2]}, ${pixel[3] / 255})`;
    context.fillRect(x, y, 1, 1);
  };

  applyStrokePoint = (x, y) => {
    if (!this.strokeMap) return;
    const canvas = this.canvasRef_display.current;
    if (!canvas) return;
    const width = canvas.width;
    const height = canvas.height;
    const size = Math.max(1, this.state.editorBrushSize || 1);
    const offset = Math.floor((size - 1) / 2);
    const colour = this.strokeTool === "mask" ? "mask" : this.state.editorColour || this.state.editorColours[0];
    if (this.strokeTool !== "erase" && !colour) return;
    for (let dy = 0; dy < size; dy++) {
      const ny = y - offset + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = 0; dx < size; dx++) {
        const nx = x - offset + dx;
        if (nx < 0 || nx >= width) continue;
        const index = ny * width + nx;
        const exist = this.strokeMap[index];
        if (this.strokeTool === "erase") {
          if (!exist) continue;
          delete this.strokeMap[index];
          this.strokeChanged = true;
          this.drawEditorPreviewPixel(nx, ny, null);
        } else if (exist !== colour) {
          this.strokeMap[index] = colour;
          this.strokeChanged = true;
          this.drawEditorPreviewPixel(nx, ny, colour);
        }
      }
    }
  };

  paintStrokeTo = (x, y) => {
    if (!this.strokeLast) {
      this.applyStrokePoint(x, y);
      this.strokeLast = { x, y };
      return;
    }
    const from = this.strokeLast;
    const steps = Math.max(Math.abs(x - from.x), Math.abs(y - from.y));
    for (let step = 1; step <= steps; step++) {
      this.applyStrokePoint(
        Math.round(from.x + ((x - from.x) * step) / steps),
        Math.round(from.y + ((y - from.y) * step) / steps)
      );
    }
    if (steps === 0) this.applyStrokePoint(x, y);
    this.strokeLast = { x, y };
  };

  getShapeIndices = (start, end, tool, filled) => {
    const canvas = this.canvasRef_display.current;
    if (!canvas) return new Set();
    const width = canvas.width;
    const height = canvas.height;
    const indices = new Set();
    const add = (x, y) => {
      if (x >= 0 && y >= 0 && x < width && y < height) indices.add(y * width + x);
    };
    if (tool === "line") {
      let x0 = start.x, y0 = start.y;
      const x1 = end.x, y1 = end.y;
      const dx = Math.abs(x1 - x0);
      const sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0);
      const sy = y0 < y1 ? 1 : -1;
      let error = dx + dy;
      while (true) {
        add(x0, y0);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * error;
        if (e2 >= dy) { error += dy; x0 += sx; }
        if (e2 <= dx) { error += dx; y0 += sy; }
      }
    } else if (tool === "rect") {
      const x0 = Math.min(start.x, end.x), x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y), y1 = Math.max(start.y, end.y);
      if (filled) {
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) add(x, y);
      } else {
        for (let x = x0; x <= x1; x++) { add(x, y0); add(x, y1); }
        for (let y = y0; y <= y1; y++) { add(x0, y); add(x1, y); }
      }
    } else if (tool === "ellipse") {
      const x0 = Math.min(start.x, end.x), x1 = Math.max(start.x, end.x);
      const y0 = Math.min(start.y, end.y), y1 = Math.max(start.y, end.y);
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const rx = Math.max(0.5, (x1 - x0) / 2);
      const ry = Math.max(0.5, (y1 - y0) / 2);
      for (let y = y0; y <= y1; y++) {
        const dy = (y - cy) / ry;
        if (Math.abs(dy) > 1) continue;
        const dx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
        const xa = Math.round(cx - dx);
        const xb = Math.round(cx + dx);
        if (filled) {
          for (let x = xa; x <= xb; x++) add(x, y);
        } else {
          add(xa, y);
          add(xb, y);
        }
      }
    }
    return indices;
  };

  drawShapePreview = (indices, colour) => {
    this.clearEditorOverlay();
    if (!colour) return;
    const canvas = this.canvasRef_display.current;
    if (!canvas) return;
    const width = canvas.width;
    for (const index of indices) {
      const x = index % width;
      const y = (index - x) / width;
      this.drawEditorPreviewPixel(x, y, colour);
    }
  };

  constrainShapeEnd = (start, end, tool, shiftKey) => {
    if (!shiftKey) return end;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    if (tool === "line") {
      if (Math.abs(dx) >= Math.abs(dy) * 2) return { x: end.x, y: start.y };
      if (Math.abs(dy) >= Math.abs(dx) * 2) return { x: start.x, y: end.y };
      const length = Math.max(Math.abs(dx), Math.abs(dy));
      return {
        x: start.x + (dx < 0 ? -length : length),
        y: start.y + (dy < 0 ? -length : length),
      };
    }
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    return { x: start.x + sx * size, y: start.y + sy * size };
  };

  expandShapeIndices = (indices, size) => {
    if (size <= 1) return indices;
    const canvas = this.canvasRef_display.current;
    if (!canvas) return indices;
    const offset = Math.floor((size - 1) / 2);
    const expanded = new Set();
    for (const index of indices) {
      const x = index % canvas.width;
      const y = (index - x) / canvas.width;
      for (let dy = 0; dy < size; dy++) {
        const ny = y - offset + dy;
        if (ny < 0 || ny >= canvas.height) continue;
        for (let dx = 0; dx < size; dx++) {
          const nx = x - offset + dx;
          if (nx < 0 || nx >= canvas.width) continue;
          expanded.add(ny * canvas.width + nx);
        }
      }
    }
    return expanded;
  };

  updateShapePreview = (point, shiftKey = false) => {
    if (!this.shapeStartPoint || !this.shapeStartMap) return;
    const colour = this.state.editorColour || this.state.editorColours[0];
    if (!colour) return;
    const end = this.constrainShapeEnd(this.shapeStartPoint, point, this.state.editorTool, shiftKey);
    this.shapeLastPoint = end;
    this.shapeShift = shiftKey;
    let indices = this.getShapeIndices(this.shapeStartPoint, end, this.state.editorTool, this.state.editorShapeFilled);
    if (this.state.editorBrushSize > 1 && (this.state.editorTool === "line" || !this.state.editorShapeFilled)) {
      indices = this.expandShapeIndices(indices, this.state.editorBrushSize);
    }
    const nextMap = { ...this.shapeStartMap };
    for (const index of indices) nextMap[index] = colour;
    this.shapeMap = nextMap;
    this.shapeChanged = indices.size > 0;
    this.drawShapePreview(indices, colour);
  };

  finishShape = (event) => {
    if (this.shapePointerId !== null && event && event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(this.shapePointerId);
      } catch (error) {
        // The pointer may already have been released by the browser.
      }
    }
    if (this.shapeChanged && this.shapeMap) {
      this.commitEditorMap(this.shapeMap, this.t("PIXEL-EDITOR/STATUS-SHAPE", "Shape applied"));
    } else {
      this.clearEditorOverlay();
    }
    this.shapeStartPoint = null;
    this.shapePointerId = null;
    this.shapeStartMap = null;
    this.shapeMap = null;
    this.shapeChanged = false;
  };

  onEditorPointerDown = (event) => {
    if (!this.state.editorEnabled) return;
    const point = this.getCanvasPixel(event);
    if (!point) return;

    if (event.button === 1 || (event.button === 0 && this.state.editorTool === "pick")) {
      event.preventDefault();
      const colour = this.getDisplayColour(point.x, point.y);
      if (colour) this.setState({ editorColour: colour, editorTool: "paint", editorStatus: "" });
      return;
    }
    if (event.button !== 0 && event.button !== 2) return;

    if (this.state.editorTool === "wand") {
      if (event.button !== 0) return;
      event.preventDefault();
      this.selectMagicWand(point);
      return;
    }

    if (this.state.editorTool === "lasso") {
      if (event.button !== 0) return;
      event.preventDefault();
      this.lassoPoints = [{ x: point.x, y: point.y }];
      this.lassoPointerId = event.pointerId;
      this.setState({ editorSelection: null, editorStatus: "" }, this.drawLassoPreview);
      if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (this.state.editorTool === "move") {
      if (event.button !== 0) return;
      event.preventDefault();
      this.beginMoveSelection(point, event);
      return;
    }

    if (this.state.editorTool === "select") {
      event.preventDefault();
      if (event.button === 2) {
        this.clearEditorSelection();
        return;
      }
      this.selectionStartPoint = { x: point.x, y: point.y };
      this.selectionPointerId = event.pointerId;
      this.setEditorSelection({ x: point.x, y: point.y, width: 1, height: 1 });
      if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (this.state.editorTool === "fill") {
      if (event.button !== 0) return;
      event.preventDefault();
      this.fillEditorAtPoint(point);
      return;
    }

    if (EDITOR_SHAPE_TOOLS.includes(this.state.editorTool)) {
      if (event.button !== 0) return;
      if (!this.state.editorColour && !this.state.editorColours[0]) return;
      event.preventDefault();
      this.shapeStartPoint = { x: point.x, y: point.y };
      this.shapePointerId = event.pointerId;
      this.shapeStartMap = { ...this.editorMap };
      this.shapeMap = { ...this.editorMap };
      this.shapeChanged = false;
      if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
      this.updateShapePreview(point, event.shiftKey);
      return;
    }

    event.preventDefault();
    this.strokeTool =
      event.button === 2 ? "erase" : this.state.editorTool === "erase" ? "erase" : this.state.editorTool === "mask" ? "mask" : "paint";
    if (this.strokeTool === "paint" && !this.state.editorColour && !this.state.editorColours[0]) return;
    this.strokeStartMap = { ...this.editorMap };
    this.strokeMap = { ...this.editorMap };
    this.strokeLast = null;
    this.strokeChanged = false;
    this.strokePointerId = event.pointerId;
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId);
    this.paintStrokeTo(point.x, point.y);
  };

  onEditorPointerMove = (event) => {
    if (this.moveStartPoint && event.pointerId === this.movePointerId) {
      const point = this.getCanvasPixel(event);
      if (!point) return;
      event.preventDefault();
      this.updateMoveSelection(point);
      return;
    }
    if (this.lassoPoints && event.pointerId === this.lassoPointerId) {
      const point = this.getCanvasPixel(event);
      if (!point) return;
      const last = this.lassoPoints[this.lassoPoints.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) {
        this.lassoPoints.push(point);
        event.preventDefault();
        this.drawLassoPreview();
      }
      return;
    }
    if (this.shapeStartPoint && event.pointerId === this.shapePointerId) {
      const point = this.getCanvasPixel(event);
      if (!point) return;
      event.preventDefault();
      this.updateShapePreview(point, event.shiftKey);
      return;
    }
    if (this.selectionStartPoint && event.pointerId === this.selectionPointerId) {
      const point = this.getCanvasPixel(event);
      if (!point) return;
      event.preventDefault();
      this.setEditorSelection(this.getNormalizedSelection(this.selectionStartPoint, point));
      return;
    }
    if (!this.strokeMap || event.pointerId !== this.strokePointerId) return;
    const point = this.getCanvasPixel(event);
    if (!point) return;
    event.preventDefault();
    this.paintStrokeTo(point.x, point.y);
  };

  finishEditorStroke = (event) => {
    if (this.moveStartPoint) {
      this.finishMoveSelection(event);
      return;
    }
    if (this.lassoPoints) {
      this.finishLasso(event);
      return;
    }
    if (this.shapeStartPoint) {
      this.finishShape(event);
      return;
    }
    if (this.selectionStartPoint) {
      if (event && event.currentTarget.releasePointerCapture) {
        try {
          event.currentTarget.releasePointerCapture(this.selectionPointerId);
        } catch (error) {
          // The pointer may already have been released by the browser.
        }
      }
      this.selectionStartPoint = null;
      this.selectionPointerId = null;
      return;
    }
    if (!this.strokeMap) return;
    if (event && event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(this.strokePointerId);
      } catch (error) {
        // The pointer may already have been released by the browser.
      }
    }
    const hadChanges = this.strokeChanged;
    if (hadChanges) {
      this.editorUndo.push(this.strokeStartMap);
      if (this.editorUndo.length > 40) this.editorUndo.shift();
      this.editorRedo = [];
      this.editorMap = { ...this.strokeMap };
      if (this.props.onPixelEditsChange) this.props.onPixelEditsChange({ ...this.strokeMap });
    } else {
      this.clearEditorOverlay();
    }
    this.strokeMap = null;
    this.strokeStartMap = null;
    this.strokeLast = null;
    this.strokeChanged = false;
    this.setState({
      editorHistoryDepth: this.editorUndo.length,
      editorRedoDepth: 0,
    });
  };

  onEditorPointerCancel = () => {
    if (this.moveStartPoint) {
      const selection = this.moveStartSelection;
      this.moveStartPoint = null;
      this.movePointerId = null;
      this.moveStartSelection = null;
      this.moveStartMap = null;
      this.moveContent = null;
      this.moveDelta = { x: 0, y: 0 };
      this.setEditorSelection(selection);
      return;
    }
    if (this.lassoPoints) {
      this.lassoPoints = null;
      this.lassoPointerId = null;
      this.drawEditorSelection();
      return;
    }
    if (this.shapeStartPoint) {
      this.shapeStartPoint = null;
      this.shapePointerId = null;
      this.shapeStartMap = null;
      this.shapeMap = null;
      this.shapeChanged = false;
      this.clearEditorOverlay();
      return;
    }
    if (this.selectionStartPoint) {
      this.selectionStartPoint = null;
      this.selectionPointerId = null;
      this.clearEditorSelection();
      return;
    }
    if (!this.strokeMap) return;
    // Cancel the in-flight stroke and restore the pre-stroke preview.
    this.strokeMap = null;
    this.strokeStartMap = null;
    this.strokeLast = null;
    this.strokeChanged = false;
    this.clearEditorOverlay();
    this.updateCanvas_display();
  };

  undoEditor = () => {
    if (!this.editorUndo.length) return;
    const current = { ...this.editorMap };
    const previous = this.editorUndo.pop();
    this.editorRedo.push(current);
    this.editorMap = { ...previous };
    this.clearEditorOverlay();
    if (this.props.onPixelEditsChange) this.props.onPixelEditsChange({ ...previous });
    this.setState({
      editorHistoryDepth: this.editorUndo.length,
      editorRedoDepth: this.editorRedo.length,
    });
  };

  redoEditor = () => {
    if (!this.editorRedo.length) return;
    const current = { ...this.editorMap };
    const next = this.editorRedo.pop();
    this.editorUndo.push(current);
    this.editorMap = { ...next };
    this.clearEditorOverlay();
    if (this.props.onPixelEditsChange) this.props.onPixelEditsChange({ ...next });
    this.setState({
      editorHistoryDepth: this.editorUndo.length,
      editorRedoDepth: this.editorRedo.length,
    });
  };

  clearEditorEdits = () => {
    if (!Object.keys(this.editorMap).length) return;
    this.editorUndo.push({ ...this.editorMap });
    if (this.editorUndo.length > 40) this.editorUndo.shift();
    this.editorRedo = [];
    this.editorMap = {};
    this.clearEditorOverlay();
    if (this.props.onPixelEditsChange) this.props.onPixelEditsChange({});
    this.setState({
      editorHistoryDepth: this.editorUndo.length,
      editorRedoDepth: 0,
    });
  };

  increasePreviewScale = () => {
    const { optionValue_previewScale, onOptionChange_previewScale } = this.props;
    if (onOptionChange_previewScale) onOptionChange_previewScale(optionValue_previewScale + 1);
  };

  decreasePreviewScale = () => {
    const { optionValue_previewScale, onOptionChange_previewScale } = this.props;
    if (onOptionChange_previewScale) onOptionChange_previewScale(optionValue_previewScale - 1);
  };

  setPreviewScaleOne = () => {
    const { onOptionChange_previewScale } = this.props;
    if (onOptionChange_previewScale) onOptionChange_previewScale(1);
  };

  fitPreviewScale = () => {
    const { onOptionChange_previewScale, optionValue_mapSize_x } = this.props;
    const canvas = this.canvasRef_display.current;
    const container = canvas ? canvas.closest(".mapPreviewDiv") : null;
    if (!onOptionChange_previewScale) return;
    const available = (container && container.clientWidth) || window.innerWidth || 320;
    const scale = Math.max(1, Math.min(8, Math.floor((available - 12) / (128 * (optionValue_mapSize_x || 1)))));
    onOptionChange_previewScale(scale);
  };

  componentWillUnmount() {
    window.removeEventListener("keydown", this.handleEditorKeyDown, true);
    const canvas = this.canvasRef_display.current;
    if (canvas) {
      canvas.removeEventListener("wheel", this.handleEditorWheel);
      canvas.removeEventListener("pointermove", this.handleEditorCoordinateMove);
      canvas.removeEventListener("pointerleave", this.handleEditorCoordinateLeave);
    }
    this.mapCanvasWorker.terminate();
  }

  render() {
    const {
      getLocaleString,
      optionValue_mapSize_x, // map size in maps
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_showGridOverlay,
      optionValue_showPixelGrid,
      optionValue_previewScale,
      optionValue_pixelPerfect,
      onFileDialogEvent,
      uploadedImage,
      pixelEdits,
    } = this.props;
    const {
      workerProgress,
      detectedPixelScale,
      editorEnabled,
      editorTool,
      editorColour,
      editorColours,
      editorHistoryDepth,
      editorRedoDepth,
      editorSelection,
      editorClipboardInfo,
      editorStatus,
    } = this.state;
    let editedPixelCount = 0;
    let maskedPixelCount = 0;
    if (editorEnabled) {
      for (const value of Object.values(pixelEdits || {})) {
        editedPixelCount += 1;
        if (value === "mask") maskedPixelCount += 1;
      }
    }
    const mapPreviewSizeScale = Math.max(1, Math.round(optionValue_previewScale || 2));
    const canvasWidth = mapPreviewSizeScale * 128 * optionValue_mapSize_x;
    const canvasHeight = mapPreviewSizeScale * 128 * optionValue_mapSize_y;
    return (
      <div className="section mapPreviewDiv">
        <h2>{getLocaleString("MAP-PREVIEW/TITLE")}</h2>
        <input type="file" className="imgUpload" ref={this.fileInputRef} onChange={onFileDialogEvent} />
        <div className="pixelEditor">
          <div className="pixelEditorRow">
            <button
              type="button"
              className={`pixelEditorToggle${editorEnabled ? " active" : ""}`}
              onClick={this.onToggleEditor}
              disabled={!uploadedImage}
              title={this.t("PIXEL-EDITOR/TITLE-TT", "Per-pixel edits included in PNG and .litematic")}
            >
              {this.t("PIXEL-EDITOR/TITLE", "Pixel editor")}
            </button>
            {editorEnabled ? (
              <React.Fragment>
                <span className="pixelEditorTools">
                  {EDITOR_TOOLS.map(([tool, labelKey, labelFallback, hotkey]) => {
                    const label = this.t(labelKey, labelFallback);
                    return (
                      <button
                        key={tool}
                        type="button"
                        className={editorTool === tool ? "active" : ""}
                        onClick={() => this.setEditorTool(tool)}
                        title={`${label} (${hotkey})`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </span>
                <label className="pixelEditorInlineControl">
                  <span>{this.t("PIXEL-EDITOR/BRUSH-SIZE", "Size")}</span>
                  <select
                    value={this.state.editorBrushSize}
                    onChange={(event) => this.setState({ editorBrushSize: parseInt(event.target.value) })}
                  >
                    {EDITOR_BRUSH_SIZES.map((size) => (
                      <option key={size} value={size}>{size}×{size}</option>
                    ))}
                  </select>
                </label>
                <label
                  className="pixelEditorInlineControl pixelEditorTolerance"
                  style={{ visibility: editorTool === "wand" ? "visible" : "hidden" }}
                >
                  <span>{this.t("PIXEL-EDITOR/TOLERANCE", "Tolerance")}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={this.state.editorWandTolerance}
                    onChange={(event) => this.setState({ editorWandTolerance: parseInt(event.target.value) })}
                    disabled={editorTool !== "wand"}
                  />
                  <b>{this.state.editorWandTolerance}</b>
                </label>
                <span className="pixelEditorZoom">
                  <button type="button" onClick={this.decreasePreviewScale} title={this.t("PIXEL-EDITOR/ZOOM-OUT", "Zoom out")}>−</button>
                  <span>{optionValue_previewScale}×</span>
                  <button type="button" onClick={this.increasePreviewScale} title={this.t("PIXEL-EDITOR/ZOOM-IN", "Zoom in")}>+</button>
                  <button type="button" onClick={this.setPreviewScaleOne} title={this.t("PIXEL-EDITOR/ZOOM-ONE", "1:1")}>1:1</button>
                  <button type="button" onClick={this.fitPreviewScale} title={this.t("PIXEL-EDITOR/ZOOM-FIT", "Fit to width")}>
                    {this.t("PIXEL-EDITOR/ZOOM-FIT", "Fit")}
                  </button>
                </span>
                <span className="pixelEditorCoords" ref={this.coordsRef}>X: – Y: –</span>
                <span className="pixelEditorCount">
                  {editedPixelCount
                    ? `${editedPixelCount} px${maskedPixelCount ? ` · ${this.t("PIXEL-EDITOR/COUNT-MASK", "mask:")} ${maskedPixelCount}` : ""}`
                    : this.t("PIXEL-EDITOR/COUNT-EMPTY", "no edits")}
                </span>
              </React.Fragment>
            ) : (
              <span className="pixelEditorHint">{this.t("PIXEL-EDITOR/TOGGLE-HINT", "Per-pixel edits included in PNG and .litematic")}</span>
            )}
          </div>
          {editorEnabled ? (
            <React.Fragment>
              <div className="pixelEditorPalette">
                {editorColour ? (
                  <span
                    className="pixelEditorSwatch pixelEditorSwatchCurrent"
                    style={{ backgroundColor: editorColour }}
                    title={`${this.t("PIXEL-EDITOR/CURRENT-COLOUR", "Current colour")} ${editorColour}`}
                  />
                ) : null}
                {editorColours.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    className={`pixelEditorSwatch${editorColour === colour ? " active" : ""}`}
                    style={{ backgroundColor: colour }}
                    title={colour}
                    aria-label={`${this.t("PIXEL-EDITOR/COLOUR-ARIA", "Colour")} ${colour}`}
                    onClick={() => this.setState({ editorColour: colour, editorTool: "paint", editorStatus: "" })}
                  />
                ))}
                {!editorColours.length ? <span className="pixelEditorHint">{this.t("PIXEL-EDITOR/WAIT-PREVIEW", "Wait for the preview first.")}</span> : null}
              </div>
              <div className="pixelEditorRow pixelEditorActions">
                <button type="button" onClick={this.undoEditor} disabled={!editorHistoryDepth}>
                  {this.t("PIXEL-EDITOR/UNDO", "Undo")}
                </button>
                <button type="button" onClick={this.redoEditor} disabled={!editorRedoDepth}>
                  {this.t("PIXEL-EDITOR/REDO", "Redo")}
                </button>
                <label
                  className="studioCheck pixelEditorShapeFill"
                  style={{ visibility: EDITOR_SHAPE_TOOLS.includes(editorTool) ? "visible" : "hidden" }}
                >
                  <input
                    type="checkbox"
                    checked={this.state.editorShapeFilled}
                    onChange={() => this.setState({ editorShapeFilled: !this.state.editorShapeFilled })}
                    disabled={!EDITOR_SHAPE_TOOLS.includes(editorTool)}
                  />
                  <span>{this.t("PIXEL-EDITOR/FILL-SHAPE", "Fill shape")}</span>
                </label>
                <button type="button" onClick={this.clearEditorEdits} disabled={!editedPixelCount}>
                  {this.t("PIXEL-EDITOR/RESET", "Reset edits")}
                </button>
                <span className="pixelEditorHint">{this.t("PIXEL-EDITOR/HINT", "LMB selected tool, RMB erase. Shift constrains shapes.")}</span>
              </div>
              <div className="pixelEditorRow">
                <span className="pixelEditorHint">
                  {this.t("PIXEL-EDITOR/HOTKEYS", "Hotkeys: B/E/I/M/F/L/U/O/R, Ctrl+Z, Ctrl+Shift+Z, Ctrl+C, Ctrl+V, Delete.")}
                </span>
              </div>
            </React.Fragment>
          ) : null}
        </div>
        <div className="mapCanvasWrap">
          <span
            className="gridOverlay"
            style={{
              backgroundImage: `url(${IMG_GridOverlay})`,
              display: optionValue_showGridOverlay ? "block" : "none",
              width: `${canvasWidth.toString()}px`,
              height: `${canvasHeight.toString()}px`,
              backgroundSize: `${(mapPreviewSizeScale * 128).toString()}px`,
            }}
          />
          {optionValue_showPixelGrid ? (
            <span
              className="pixelGridOverlay"
              style={{
                width: `${canvasWidth.toString()}px`,
                height: `${canvasHeight.toString()}px`,
                backgroundSize: `${mapPreviewSizeScale.toString()}px ${mapPreviewSizeScale.toString()}px`,
              }}
            />
          ) : null}
          <canvas
            className={`mapCanvas${editorEnabled ? " mapCanvasEditing" : ""}`}
            width={128 * optionValue_mapSize_x}
            height={128 * optionValue_mapSize_y}
            ref={this.canvasRef_display}
            style={{
              width: `${canvasWidth.toString()}px`,
              height: `${canvasHeight.toString()}px`,
              touchAction: editorEnabled ? "none" : undefined,
              cursor: editorEnabled ? (editorTool === "pick" || editorTool === "select" ? "crosshair" : editorTool === "move" ? "move" : "cell") : "pointer",
            }}
            onClick={() => {
              if (!editorEnabled) this.fileInputRef.current.click();
            }}
            onPointerDown={this.onEditorPointerDown}
            onPointerMove={this.onEditorPointerMove}
            onPointerUp={this.finishEditorStroke}
            onPointerCancel={this.onEditorPointerCancel}
            onContextMenu={(event) => {
              if (editorEnabled) event.preventDefault();
            }}
          />
          <canvas
            className="pixelEditorOverlay"
            width={128 * optionValue_mapSize_x}
            height={128 * optionValue_mapSize_y}
            ref={this.canvasRef_editor}
            style={{
              width: `${canvasWidth.toString()}px`,
              height: `${canvasHeight.toString()}px`,
              display: editorEnabled ? "block" : "none",
            }}
          />
          <canvas
            className="pixelEditorSelectionOverlay"
            width={128 * optionValue_mapSize_x}
            height={128 * optionValue_mapSize_y}
            ref={this.canvasRef_selection}
            style={{
              width: `${canvasWidth.toString()}px`,
              height: `${canvasHeight.toString()}px`,
              display: editorEnabled ? "block" : "none",
            }}
          />
          <canvas className="displayNone" width={128 * optionValue_mapSize_x} height={128 * optionValue_mapSize_y} ref={this.canvasRef_source}></canvas>
        </div>
        {editorEnabled && editorSelection ? (
          <div className="pixelEditorSelectionBar" role="toolbar" aria-label={this.t("PIXEL-EDITOR/ACTIONS-ARIA", "Selection actions")}>
            <span className="pixelEditorSelectionLabel">
              {this.t("PIXEL-EDITOR/SELECTION", "Selection")} {editorSelection.width}×{editorSelection.height}
            </span>
            <button type="button" onClick={this.copyEditorSelection}>
              {this.t("PIXEL-EDITOR/COPY", "Copy")}
            </button>
            <button type="button" onClick={this.pasteEditorSelection} disabled={!editorClipboardInfo}>
              {this.t("PIXEL-EDITOR/PASTE", "Paste")}
            </button>
            <button type="button" onClick={this.fillEditorSelection} disabled={!editorColour}>
              {this.t("PIXEL-EDITOR/FILL", "Fill selection")}
            </button>
            <button type="button" onClick={this.eraseEditorSelection}>
              {this.t("PIXEL-EDITOR/ERASE", "Erase")}
            </button>
            <button type="button" onClick={() => this.transformEditorSelection("flip-h")} title={this.t("PIXEL-EDITOR/FLIP-H", "Flip horizontally")}>↔</button>
            <button type="button" onClick={() => this.transformEditorSelection("flip-v")} title={this.t("PIXEL-EDITOR/FLIP-V", "Flip vertically")}>↕</button>
            <button type="button" onClick={() => this.transformEditorSelection("rotate")} title={this.t("PIXEL-EDITOR/ROTATE", "Rotate 90°")}>⟳</button>
            <button type="button" onClick={this.clearEditorSelection}>
              {this.t("PIXEL-EDITOR/DESELECT", "Deselect")}
            </button>
            <span className="pixelEditorStatus">{editorStatus}</span>
          </div>
        ) : null}
        <div className="mapResolutionAndZoom">
          <div>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/BEST-RESOLUTION-TT")}>
              <small>{`${(128 * optionValue_mapSize_x).toString()}x${(128 * optionValue_mapSize_y).toString()}`}</small>
            </Tooltip>{" "}
            <small className="pixelModeHint">
              {optionValue_pixelPerfect ? (detectedPixelScale > 1 ? `pixel x${detectedPixelScale}` : "pixel 1:1") : "smooth"}
            </small>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/ASPECT-RATIO-MISMATCH-TT")}>
              <small
                className="mapResWarning"
                style={{
                  display:
                    uploadedImage === null || uploadedImage.height * optionValue_mapSize_x === uploadedImage.width * optionValue_mapSize_y ? "none" : "inline",
                  color: optionValue_cropImage === CropModes.OFF.uniqueId ? "red" : "orange",
                }}
              >
                {uploadedImage === null ? null : `${uploadedImage.width.toString()}x${uploadedImage.height.toString()}`}
              </small>
            </Tooltip>
          </div>
          <div>
            <button type="button" className="previewModeButton" onClick={this.setPreviewScaleOne} title="1 map pixel = 1 screen pixel">
              1:1
            </button>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/SCALE-PLUS-TT")}>
              <img
                alt="+"
                className="sizeButton"
                src={IMG_Null}
                style={{
                  backgroundImage: `url(${IMG_Textures})`,
                  backgroundPositionX: "-96px",
                  backgroundPositionY: "-2048px",
                }}
                onClick={this.increasePreviewScale}
              />
            </Tooltip>
            <Tooltip tooltipText={getLocaleString("MAP-PREVIEW/SCALE-MINUS-TT")}>
              <img
                alt="-"
                className="sizeButton"
                src={IMG_Null}
                style={{
                  backgroundImage: `url(${IMG_Textures})`,
                  backgroundPositionX: "-128px",
                  backgroundPositionY: "-2048px",
                }}
                onClick={this.decreasePreviewScale}
              />
            </Tooltip>
          </div>
        </div>
        <div
          className="progress"
          style={
            [0, 1].includes(workerProgress)
              ? {
                  display: "unset",
                  visibility: "hidden",
                }
              : { display: "block" }
          }
        >
          <span className="progressText">{`${Math.floor(workerProgress * 100)}%`}</span>
          <div
            className="progressDiv"
            style={{
              width: `${Math.floor(workerProgress * 100)}%`,
            }}
          />
        </div>
      </div>
    );
  }
}

export default MapPreview;
