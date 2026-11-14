import WorkerBuilder from "./workers/worker-builder";
import MapCanvasWorker from "./workers/mapCanvas";

import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";
import ColourMethods from "./json/colourMethods.json";
import DitherMethods from "./json/ditherMethods.json";

/* Превью стилей рисуется тем же воркером, что и карта: иначе превью
   показывало бы не то, что получится на самом деле.

   Один воркер на все стили: пять воркеров — это пять копий палитры в
   памяти. Рендер маленький (128x128), но воркер обрабатывает сообщения
   по одному, поэтому нужен порядок. */
export const PREVIEW_SIZE = 128;
export const THUMB_SIZE = 32;

/* Образец, когда картинки ещё нет: плавный переход от тёмного к
   светлому с парой пятен — видно и полутон, и оттенок. */
export const sampleImageData = () => {
  const data = new Uint8ClampedArray(PREVIEW_SIZE * PREVIEW_SIZE * 4);
  for (let y = 0; y < PREVIEW_SIZE; y++) {
    for (let x = 0; x < PREVIEW_SIZE; x++) {
      const i = (y * PREVIEW_SIZE + x) * 4;
      const ramp = Math.round((x / (PREVIEW_SIZE - 1)) * 255);
      const vertical = Math.round((y / (PREVIEW_SIZE - 1)) * 255);
      /* Диагональный переход и пятно посередине: ровный градиент плохо
         показывает, как работает дизеринг. */
      const blob = Math.hypot(x - PREVIEW_SIZE * 0.32, y - PREVIEW_SIZE * 0.68) < PREVIEW_SIZE * 0.22 ? 70 : 0;
      data[i] = Math.min(255, ramp + blob);
      data[i + 1] = Math.min(255, vertical);
      data[i + 2] = Math.min(255, Math.round((ramp + vertical) / 2));
      data[i + 3] = 255;
    }
  }
  return { data, width: PREVIEW_SIZE, height: PREVIEW_SIZE };
};

export default class StylePreviewRenderer {
  constructor() {
    this.worker = null;
    this.canvases = new Map();
    this.queue = [];
    this.busy = false;
    this.sentColoursJSON = null;
    this.context = null;
    this.styles = [];
    this.requestId = 0;
    this.currentRequestId = 0;
    this.currentStyleId = null;
    /* Готовые картинки превью: их надо перерисовать, если холст
       появился позже, чем пришёл ответ воркера. */
    this.painted = new Map();
  }

  /* Холст, в который рисуется превью стиля. */
  setCanvas(styleId, canvas) {
    if (canvas) {
      this.canvases.set(styleId, canvas);
      /* Холст мог появиться после того, как превью уже было готово. */
      const pixels = this.painted.get(styleId);
      if (pixels) this.paint(styleId, pixels);
    } else {
      this.canvases.delete(styleId);
    }
  }

  /* Палитра и образец. Поменялись — перерисовываем все превью. */
  setContext(context, styles) {
    this.context = context;
    this.styles = styles;
    this.renderAll();
  }

  ensureWorker() {
    if (this.worker) return this.worker;
    this.worker = new WorkerBuilder(MapCanvasWorker);
    this.worker.onmessage = (event) => {
      const { head, body, requestId } = event.data;
      if (head === "INIT_DONE") {
        /* Палитра принята — можно рисовать. */
        this.busy = false;
        this.next();
        return;
      }
      if (head === "PIXELS_MATERIALS_CURRENTSELECTEDBLOCKS") {
        if (requestId === this.currentRequestId) {
          this.paint(this.currentStyleId, body.pixels);
        }
        /* Готов следующий стиль в очереди. */
        this.busy = false;
        this.next();
      }
    };
    this.worker.onerror = () => {
      /* Превью — украшение: ошибка воркера не должна ломать страницу. */
      this.queue = [];
      this.busy = false;
    };
    return this.worker;
  }

  sendInit() {
    const worker = this.ensureWorker();
    this.requestId += 1;
    this.sentColoursJSON = this.context.coloursJSON;
    worker.postMessage({
      head: "INIT",
      body: {
        coloursJSON: this.context.coloursJSON,
        MapModes,
        WhereSupportBlocksModes,
        ColourMethods,
        DitherMethods,
      },
      requestId: this.requestId,
    });
  }

  /* Ставит в очередь рендер каждого стиля. */
  renderAll() {
    if (!this.context || !this.styles.length) return;
    this.queue = this.styles.map((style) => style.id);
    this.busy = false;
    this.painted.clear();
    if (this.sentColoursJSON !== this.context.coloursJSON) {
      /* Палитра изменилась — воркер должен получить её заново. */
      this.sendInit();
      this.busy = true;
      return;
    }
    this.next();
  }

  next() {
    if (this.busy) return;
    const styleId = this.queue.shift();
    if (styleId === undefined) return;
    const style = this.styles.find((entry) => entry.id === styleId);
    if (!style) {
      this.next();
      return;
    }
    this.busy = true;
    const settings = style.settings;
    this.currentStyleId = style.id;
    this.currentRequestId = this.requestId + 1;
    this.requestId += 1;
    this.worker.postMessage({
      head: "PIXELS",
      body: {
        canvasImageData: this.context.imageData,
        selectedBlocks: this.context.selectedBlocks,
        disabledTones: this.context.disabledTones,
        optionValue_modeNBTOrMapdat: MapModes.SCHEMATIC_NBT.uniqueId,
        optionValue_mapSize_x: 1,
        optionValue_mapSize_y: 1,
        optionValue_staircasing: MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId,
        optionValue_whereSupportBlocks: WhereSupportBlocksModes.ALL_DOUBLE_OPTIMIZED.uniqueId,
        optionValue_transparency: false,
        optionValue_transparencyTolerance: 128,
        optionValue_betterColour: settings.colourMethod,
        optionValue_dithering: settings.dithering,
        optionValue_dithering_propagation_red: settings.propagation[0],
        optionValue_dithering_propagation_green: settings.propagation[1],
        optionValue_dithering_propagation_blue: settings.propagation[2],
        optionValue_dithering_strength: this.context.ditheringStrength,
        optionValue_improvedPatternDithering: settings.improvedPattern === true,
        optionValue_patternPairMode: settings.patternPairMode || "nearest",
        optionValue_paletteStrategy: settings.paletteStrategy || "all",
        optionValue_maxTones: settings.maxTones || 0,
        optionValue_cleanup_enabled: false,
        optionValue_cleanup_denoise: 0,
        optionValue_cleanup_denoiseMethod: "median",
        optionValue_cleanup_edges: 60,
        optionValue_cleanup_despeckle: 0,
        optionValue_cleanup_paletteIslands: true,
        optionValue_cleanup_colours: 0,
        optionValue_cleanup_coloursPerceptual: false,
        optionValue_cleanup_islandsSmart: false,
        optionValue_cleanup_adaptiveDither: true,
        pixelEdits: {},
      },
      requestId: this.currentRequestId,
    });
  }

  /* Рисует результат в холст превью. */
  paint(styleId, pixels) {
    if (!styleId || !pixels) return;
    this.painted.set(styleId, pixels);
    const canvas = this.canvases.get(styleId);
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const source = document.createElement("canvas");
    source.width = pixels.width;
    source.height = pixels.height;
    const sourceContext = source.getContext("2d");
    sourceContext.putImageData(pixels, 0, 0);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
  }

  dispose() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.canvases.clear();
    this.painted.clear();
    this.queue = [];
  }
}
