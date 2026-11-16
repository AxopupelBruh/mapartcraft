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

  componentWillUnmount() {
    this.removeHideListeners();
  }

  hide = () => {
    this.removeHideListeners();
    this.setState({ hovering: false });
  };

  addHideListeners = () => {
    window.addEventListener("scroll", this.hide, true);
    window.addEventListener("pointerdown", this.handleOutsidePointer, true);
  };

  removeHideListeners = () => {
    window.removeEventListener("scroll", this.hide, true);
    window.removeEventListener("pointerdown", this.handleOutsidePointer, true);
  };

  handleOutsidePointer = (e) => {
    if (this.containerRef && !this.containerRef.contains(e.target)) this.hide();
  };

  handleMouseOver = () => {
    if (!this.state.hovering) this.addHideListeners();
    this.setState({ hovering: true });
  };

  handleMouseOut = () => {
    this.hide();
  };

  /* Клавиатура: тултип должен открываться и на focus, а не только по наведению. */
  handleFocus = () => {
    if (!this.state.hovering) this.addHideListeners();
    this.setState({ hovering: true });
  };

  handleBlur = () => {
    this.hide();
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
      <div className="tooltipContainer" ref={(el) => (this.containerRef = el)}>
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
