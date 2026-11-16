import React, { Component } from "react";

import Tooltip from "../tooltip";
import BlockSelectionAddCustom from "./blockSelectionAddCustom/blockSelectionAddCustom";
import BlockImage from "./blockImage";

import MapModes from "./json/mapModes.json";
import SupportedVersions from "./json/supportedVersions.json";

import { presetName } from "../../presets/presetFormat";
import { colourSetDiagramPoint, colourSetToneRGB, pickBlockForColourSet } from "./autoPalette";

import "./blockSelection.css";

class BlockSelection extends Component {
  state = {
    lastSelectedCustomBlock: null, // {colourSetId, blockId}
    paletteOpen: false,
    paletteSearch: "",
    paletteFocusColourSetId: null,
    /* Порядок списка блоков в модалке палитры. */
    paletteSort: "name",
    /* Сколько цветов искать в картинке для автопалитры. */
    autoPaletteCount: 8,
  };

  constructor(props) {
    super(props);
    this.paletteBodyRef = React.createRef();
    this.paletteModalRef = React.createRef();
    this.previouslyFocusedElement = null;
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
    /* Запоминаем, где был фокус — вернём его при закрытии модалки. */
    this.previouslyFocusedElement = document.activeElement;
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
    /* Возвращаем фокус на элемент, который открыл модалку. */
    if (this.previouslyFocusedElement && typeof this.previouslyFocusedElement.focus === "function") {
      this.previouslyFocusedElement.focus();
    }
    this.previouslyFocusedElement = null;
  };

  /* Ловушка фокуса: Tab не должен уводить фокус за пределы модалки. */
  handlePaletteKeyDown = (event) => {
    if (event.key !== "Tab") return;
    const modal = this.paletteModalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
      /* Id блока может быть 0 — это обычный номер, а не «ничего не
         выбрано». Поэтому проверяем на undefined, а не на правдивость. */
      .filter(([colourSetId]) => {
        const blockId = selectedBlocks[colourSetId];
        return blockId !== undefined && blockId !== null && blockId !== "-1";
      })
      .map(([colourSetId]) => ({ colourSetId, blockId: selectedBlocks[colourSetId] }));
  };

  getFilteredColourSets = () => {
    const { optionValue_version } = this.props;
    const query = this.state.paletteSearch.trim().toLowerCase();
    const rows = this.getAvailableColourSets()
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

    /* Порядок списка: по названию или по яркости. По яркости палитра
       читается как шкала — тёмное сверху, светлое снизу. */
    if (this.state.paletteSort === "brightness") {
      rows.sort((first, second) => {
        const firstLuma = colourSetDiagramPoint(first.colourSet).luma;
        const secondLuma = colourSetDiagramPoint(second.colourSet).luma;
        if (firstLuma !== secondLuma) return firstLuma - secondLuma;
        return first.colourSet.colourName.localeCompare(second.colourSet.colourName);
      });
    } else {
      rows.sort((first, second) => first.colourSet.colourName.localeCompare(second.colourSet.colourName));
    }
    return rows;
  };

  /* Точки диаграммы: яркость по горизонтали, цветность по вертикали. */
  getDiagramPoints = () => {
    const { selectedBlocks } = this.props;
    return this.getAvailableColourSets().map(([colourSetId, colourSet]) => {
      const point = colourSetDiagramPoint(colourSet);
      return {
        colourSetId,
        colourSet,
        luma: point.luma,
        chroma: point.chroma,
        rgb: colourSetToneRGB(colourSet),
        selected: !!selectedBlocks[colourSetId] && selectedBlocks[colourSetId] !== "-1",
      };
    });
  };

