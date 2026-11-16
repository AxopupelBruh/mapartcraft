import React, { Component } from "react";
import JSZip from "jszip";

import Tooltip from "../tooltip";

import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import WorkerBuilder from './workers/worker-builder';
import NBTWorker from "./workers/nbt";
import { canvasToBlob, exportArtZip, pixelsToCanvas, sanitizeFilename } from "../../studioStorage";
import { gzipBytes } from "./gzip";
import { isBigMap } from "./canvasLimits";

import "./greenButtons.css";

class GreenButtons extends Component {
  // For download buttons etc
  state = {
    buttonWidth_viewOnline: 1,
    buttonWidth_NBT_Joined: 1,
    buttonWidth_NBT_Split: 1,
    buttonWidth_Mapdat_Split: 1,
    buttonWidth_Litematic: 1,
    litematicExportInProgress: false,
    litematicStatus: "",
    mapPreviewWorker_onFinishCallback: null,
  };

  nbtWorker = new WorkerBuilder(NBTWorker);
  litematicExportId = 0;

  t(key, fallback) {
    const { getLocaleString } = this.props;
    const value = getLocaleString ? getLocaleString(key) : null;
    return value || fallback;
  }

  hasUsablePalette(currentMaterialsData) {
    return (currentMaterialsData.maps || []).some((row) =>
      row.some((map) => Object.keys(map.materials || {}).length > 0)
    );
  }

  /* Огромная карта — это огромный файл схемы: каждый блок попадает в NBT.
     Предупреждаем заранее, чтобы пользователь не ждал час ради файла,
     который не откроется. Порог тот же, что и в настройках размера, —
     иначе экспорт ругался бы на карту, которую настройки считали обычной. */
  confirmHugeExport() {
    const { optionValue_mapSize_x, optionValue_mapSize_y } = this.props;
    if (!isBigMap(optionValue_mapSize_x, optionValue_mapSize_y)) return true;
    const blocks = 128 * optionValue_mapSize_x * 128 * optionValue_mapSize_y;
    const million = Math.round((blocks / 1000000) * 10) / 10;
    return window.confirm(
      this.t("DOWNLOAD/HUGE-EXPORT", "This map is very large ({blocks} million blocks). The export will take a long time and the file will be huge. Continue?").replace(
        "{blocks}",
        million
      )
    );
  }

  cancelNbtWorker = (updateState = true) => {
    this.litematicExportId += 1;
    this.nbtWorker.terminate();
    if (updateState && this.state.litematicExportInProgress) {
      this.setState({
        buttonWidth_Litematic: 1,
        litematicExportInProgress: false,
        litematicStatus: "",
      });
    }
  };

  resetButtonWidths() {
    this.setState({
      buttonWidth_viewOnline: 1,
      buttonWidth_NBT_Joined: 1,
      buttonWidth_NBT_Split: 1,
      buttonWidth_Mapdat_Split: 1,
      buttonWidth_Litematic: 1,
    });
  }

