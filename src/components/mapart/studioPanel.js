import React, { Component } from "react";

import { STYLE_PRESETS } from "../../presets/stylePresets";
import { attachWheel, wheelValue } from "./wheelValue";

import "./studioPanel.css";

class StudioPanel extends Component {
  ditherStrengthRef = React.createRef();
  projectInputRef = React.createRef();

  componentDidMount() {
    /* Колесо мыши над ползунком силы дизеринга меняет значение. */
    this.detachWheel = attachWheel(this.ditherStrengthRef.current, (event) => {
      const node = this.ditherStrengthRef.current;
      /* Выключенный ползунок не реагирует — как и на перетаскивание. */
      if (node && node.disabled) return;
      const { optionValue_dithering_strength, onOptionChange_dithering_strength } = this.props;
      const next = wheelValue(event, optionValue_dithering_strength, 0, 200, 5);
      if (next === null) return;
      onOptionChange_dithering_strength(next);
    });
  }

  componentWillUnmount() {
    if (this.detachWheel) this.detachWheel();
  }

  /* Открытие проекта: файл выбирается через скрытый input. Значение
     сбрасывается, иначе повторный выбор того же файла не сработает. */
  onProjectFileChosen = (event) => {
    const { onOpenProject } = this.props;
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (file && onOpenProject) onOpenProject(file);
  };

  t(key, fallback) {
    const { getLocaleString } = this.props;
    const value = getLocaleString ? getLocaleString(key) : null;
    return value || fallback;
  }

