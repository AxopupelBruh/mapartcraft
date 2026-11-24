import React, { Component } from "react";

import Header from "./header";
import Languages from "./languages";
import MapartController from "./mapart/mapartController";

import Locale from "../locale/locale";

import "./root.css";

class Root extends Component {
  state = {
    displayingCorruptedPresetWarning: false,
    displayingEdgeWarning: false,
  };

  constructor(props) {
    super(props);

    //show warning when using Edge
    if (!(/*@cc_on!@*/ (false || !!document["documentMode"])) && !!window["StyleMedia"]) {
      this.state.displayingEdgeWarning = true;
    }
  }

  /* Перевод строки по ключу "SECTION/KEY".

     Второй аргумент — запасной текст на случай, если ключа нет в словаре
     вообще. Раньше на этом месте стоял код языка: вызовы вида
     getLocaleString("MAP-SETTINGS/MAP-SIZE-SUMMARY", "{files} files…")
     трактовали английскую строку как код языка, и русский пользователь
     видел английский текст вместо своего. Теперь код языка — только
     внутренний аргумент (см. localeStringFor), а наружу — fallback. */
  getLocaleString = (stringName, fallback) => {
    const value = this.localeStringFor(stringName, this.props.match.params.countryCode);
    if (value !== null && value !== undefined) return value;
    return fallback !== undefined ? fallback : null;
  };

  /* Поиск строки в конкретном языке с откатом на английский. */
  localeStringFor = (stringName, countryCode) => {
    if (countryCode in Locale) {
      let stringSegments = stringName.split("/");
      const stringLast = stringSegments.pop();
      let folder = Locale[countryCode].strings;
      for (const stringSegment of stringSegments) {
        if (folder === undefined || folder === null) return null;
        folder = folder[stringSegment];
      }
      if (folder === undefined || folder === null || folder[stringLast] === null || folder[stringLast] === undefined) {
        // Fall back to English, but do not recurse forever when a new key has
        // not been translated yet.
        return countryCode === "en" ? null : this.localeStringFor(stringName, "en");
      }
      return folder[stringLast];
    }
    return this.localeStringFor(stringName, "en");
  };

  onEdgeWarningButtonClick = () => {
    this.setState({ displayingEdgeWarning: false });
  };

  onCorruptedPresetWarningButtonClick = () => {
    this.setState({ displayingCorruptedPresetWarning: false });
  };

  showCorruptedPresetWarning = () => {
    this.setState({ displayingCorruptedPresetWarning: true });
  };

  render() {
    const { displayingCorruptedPresetWarning, displayingEdgeWarning } = this.state;
    return (
      <React.Fragment>
        <div className="titleAndLanguages">
          <span>
            <h1>
              MapartCraft <small className="titleSubtitle">{this.getLocaleString("STUDIO/TITLE") || "Local Studio"}</small>
            </h1>
            <small className="forkCredit">
              {this.getLocaleString("FORK-LABEL")}
              <a href="https://github.com/mike2b2t/mapartcraft" target="_blank" rel="noopener noreferrer">
                mike2b2t/mapartcraft
              </a>
            </small>
            {this.props.match.params.countryCode && this.props.match.params.countryCode !== "en" && <small>{this.getLocaleString("TRANSLATION/CREDITS")}</small>}
          </span>
          <Languages getLocaleString={this.getLocaleString} />
        </div>
        <Header getLocaleString={this.getLocaleString} countryCode={this.props.match.params.countryCode} />
        <MapartController getLocaleString={this.getLocaleString} onCorruptedPreset={this.showCorruptedPresetWarning} />
        <div className="fixedMessages">
          {displayingEdgeWarning ? (
            <div className="fixedMessage">
              <p>{this.getLocaleString("EDGE-WARNING").replace("\\n", "\n")}</p>
              <button
                type="button"
                onClick={this.onEdgeWarningButtonClick}
                aria-label={this.getLocaleString("EDGE-WARNING-CLOSE")}
                title={this.getLocaleString("EDGE-WARNING-CLOSE")}
              >
                ✔️
              </button>
            </div>
          ) : null}
          {displayingCorruptedPresetWarning ? (
            <div className="fixedMessage">
              <p>{this.getLocaleString("BLOCK-SELECTION/PRESETS/IMPORT-ERROR-CORRUPTED")}</p>
              <button
                type="button"
                onClick={this.onCorruptedPresetWarningButtonClick}
                aria-label={this.getLocaleString("PRESET-ERROR-CLOSE")}
                title={this.getLocaleString("PRESET-ERROR-CLOSE")}
              >
                ❗
              </button>
            </div>
          ) : null}
        </div>
      </React.Fragment>
    );
  }
}

export default Root;
