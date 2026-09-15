// Fits the 224x256 field into a display canvas at an INTEGER scale in device
// pixels, letterboxing the remainder. The display canvas is sized in device
// pixels (css size x devicePixelRatio) so that one field pixel is exactly
// `scale` device pixels and nothing is resampled; the CSS size stays the
// element's layout size. The offsets are whole device pixels so the
// drawImage lands on a pixel boundary.

import { FIELD_W, FIELD_H } from './intensity.js';

export function layoutViewport(cssWidth, cssHeight, devicePixelRatio = 1) {
  const dpr = devicePixelRatio > 0 ? devicePixelRatio : 1;
  const deviceW = Math.max(1, Math.round(cssWidth * dpr));
  const deviceH = Math.max(1, Math.round(cssHeight * dpr));
  const scale = Math.max(1, Math.floor(Math.min(deviceW / FIELD_W, deviceH / FIELD_H)));
  const width = FIELD_W * scale;
  const height = FIELD_H * scale;
  return {
    deviceW,
    deviceH,
    scale,
    width,
    height,
    offsetX: Math.floor((deviceW - width) / 2),
    offsetY: Math.floor((deviceH - height) / 2),
  };
}