  getNBT_base = (workerHeader) => {
    const {
      getLocaleString,
      coloursJSON,
      optionValue_version,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_staircasing,
      optionValue_whereSupportBlocks,
      optionValue_supportBlock,
      optionValue_mapdatFilenameUseId,
      optionValue_mapdatFilenameIdStart,
      uploadedImage_baseFilename,
      currentMaterialsData,
      mapPreviewWorker_inProgress,
      downloadBlobFile,
      onGetViewOnlineNBT,
    } = this.props;
    if (mapPreviewWorker_inProgress) {
      this.setState({ mapPreviewWorker_onFinishCallback: () => this.getNBT_base(workerHeader) });
      return;
    }
    if (
      Object.entries(currentMaterialsData.currentSelectedBlocks).every((elt) => elt[1] === "-1") ||
      !this.hasUsablePalette(currentMaterialsData)
    ) {
      alert(getLocaleString("DOWNLOAD/ERROR-NONE-SELECTED"));
      return;
    }
    if (!this.confirmHugeExport()) return;
    this.cancelNbtWorker();
    /* Номер экспорта: если пользователь отменил его или запустил новый,
       ответы и файлы прошлого экспорта игнорируются. */
    const exportId = this.litematicExportId;
    this.resetButtonWidths();
    let numberOfSplitsCalculated = 0;
    // The compression happens in the background, so the number of finished
    // compressions is counted separately.
    let numberOfSplitsCompressed = 0;
    // The parts of a split export, collected until all of them are ready.
    const splitFiles = [];
    let zipFile = new JSZip();
    const t0 = performance.now();
    this.nbtWorker = new WorkerBuilder(NBTWorker);
    this.nbtWorker.onmessage = (e) => {
      if (exportId !== this.litematicExportId) return; // the export was cancelled
      switch (e.data.head) {
        case "PROGRESS_REPORT_CREATE_NBT_JOINED_FOR_VIEW_ONLINE": {
          this.setState({ buttonWidth_viewOnline: e.data.body });
          break;
        }
        case "PROGRESS_REPORT_CREATE_NBT_JOINED": {
          this.setState({ buttonWidth_NBT_Joined: e.data.body });
          break;
        }
        case "PROGRESS_REPORT_CREATE_NBT_SPLIT": {
          this.setState({ buttonWidth_NBT_Split: (numberOfSplitsCalculated + e.data.body) / (optionValue_mapSize_x * optionValue_mapSize_y) });
          break;
        }
        case "PROGRESS_REPORT_CREATE_MAPDAT_SPLIT": {
          this.setState({ buttonWidth_Mapdat_Split: (numberOfSplitsCalculated + e.data.body) / (optionValue_mapSize_x * optionValue_mapSize_y) });
          break;
        }
        case "NBT_FOR_VIEW_ONLINE": {
          const t1 = performance.now();
          console.log(`Created NBT for 'view online' by ${(t1 - t0).toString()}ms`);
          const { NBT_Array } = e.data.body;
          onGetViewOnlineNBT(NBT_Array);
          break;
        }
        case "NBT_ARRAY": {
          const t1 = performance.now();
          console.log(`Created NBT by ${(t1 - t0).toString()}ms`);
          numberOfSplitsCalculated++;
          const { NBT_Array, whichMap_x, whichMap_y } = e.data.body;
          // The compression runs in the background, so the interface stays
          // usable while a big map is written.
          gzipBytes(NBT_Array).then((NBT_Array_gzipped) => {
            if (exportId !== this.litematicExportId) return; // the export was cancelled
            if (workerHeader === "CREATE_NBT_SPLIT") {
              /* Файлы собираем отдельно: сжатие идёт параллельно, и порядок
                 готовности не совпадает с порядком частей карты. В архив
                 кладём их по именам — иначе состав архива плавает от запуска
                 к запуску. */
              splitFiles.push({ name: `${uploadedImage_baseFilename}_${whichMap_x}_${whichMap_y}.nbt`, bytes: NBT_Array_gzipped });
              numberOfSplitsCompressed++;
              if (numberOfSplitsCompressed === optionValue_mapSize_x * optionValue_mapSize_y) {
                for (const file of splitFiles.slice().sort((a, b) => (a.name < b.name ? -1 : 1))) {
                  zipFile.file(file.name, file.bytes);
                }
                zipFile.generateAsync({ type: "blob" }).then((content) => {
                  downloadBlobFile(content, `${uploadedImage_baseFilename}.zip`);
                });
              }
            } else {
              const downloadBlob = new Blob([NBT_Array_gzipped], { type: "application/x-minecraft-level" });
              downloadBlobFile(downloadBlob, `${uploadedImage_baseFilename}.nbt`);
            }
          });
          break;
        }
        case "MAPDAT_BYTES": {
          const t1 = performance.now();
          console.log(`Created Mapdat by ${(t1 - t0).toString()}ms`);
          numberOfSplitsCalculated++;
          const { Mapdat_Bytes, whichMap_x, whichMap_y } = e.data.body;
          gzipBytes(Mapdat_Bytes).then((Mapdat_Bytes_gzipped) => {
            if (exportId !== this.litematicExportId) return; // the export was cancelled
            const downloadBlob = new Blob([Mapdat_Bytes_gzipped], { type: "application/x-minecraft-level" });
            downloadBlobFile(downloadBlob, optionValue_mapdatFilenameUseId
              ? `map_${(optionValue_mapdatFilenameIdStart + whichMap_y * optionValue_mapSize_x + whichMap_x).toString()}.dat`
              : `${uploadedImage_baseFilename}_${whichMap_x.toString()}_${whichMap_y.toString()}.dat`);
          });
          break;
        }
        case "MAPDAT_BYTES_ZIP": {
          const t1 = performance.now();
          console.log(`Created Mapdat by ${(t1 - t0).toString()}ms`);
          numberOfSplitsCalculated++;
          const { Mapdat_Bytes, whichMap_x, whichMap_y } = e.data.body;
          gzipBytes(Mapdat_Bytes).then((Mapdat_Bytes_gzipped) => {
            if (exportId !== this.litematicExportId) return; // the export was cancelled
            splitFiles.push({
              name: optionValue_mapdatFilenameUseId
                ? `map_${(optionValue_mapdatFilenameIdStart + whichMap_y * optionValue_mapSize_x + whichMap_x).toString()}.dat`
                : `${uploadedImage_baseFilename}_${whichMap_x.toString()}_${whichMap_y.toString()}.dat`,
              bytes: Mapdat_Bytes_gzipped,
            });
            numberOfSplitsCompressed++;
            if (numberOfSplitsCompressed === optionValue_mapSize_x * optionValue_mapSize_y) {
              for (const file of splitFiles.slice().sort((a, b) => (a.name < b.name ? -1 : 1))) {
                zipFile.file(file.name, file.bytes);
              }
              zipFile.generateAsync({ type: "blob" }).then((content) => {
                downloadBlobFile(content, `${uploadedImage_baseFilename}.zip`);
              });
            }
          });
          break;
        }
        default: {
          throw new Error("Unknown worker response header");
        }
      }
    };
    this.nbtWorker.postMessage({
      head: workerHeader,
      body: {
        coloursJSON: coloursJSON,
        MapModes: MapModes,
        WhereSupportBlocksModes: WhereSupportBlocksModes,
        optionValue_version: optionValue_version,
        optionValue_staircasing: optionValue_staircasing,
        optionValue_whereSupportBlocks: optionValue_whereSupportBlocks,
        optionValue_supportBlock: optionValue_supportBlock,
        pixelsData: currentMaterialsData.pixelsData,
        maps: currentMaterialsData.maps,
        currentSelectedBlocks: currentMaterialsData.currentSelectedBlocks,
      },
    });
  };

