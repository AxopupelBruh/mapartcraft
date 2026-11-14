import React, { Component } from "react";

import Tooltip from "../tooltip";

import BlockImage from "./blockImage";

import "./materials.css";

class Materials extends Component {
  state = { onlyMaxPerSplit: false,
            sortMaterials: true,
          };

  alphaColorIdx = 61;

  onOnlyMaxPerSplitChange = () => {
    this.setState((currentState) => ({
      // nb this method of passing currentState instead of using this.state... is prefered; TODO neaten up controller uses
      onlyMaxPerSplit: !currentState.onlyMaxPerSplit,
    }));
  };

  onDisplaySortChange = () => {
    this.setState((currentState) => ({
      sortMaterials: !currentState.sortMaterials,
    }));
  };

  getMaterialsCount_nonZeroMaterialsItems() {
    const { coloursJSON, currentMaterialsData } = this.props;
    const { onlyMaxPerSplit, sortMaterials } = this.state;
    const materialsCount = {};
    for (const colourSetId of Object.keys(coloursJSON)) {
      materialsCount[colourSetId] = 0;
    }
    for (const row of currentMaterialsData.maps) {
      for (const map of row) {
        for (const [colourSetId, materialCount] of Object.entries(map.materials)) {
          if (colourSetId !== this.alphaColorIdx.toString()) {
            if (onlyMaxPerSplit) {
              materialsCount[colourSetId] = Math.max(materialsCount[colourSetId], materialCount);
            } else {
              materialsCount[colourSetId] += materialCount;
            }
          }
        }
      }
    }
    if (sortMaterials) {
      return Object.entries(materialsCount)
        .filter(([_, value]) => value !== 0)
        .sort((first, second) => {
          return second[1] - first[1];
        });
    } else {
      return Object.entries(materialsCount)
        .filter(([_, value]) => value !== 0)
    }
  }

  getMaterialsCount_supportBlock() {
    const { currentMaterialsData } = this.props;
    const { onlyMaxPerSplit } = this.state;
    let supportBlockCount = 0;
    currentMaterialsData.maps.forEach((row) => {
      row.forEach((map) => {
        const count = map.supportBlockCount;
        if (onlyMaxPerSplit) {
          supportBlockCount = Math.max(supportBlockCount, count);
        } else {
          supportBlockCount += count;
        }
      });
    });
    return supportBlockCount;
  }

  /* Разбивка количества на шалкеры, стопки и остаток:
     2070358 -> 1198SB+3ST+22 */
  formatMaterialCountBreakdown = (count) => {
    if (count < 64) return "";
    const numberOfShulkers = Math.floor(count / 1728);
    const numberOfStacks = Math.floor((count % 1728) / 64);
    const remainder = count % 64;

    const sb = numberOfShulkers > 0 ? `${numberOfShulkers}SB` : "";
    const stacks = numberOfStacks > 0 ? `${numberOfStacks}ST` : "";
    const items = remainder > 0 ? `${remainder}` : "";

    return [sb, stacks, items].filter((part) => part).join("+");
  };

  /* Короткая запись больших чисел: 2070358 -> ~2m, 1500 -> ~2k. */
  abbreviateMaterialCount = (count) => {
    if (count < 1000) return `${count}`;
    if (count < 1000000) return `~${Math.round(count / 1000)}k`;
    return `~${Math.round(count / 1000000)}m`;
  };

  /* Полное количество блоков показываем, когда включён режим «Only show max
     mats per split» — там числа небольшие. Без него суммируются все
     части карты, и точное число занимает пол-экрана, поэтому пишем
     коротко: ~2m (1198SB+3ST+22). */
  formatMaterialCount = (count) => {
    const breakdown = this.formatMaterialCountBreakdown(count);
    const number = this.state.onlyMaxPerSplit ? `${count}` : this.abbreviateMaterialCount(count);
    return breakdown ? `${number} (${breakdown})` : number;
  };

  /* Для буфера обмена всегда точное число: это список для закупки. */
  formatMaterialCountExact = (count) => {
    const breakdown = this.formatMaterialCountBreakdown(count);
    return breakdown ? `${count} (${breakdown})` : `${count}`;
  };

  colourSetIdAndBlockIdFromNBTName(blockName) {
    const { coloursJSON, optionValue_version } = this.props;
    for (const [colourSetId, colourSet] of Object.entries(coloursJSON)) {
      for (const [blockId, block] of Object.entries(colourSet.blocks)) {
        if (!(optionValue_version.MCVersion in block.validVersions)) {
          continue;
        }
        let blockNBTData = block.validVersions[optionValue_version.MCVersion];
        if (typeof blockNBTData === "string") {
          // this is of the form eg "&1.12.2"
          blockNBTData = block.validVersions[blockNBTData.slice(1)];
        }
        if (
          Object.keys(blockNBTData.NBTArgs).length === 0 && // no exotic blocks for noobline
          blockName.toLowerCase() === blockNBTData.NBTName.toLowerCase()
        ) {
          return { colourSetId, blockId };
        }
      }
    }
    return null; // if block not found
  }

