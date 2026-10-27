import React, { Component } from "react";

import Tooltip from "../tooltip";
import BlockSelectionAddCustom from "./blockSelectionAddCustom/blockSelectionAddCustom";
import BlockImage from "./blockImage";

import MapModes from "./json/mapModes.json";
import SupportedVersions from "./json/supportedVersions.json";

import "./blockSelection.css";

class BlockSelection extends Component {
  state = {
    lastSelectedCustomBlock: null, // {colourSetId, blockId}
    paletteOpen: false,
    paletteSearch: "",
    paletteFocusColourSetId: null,
  };

  constructor(props) {
    super(props);
    this.paletteBodyRef = React.createRef();
  }

  componentDidMount() {
    document.addEventListener("keydown", this.handleGlobalKeyDown);
  }

  componentWillUnmount() {
    document.removeEventListener("keydown", this.handleGlobalKeyDown);
    this.unlockBodyScroll();
  }

  cssRGB(RGBArray) {
    // RGB array to css compatible string
    return `rgb(${RGBArray.join(", ")})`;
  }

  handleGlobalKeyDown = (event) => {
    if (event.key === "Escape" && this.state.paletteOpen) {
      this.closePalette();
    }
  };

  lockBodyScroll = () => {
    document.body.classList.add("paletteModalOpen");
  };

  unlockBodyScroll = () => {
    document.body.classList.remove("paletteModalOpen");
  };

  openPalette = (colourSetId = null) => {
    this.setState(
      {
        paletteOpen: true,
        paletteSearch: "",
        paletteFocusColourSetId: colourSetId,
      },
      () => {
        this.lockBodyScroll();
        if (colourSetId !== null) {
          this.scrollToColourSet(colourSetId);
        }
      }
    );
  };

  closePalette = () => {
    this.unlockBodyScroll();
    this.setState({
      paletteOpen: false,
      paletteSearch: "",
      paletteFocusColourSetId: null,
    });
  };

  handlePaletteOverlayMouseDown = (event) => {
    if (event.target === event.currentTarget) {
      this.closePalette();
    }
  };

  handlePaletteSearch = (event) => {
    this.setState({ paletteSearch: event.target.value });
  };

  scrollToColourSet = (colourSetId) => {
    window.requestAnimationFrame(() => {
      const body = this.paletteBodyRef.current;
      if (!body) return;
      const row = body.querySelector(`[data-colour-set="${colourSetId}"]`);
      if (!row) return;
      const bodyRect = body.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      body.scrollTop += rowRect.top - bodyRect.top - bodyRect.height / 2 + rowRect.height / 2;
    });
  };

  getColourSetBox = (colourSet) => {
    const { optionValue_staircasing } = this.props;
    let background;
    switch (optionValue_staircasing) {
      case MapModes.SCHEMATIC_NBT.staircaseModes.OFF.uniqueId:
      case MapModes.MAPDAT.staircaseModes.OFF.uniqueId: {
        background = this.cssRGB(colourSet.tonesRGB.normal);
        break;
      }
      case MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId:
      case MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId:
      case MapModes.MAPDAT.staircaseModes.ON.uniqueId: {
        background = `linear-gradient(${this.cssRGB(colourSet.tonesRGB.dark)} 33%, ${this.cssRGB(colourSet.tonesRGB.normal)} 33%, ${this.cssRGB(
          colourSet.tonesRGB.normal
        )} 66%, ${this.cssRGB(colourSet.tonesRGB.light)} 66%)`;
        break;
      }
      case MapModes.MAPDAT.staircaseModes.ON_UNOBTAINABLE.uniqueId: {
        background = `linear-gradient(${this.cssRGB(colourSet.tonesRGB.unobtainable)} 25%, ${this.cssRGB(colourSet.tonesRGB.dark)} 25%, ${this.cssRGB(
          colourSet.tonesRGB.dark
        )} 50%, ${this.cssRGB(colourSet.tonesRGB.normal)} 50%, ${this.cssRGB(colourSet.tonesRGB.normal)} 75%, ${this.cssRGB(colourSet.tonesRGB.light)} 75%)`;
        break;
      }
      case MapModes.SCHEMATIC_NBT.staircaseModes.FULL_DARK.uniqueId:
      case MapModes.MAPDAT.staircaseModes.FULL_DARK.uniqueId: {
        background = this.cssRGB(colourSet.tonesRGB.dark);
        break;
      }
      case MapModes.SCHEMATIC_NBT.staircaseModes.FULL_LIGHT.uniqueId:
      case MapModes.MAPDAT.staircaseModes.FULL_LIGHT.uniqueId: {
        background = this.cssRGB(colourSet.tonesRGB.light);
        break;
      }
      case MapModes.MAPDAT.staircaseModes.FULL_UNOBTAINABLE.uniqueId: {
        background = this.cssRGB(colourSet.tonesRGB.unobtainable);
        break;
      }
      case MapModes.SCHEMATIC_NBT.staircaseModes.UPWARDS_ONLY.uniqueId: {
        background = `linear-gradient(${this.cssRGB(colourSet.tonesRGB.normal)} 50%, ${this.cssRGB(
          colourSet.tonesRGB.normal
        )} 50%, ${this.cssRGB(colourSet.tonesRGB.light)} 50%)`;
        break;
      }
      case MapModes.SCHEMATIC_NBT.staircaseModes.REVERSE_UPWARDS_ONLY.uniqueId: {
        background = `linear-gradient(${this.cssRGB(colourSet.tonesRGB.dark)} 50%, ${this.cssRGB(colourSet.tonesRGB.normal)} 50%, ${this.cssRGB(
          colourSet.tonesRGB.normal
        )} 50%`;
        break;
      }
      default: {
        throw new Error("Unknown staircasing value");
      }
    }
    return (
      <div
        className="colourSetBox"
        style={{
          background: background,
        }}
      />
    );
  };