  finishLitematicExport = async (litematicFiles, artName, snapshot, exportId) => {
    try {
      const canvas = pixelsToCanvas(snapshot.pixelsData, snapshot.pixelsWidth, snapshot.pixelsHeight);
      const pngBlob = await canvasToBlob(canvas, "image/png");
      if (exportId !== this.litematicExportId) return;
      const result = await exportArtZip({
        artName,
        litematicFiles,
        pngBlob,
        pngName: `${artName}.png`,
      });
      if (exportId !== this.litematicExportId) return;
      this.setState({
        buttonWidth_Litematic: 1,
        litematicExportInProgress: false,
        litematicStatus: `ZIP: ${result.filename}`,
      });
    } catch (error) {
      if (exportId !== this.litematicExportId) return;
      console.error("Could not export .litematic + PNG", error);
      this.setState({
        buttonWidth_Litematic: 1,
        litematicExportInProgress: false,
        litematicStatus: this.t("STUDIO/EXPORT-ERROR", "Export failed"),
      });
      const message = `${this.t("STUDIO/EXPORT-FAILED", "Could not export .litematic + PNG: ")}${error.message || error}`;
      window.alert(message);
    }
  };

  onGetLitematicClicked = () => {
    const {
      currentMaterialsData,
      mapPreviewWorker_inProgress,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      uploadedImage_baseFilename,
    } = this.props;

    if (mapPreviewWorker_inProgress) {
      this.setState({ mapPreviewWorker_onFinishCallback: () => this.onGetLitematicClicked() });
      return;
    }
    if (!currentMaterialsData.pixelsData || !currentMaterialsData.maps || !currentMaterialsData.currentSelectedBlocks) {
      window.alert(this.t("STUDIO/WAIT-PREVIEW", "Wait for the preview first."));
      return;
    }
    if (
      Object.entries(currentMaterialsData.currentSelectedBlocks).every((entry) => entry[1] === "-1") ||
      !this.hasUsablePalette(currentMaterialsData)
    ) {
      window.alert(this.t("STUDIO/NO-BLOCKS", "No blocks selected."));
      return;
    }
    if (this.state.litematicExportInProgress) return;
    if (!this.confirmHugeExport()) return;

    const artName = sanitizeFilename(uploadedImage_baseFilename || "MyArt");
    const expected = optionValue_mapSize_x * optionValue_mapSize_y;
    const snapshot = {
      pixelsData: currentMaterialsData.pixelsData,
      pixelsWidth: currentMaterialsData.pixelsWidth || 128 * optionValue_mapSize_x,
      pixelsHeight: currentMaterialsData.pixelsHeight || 128 * optionValue_mapSize_y,
      maps: currentMaterialsData.maps,
      currentSelectedBlocks: currentMaterialsData.currentSelectedBlocks,
    };
    const files = [];
    let received = 0;
    // The number of files whose compression has finished.
    let filesFinished = 0;

    this.cancelNbtWorker();
    const exportId = ++this.litematicExportId;
    this.resetButtonWidths();
    this.setState({
      litematicExportInProgress: true,
      litematicStatus: this.t("STUDIO/PREPARING-LITEMATIC", "Preparing .litematic..."),
    });
    this.nbtWorker = new WorkerBuilder(NBTWorker);
    this.nbtWorker.onmessage = (e) => {
      if (exportId !== this.litematicExportId) return;
      switch (e.data.head) {
        case "PROGRESS_REPORT_CREATE_LITEMATIC_SPLIT": {
          this.setState({ buttonWidth_Litematic: (received + e.data.body) / expected });
          break;
        }
        case "LITEMATIC_ARRAY": {
          received++;
          const { Litematic_Array, whichMap_x, whichMap_y } = e.data.body;
          gzipBytes(Litematic_Array).then((bytes) => {
            if (exportId !== this.litematicExportId) return; // the export was cancelled
            const filename = expected > 1 ? `${artName}_${whichMap_x}_${whichMap_y}.litematic` : `${artName}.litematic`;
            files.push({ name: filename, bytes });
            filesFinished++;
            this.setState({ buttonWidth_Litematic: (filesFinished - 1 + 0.98) / expected });
            if (filesFinished === expected) this.finishLitematicExport(files, artName, snapshot, exportId);
          });
          break;
        }
        default: {
          if (e.data.head && e.data.head.startsWith("PROGRESS_REPORT")) break;
          throw new Error("Unknown worker response header");
        }
      }
    };
    this.nbtWorker.onerror = (event) => {
      if (exportId !== this.litematicExportId) return;
      event.preventDefault();
      this.cancelNbtWorker();
      this.setState({ litematicStatus: this.t("STUDIO/EXPORT-ERROR", "Export failed") });
      window.alert(this.t("STUDIO/EXPORT-ERROR", "Export failed"));
    };
    this.nbtWorker.postMessage({
      head: "CREATE_LITEMATIC_SPLIT",
      body: {
        coloursJSON: this.props.coloursJSON,
        MapModes: MapModes,
        WhereSupportBlocksModes: WhereSupportBlocksModes,
        optionValue_version: this.props.optionValue_version,
        optionValue_staircasing: this.props.optionValue_staircasing,
        optionValue_whereSupportBlocks: this.props.optionValue_whereSupportBlocks,
        optionValue_supportBlock: this.props.optionValue_supportBlock,
        pixelsData: snapshot.pixelsData,
        maps: snapshot.maps,
        currentSelectedBlocks: snapshot.currentSelectedBlocks,
      },
    });
  };

