import React, { useEffect, useRef, useState } from "react";

import AutoCompleteInputBlockToAdd from "./autoCompleteInputBlockToAdd/autoCompleteInputBlockToAdd";
import BufferedNumberInput from "./bufferedNumberInput/bufferedNumberInput";
import { optionControlId } from "./optionControl";

import { BIG_MAP_MEGABYTES, canAllocateCanvas, estimateMapSize, estimateRenderSeconds, getMaxMapSize } from "./canvasLimits";

/* --------------------------------------------------------------------------
   Кастомные поля настроек.
   Используются, когда поле не сводится к одному контролу: пара значений,
   виджет с автодополнением и т.п. Схема ссылается на них по имени
   (option.custom), а mapSettings рисует каждое из них ровно один раз —
   даже если в схеме оно встречается в нескольких записях.
   -------------------------------------------------------------------------- */

export const MAP_SIZE_MIN = 1;

/* Ключи и id полей размера карты выведены из схемы, чтобы переименование
   ключа не ломало обработчик колеса молча. */
const SIZE_X_KEY = "optionValue_mapSize_x";
const SIZE_Y_KEY = "optionValue_mapSize_y";
const SIZE_X_ID = optionControlId({ key: SIZE_X_KEY });
const SIZE_Y_ID = optionControlId({ key: SIZE_Y_KEY });

/* Порог, с которого размер считается «большим»: дальше нужна проверка
   памяти и предупреждение пользователю. */

const formatMemory = (megabytes) => {
  if (megabytes >= 1024) return `${(megabytes / 1024).toFixed(1)} GB`;
  return `${Math.round(megabytes)} MB`;
};

/* Хватит ли браузеру памяти под такой размер? Проба выделяет холст того же
   размера, поэтому её делают только для больших карт. */
const fitsInMemory = (sizeX, sizeY) => {
  const estimate = estimateMapSize(sizeX, sizeY);
  if (estimate.megabytes < BIG_MAP_MEGABYTES) return true;
  return canAllocateCanvas(estimate.width, estimate.height);
};

