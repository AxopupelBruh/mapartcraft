import React, { Component } from "react";
import { Link } from "react-router-dom";

import "./header.css";

class Header extends Component {
  render() {
    const { getLocaleString } = this.props;
    return (
      <div className="header">
        <h3>
          <Link to={`/${![undefined, "en"].includes(this.props.countryCode) ? this.props.countryCode + "/" : ""}faq`}>
            <span className="FAQTextButton">{getLocaleString("FAQ/FAQ")}</span>
          </Link>
          <span> | </span>
          <a href="https://youtu.be/j-4RXPkJKU8" target="_blank" rel="noopener noreferrer">
            {getLocaleString("FAQ/VIDEO-TUTORIAL")}
          </a>
          <span> | </span>
          <a href="https://github.com/AxopupelBruh/mapartcraft" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <span> | </span>
          <a href="https://discord.gg/r7Tuerq" target="_blank" rel="noopener noreferrer">
            2b2t Mapart Discord
          </a>
        </h3>
      </div>
    );
  }
}

export default Header;
