import React, { Component } from "react";
import { gzip } from "pako"; // blocks when zipping
import JSZip from "jszip";

import Tooltip from "../tooltip";

import MapModes from "./json/mapModes.json";
import WhereSupportBlocksModes from "./json/whereSupportBlocksModes.json";

import WorkerBuilder from './workers/worker-builder';
import NBTWorker from "./workers/nbt";
import { canvasToBlob, exportArtZip, pixelsToCanvas, sanitizeFilename } from "../../studioStorage";

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

  t(key, fallback) {
    const { getLocaleString } = this.props;
    const value = getLocaleString ? getLocaleString(key) : null;
    return value || fallback;
  }

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
    if (Object.entries(currentMaterialsData.currentSelectedBlocks).every((elt) => elt[1] === "-1")) {
      alert(getLocaleString("DOWNLOAD/ERROR-NONE-SELECTED"));
      return;
    }
    this.nbtWorker.terminate();
    this.resetButtonWidths();
    let numberOfSplitsCalculated = 0;
    let zipFile = new JSZip();
    const t0 = performance.now();
    this.nbtWorker = new WorkerBuilder(NBTWorker);
    this.nbtWorker.onmessage = (e) => {
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
          const NBT_Array_gzipped = gzip(NBT_Array);
          if (workerHeader === "CREATE_NBT_SPLIT") {
            zipFile.file(`${uploadedImage_baseFilename}_${whichMap_x}_${whichMap_y}.nbt`, NBT_Array_gzipped);
            if (numberOfSplitsCalculated === optionValue_mapSize_x * optionValue_mapSize_y) {
              zipFile.generateAsync({ type: "blob" }).then((content) => {
                downloadBlobFile(content, `${uploadedImage_baseFilename}.zip`);
              });
            }
          } else {
            const downloadBlob = new Blob([NBT_Array_gzipped], { type: "application/x-minecraft-level" });
            downloadBlobFile(downloadBlob, `${uploadedImage_baseFilename}.nbt`);
          }
          break;
        }
        case "MAPDAT_BYTES": {
          const t1 = performance.now();
          console.log(`Created Mapdat by ${(t1 - t0).toString()}ms`);
          numberOfSplitsCalculated++;
          const { Mapdat_Bytes, whichMap_x, whichMap_y } = e.data.body;
          const Mapdat_Bytes_gzipped = gzip(Mapdat_Bytes);
          const downloadBlob = new Blob([Mapdat_Bytes_gzipped], { type: "application/x-minecraft-level" });
          downloadBlobFile(downloadBlob, optionValue_mapdatFilenameUseId
            ? `map_${(optionValue_mapdatFilenameIdStart + whichMap_y * optionValue_mapSize_x + whichMap_x).toString()}.dat`
            : `${uploadedImage_baseFilename}_${whichMap_x.toString()}_${whichMap_y.toString()}.dat`);
          break;
        }
        case "MAPDAT_BYTES_ZIP": {
          const t1 = performance.now();
          console.log(`Created Mapdat by ${(t1 - t0).toString()}ms`);
          numberOfSplitsCalculated++;
          const { Mapdat_Bytes, whichMap_x, whichMap_y } = e.data.body;
          const Mapdat_Bytes_gzipped = gzip(Mapdat_Bytes);
          zipFile.file(
            optionValue_mapdatFilenameUseId
              ? `map_${(optionValue_mapdatFilenameIdStart + whichMap_y * optionValue_mapSize_x + whichMap_x).toString()}.dat`
              : `${uploadedImage_baseFilename}_${whichMap_x.toString()}_${whichMap_y.toString()}.dat`,
            Mapdat_Bytes_gzipped
          );
          if (numberOfSplitsCalculated === optionValue_mapSize_x * optionValue_mapSize_y) {
            zipFile.generateAsync({ type: "blob" }).then((content) => {
              downloadBlobFile(content, `${uploadedImage_baseFilename}.zip`);
            });
          }
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

  finishLitematicExport = async (litematicFiles, artName) => {
    const { currentMaterialsData, optionValue_mapSize_x, optionValue_mapSize_y } = this.props;
    const width = currentMaterialsData.pixelsWidth || 128 * optionValue_mapSize_x;
    const height = currentMaterialsData.pixelsHeight || 128 * optionValue_mapSize_y;
    try {
      const canvas = pixelsToCanvas(currentMaterialsData.pixelsData, width, height);
      const pngBlob = await canvasToBlob(canvas, "image/png");
      const result = await exportArtZip({
        artName,
        litematicFiles,
        pngBlob,
        pngName: `${artName}.png`,
      });
      this.setState({
        buttonWidth_Litematic: 1,
        litematicExportInProgress: false,
        litematicStatus: `ZIP: ${result.filename}`,
      });
    } catch (error) {
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
    if (Object.entries(currentMaterialsData.currentSelectedBlocks).every((entry) => entry[1] === "-1")) {
      window.alert(this.t("STUDIO/NO-BLOCKS", "No blocks selected."));
      return;
    }
    if (this.state.litematicExportInProgress) return;

    const artName = sanitizeFilename(uploadedImage_baseFilename || "MyArt");
    const expected = optionValue_mapSize_x * optionValue_mapSize_y;
    const files = [];
    let received = 0;

    this.nbtWorker.terminate();
    this.resetButtonWidths();
    this.setState({
      litematicExportInProgress: true,
      litematicStatus: this.t("STUDIO/PREPARING-LITEMATIC", "Preparing .litematic..."),
    });
    this.nbtWorker = new WorkerBuilder(NBTWorker);
    this.nbtWorker.onmessage = (e) => {
      switch (e.data.head) {
        case "PROGRESS_REPORT_CREATE_LITEMATIC_SPLIT": {
          this.setState({ buttonWidth_Litematic: (received + e.data.body) / expected });
          break;
        }
        case "LITEMATIC_ARRAY": {
          received++;
          const { Litematic_Array, whichMap_x, whichMap_y } = e.data.body;
          const bytes = gzip(Litematic_Array);
          const filename = expected > 1 ? `${artName}_${whichMap_x}_${whichMap_y}.litematic` : `${artName}.litematic`;
          files.push({ name: filename, bytes });
          this.setState({ buttonWidth_Litematic: (received - 1 + 0.98) / expected });
          if (received === expected) {
            this.finishLitematicExport(files, artName);
          }
          break;
        }
        default: {
          if (e.data.head && e.data.head.startsWith("PROGRESS_REPORT")) {
            break;
          }
          throw new Error("Unknown worker response header");
        }
      }
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
        pixelsData: currentMaterialsData.pixelsData,
        maps: currentMaterialsData.maps,
        currentSelectedBlocks: currentMaterialsData.currentSelectedBlocks,
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
      this.nbtWorker.terminate();
      this.resetButtonWidths();
      this.setState({ mapPreviewWorker_onFinishCallback: null });
    } else if (!mapPreviewWorker_inProgress && this.state.mapPreviewWorker_onFinishCallback !== null) {
      this.state.mapPreviewWorker_onFinishCallback();
      this.setState({ mapPreviewWorker_onFinishCallback: null });
    }
  }

  componentWillUnmount() {
    this.nbtWorker.terminate();
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
            <div className="greenButton" onClick={this.onViewOnlineClicked}>
              <span className="greenButton_text_dummy">{getLocaleString("VIEW-ONLINE/TITLE")}</span>
              <span className="greenButton_text">{getLocaleString("VIEW-ONLINE/TITLE")}</span>
              <div
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_viewOnline * 100)}%`,
                }}
              />
            </div>
          </Tooltip>
          <br />
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-TT")}>
            <div className="greenButton" onClick={this.onGetNBTClicked}>
              <span className="greenButton_large_text_dummy">{getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD")}</span>
              <span className="greenButton_large_text">{getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD")}</span>
              <div
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_NBT_Joined * 100)}%`,
                }}
              />
            </div>
          </Tooltip>
          <br />
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT-TT")}>
            <div className="greenButton" onClick={this.onGetNBTSplitClicked}>
              <span className="greenButton_text_dummy">{`${getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT")} .ZIP`}</span>
              <span className="greenButton_text">{`${getLocaleString("DOWNLOAD/NBT-SPECIFIC/DOWNLOAD-SPLIT")} .ZIP`}</span>
              <div
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_NBT_Split * 100)}%`,
                }}
              />
            </div>
          </Tooltip>
          <br />
          <Tooltip tooltipText={this.t("STUDIO/LITEMATIC-TT", "Download .litematic and PNG as a ZIP archive")}>
            <div className="greenButton greenButton_wide" onClick={this.onGetLitematicClicked}>
              <span className="greenButton_text_dummy">{this.t("STUDIO/LITEMATIC-BUTTON", "Download .litematic + PNG")}</span>
              <span className="greenButton_text">{this.t("STUDIO/LITEMATIC-BUTTON", "Download .litematic + PNG")}</span>
              <div
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_Litematic * 100)}%`,
                }}
              />
            </div>
          </Tooltip>
          {litematicStatus ? <div className="greenButton_status">{litematicStatus}</div> : null}
          <br />
        </React.Fragment>
      );
    } else {
      buttons_mapModeConditional = (
        <React.Fragment>
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD-TT")}>
            <div className="greenButton" onClick={this.onGetMapdatSplitClicked}>
              <span className="greenButton_large_text_dummy">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")}`}</span>
              <span className="greenButton_large_text">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")}`}</span>
              <div
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_Mapdat_Split * 100)}%`,
                }}
              />
            </div>
          </Tooltip>
          <br />
          <Tooltip tooltipText={getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD-TT")}>
            <div className="greenButton" onClick={this.onGetMapdatSplitZipClicked}>
              <span className="greenButton_large_text_dummy">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")} .ZIP`}</span>
              <span className="greenButton_large_text">{`${getLocaleString("DOWNLOAD/MAPDAT-SPECIFIC/DOWNLOAD")} .ZIP`}</span>
              <div
                className="greenButton_progressDiv"
                style={{
                  width: `${Math.floor(buttonWidth_Mapdat_Split * 100)}%`,
                }}
              />
            </div>
          </Tooltip>
          <br />
        </React.Fragment>
      );
    }
    const buttonsDiv = (
      <div>
        {buttons_mapModeConditional}
      </div>
    );
    return buttonsDiv;
  }
}

export default GreenButtons;