  onViewOnlineClicked = () => {
    this.getNBT_base("CREATE_NBT_JOINED_FOR_VIEW_ONLINE");
  };

  onGetNBTClicked = () => {
    this.getNBT_base("CREATE_NBT_JOINED");
  };

  onGetNBTSplitClicked = () => {
    this.getNBT_base("CREATE_NBT_SPLIT");
  };

  onGetMapdatSplitClicked = () => {
    this.getNBT_base("CREATE_MAPDAT_SPLIT");
  };

  onGetMapdatSplitZipClicked = () => {
    this.getNBT_base("CREATE_MAPDAT_SPLIT_ZIP");
  };

  componentDidUpdate_shouldNBTWorkerTerminate(prevProps) {
    const {
      selectedBlocks,
      optionValue_version,
      optionValue_modeNBTOrMapdat,
      optionValue_mapSize_x,
      optionValue_mapSize_y,
      optionValue_cropImage,
      optionValue_cropImage_zoom,
      optionValue_cropImage_percent_x,
      optionValue_cropImage_percent_y,
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
      optionValue_preprocessingEnabled,
      preProcessingValue_brightness,
      preProcessingValue_contrast,
      preProcessingValue_saturation,
      preProcessingValue_backgroundColourSelect,
      preProcessingValue_backgroundColour,
      uploadedImage,
    } = this.props;
    return [
      prevProps.selectedBlocks !== selectedBlocks,
      prevProps.optionValue_version !== optionValue_version,
      prevProps.optionValue_modeNBTOrMapdat !== optionValue_modeNBTOrMapdat,
      prevProps.optionValue_mapSize_x !== optionValue_mapSize_x,
      prevProps.optionValue_mapSize_y !== optionValue_mapSize_y,
      prevProps.optionValue_cropImage !== optionValue_cropImage,
      prevProps.optionValue_cropImage_zoom !== optionValue_cropImage_zoom,
      prevProps.optionValue_cropImage_percent_x !== optionValue_cropImage_percent_x,
      prevProps.optionValue_cropImage_percent_y !== optionValue_cropImage_percent_y,
      prevProps.optionValue_staircasing !== optionValue_staircasing,
      prevProps.optionValue_whereSupportBlocks !== optionValue_whereSupportBlocks,
      prevProps.optionValue_supportBlock !== optionValue_supportBlock,
      prevProps.optionValue_transparency !== optionValue_transparency,
      prevProps.optionValue_transparencyTolerance !== optionValue_transparencyTolerance,
      prevProps.optionValue_mapdatFilenameUseId !== optionValue_mapdatFilenameUseId,
      prevProps.optionValue_mapdatFilenameIdStart !== optionValue_mapdatFilenameIdStart,
      prevProps.optionValue_betterColour !== optionValue_betterColour,
      prevProps.optionValue_dithering !== optionValue_dithering,
      prevProps.optionValue_dithering_propagation_red !== optionValue_dithering_propagation_red,
      prevProps.optionValue_dithering_propagation_green !== optionValue_dithering_propagation_green,
      prevProps.optionValue_dithering_propagation_blue !== optionValue_dithering_propagation_blue,
      prevProps.optionValue_preprocessingEnabled !== optionValue_preprocessingEnabled,
      prevProps.preProcessingValue_brightness !== preProcessingValue_brightness,
      prevProps.preProcessingValue_contrast !== preProcessingValue_contrast,
      prevProps.preProcessingValue_saturation !== preProcessingValue_saturation,
      prevProps.preProcessingValue_backgroundColourSelect !== preProcessingValue_backgroundColourSelect,
      prevProps.preProcessingValue_backgroundColour !== preProcessingValue_backgroundColour,
      prevProps.uploadedImage !== uploadedImage,
    ].some((elt) => elt);
  }

