import React, { Component } from "react";

import "./tooltip.css";

let tooltipCounter = 0;

class Tooltip extends Component {
  state = {
    hovering: false,
  };

  constructor(props) {
    super(props);
    this.tooltipId = `tooltip-${(tooltipCounter += 1)}`;
  }

  handleMouseOver = () => {
    this.setState({ hovering: true });
  };

  handleMouseOut = () => {
    this.setState({ hovering: false });
  };

  /* Клавиатура: тултип должен открываться и на focus, а не только по наведению. */
  handleFocus = () => {
    this.setState({ hovering: true });
  };

  handleBlur = () => {
    this.setState({ hovering: false });
  };

  render() {
    const { tooltipText, textStyleOverrides, children } = this.props;
    const visible = this.state.hovering;
    const tooltipStyle =
      textStyleOverrides !== undefined
        ? {
            display: visible ? "unset" : "none",
            ...textStyleOverrides,
          }
        : { display: visible ? "unset" : "none" };

    const childWithAria = React.Children.map(children, (child) => {
      if (!React.isValidElement(child)) {
        return child;
      }
      return React.cloneElement(child, {
        "aria-describedby": visible ? this.tooltipId : undefined,
      });
    });

    return (
      <div className="tooltipContainer">
        <div
          onMouseOver={this.handleMouseOver}
          onMouseOut={this.handleMouseOut}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
        >
          {childWithAria}
        </div>
        <p className="tooltipText" id={this.tooltipId} role="tooltip" style={tooltipStyle}>
          {tooltipText}
        </p>
      </div>
    );
  }
}

export default Tooltip;