  nbtNameToColourSetId(colourSetId) {
    const { coloursJSON, optionValue_version, currentMaterialsData } = this.props;
    const colourSet = coloursJSON[colourSetId];
    const selection = currentMaterialsData.currentSelectedBlocks[colourSetId];

    if (selection < 0) return null;

    const block = colourSet.blocks[selection];
    if (!(optionValue_version.MCVersion in block.validVersions)) {
      return null;
    }
    let blockNBTData = block.validVersions[optionValue_version.MCVersion];

    if (typeof blockNBTData === "string") {
      // this is of the form eg "&1.12.2"
      blockNBTData = block.validVersions[blockNBTData.slice(1)];
    }

    return blockNBTData.NBTName.toLowerCase();
  }

  copyToClipboard(nonZeroMaterialsItems, supportBlockCount) {
    const { optionValue_supportBlock} = this.props;

    const counts = {};

    for (const [colourSetId, count] of nonZeroMaterialsItems) {
      const mcId = this.nbtNameToColourSetId(colourSetId);
      counts[mcId] = (counts[mcId] || 0) + count;
    }

    if (supportBlockCount !== 0) {
      counts[optionValue_supportBlock] = (counts[optionValue_supportBlock] || 0) + supportBlockCount;
    }

    const sortedEntries = Object.entries(counts)
      .sort((first, second) => second[1] - first[1])
      .map(([key, count]) => [key, this.formatMaterialCountExact(count)]);

    const NBSP = String.fromCharCode(160); //non-breaking space
    const CRLF = String.fromCharCode(13, 10); //new line

    const results = ["```"];

    //calculate paddings
    let nameMaxLength = 0;

    for (const [key] of sortedEntries) {
      if (nameMaxLength < key.length)
        nameMaxLength = key.length;
    }

    //insert each entry
    for (const [key, val] of sortedEntries) {
      results.push(key.padEnd(nameMaxLength, NBSP) + " = " + val);
    }

    results.push("```");

    navigator.clipboard.writeText(results.join(CRLF));
  }

  render() {
    const { getLocaleString, coloursJSON, optionValue_supportBlock, currentMaterialsData, onChangeColourSetBlock } = this.props;
    const { onlyMaxPerSplit, sortMaterials } = this.state;
    const nonZeroMaterialsItems = this.getMaterialsCount_nonZeroMaterialsItems();
    const supportBlockCount = this.getMaterialsCount_supportBlock();
    const supportBlockIds = supportBlockCount === 0 ? null : this.colourSetIdAndBlockIdFromNBTName(optionValue_supportBlock);
    return (
      <div className="section materialsDiv">
        <h2>{getLocaleString("MATERIALS/TITLE")}</h2>
        <Tooltip tooltipText={getLocaleString("MATERIALS/SHOW-PER-SPLIT-TT")}>
          <b>
            {getLocaleString("MATERIALS/SHOW-PER-SPLIT")}
            {":"}
          </b>
        </Tooltip>{" "}
        <input type="checkbox" checked={onlyMaxPerSplit} onChange={this.onOnlyMaxPerSplitChange} />
        <br />
        <Tooltip tooltipText={getLocaleString("MATERIALS/SORTED-TT")}>
          <b>
            {getLocaleString("MATERIALS/SORTED")}
            {":"}
          </b>
        </Tooltip>{" "}
        <input type="checkbox" checked={sortMaterials} onChange={this.onDisplaySortChange} />
        <br />
        <button type="button" onClick={() => this.copyToClipboard(nonZeroMaterialsItems, supportBlockCount)}>{getLocaleString("MATERIALS/COPY-CLIPBOARD")}</button>
        <table id="materialtable">
          <tbody>
            <tr>
              <th>{getLocaleString("MATERIALS/BLOCK")}</th>
              <th>{getLocaleString("MATERIALS/AMOUNT")}</th>
            </tr>
            {supportBlockCount !== 0 && (
              <tr>
                <th>
                  <span className="materialBlockCell">
                    <Tooltip tooltipText={getLocaleString("MATERIALS/PLACEHOLDER-BLOCK-TT")}>
                      <BlockImage
                        getLocaleString={getLocaleString}
                        coloursJSON={coloursJSON}
                        colourSetId={supportBlockIds === null ? "64" : supportBlockIds.colourSetId}
                        blockId={supportBlockIds === null ? "2" : supportBlockIds.blockId}
                      />
                    </Tooltip>
                  </span>
                </th>
                <th className="materialAmountCell">{this.formatMaterialCount(supportBlockCount)}</th>
              </tr>
            )}
            {nonZeroMaterialsItems.map(([colourSetId, materialCount]) => {
              const blockId = currentMaterialsData.currentSelectedBlocks[colourSetId];
              return (
                <tr key={colourSetId}>
                  <th>
                    {/* Блок и кнопка удаления стоят рядом: раньше кнопка
                        уезжала на следующую строку и ломала таблицу. */}
                    <span className="materialBlockCell">
                      <Tooltip tooltipText={coloursJSON[colourSetId].blocks[blockId].displayName}>
                        <BlockImage coloursJSON={coloursJSON} colourSetId={colourSetId} blockId={blockId} />
                      </Tooltip>
                      <Tooltip tooltipText={getLocaleString("NONE")}>
                        <BlockImage
                          getLocaleString={getLocaleString}
                          coloursJSON={coloursJSON}
                          colourSetId={colourSetId}
                          blockId={"-1"}
                          onClick={() => onChangeColourSetBlock(colourSetId, "-1")}
                          className="materialBlockRemove"
                        />
                      </Tooltip>
                    </span>
                  </th>
                  <th className="materialAmountCell">{this.formatMaterialCount(materialCount)}</th>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
}

export default Materials;