  componentDidUpdate(prevProps) {
    const { mapPreviewWorker_inProgress } = this.props;
    if (this.componentDidUpdate_shouldNBTWorkerTerminate(prevProps)) {
      // reset callback if setting changed
      this.cancelNbtWorker();
      this.resetButtonWidths();
      this.setState({ mapPreviewWorker_onFinishCallback: null });
    } else if (!mapPreviewWorker_inProgress && this.state.mapPreviewWorker_onFinishCallback !== null) {
      this.state.mapPreviewWorker_onFinishCallback();
      this.setState({ mapPreviewWorker_onFinishCallback: null });
    }
  }

  componentWillUnmount() {
    this.cancelNbtWorker(false);
  }

  render() {
    const {
      buttonWidth_viewOnline,
      buttonWidth_NBT_Joined,
      buttonWidth_NBT_Split,
      buttonWidth_Mapdat_Split,
      buttonWidth_Litematic,
      litematicStatus,
    } = this.state;
    const { getLocaleString, optionValue_modeNBTOrMapdat } = this.props;
    let buttons_mapModeConditional;
    // dummy text used in divs with absolutely positioned children to create correct container height
    if (optionValue_modeNBTOrMapdat === MapModes.SCHEMATIC_NBT.uniqueId) {
      buttons_mapModeConditional = (
        <React.Fragment>
          <Tooltip tooltipText={getLocaleString("VIEW-ONLINE/TITLE-TT")}>
            <button
              type="button"
              className="greenButton"
              onClick={this.onViewOnlineClicked}
              aria-label={getLocaleString("VIEW-ONLINE/TITLE")}
            >
              <span className="greenButton_text_dummy">{getLocaleString("VIEW-ONLINE/TITLE")}</span>
              <span className="greenButton_text">{getLocaleString("VIEW-ONLINE/TITLE")}</span>
              <span
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_viewOnline * 100)}%`,
                }}
              />
            </button>
          </Tooltip>
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-TT")}>
            <button
              type="button"
              className="greenButton"
              onClick={this.onGetNBTClicked}
              aria-label={getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD")}
            >
              <span className="greenButton_text_dummy">{getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD")}</span>
              <span className="greenButton_text">{getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD")}</span>
              <span
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_NBT_Joined * 100)}%`,
                }}
              />
            </button>
          </Tooltip>
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT-TT")}>
            <button
              type="button"
              className="greenButton"
              onClick={this.onGetNBTSplitClicked}
              aria-label={`${getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT")} .ZIP`}
            >
              <span className="greenButton_text_dummy">{`${getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT")} .ZIP`}</span>
              <span className="greenButton_text">{`${getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT")} .ZIP`}</span>
              <span
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_NBT_Split * 100)}%`,
                }}
              />
            </button>
          </Tooltip>
          <Tooltip tooltipText={this.t("STUDIO/LITEMATIC-TT", "Download .litematic and PNG as a ZIP archive")}>
            <button
              type="button"
              className="greenButton greenButton_wide"
              onClick={this.onGetLitematicClicked}
              aria-label={this.t("STUDIO/LITEMATIC-BUTTON", "Download .litematic + PNG")}
            >
              <span className="greenButton_text_dummy">{this.t("STUDIO/LITEMATIC-BUTTON", "Download .litematic + PNG")}</span>
              <span className="greenButton_text">{this.t("STUDIO/LITEMATIC-BUTTON", "Download .litematic + PNG")}</span>
              <span
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_Litematic * 100)}%`,
                }}
              />
            </button>
          </Tooltip>
          {litematicStatus ? <div className="greenButton_status">{litematicStatus}</div> : null}
        </React.Fragment>
      );
    } else {
      buttons_mapModeConditional = (
        <React.Fragment>
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD-TT")}>
            <button
              type="button"
              className="greenButton"
              onClick={this.onGetMapdatSplitClicked}
              aria-label={getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")}
            >
              <span className="greenButton_text_dummy">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")}`}</span>
              <span className="greenButton_text">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")}`}</span>
              <span
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_Mapdat_Split * 100)}%`,
                }}
              />
            </button>
          </Tooltip>
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD-TT")}>
            <button
              type="button"
              className="greenButton"
              onClick={this.onGetMapdatSplitZipClicked}
              aria-label={`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")} .ZIP`}
            >
              <span className="greenButton_text_dummy">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")} .ZIP`}</span>
              <span className="greenButton_text">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")} .ZIP`}</span>
              <span
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_Mapdat_Split * 100)}%`,
                }}
              />
            </button>
          </Tooltip>
        </React.Fragment>
      );
    }
    const buttonsDiv = (
      <div className="greenButtonsRow">
        {buttons_mapModeConditional}
      </div>
    );
    /* Проверка перед экспортом (этап 4, пункт 4.3): что стоит знать до
       того, как нажать кнопку экспорта. */
    const exportChecks = this.props.exportChecks || [];
    const checksDiv = exportChecks.length > 0 ? (
      <div className="exportCheck" role="status">
        <span className="exportCheck_title">{this.t("EXPORT-CHECK/TITLE", "Check before export")}</span>
        {exportChecks.map((check) => (
          <span key={check.id} className={`exportCheck_item exportCheck_${check.level}`}>
            {check.text}
          </span>
        ))}
      </div>
    ) : null;
    return (
      <React.Fragment>
        {buttonsDiv}
        {checksDiv}
      </React.Fragment>
    );
  }
}

export default GreenButtons;