  render() {
    const {
      stylePreset,
      optionValue_style,
      activeStyleId,
      styleModified,
      onApplyStyle,
      optionValue_resizeMethod,
      onOptionChange_resizeMethod,
      optionValue_autoDetectPixelScale,
      onOptionChange_autoDetectPixelScale,
      optionValue_showPixelGrid,
      onOptionChange_showPixelGrid,
      optionValue_dithering,
      optionValue_dithering_strength,
      onOptionChange_dithering_strength,
      detectedPixelScale,
      sessionStatus,
      onResetSession,
      sessionResetAvailable,
      onSaveProject,
      projectSaveAvailable,
      projectStatus,
    } = this.props;

    /* activeStyleId приходит из контроллера: он учитывает, что настройки
       могли измениться вручную, и подсвечивает последний применённый стиль. */
    const activeStyle = activeStyleId || (stylePreset !== "custom" ? stylePreset : optionValue_style) || "clean";
    return (
      <div className="studioPanel">
        <div className="studioPanel_group studioPanel_styles">
          <div className="studioPanel_heading">
            <h2>Local Studio</h2>
            <div className="studioPanel_headingActions">
              <span className="studioPanel_kicker">
                {sessionStatus === "saving"
                  ? this.t("STUDIO/SESSION-SAVING", "Saving session...")
                  : sessionStatus === "saved"
                    ? this.t("STUDIO/SESSION-SAVED", "Session saved")
                    : sessionStatus === "error"
                      ? this.t("STUDIO/SESSION-ERROR", "Session save failed")
                      : this.t("STUDIO/KICKER", "style & pixels")}
              </span>
              {sessionResetAvailable ? (
                <button type="button" className="studioSessionReset" onClick={onResetSession}>
                  {this.t("STUDIO/RESET-SESSION", "Reset session")}
                </button>
              ) : null}
            </div>
          </div>
          {/* Проект целиком: картинка, настройки и правки пикселей в одном
              файле. Кнопки стоят вверху панели, а не внизу: внизу их
              перекрывает липкая полоса экспорта. */}
          <div className="studioProjectRow">
            <button type="button" className="studioProjectButton" onClick={onSaveProject} disabled={!projectSaveAvailable}>
              {this.t("PROJECT/SAVE", "Save project")}
            </button>
            <button
              type="button"
              className="studioProjectButton"
              onClick={() => this.projectInputRef.current && this.projectInputRef.current.click()}
            >
              {this.t("PROJECT/OPEN", "Open project")}
            </button>
            <input
              type="file"
              className="displayNone"
              accept=".mapartstudio.json,.json,application/json"
              ref={this.projectInputRef}
              onChange={this.onProjectFileChosen}
            />
            {projectStatus ? (
              <span className="studioProjectStatus">
                {projectStatus === "saved"
                  ? this.t("PROJECT/SAVED", "Project saved")
                  : this.t("PROJECT/OPENED", "Project opened")}
              </span>
            ) : null}
          </div>
          <div className="studioStyleGrid">
            {STYLE_PRESETS.map((style) => {
              const description = this.t(style.descriptionKey, style.description);
              const name = this.t(style.nameKey, style.name);
              return (
                <button
                  key={style.id}
                  type="button"
                  className={`studioStyleButton${activeStyle === style.id ? " active" : ""}`}
                  onClick={() => onApplyStyle(style.id)}
                  title={description}
                  aria-pressed={activeStyle === style.id}
                >
                  <b>
                    {name}
                    {activeStyle === style.id && styleModified ? (
                      <em className="studioStyleModified">{this.t("STUDIO/STYLE-MODIFIED", "modified")}</em>
                    ) : null}
                  </b>
                  <small>{description}</small>
                </button>
              );
            })}
          </div>
          <div className="studioDitherStrength">
            <label htmlFor="studioDitherStrength">
              <span>{this.t("STUDIO/DITHER-STRENGTH", "Dither strength")}</span>
              <b>{optionValue_dithering_strength}%</b>
            </label>
            <input
              ref={this.ditherStrengthRef}
              id="studioDitherStrength"
              type="range"
              min="0"
              max="200"
              step="5"
              value={optionValue_dithering_strength}
              onChange={(event) => onOptionChange_dithering_strength(parseInt(event.target.value))}
              disabled={optionValue_dithering === 0}
            />
            <small>
              {optionValue_dithering === 0
                ? this.t("STUDIO/DITHER-NONE", "Dithering is disabled for the None method.")
                : this.t("STUDIO/DITHER-HINT", "0 — no error propagation, 100 — preset, 200 — stronger.")}
            </small>
          </div>
          <div className="studioToggleRow">
            <label className="studioCheck studioResizeSelect">
              <span>{this.t("STUDIO/RESIZE", "Scaling")}</span>
              <select value={optionValue_resizeMethod} onChange={onOptionChange_resizeMethod}>
                <option value="pixel">{this.t("STUDIO/RESIZE-PIXEL", "Pixel (nearest)")}</option>
                <option value="smooth">{this.t("STUDIO/RESIZE-SMOOTH", "Smooth")}</option>
                <option value="lanczos">{this.t("STUDIO/RESIZE-LANCZOS", "High quality (Lanczos)")}</option>
              </select>
            </label>
            <label className="studioCheck">
              <input
                type="checkbox"
                checked={optionValue_autoDetectPixelScale}
                onChange={onOptionChange_autoDetectPixelScale}
                disabled={optionValue_resizeMethod !== "pixel"}
              />
              <span>{this.t("STUDIO/AUTO-SCALE", "Auto scale")}</span>
            </label>
            <label className="studioCheck">
              <input type="checkbox" checked={optionValue_showPixelGrid} onChange={onOptionChange_showPixelGrid} />
              <span>{this.t("STUDIO/PIXEL-GRID", "Pixel grid")}</span>
            </label>
            <span className="studioScaleHint">
              {optionValue_resizeMethod === "pixel"
                ? detectedPixelScale > 1
                  ? `${this.t("STUDIO/SCALE-DETECTED", "detected x")}${detectedPixelScale}`
                  : this.t("STUDIO/SCALE-1TO1", "1:1 pixels")
                : optionValue_resizeMethod === "lanczos"
                  ? this.t("STUDIO/SCALE-LANCZOS", "Lanczos")
                  : this.t("STUDIO/SMOOTH", "smooth")}
            </span>
          </div>
        </div>
      </div>
    );
  }
}

export default StudioPanel;
