import React, { Component } from "react";
import { withRouter } from "react-router-dom";

import "./languages.css";

/* Переключатель языка.
   В шапке раньше стояли флаги всех восемнадцати языков, но переведены
   по-настоящему только два: английский и русский. Остальные файлы
   переводов остаются в репозитории, но в выборе их нет — иначе
   пользователь попадает в интерфейс, где половина строк по-английски.
   Выглядит как список дизерингов: нажал — выбрал. */
const LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
];

class Languages extends Component {
  onChange = (event) => {
    const code = event.target.value;
    this.props.history.push(code === "en" ? "/" : `/${code}`);
  };

  render() {
    const { getLocaleString } = this.props;
    const countryCode = this.props.match.params.countryCode;
    const current = LANGUAGES.some((language) => language.code === countryCode) ? countryCode : "en";
    return (
      <div className="languages">
        <select
          className="languagesSelect"
          value={current}
          onChange={this.onChange}
          aria-label={getLocaleString ? getLocaleString("LANGUAGES/TITLE") : "Language"}
        >
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.flag} {language.name}
            </option>
          ))}
        </select>
      </div>
    );
  }
}

export default withRouter(Languages);
