import React, { Component } from "react";

import { attachWheel, wheelValue } from "../wheelValue";

import "./bufferedNumberInput.css";

class BufferedNumberInput extends Component {
  state = { buffer: null };

  inputRef = React.createRef();

  constructor(props) {
    super(props);
    this.state.buffer = props.value;
  }

  componentDidMount() {
    /* Колесо мыши меняет значение. */
    this.detachWheel = attachWheel(this.inputRef.current, (event) => {
      if (this.props.disabled) return;
      const { min, max, step } = this.props;
      const next = wheelValue(event, this.state.buffer, min, max, step);
      if (next === null) return;
      this.onInputChange({ target: { value: String(next) } });
    });
  }

  componentWillUnmount() {
    if (this.detachWheel) this.detachWheel();
  }

  componentDidUpdate(prevProps) {
    const { value } = this.props;
    if (prevProps.value !== value) {
      this.setState({ buffer: value });
    }
  }

  onInputChange = (e) => {
    const { validators, onValidInput, onInvalidInput } = this.props;
    const newValue_buffer = e.target.value;
    const newValue_int = parseInt(newValue_buffer);
    const valid = (validators || []).every((validator) => {
      return validator(newValue_int);
    });
    this.setState({ buffer: newValue_buffer }, () => {
      if (valid) {
        onValidInput(newValue_int);
      } else if (onInvalidInput) {
        onInvalidInput(newValue_int);
      }
    });
  };

  render() {
    const { min, max, step, style, disabled, id, ariaLabel } = this.props;
    const { buffer } = this.state;
    return (
      <input
        type="number"
        ref={this.inputRef}
        id={id}
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={buffer}
        onChange={this.onInputChange}
        disabled={disabled}
        style={style}
      />
    );
  }
}

export default BufferedNumberInput;