  getColourSetTones = (colourSetId, colourSet, disabledTones, onToggleColourTone) => {
    const { optionValue_staircasing } = this.props;
    switch (optionValue_staircasing) {
      case MapModes.SCHEMATIC_NBT.staircaseModes.CLASSIC.uniqueId:
      case MapModes.SCHEMATIC_NBT.staircaseModes.VALLEY.uniqueId:
        return (
          <React.Fragment>
            <Tooltip tooltipText="DARK SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "dark")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.dark),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("dark") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("dark") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
            <Tooltip tooltipText="NORMAL SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "normal")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.normal),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("normal") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("normal") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
            <Tooltip tooltipText="BRIGHT SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "light")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.light),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("light") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("light") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
          </React.Fragment>
        );
      case MapModes.SCHEMATIC_NBT.staircaseModes.UPWARDS_ONLY.uniqueId:
        return (
          <React.Fragment>
            <Tooltip tooltipText="NORMAL SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "normal")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.normal),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("normal") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("normal") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
            <Tooltip tooltipText="BRIGHT SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "light")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.light),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("light") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("light") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
          </React.Fragment>
        );
      case MapModes.SCHEMATIC_NBT.staircaseModes.REVERSE_UPWARDS_ONLY.uniqueId:
        return (
          <React.Fragment>
            <Tooltip tooltipText="DARK SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "dark")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.dark),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("dark") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("dark") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
            <Tooltip tooltipText="NORMAL SHADE">
              <div
                className="colourSetBox"
                onClick={() => onToggleColourTone(colourSetId, "normal")}
                style={{
                  background: this.cssRGB(colourSet.tonesRGB.normal),
                  cursor: "pointer",
                  ...(!disabledTones[colourSetId].has("normal") && {
                    filter: "drop-shadow(0 0 4px #658968)"
                  }),
                  ...(disabledTones[colourSetId].has("normal") && {
                    opacity: 0.28,
                  })
                }}
              />
            </Tooltip>
          </React.Fragment>
        );
      default:
        return "";
    }
  };

  getAvailableColourSets = () => {
    const { coloursJSON, optionValue_version } = this.props;
    return Object.entries(coloursJSON).filter(([, colourSet]) =>
      Object.values(colourSet.blocks).some((block) => Object.keys(block.validVersions).includes(optionValue_version.MCVersion))
    );
  };

  getSelectedSummary = (availableColourSets) => {
    const { selectedBlocks } = this.props;
    return availableColourSets
      .filter(([colourSetId]) => selectedBlocks[colourSetId] && selectedBlocks[colourSetId] !== "-1")
      .map(([colourSetId]) => ({ colourSetId, blockId: selectedBlocks[colourSetId] }));
  };

  getFilteredColourSets = () => {
    const { optionValue_version } = this.props;
    const query = this.state.paletteSearch.trim().toLowerCase();
    return this.getAvailableColourSets()
      .map(([colourSetId, colourSet]) => {
        const blocks = Object.entries(colourSet.blocks).filter(([, block]) =>
          Object.keys(block.validVersions).includes(optionValue_version.MCVersion)
        );
        if (query === "") {
          return { colourSetId, colourSet, blocks };
        }
        const colourMatches = colourSet.colourName.toLowerCase().includes(query);
        const matchingBlocks = colourMatches
          ? blocks
          : blocks.filter(([, block]) => block.displayName.toLowerCase().includes(query));
        return {
          colourSetId,
          colourSet,
          blocks: matchingBlocks,
          visible: colourMatches || matchingBlocks.length > 0,
        };
      })
      .filter((row) => row.visible !== false);
  };

