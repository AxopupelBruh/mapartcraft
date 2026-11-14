/* Пределы холста в браузере.

   Размер карты не ограничен искусственно: верхнюю границу задаёт сам
   браузер — максимальная сторона и максимальная площадь холста. Модуль
   переводит эти пределы в размер карты (один «пиксель» карты — это
   128x128 блоков) и умеет оценить, сколько памяти и времени потребует
   карта такого размера.

   Значения пределов консервативные: если браузер окажется строже, ошибку
   поймает проверка размера холста и пользователь увидит понятное
   сообщение вместо падения вкладки. */

/* Сколько блоков в стороне одного «пикселя» карты. */
export const MAP_CHUNK_BLOCKS = 128;

const BROWSER_LIMITS = {
  chrome: { maxDimension: 65535, maxArea: 268435456 },
  firefox: { maxDimension: 32767, maxArea: 124000000 },
  safari: { maxDimension: 4096, maxArea: 16777216 },
  other: { maxDimension: 32767, maxArea: 124000000 },
};

const detectBrowserKey = () => {
  if (typeof navigator === "undefined") return "other";
  const userAgent = navigator.userAgent || "";
  if (/Firefox\//.test(userAgent)) return "firefox";
  if (/Edg\//.test(userAgent) || /Chrome\//.test(userAgent)) return "chrome";
  if (/Safari\//.test(userAgent)) return "safari";
  return "other";
};

let limitsCache = null;

export const getCanvasLimits = () => {
  if (!limitsCache) {
    const browser = detectBrowserKey();
    const limits = BROWSER_LIMITS[browser];
    limitsCache = {
      ...limits,
      browser,
      /* Максимальная сторона квадратного холста: ограничение по площади. */
      maxSquareSide: Math.floor(Math.sqrt(limits.maxArea)),
    };
  }
  return limitsCache;
};

/* Максимальный размер карты (в «пикселях» карты) для квадратной карты. */
export const getMaxMapSize = () => {
  const limits = getCanvasLimits();
  return Math.max(1, Math.floor(Math.min(limits.maxDimension, limits.maxSquareSide) / MAP_CHUNK_BLOCKS));
};

/* Сколько пикселей в карте X x Y и сколько памяти она примерно съест. */
export const estimateMapSize = (sizeX, sizeY) => {
  const width = Math.max(1, sizeX || 1) * MAP_CHUNK_BLOCKS;
  const height = Math.max(1, sizeY || 1) * MAP_CHUNK_BLOCKS;
  const pixels = width * height;
  /* Пиксели живут сразу в нескольких копиях: холст источника, данные
     изображения, копия в воркере и (при cleanup) ещё одна копия. */
  const bytes = pixels * 4 * 4;
  return {
    width,
    height,
    pixels,
    bytes,
    megabytes: bytes / (1024 * 1024),
    gigabytes: bytes / (1024 * 1024 * 1024),
  };
};

/* Оценка времени рендера. Замеры воркера: 4.2 млн пикселей — около
   1.5 с, дальше зависимость линейная. */
export const estimateRenderSeconds = (sizeX, sizeY) => {
  const { pixels } = estimateMapSize(sizeX, sizeY);
  return Math.round((pixels / 4194304) * 1.5);
};

/* Порог «большой» карты. Выше него и в настройках, и перед экспортом
   показывается предупреждение. Порог один на оба места — иначе
   пользователю кажется странным, что экспорт ругается на карту, которую
   настройки считали обычной. */
export const BIG_MAP_MEGABYTES = 512;

export const isBigMap = (sizeX, sizeY) => estimateMapSize(sizeX, sizeY).megabytes >= BIG_MAP_MEGABYTES;

/* Сможет ли браузер выделить холст такого размера. Некоторые браузеры
   не бросают исключение, а молча уменьшают холст — это тоже ловится. */
export const canAllocateCanvas = (width, height) => {
  if (typeof document === "undefined") return true;
  let canvas = null;
  try {
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return false;
    if (canvas.width !== width || canvas.height !== height) return false;
    /* getImageData заставляет браузер действительно выделить память. */
    context.getImageData(0, 0, 1, 1);
    return true;
  } catch (error) {
    return false;
  } finally {
    /* Освобождаем память пробного холста сразу. */
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
};
