import React, { useEffect, useRef } from "react";

import Tooltip from "../tooltip";
import BufferedNumberInput from "./bufferedNumberInput/bufferedNumberInput";
import { optionControlId } from "./optionControl";
import { CUSTOM_FIELDS } from "./optionCustomFields";
import { attachWheel, wheelValue } from "./wheelValue";

export { optionControlId };

const labelText = (option, getLocaleString) => {
  if (option.labelKeyOverride) return getLocaleString(option.labelKeyOverride);
  if (option.labelOverride) return option.labelOverride;
  if (option.labelKey) return getLocaleString(option.labelKey);
  return "";
};

const optionLabel = (entry, getLocaleString) => {
  if (entry.labelKey) return getLocaleString(entry.labelKey);
  if (entry.label) return entry.label;
  return String(entry.value);
};

/* Одно поле настройки. Рисуется одинаково для всех типов: подпись слева,
   управление справа. Каждому управлению проставляется id, а подпись связана
   с ним через htmlFor — это закрывает требование доступности «16 контролов
   без доступного имени». */
const OptionField = ({ option, values, handlers, getLocaleString, context }) => {
  const id = optionControlId(option);
  const label = labelText(option, getLocaleString);
  const tooltip = option.tooltipKey ? getLocaleString(option.tooltipKey) : null;
  const descriptionId = `${id}-description`;
  const disabled = option.disabled ? !!option.disabled(values) : false;
  const value = option.valueFrom ? option.valueFrom(values) : values[option.key];
  const onChange = handlers[option.key];

  /* Колесо мыши над ползунком меняет значение на один шаг. */
  const rangeRef = useRef(null);
  const latestRef = useRef({ option, value, onChange, disabled });
  latestRef.current = { option, value, onChange, disabled };
  useEffect(() => {
    return attachWheel(rangeRef.current, (event) => {
      const current = latestRef.current;
      /* Выключенный ползунок не реагирует — как и на перетаскивание. */
      if (!current.onChange || current.disabled) return;
      const { min, max, step } = current.option;
      const next = wheelValue(event, current.value, min, max, step);
      if (next === null) return;
      current.onChange(next);
    });
  }, []);

  const handleEvent = (event) => {
    if (!onChange) return;
    if (option.valueType === "value") {
      onChange(parseInt(event.target.value, 10));
    } else {
      onChange(event);
    }
  };

  const describedBy = tooltip ? descriptionId : undefined;

  const renderControl = () => {
    switch (option.type) {
      case "select": {
        const rawOptions = typeof option.options === "function" ? option.options(values) : option.options || [];
        const grouped = rawOptions.length > 0 && Array.isArray(rawOptions[0].methods);
        if (grouped) {
          return (
            <select id={id} value={value} onChange={handleEvent} disabled={disabled} aria-describedby={describedBy}>
              {rawOptions.map((group) => (
                <optgroup key={group.category} label={group.labelKey ? getLocaleString(group.labelKey) : group.category}>
                  {group.methods.map((method) => (
                    <option key={method.uniqueId} value={method.uniqueId}>
                      {method.localeKey ? getLocaleString(method.localeKey) : method.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          );
        }
        return (
          <select id={id} value={value} onChange={handleEvent} disabled={disabled} aria-describedby={describedBy}>
            {rawOptions.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {optionLabel(entry, getLocaleString)}
              </option>
            ))}
          </select>
        );
      }
      case "checkbox":
        return (
          <input id={id} type="checkbox" checked={!!value} onChange={handleEvent} disabled={disabled} aria-describedby={describedBy} />
        );
      case "range":
        return (
          <React.Fragment>
            <input
              ref={rangeRef}
              id={id}
              type="range"
              min={option.min}
              max={option.max}
              step={option.step}
              value={value}
              onChange={handleEvent}
              disabled={disabled}
              aria-describedby={describedBy}
            />
            <BufferedNumberInput
              id={`${id}-number`}
              ariaLabel={label}
              min={option.min}
              max={option.max}
              step={option.step}
              value={value}
              validators={option.validators}
              onValidInput={onChange}
              disabled={disabled}
            />
          </React.Fragment>
        );
      case "number":
        return (
          <BufferedNumberInput
            id={id}
            ariaLabel={label}
            min={option.min}
            max={option.max}
            step={option.step}
            value={value}
            validators={option.validators}
            onValidInput={onChange}
            disabled={disabled}
          />
        );
      case "color":
        return (
          <input id={id} type="color" value={value} onChange={handleEvent} disabled={disabled} aria-describedby={describedBy} />
        );
      case "custom": {
        const customField = CUSTOM_FIELDS[option.custom];
        if (!customField) return null;
        /* Рендерим как компонент, а не как функцию — кастомным полям
           нужен собственный стейт (например, подсветка ошибки ввода). */
        return React.createElement(customField, { option, values, handlers, getLocaleString, context, id, label, disabled });
      }
      default:
        return null;
    }
  };

  const helpMark = tooltip ? (
    <Tooltip tooltipText={tooltip}>
      <span className="optionField_help" aria-hidden="true">
        ?
      </span>
    </Tooltip>
  ) : null;

  if (option.type === "checkbox") {
    return (
      <div className="optionField optionField_checkbox">
        <label className="optionField_checkboxLabel" htmlFor={id}>
          <input id={id} type="checkbox" checked={!!value} onChange={handleEvent} disabled={disabled} aria-describedby={describedBy} />
          <span>{label}</span>
          {helpMark}
        </label>
        {tooltip ? (
          <span className="visuallyHidden" id={descriptionId}>
            {tooltip}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`optionField optionField_${option.type}`}>
      <label className="optionField_label" htmlFor={id}>
        <span>{label}</span>
        {helpMark}
      </label>
      <div className="optionField_control">{renderControl()}</div>
      {tooltip ? (
        <span className="visuallyHidden" id={descriptionId}>
          {tooltip}
        </span>
      ) : null}
      {option.hintKey ? <small className="optionField_hint">{getLocaleString(option.hintKey)}</small> : null}
    </div>
  );
};

export default OptionField;
