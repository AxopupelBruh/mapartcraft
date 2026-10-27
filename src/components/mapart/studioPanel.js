import React, { Component } from "react";

import { STYLE_PRESETS } from "./stylePresets";

import "./studioPanel.css";

class StudioPanel extends Component {
  t(key, fallback) {
    const { getLocaleString } = this.props;
    const value = getLocaleString ? getLocaleString(key) : null;
    return value || fallback;
  }

  render() {
    const {
      stylePreset,
      optionValue_style,
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
      optionValue_cleanup_enabled,
      optionValue_cleanup_denoise,
      optionValue_cleanup_denoiseMethod,
      optionValue_cleanup_edges,
      optionValue_cleanup_despeckle,
      optionValue_cleanup_paletteIslands,
      optionValue_cleanup_colours,
      optionValue_cleanup_coloursPerceptual,
      optionValue_cleanup_islandsSmart,
      optionValue_cleanup_adaptiveDither,
      onOptionChange_cleanup_enabled,
      onOptionChange_cleanup_denoise,
      onOptionChange_cleanup_denoiseMethod,
      onOptionChange_cleanup_edges,
      onOptionChange_cleanup_despeckle,
      onOptionChange_cleanup_paletteIslands,
      onOptionChange_cleanup_colours,
      onOptionChange_cleanup_coloursPerceptual,
      onOptionChange_cleanup_islandsSmart,
      onOptionChange_cleanup_adaptiveDither,
      onApplyCleanupPreset,
      detectedPixelScale,
      sessionStatus,
      onResetSession,
      sessionResetAvailable,
    } = this.props;

    const activeStyle = stylePreset || optionValue_style || "clean";
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
          <div className="studioStyleGrid">
            {STYLE_PRESETS.map((style) => {
              const description = this.t(style.descriptionKey, style.description);
              return (
                <button
                  key={style.id}
                  type="button"
                  className={`studioStyleButton${activeStyle === style.id ? " active" : ""}`}
                  onClick={() => onApplyStyle(style.id)}
                  title={description}
                >
                  <b>{style.name}</b>
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
          <details className="studioCleanup">
            <summary>
              {this.t("STUDIO/CLEANUP", "Cleanup & enhancement")}
              <span>{optionValue_cleanup_enabled ? this.t("STUDIO/ON", "on") : this.t("STUDIO/OFF", "off")}</span>
            </summary>
            <div className="studioCleanupPresets">
              <button type="button" onClick={() => onApplyCleanupPreset("clean")}>{this.t("STUDIO/CLEANUP-CLEAN", "Clean art")}</button>
              <button type="button" onClick={() => onApplyCleanupPreset("soft")}>{this.t("STUDIO/CLEANUP-SOFT", "Soft")}</button>
              <button type="button" onClick={() => onApplyCleanupPreset("detail")}>{this.t("STUDIO/CLEANUP-DETAIL", "Details")}</button>
              <button type="button" onClick={() => onApplyCleanupPreset("off")}>{this.t("STUDIO/CLEANUP-OFF", "Off")}</button>
            </div>
            <label className="studioCheck studioCleanupToggle">
              <input type="checkbox" checked={optionValue_cleanup_enabled} onChange={onOptionChange_cleanup_enabled} />
              <span>{this.t("STUDIO/CLEANUP-ENABLE", "Apply cleanup")}</span>
            </label>
            <div className="studioCleanupGrid">
              <label className="studioCleanupControl">
                <span>{this.t("STUDIO/DENOISE-METHOD", "Denoise method")}</span>
                <select
                  value={optionValue_cleanup_denoiseMethod}
                  onChange={onOptionChange_cleanup_denoiseMethod}
                  disabled={!optionValue_cleanup_enabled}
                >
                  <option value="median">Median</option>
                  <option value="bilateral">Bilateral</option>
                  <option value="guided">Guided</option>
                </select>
              </label>
              <label className="studioCleanupControl">
                <span>{this.t("STUDIO/DENOISE", "Denoise")} <b>{optionValue_cleanup_denoise}%</b></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={optionValue_cleanup_denoise}
                  onChange={(event) => onOptionChange_cleanup_denoise(parseInt(event.target.value))}
                  disabled={!optionValue_cleanup_enabled}
                />
              </label>
              <label className="studioCleanupControl">
                <span>{this.t("STUDIO/PRESERVE-EDGES", "Preserve edges")} <b>{optionValue_cleanup_edges}%</b></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={optionValue_cleanup_edges}
                  onChange={(event) => onOptionChange_cleanup_edges(parseInt(event.target.value))}
                  disabled={!optionValue_cleanup_enabled}
                />
              </label>
              <label className="studioCleanupControl">
                <span>{this.t("STUDIO/ISLANDS", "Remove islands")}</span>
                <select
                  value={optionValue_cleanup_despeckle}
                  onChange={onOptionChange_cleanup_despeckle}
                  disabled={!optionValue_cleanup_enabled}
                >
                  <option value="0">{this.t("STUDIO/CLEANUP-OFF", "Off")}</option>
                  <option value="1">1 px</option>
                  <option value="2">2 px</option>
                  <option value="4">4 px</option>
                </select>
              </label>
              <label className="studioCheck studioCleanupWide">
                <input
                  type="checkbox"
                  checked={optionValue_cleanup_islandsSmart}
                  onChange={onOptionChange_cleanup_islandsSmart}
                  disabled={!optionValue_cleanup_enabled || optionValue_cleanup_despeckle === 0}
                />
                <span>{this.t("STUDIO/ISLANDS-SMART", "Smart islands: keep lines, eyes and highlights")}</span>
              </label>
              <label className="studioCheck studioCleanupWide">
                <input
                  type="checkbox"
                  checked={optionValue_cleanup_paletteIslands}
                  onChange={onOptionChange_cleanup_paletteIslands}
                  disabled={!optionValue_cleanup_enabled || optionValue_cleanup_despeckle === 0}
                />
                <span>{this.t("STUDIO/PALETTE-ISLANDS", "Clean islands after palette")}</span>
              </label>
              <label className="studioCleanupControl">
                <span>{this.t("STUDIO/SIMPLIFY", "Simplify colours")}</span>
                <select
                  value={optionValue_cleanup_colours}
                  onChange={onOptionChange_cleanup_colours}
                  disabled={!optionValue_cleanup_enabled}
                >
                  <option value="0">{this.t("STUDIO/CLEANUP-OFF", "Off")}</option>
                  <option value="16">16</option>
                  <option value="24">24</option>
                  <option value="32">32</option>
                  <option value="48">48</option>
                  <option value="64">64</option>
                </select>
              </label>
              <label className="studioCheck studioCleanupWide">
                <input
                  type="checkbox"
                  checked={optionValue_cleanup_coloursPerceptual}
                  onChange={onOptionChange_cleanup_coloursPerceptual}
                  disabled={!optionValue_cleanup_enabled || optionValue_cleanup_colours === 0}
                />
                <span>{this.t("STUDIO/SIMPLIFY-PERCEPTUAL", "Perceptual colours (Lab), protect small accents")}</span>
              </label>
              <label className="studioCheck studioCleanupWide">
                <input
                  type="checkbox"
                  checked={optionValue_cleanup_adaptiveDither}
                  onChange={onOptionChange_cleanup_adaptiveDither}
                  disabled={!optionValue_cleanup_enabled}
                />
                <span>{this.t("STUDIO/ADAPTIVE", "Dither only in smooth areas")}</span>
              </label>
            </div>
            <small className="studioCleanupHint">
              {this.t("STUDIO/CLEANUP-HINT", "Islands are cleaned before and after palette quantization. The original and manual edits are not changed.")}
            </small>
          </details>
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
