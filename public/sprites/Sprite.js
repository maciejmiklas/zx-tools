import { width, xyToIndex, colourTable, emptyCanvas } from './sprite-tools.js';
import { transparent, toRGB332 } from './lib/colour.js';

export default class Sprite {
  scale = width;
  subSprite = 0; // only used when 8x8
  _lastIndex = null;

  /**
   *
   * @param {Uint8Array} pixels
   */
  constructor(pixels) {
    this.pixels = pixels;
    this.ctx = document.createElement('canvas').getContext('2d');
    this.ctx.canvas.width = this.ctx.canvas.height = width;
    this.render();
  }

  get canvas() {
    return this.ctx.canvas;
  }

  pget({ index = null, x = null, y, scale = this.scale }) {
    index = xyToIndex({ x, y, w: scale });

    if (scale === 8) {
      index += this.subSprite * 64;
    }

    return this.pixels[index];
  }

  pset({ index = null, x = null, y, value, scale = this.scale }) {
    index = xyToIndex({ x, y, w: scale });

    if (index === this._lastIndex) return;
    this._lastIndex = index;

    if (scale === 8) {
      index += this.subSprite * 64;
    }

    this.pixels[index] = value;
    this.render();
  }

  clear() {
    if (this.scale === 16) {
      this.pixels.fill(transparent);
    } else {
      const empty = new Uint8Array(64);
      empty.fill(transparent);
      this.pixels.set(empty, 64 * this.subSprite);
    }
    this.render();
  }

  mirror(horizontal = true) {
    return new Promise((resolve) => {
      const i = new Image();
      const url = this.canvas.toDataURL(); // needed over a blob because blob is apparently a reference
      i.src = url;
      i.onload = () => {
        this.ctx.clearRect(0, 0, width, width);
        this.ctx.save();
        if (horizontal) {
          this.ctx.scale(-1, 1);
          this.ctx.drawImage(i, 0, 0, -width, width); //, -width, 0);
        } else {
          this.ctx.scale(1, -1);
          this.ctx.drawImage(i, 0, 0, width, -width);
        }
        this.ctx.restore();
        this.canvasToPixels();
        resolve();
      };
    });
  }

  rotate() {
    return new Promise((resolve) => {
      const i = new Image();
      const url = this.canvas.toDataURL(); // needed over a blob because blob is apparently a reference
      i.src = url;
      i.onload = () => {
        this.ctx.clearRect(0, 0, width, width);
        this.ctx.translate(width / 2, width / 2);
        this.ctx.rotate((90 * Math.PI) / 180); // 90deg
        this.ctx.drawImage(i, -width / 2, -width / 2);
        this.ctx.rotate((-90 * Math.PI) / 180);
        this.ctx.translate(-width / 2, -width / 2);
        this.canvasToPixels();
        resolve();
      };
    });
  }

  canvasToPixels() {
    const imageData = this.ctx.getImageData(0, 0, width, width);
    for (let i = 0; i < imageData.data.length / 4; i++) {
      const [r, g, b, a] = imageData.data.slice(i * 4, i * 4 + 4);

      if (a === 0) {
        this.pixels[i] = transparent;
      } else {
        this.pixels[i] = toRGB332(r, g, b);
      }
    }
  }

  render({
    x = 0,
    y = 0,
    subSprite = this.subSprite,
    scale = this.scale,
    ctx = this.ctx,
  } = {}) {
    const pixels = this.pixels;

    // imageData is the internal copy
    const width = scale;
    const imageData = this.ctx.getImageData(0, 0, width, width);

    let i = 0;
    let j = pixels.length;
    if (scale === 8) {
      i = subSprite * 64;
      j = i + 64;
    }

    let ptr = 0;

    for (i; i < j; i++) {
      let index = pixels[i];

      const { r, g, b, a } = colourTable[index];
      imageData.data[ptr * 4 + 0] = r;
      imageData.data[ptr * 4 + 1] = g;
      imageData.data[ptr * 4 + 2] = b;
      imageData.data[ptr * 4 + 3] = a * 255;
      ptr++;
    }

    if (x !== 0 || y !== 0) {
      emptyCanvas(ctx);
    }

    ctx.putImageData(imageData, x, y, 0, 0, imageData.width, imageData.height);
  }

  // we always paint square…
  paint(ctx, { x = 0, y = 0, w = null, scale = null, subSprite = null } = {}) {
    if (w === null) {
      w = ctx.canvas.width;
    }

    // clear, set to jaggy and scale to canvas
    ctx.clearRect(x, y, w, w);
    ctx.imageSmoothingEnabled = false;

    let source = this.ctx.canvas;

    if (scale) {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.canvas.width = scale;
      ctx.canvas.height = scale;
      this.render({ ctx, scale, subSprite });
      source = ctx.canvas;
    }

    ctx.drawImage(source, 0, 0, source.width, source.height, x, y, w, w);
  }
}