  renderPaletteSummary = (selectedSummary) => {
    const { coloursJSON, getLocaleString } = this.props;
    if (selectedSummary.length === 0) {
      return <span className="paletteSummaryEmpty">{getLocaleString("BLOCK-SELECTION/PALETTE/EMPTY")}</span>;
    }
    return selectedSummary.map(({ colourSetId, blockId }) => {
      const colourSet = coloursJSON[colourSetId];
      const block = colourSet && colourSet.blocks[blockId];
      if (!block) return null;
      const label = `${colourSet.colourName}: ${block.displayName}`;
      return (
        <button
          type="button"
          key={colourSetId}
          className="paletteSummaryItem"
          title={label}
          aria-label={label}
          onClick={() => this.openPalette(colourSetId)}
        >
          <BlockImage
            getLocaleString={getLocaleString}
            coloursJSON={coloursJSON}
            colourSetId={colourSetId}
            blockId={blockId}
            className="paletteSummaryBlock"
            style={{ backgroundColor: this.cssRGB(colourSet.tonesRGB.normal) }}
          />
        </button>
      );
    });
  };

  renderColourSetRow = (colourSetId, colourSet, blocks) => {
    const {
      coloursJSON,
      getLocaleString,
      onChangeColourSetBlock,
      selectedBlocks,
      disabledTones,
      onToggleColourTone,
    } = this.props;
    const { paletteFocusColourSetId } = this.state;
    const latestVersion = Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1].MCVersion;
    return (
      <div
        key={colourSetId}
        data-colour-set={colourSetId}
        className={`colourSet${paletteFocusColourSetId === colourSetId ? " focused" : ""}`}
      >
        <div className="colourSetLabel" title={colourSet.colourName}>
          {colourSet.colourName}
        </div>
        {this.getColourSetBox(colourSet)}
        {this.getColourSetTones(colourSetId, colourSet, disabledTones, onToggleColourTone)}
        <label>
          <Tooltip tooltipText={getLocaleString("NONE")}>
            <BlockImage
              getLocaleString={getLocaleString}
              coloursJSON={coloursJSON}
              colourSetId={colourSetId}
              blockId={"-1"}
              onClick={() => {
                onChangeColourSetBlock(colourSetId, "-1");
                this.setState({ paletteFocusColourSetId: colourSetId });
              }}
              style={{
                cursor: "pointer",
                ...(selectedBlocks[colourSetId] === "-1" && {
                  filter: "drop-shadow(0 0 4px #658968)",
                  backgroundColor: "#658968",
                }),
              }}
            />
          </Tooltip>
        </label>
        <div className={"colourSetBlocks"}>
          {blocks.map(([blockId, block]) => (
            <label key={blockId}>
              <Tooltip tooltipText={block.displayName}>
                {selectedBlocks[colourSetId] === blockId && !(latestVersion in block.validVersions) && (
                  // if doesn't support latest version
                  <div
                    style={{
                      position: "absolute",
                      paddingLeft: "28px",
                      zIndex: 110,
                    }}
                  >
                    <Tooltip
                      tooltipText={`${getLocaleString("BLOCK-SELECTION/UNSUPPORTED-PAST")} ${
                        Object.keys(block.validVersions)[Object.keys(block.validVersions).length - 1]
                      }`}
                      textStyleOverrides={{
                        whiteSpace: "nowrap",
                        backgroundColor: "red",
                      }}
                    >
                      <h2 style={{ backgroundColor: "red", margin: "0" }}>{"!"}</h2>
                    </Tooltip>
                  </div>
                )}
                <BlockImage
                  coloursJSON={coloursJSON}
                  colourSetId={colourSetId}
                  blockId={blockId}
                  onClick={() => {
                    onChangeColourSetBlock(colourSetId, blockId);
                    this.setState({
                      paletteFocusColourSetId: colourSetId,
                      ...(block.presetIndex === "CUSTOM" && {
                        lastSelectedCustomBlock: { colourSetId, blockId },
                      }),
                    });
                  }}
                  style={{
                    cursor: "pointer",
                    ...(selectedBlocks[colourSetId] === blockId && {
                      filter: "drop-shadow(0 0 4px #658968)",
                      ...(block.presetIndex !== "CUSTOM" && {
                        backgroundColor: "#658968",
                      }),
                    }),
                  }}
                />
              </Tooltip>
            </label>
          ))}
        </div>
      </div>
    );
  };

  renderPaletteModal = (availableColourSets) => {
    const {
      getLocaleString,
      coloursJSON,
      handleAddCustomBlock,
      handleDeleteCustomBlock,
    } = this.props;
    const { paletteOpen, paletteSearch, lastSelectedCustomBlock } = this.state;
    if (!paletteOpen) return null;
    const filteredColourSets = this.getFilteredColourSets();
    const selectedCount = this.getSelectedSummary(availableColourSets).length;
    return (
      <div className="paletteModalOverlay" onMouseDown={this.handlePaletteOverlayMouseDown}>
        <div className="paletteModal" role="dialog" aria-modal="true" aria-labelledby="paletteModalTitle">
          <div className="paletteModalHeader">
            <div className="paletteModalHeading">
              <h2 id="paletteModalTitle">{getLocaleString("BLOCK-SELECTION/PALETTE/TITLE")}</h2>
              <span className="paletteModalCount">
                {getLocaleString("BLOCK-SELECTION/PALETTE/COUNT")}: {selectedCount} / {availableColourSets.length}
              </span>
            </div>
            <input
              type="search"
              className="paletteModalSearch"
              value={paletteSearch}
              onChange={this.handlePaletteSearch}
              placeholder={getLocaleString("BLOCK-SELECTION/PALETTE/SEARCH")}
              aria-label={getLocaleString("BLOCK-SELECTION/PALETTE/SEARCH")}
              autoFocus
            />
            <button type="button" className="paletteModalClose" onClick={this.closePalette}>
              {getLocaleString("BLOCK-SELECTION/PALETTE/DONE")}
            </button>
          </div>
          <div className="paletteModalBody" ref={this.paletteBodyRef}>
            {filteredColourSets.map(({ colourSetId, colourSet, blocks }) =>
              this.renderColourSetRow(colourSetId, colourSet, blocks)
            )}
            {filteredColourSets.length === 0 && (
              <p className="paletteModalEmpty">{getLocaleString("BLOCK-SELECTION/PALETTE/NO-RESULTS")}</p>
            )}
            <div className="paletteModalCustom">
              <BlockSelectionAddCustom
                getLocaleString={getLocaleString}
                coloursJSON={coloursJSON}
                onAddCustomBlock={handleAddCustomBlock}
                onDeleteCustomBlock={handleDeleteCustomBlock}
                lastSelectedCustomBlock={lastSelectedCustomBlock}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  render() {
    const {
      getLocaleString,
      presets,
      selectedPresetName,
      canDeletePreset,
      onPresetChange,
      onDeletePreset,
      onSavePreset,
      onSharePreset,
      onGetPDNPaletteClicked,
    } = this.props;
    const availableColourSets = this.getAvailableColourSets();
    const selectedSummary = this.getSelectedSummary(availableColourSets);
    const presetsManagement = (
      <div className="blockSelectionPresets">
        <b>
          {getLocaleString("BLOCK-SELECTION/PRESETS/TITLE")}
          {":"}
        </b>{" "}
        <select id="presets" value={selectedPresetName} onChange={onPresetChange}>
          <option value="None">{getLocaleString("BLOCK-SELECTION/PRESETS/NONE")}</option>
          {presets.map((preset) => (
            <option value={preset.name} key={preset.name}>
              {"localeKey" in preset ? getLocaleString(preset.localeKey) : preset.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!canDeletePreset()} onClick={onDeletePreset}>
          {getLocaleString("BLOCK-SELECTION/PRESETS/DELETE")}
        </button>
        <button type="button" onClick={onSavePreset}>
          {getLocaleString("BLOCK-SELECTION/PRESETS/SAVE")}
        </button>
        <Tooltip tooltipText={getLocaleString("BLOCK-SELECTION/PRESETS/SHARE-TT")}>
          <button type="button" onClick={onSharePreset}>
            {getLocaleString("BLOCK-SELECTION/PRESETS/SHARE")}
          </button>
        </Tooltip>
        <Tooltip tooltipText={getLocaleString("BLOCK-SELECTION/PRESETS/DOWNLOAD-TT")}>
          <button type="button" onClick={onGetPDNPaletteClicked}>
            {getLocaleString("BLOCK-SELECTION/PRESETS/DOWNLOAD")}
          </button>
        </Tooltip>
      </div>
    );
    return (
      <div className="section blockSelectionDiv">
        <div className="blockSelectionToolbar">
          <div className="blockSelectionHeading">
            <h2 id="blockselectiontitle">{getLocaleString("BLOCK-SELECTION/TITLE")}</h2>
            <span className="blockSelectionCount">
              {getLocaleString("BLOCK-SELECTION/PALETTE/COUNT")}: {selectedSummary.length} / {availableColourSets.length}
            </span>
          </div>
          <button type="button" className="blockSelectionOpenButton" onClick={() => this.openPalette()}>
            {getLocaleString("BLOCK-SELECTION/PALETTE/OPEN")}
          </button>
        </div>
        {presetsManagement}
        <div className="blockSelectionSummary">
          <span className="blockSelectionSummaryTitle">{getLocaleString("BLOCK-SELECTION/PALETTE/SELECTED")}</span>
          <div className="paletteSummary">{this.renderPaletteSummary(selectedSummary)}</div>
        </div>
        {this.renderPaletteModal(availableColourSets)}
      </div>
    );
  }
}

export default BlockSelection;