  /* Клик по точке диаграммы выбирает набор блоков: берётся первый блок,
     который есть в выбранной версии игры. */
  handleDiagramClick = (colourSetId) => {
    const { coloursJSON, optionValue_version, onChangeColourSetBlock } = this.props;
    const colourSet = coloursJSON[colourSetId];
    if (!colourSet) return;
    const blockId = pickBlockForColourSet(colourSet, optionValue_version.MCVersion);
    if (!blockId) return;
    onChangeColourSetBlock(colourSetId, blockId);
    this.setState({ paletteFocusColourSetId: colourSetId });
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
      const replaceHint = getLocaleString("BLOCK-SELECTION/PALETTE/REPLACE");
      return (
        <button
          type="button"
          key={colourSetId}
          className="paletteSummaryItem"
          title={`${label} — ${replaceHint}`}
          aria-label={`${label} — ${replaceHint}`}
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
      imageColourSetIds,
    } = this.props;
    const { paletteFocusColourSetId } = this.state;
    const latestVersion = Object.values(SupportedVersions)[Object.keys(SupportedVersions).length - 1].MCVersion;
    /* Набор, который встречается в картинке, помечается: он точно
       пригодится. */
    const presentInImage = !!(imageColourSetIds && imageColourSetIds.has(colourSetId));
    return (
      <div
        key={colourSetId}
        data-colour-set={colourSetId}
        className={`colourSet${paletteFocusColourSetId === colourSetId ? " focused" : ""}${
          presentInImage ? " presentInImage" : ""
        }`}
      >
        <div className="colourSetLabel" title={colourSet.colourName}>
          {colourSet.colourName}
          {presentInImage ? (
            <span
              className="colourSetPresent"
              title={getLocaleString("BLOCK-SELECTION/PALETTE/PRESENT-TT")}
              aria-label={getLocaleString("BLOCK-SELECTION/PALETTE/PRESENT-TT")}
            >
              ●
            </span>
          ) : null}
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

  /* Диаграмма палитры: по горизонтали яркость, по вертикали цветность.
     Точка — набор блоков; нажатие выбирает его. */
  renderDiagram = () => {
    const { getLocaleString, imageColourSetIds } = this.props;
    const points = this.getDiagramPoints();
    if (points.length === 0) return null;
    const maxChroma = Math.max(20, ...points.map((point) => point.chroma));
    return (
      <div className="paletteDiagram">
        <svg
          className="paletteDiagramSvg"
          viewBox="0 0 100 60"
          preserveAspectRatio="none"
          role="img"
          aria-label={getLocaleString("BLOCK-SELECTION/PALETTE/DIAGRAM")}
        >
          <line x1="0" y1="59.5" x2="100" y2="59.5" className="paletteDiagramAxis" />
          <line x1="0.5" y1="0" x2="0.5" y2="60" className="paletteDiagramAxis" />
          {points.map((point) => {
            const x = Math.max(0, Math.min(100, point.luma));
            const y = 60 - Math.max(0, Math.min(60, (point.chroma / maxChroma) * 58));
            const present = !!(imageColourSetIds && imageColourSetIds.has(point.colourSetId));
            return (
              <circle
                key={point.colourSetId}
                cx={x}
                cy={y}
                r={point.selected ? 2.2 : 1.3}
                className={`paletteDiagramPoint${point.selected ? " selected" : ""}${
                  present ? " present" : ""
                }`}
                fill={`rgb(${point.rgb.join(", ")})`}
                onClick={() => this.handleDiagramClick(point.colourSetId)}
              >
                <title>{point.colourSet.colourName}</title>
              </circle>
            );
          })}
        </svg>
        <div className="paletteDiagramLegend">
          <span>{getLocaleString("BLOCK-SELECTION/PALETTE/DIAGRAM-LUMA")}</span>
          <span>{getLocaleString("BLOCK-SELECTION/PALETTE/DIAGRAM-CHROMA")}</span>
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
        <div
          className="paletteModal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paletteModalTitle"
          ref={this.paletteModalRef}
          onKeyDown={this.handlePaletteKeyDown}
        >
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
          <div className="paletteModalTools">
            <label className="paletteModalSort">
              <span>{getLocaleString("BLOCK-SELECTION/PALETTE/SORT")}</span>
              <select
                value={this.state.paletteSort}
                onChange={(event) => this.setState({ paletteSort: event.target.value })}
                aria-label={getLocaleString("BLOCK-SELECTION/PALETTE/SORT")}
              >
                <option value="name">{getLocaleString("BLOCK-SELECTION/PALETTE/SORT-NAME")}</option>
                <option value="brightness">{getLocaleString("BLOCK-SELECTION/PALETTE/SORT-BRIGHTNESS")}</option>
              </select>
            </label>
            <label className="paletteModalAutoCount">
              <span>{getLocaleString("BLOCK-SELECTION/PALETTE/AUTO-COUNT")}</span>
              <input
                type="number"
                min="1"
                max="32"
                step="1"
                value={this.state.autoPaletteCount}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10);
                  this.setState({ autoPaletteCount: isNaN(value) ? 1 : Math.max(1, Math.min(32, value)) });
                }}
                aria-label={getLocaleString("BLOCK-SELECTION/PALETTE/AUTO-COUNT")}
              />
            </label>
            <button
              type="button"
              className="paletteModalAutoButton"
              onClick={() => this.props.onAutoPalette(this.state.autoPaletteCount)}
              disabled={!this.props.onAutoPalette || !(this.props.imageColours || []).length}
              title={getLocaleString("BLOCK-SELECTION/PALETTE/AUTO-TT")}
            >
              {getLocaleString("BLOCK-SELECTION/PALETTE/AUTO")}
            </button>
            {this.props.autoPaletteResult ? (
              <span className="paletteModalAutoStatus">
                {this.props.autoPaletteResult.empty
                  ? getLocaleString("BLOCK-SELECTION/PALETTE/AUTO-NO-IMAGE")
                  : getLocaleString("BLOCK-SELECTION/PALETTE/AUTO-RESULT").replace("{count}", String(this.props.autoPaletteResult.applied))}
              </span>
            ) : null}
          </div>
          <div className="paletteModalBody" ref={this.paletteBodyRef}>
            {this.renderDiagram()}
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
      onExportPresets,
      onImportPresets,
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
              {presetName(preset, getLocaleString)}
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
        <Tooltip tooltipText={getLocaleString("BLOCK-SELECTION/PRESETS/EXPORT-JSON-TT")}>
          <button type="button" onClick={onExportPresets}>
            {getLocaleString("BLOCK-SELECTION/PRESETS/EXPORT-JSON")}
          </button>
        </Tooltip>
        <Tooltip tooltipText={getLocaleString("BLOCK-SELECTION/PRESETS/IMPORT-JSON-TT")}>
          <label className="blockSelectionImportLabel">
            {getLocaleString("BLOCK-SELECTION/PRESETS/IMPORT-JSON")}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                onImportPresets(event.target.files && event.target.files[0]);
                event.target.value = "";
              }}
            />
          </label>
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
