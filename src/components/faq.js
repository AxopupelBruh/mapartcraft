import React from "react";
import { Link } from "react-router-dom";

import Locale from "../locale/locale";

import "./faq.css";
import IMG_Palette from "../images/Palette128_Unobtainable_Trans.png";
import IMG_ClassicVsValley from "../images/classicVsValley.png";

/* Перевод по ключу "FAQ/KEY". Страница живёт вне Root, поэтому ключи
   берутся из словаря напрямую, а не из getLocaleString: так текст
   работает и на /faq, и на /ru/faq. */
function makeTranslator(countryCode) {
  const language = countryCode && countryCode in Locale ? countryCode : "en";
  const fallback = "en";
  return (key) => {
    const read = (code) => {
      const folder = Locale[code].strings.FAQ;
      if (!folder) return undefined;
      const value = folder[key];
      return typeof value === "string" ? value : undefined;
    };
    const value = read(language);
    if (value !== undefined) return value;
    const fallbackValue = read(fallback);
    return fallbackValue !== undefined ? fallbackValue : key;
  };
}

function FAQ(props) {
  const t = makeTranslator(props.match.params.countryCode);
  const countryCode = ![undefined, "en"].includes(props.match.params.countryCode) ? props.match.params.countryCode : "";
  return (
    <div className="FAQ">
      <Link to={`/${countryCode}`}>
        <h3>{t("CLOSE")}</h3>
      </Link>

      <h1>{t("TITLE")}</h1>

      <h2>{t("GET-STARTED")}</h2>
      <a href="https://youtu.be/bJ-wX68WNHM" target="_blank" rel="noopener noreferrer">
        {t("VIDEO-TUTORIAL")}
      </a>

      <h2>{t("SECTION-GENERAL")}</h2>
      <b>{t("GENERAL-OUTPUT-CHANGE")}</b>
      <p>{t("GENERAL-OUTPUT-CHANGE-BODY")}</p>

      <h2>{t("SECTION-SCHEMATIC")}</h2>
      <b>{t("NBT-WHAT-TO-DO")}</b>
      <p>{t("NBT-USE-AS-SCHEMATIC")}</p>

      <b>{t("NBT-HOW-TO-USE")}</b>
      <p>{t("NBT-HOW-TO-USE-BODY")}</p>

      <b>{t("SCHEMATIC-NEED")}</b>
      <p>{t("SCHEMATIC-NEED-BODY")}</p>

      <b>{t("MCEDIT-BROKEN")}</b>
      <p>{t("MCEDIT-BROKEN-BODY")}</p>

      <b>{t("NOOBLINE")}</b>
      <p>{t("NOOBLINE-BODY")}</p>

      <b>{t("ALIGN")}</b>
      <p>{t("ALIGN-BODY")}</p>

      <h2>{t("SECTION-DATAFILE")}</h2>
      <b>{t("DATAFILE-WHAT-IS")}</b>
      <p>{t("DATAFILE-WHAT-IS-BODY")}</p>

      <b>{t("DATAFILE-WHAT-TO-DO")}</b>
      <p>{t("DATAFILE-WHAT-TO-DO-BODY")}</p>

      <h2>{t("SECTION-SETTINGS")}</h2>
      <b>{t("SETTINGS-MAP-SIZE")}</b>
      <p>{t("SETTINGS-MAP-SIZE-BODY")}</p>

      <b>{t("SETTINGS-STRETCHED")}</b>
      <p>{t("SETTINGS-STRETCHED-BODY")}</p>

      <b>{t("SETTINGS-STAIRCASING")}</b>
      <p>{t("SETTINGS-STAIRCASING-BODY")}</p>
      <div style={{ textAlign: "center" }}>
        <img alt={t("IMG-CLASSIC-VS-VALLEY")} src={IMG_ClassicVsValley} style={{ maxWidth: "75%" }}></img>
      </div>
      <p>{t("SETTINGS-EXTRAS")}</p>

      <b>{t("SETTINGS-BETTER-COLOR")}</b>
      <p>{t("SETTINGS-BETTER-COLOR-BODY")}</p>

      <b>{t("SETTINGS-DITHERING")}</b>
      <p>{t("SETTINGS-DITHERING-BODY")}</p>

      <b>{t("SETTINGS-BLOCK-TO-ADD")}</b>
      <p>{t("SETTINGS-BLOCK-TO-ADD-BODY")}</p>

      <b>{t("SETTINGS-PRESETS")}</b>
      <p>{t("SETTINGS-PRESETS-BODY")}</p>

      <h2>{t("SECTION-CUSTOM-BLOCKS")}</h2>
      <p>{t("CUSTOM-BLOCKS-BODY")}</p>

      <div style={{ textAlign: "center" }}>
        <img alt={t("IMG-PALETTE")} src={IMG_Palette} />
      </div>
    </div>
  );
}

export default FAQ;
