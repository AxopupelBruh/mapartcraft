import React, { Component } from "react";

import "./tooltip.css";

let tooltipCounter = 0;

/* Отступ между блоком и подсказкой и отступ от края окна. */
const TOOLTIP_GAP = 6;
const TOOLTIP_EDGE = 8;

/* После тапа iOS ещё присылает эмулированные мышиные события. Их
   игнорируем, иначе подсказка может появиться снова без всякой причины. */
const TOUCH_GRACE_MS = 700;

class Tooltip extends Component {
  state = {
    hovering: false,
  };

  constructor(props) {
    super(props);
    this.tooltipId = `tooltip-${(tooltipCounter += 1)}`;
    this.triggerRef = React.createRef();
    this.tooltipRef = React.createRef();
    this.isVisible = false;
    this.listenersAttached = false;
    this.lastTouchAt = 0;
    this.skipTouchShow = false;
  }

  componentDidUpdate() {
    if (this.state.hovering) {
      this.placeTooltip();
    }
  }

  componentWillUnmount() {
    this.detachListeners();
  }

  /* Глобальные слушатели нужны только пока подсказка на экране:
     их не должно оставаться после закрытия. */
  attachListeners = () => {
    if (this.listenersAttached) return;
    this.listenersAttached = true;
    /* 'scroll' не всплывает, поэтому берём его в фазе захвата: так
       ловим прокрутку списка палитры и любого другого контейнера. */
    window.addEventListener("scroll", this.handleGlobalScroll, true);
    /* Палец пошёл по экрану — начинается прокрутка. */
    window.addEventListener("touchmove", this.handleGlobalTouchMove, true);
    /* Тап в другое место закрывает подсказку: на iOS после тапа по
       блоку 'mouseout' не приходит, и подсказка остаётся на экране. */
    window.addEventListener("pointerdown", this.handleGlobalPointerDown, true);
  };

  detachListeners = () => {
    if (!this.listenersAttached) return;
    this.listenersAttached = false;
    window.removeEventListener("scroll", this.handleGlobalScroll, true);
    window.removeEventListener("touchmove", this.handleGlobalTouchMove, true);
    window.removeEventListener("pointerdown", this.handleGlobalPointerDown, true);
  };

  show = () => {
    if (this.isVisible) return;
    this.isVisible = true;
    this.setState({ hovering: true });
    this.attachListeners();
  };

  hide = () => {
    this.detachListeners();
    if (!this.isVisible) return;
    this.isVisible = false;
    this.setState({ hovering: false });
  };

  /* Подсказка привязана к блоку, а список под ней прокручивается:
     после сдвига экрана она смотрела бы не на тот блок. */
  handleGlobalScroll = () => {
    this.hide();
  };

  handleGlobalTouchMove = () => {
    this.hide();
  };

  handleGlobalPointerDown = (event) => {
    const isTouch = event.pointerType === "touch";
    if (isTouch) {
      this.lastTouchAt = Date.now();
    }
    const trigger = this.triggerRef.current;
    const inside = trigger && event.target instanceof Node && trigger.contains(event.target);
    if (!inside) {
      this.hide();
      return;
    }
    /* Повторный тап по тому же блоку закрывает подсказку. */
    if (isTouch && this.isVisible) {
      this.skipTouchShow = true;
      this.hide();
    }
  };

  /* Эмулированные мышиные события после тапа игнорируем: на iOS и в
     эмуляции сенсорного экрана сразу после касания прилетает
     'mouseout', который иначе закрыл бы только что открытую подсказку. */
  isFreshTouch = () => {
    return Date.now() - this.lastTouchAt < TOUCH_GRACE_MS;
  };

  handleMouseOver = () => {
    if (this.isFreshTouch()) return;
    this.show();
  };

  handleMouseOut = () => {
    if (this.isFreshTouch()) return;
    this.hide();
  };

  /* Клавиатура: тултип должен открываться и на focus, а не только по наведению. */
  handleFocus = () => {
    this.show();
  };

  handleBlur = () => {
    this.hide();
  };

  /* На iOS тап по блоку не вызывает надёжный 'mouseover', поэтому
     показываем подсказку прямо по касанию. */
  handlePointerDown = (event) => {
    if (event.pointerType !== "touch") return;
    this.lastTouchAt = Date.now();
    if (this.skipTouchShow) {
      this.skipTouchShow = false;
      return;
    }
    this.show();
  };

  /* Ставим подсказку рядом с блоком и держим её в пределах окна. */
  placeTooltip = () => {
    const trigger = this.triggerRef.current;
    const tooltip = this.tooltipRef.current;
    if (!trigger || !tooltip) return;

    /* Сбрасываем прошлую позицию и ширину: иначе меряем не естественную
       ширину подсказки, а ту, что задали в прошлый раз. */
    tooltip.style.left = "auto";
    tooltip.style.top = "auto";
    tooltip.style.width = "auto";

    const rect = trigger.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const viewWidth = document.documentElement.clientWidth;
    const viewHeight = document.documentElement.clientHeight;

    let left = rect.left + rect.width / 2 - width / 2;
    if (left + width > viewWidth - TOOLTIP_EDGE) left = viewWidth - TOOLTIP_EDGE - width;
    if (left < TOOLTIP_EDGE) left = TOOLTIP_EDGE;

    /* Под блоком места хватает не всегда — тогда показываем над ним. */
    let top = rect.bottom + TOOLTIP_GAP;
    if (top + height > viewHeight - TOOLTIP_EDGE) top = rect.top - TOOLTIP_GAP - height;
    if (top < TOOLTIP_EDGE) top = TOOLTIP_EDGE;

    /* Фиксируем ширину: иначе подсказка переносится по словам, когда её
       сдвигают к левому краю окна. */
    tooltip.style.width = `${width}px`;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
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
          ref={this.triggerRef}
          onMouseOver={this.handleMouseOver}
          onMouseOut={this.handleMouseOut}
          onFocus={this.handleFocus}
          onBlur={this.handleBlur}
          onPointerDown={this.handlePointerDown}
        >
          {childWithAria}
        </div>
        <p
          className="tooltipText"
          id={this.tooltipId}
          role="tooltip"
          ref={this.tooltipRef}
          style={tooltipStyle}
        >
          {tooltipText}
        </p>
      </div>
    );
  }
}

export default Tooltip;