const MapSizeField = ({ values, handlers, getLocaleString }) => {
  const [invalidValue, setInvalidValue] = useState(null);
  const [noMemory, setNoMemory] = useState(false);
  const wheelAreaRef = useRef(null);
  const maxMapSize = getMaxMapSize();

  /* Размер по обеим осям после применения значения по одной из них. */
  const sizeWith = (key, value) => {
    const otherKey = key === SIZE_X_KEY ? SIZE_Y_KEY : SIZE_X_KEY;
    const other = parseInt(values[otherKey], 10);
    return {
      x: key === SIZE_X_KEY ? value : isNaN(other) ? MAP_SIZE_MIN : other,
      y: key === SIZE_Y_KEY ? value : isNaN(other) ? MAP_SIZE_MIN : other,
    };
  };

  const applyValue = (key, value) => {
    const number = parseInt(value, 10);
    if (isNaN(number) || number < MAP_SIZE_MIN || number > maxMapSize) {
      setInvalidValue(number);
      return;
    }
    const next = sizeWith(key, number);
    if (!fitsInMemory(next.x, next.y)) {
      setInvalidValue(null);
      setNoMemory(true);
      return;
    }
    setInvalidValue(null);
    setNoMemory(false);
    handlers[key](number);
  };

  const step = (key, delta) => {
    const current = parseInt(values[key], 10);
    const next = (isNaN(current) ? MAP_SIZE_MIN : current) + delta;
    applyValue(key, next);
  };

  /* Колесо мыши над полем меняет размер на шаг. Слушатель ставится вручную:
     React подписывается на wheel как на passive-событие, и preventDefault
     внутри обработчика не сработал бы — страница прокрутилась бы вместо
     изменения размера. */
  const latestRef = useRef({ values, handlers });
  latestRef.current = { values, handlers };

  useEffect(() => {
    const node = wheelAreaRef.current;
    if (!node) return undefined;
    const onWheel = (event) => {
      if (!event.target || event.target.tagName !== "INPUT") return;
      event.preventDefault();
      const current = latestRef.current;
      const key = event.target.id === SIZE_Y_ID ? SIZE_Y_KEY : SIZE_X_KEY;
      const currentValue = parseInt(current.values[key], 10);
      const next = (isNaN(currentValue) ? MAP_SIZE_MIN : currentValue) + (event.deltaY < 0 ? 1 : -1);
      const number = parseInt(next, 10);
      if (isNaN(number) || number < MAP_SIZE_MIN || number > getMaxMapSize()) {
        setInvalidValue(number);
        return;
      }
      const otherKey = key === SIZE_X_KEY ? SIZE_Y_KEY : SIZE_X_KEY;
      const other = parseInt(current.values[otherKey], 10);
      const nextSize = {
        x: key === SIZE_X_KEY ? number : isNaN(other) ? MAP_SIZE_MIN : other,
        y: key === SIZE_Y_KEY ? number : isNaN(other) ? MAP_SIZE_MIN : other,
      };
      if (!fitsInMemory(nextSize.x, nextSize.y)) {
        setInvalidValue(null);
        setNoMemory(true);
        return;
      }
      setInvalidValue(null);
      setNoMemory(false);
      current.handlers[key](number);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  const estimate = estimateMapSize(values.optionValue_mapSize_x, values.optionValue_mapSize_y);
  const isBig = estimate.megabytes >= 512;
  const renderSeconds = estimateRenderSeconds(values.optionValue_mapSize_x, values.optionValue_mapSize_y);

  const renderDimension = (key, axis, id) => (
    <React.Fragment key={key}>
      <span className="optionField_pairLabel">{axis}</span>
      <button
        type="button"
        className="mapSizeStepButton"
        aria-label={getLocaleString("MAP-SETTINGS/MAP-SIZE-DECREASE").replace("{axis}", axis)}
        onClick={() => step(key, -1)}
      >
        −
      </button>
      <BufferedNumberInput
        id={id}
        ariaLabel={axis}
        min={MAP_SIZE_MIN}
        max={maxMapSize}
        step={1}
        value={values[key]}
        validators={[(value) => !isNaN(value), (value) => value >= MAP_SIZE_MIN, (value) => value <= maxMapSize]}
        onValidInput={(value) => applyValue(key, value)}
        onInvalidInput={(value) => setInvalidValue(value)}
      />
      <button
        type="button"
        className="mapSizeStepButton"
        aria-label={getLocaleString("MAP-SETTINGS/MAP-SIZE-INCREASE").replace("{axis}", axis)}
        onClick={() => step(key, 1)}
      >
        +
      </button>
    </React.Fragment>
  );

  return (
    <React.Fragment>
      <span className="mapSizeStepper" ref={wheelAreaRef}>
        {renderDimension(SIZE_X_KEY, "X", SIZE_X_ID)}
        {renderDimension(SIZE_Y_KEY, "Y", SIZE_Y_ID)}
      </span>
      {noMemory ? (
        <span className="optionField_error" role="alert">
          {getLocaleString("MAP-SETTINGS/MAP-SIZE-NO-MEMORY")}
        </span>
      ) : null}
      {invalidValue !== null ? (
        <span className="optionField_error" role="alert">
          {invalidValue > maxMapSize
            ? getLocaleString("MAP-SETTINGS/MAP-SIZE-TOO-LARGE")
                .replace("{max}", maxMapSize)
                .replace("{pixels}", maxMapSize * 128)
            : getLocaleString("MAP-SETTINGS/MAP-SIZE-INVALID").replace("{max}", maxMapSize)}
        </span>
      ) : null}
      {isBig ? (
        <span className="optionField_hint">
          {getLocaleString("MAP-SETTINGS/MAP-SIZE-BIG")
            .replace("{memory}", formatMemory(estimate.megabytes))
            .replace("{seconds}", renderSeconds)}
        </span>
      ) : null}
    </React.Fragment>
  );
};

const SupportBlockField = ({ values, handlers, context, id, label }) => (
  <AutoCompleteInputBlockToAdd
    coloursJSON={context.coloursJSON}
    value={values.optionValue_supportBlock}
    setValue={handlers.optionValue_supportBlock}
    optionValue_version={values.optionValue_version}
    id={id}
    ariaLabel={label}
  />
);

export const CUSTOM_FIELDS = {
  mapSize: MapSizeField,
  supportBlock: SupportBlockField,
};

export default CUSTOM_FIELDS;
