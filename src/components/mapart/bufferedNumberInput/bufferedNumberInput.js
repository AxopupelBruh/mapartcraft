import { Component } from "react";

import "./bufferedNumberInput.css";

class BufferedNumberInput extends Component {
  state = { buffer: null };

  constructor(props) {
    super(props);
    this.state.buffer = props.value;
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
    const valid = validators.every((validator) => {
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
