import React, { Component } from "react";

import OptionField from "./optionField";

import { OPTION_GROUP_TITLES, OPTION_TABS, optionsForGroup } from "./optionSchema";

import "./mapSettings.css";

class MapSettings extends Component {
  state = { activeTab: OPTION_TABS[0].id };

  /* Итоговое распространение ошибки по каналам = сила × баланс / 100.
     Так же считает воркер: (propagation / 100) * ditherStrength. */
  static effectivePropagation(values) {
    const strength = values.optionValue_dithering_strength || 0;
    return [
      values.optionValue_dithering_propagation_red,
      values.optionValue_dithering_propagation_green,
      values.optionValue_dithering_propagation_blue,
    ].map((propagation) => Math.round((strength * (propagation || 0)) / 100));
  }

  /* В группе могут быть несколько записей с одним кастомным полем
     (например, размер карты X и Y). Такое поле рисуется один раз. */
  static filterVisibleOptions(options, values) {
    const seenCustomFields = new Set();
    return options.filter((option) => {
      if (option.showIf && !option.showIf(values)) return false;
      if (option.custom) {
        if (seenCustomFields.has(option.custom)) return false;
        seenCustomFields.add(option.custom);
      }
      return true;
    });
  }

  renderGroup(group, optionValues, optionHandlers, getLocaleString, context) {
    const options = MapSettings.filterVisibleOptions(optionsForGroup(group), optionValues);
    if (options.length === 0) return null;
    return (
      <fieldset className="settingsGroup" key={group}>
        <legend>{getLocaleString(OPTION_GROUP_TITLES[group])}</legend>
        {options.map((option) => (
          <OptionField
            key={option.key}
            option={option}
            values={optionValues}
            handlers={optionHandlers}
            getLocaleString={getLocaleString}
            context={context}
          />
        ))}
        {group === "ditherBalance" ? (
          <small className="settingsBalanceHint">
            {getLocaleString("MAP-SETTINGS/DITHERING/BALANCE-HINT")}
            <br />
            <b>
              {getLocaleString("MAP-SETTINGS/DITHERING/EFFECTIVE")}:{" "}
              {MapSettings.effectivePropagation(optionValues).map((value, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? " · " : ""}
                  {"RGB"[index]} {value}%
                </React.Fragment>
              ))}
            </b>
          </small>
        ) : null}
        {group === "cleanup" ? (
          <React.Fragment>
            <div className="settingsCleanupPresets">
              {["clean", "soft", "detail", "off"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => context.onApplyCleanupPreset(preset)}
                >
                  {getLocaleString(`STUDIO/CLEANUP-${preset.toUpperCase()}`)}
                </button>
              ))}
            </div>
            <small className="settingsCleanupHint">{getLocaleString("STUDIO/CLEANUP-HINT")}</small>
          </React.Fragment>
        ) : null}
      </fieldset>
    );
  }

  render() {
    const { getLocaleString, optionValues, optionHandlers, context } = this.props;
    const { activeTab } = this.state;
    const activeTabDefinition = OPTION_TABS.find((tab) => tab.id === activeTab) || OPTION_TABS[0];

    return (
      <div className="section settingsDiv">
        <h2>{getLocaleString("MAP-SETTINGS/TITLE")}</h2>
        <div className="settingsTabs" role="tablist">
          {OPTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settingsTab-${tab.id}`}
              aria-selected={tab.id === activeTab}
              aria-controls="settingsTabPanel"
              className={`settingsTab${tab.id === activeTab ? " active" : ""}`}
              onClick={() => this.setState({ activeTab: tab.id })}
            >
              {getLocaleString(tab.labelKey)}
            </button>
          ))}
        </div>
        <div className="settingsTabPanel" id="settingsTabPanel" role="tabpanel" aria-labelledby={`settingsTab-${activeTab}`}>
          {activeTabDefinition.groups.map((group) =>
            this.renderGroup(group, optionValues, optionHandlers, getLocaleString, context)
          )}
        </div>
      </div>
    );
  }
}

export default MapSettings;
