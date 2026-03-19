const sharp = require("sharp");
const { floodFill, erode, expandLabelsToOriginalMask } = require("./mask");

/**
 * Detect individual photo regions in a scanned image.
 * Downscales the image, applies blur and thresholding to create a binary mask,
 * erodes to separate adjacent photos, then finds connected components.
 * Returns bounding boxes in downscaled coordinates, sorted top-to-bottom, left-to-right.
 *
 * @param {string} inputPath - Absolute path to the scanned image file
 * @param {object} opts - Detection options
 * @param {number} opts.threshold - Brightness cutoff (0-255); pixels brighter than this are background
 * @param {number} opts.blur - Gaussian blur sigma applied to the downscaled image
 * @param {number} opts.scale - Downscale factor (0-1) for the detection pass
 * @param {number} opts.erode - Erosion radius in pixels to separate adjacent photos
 * @param {number} opts.minArea - Minimum photo area as a fraction of total image area
 * @returns {Promise<{ photos: Array<{ minX: number, minY: number, maxX: number, maxY: number, area: number }>, width: number, height: number }>}
 */
async function detectPhotos(inputPath, { threshold, blur, scale, erode: erodeRadius, minArea }) {
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  const dWidth = Math.round(width * scale);
  const dHeight = Math.round(height * scale);

  const blurred = await sharp(inputPath)
    .grayscale()
    .resize(dWidth, dHeight, { fit: "fill" })
    .blur(blur)
    .raw()
    .toBuffer();

  // Create binary mask: 1 = photo (dark in blurred), 0 = background (light)
  const mask = new Uint8Array(dWidth * dHeight);
  for (let i = 0; i < blurred.length; i++) {
    mask[i] = blurred[i] < threshold ? 1 : 0;
  }

  // Erode to separate photos that are close together
  const eroded = erode(mask, dWidth, dHeight, erodeRadius);

  // Find connected components on the eroded mask
  const labels = new Int32Array(dWidth * dHeight);
  let nextLabel = 1;
  const componentBounds = new Map();

  for (let y = 0; y < dHeight; y++) {
    for (let x = 0; x < dWidth; x++) {
      const idx = y * dWidth + x;
      if (eroded[idx] === 1 && labels[idx] === 0) {
        const bounds = floodFill(eroded, labels, dWidth, dHeight, x, y, nextLabel);
        componentBounds.set(nextLabel, bounds);
        nextLabel++;
      }
    }
  }

  // Re-derive bounding boxes from the original (non-eroded) mask
  expandLabelsToOriginalMask(mask, labels, dWidth, dHeight);
  for (const [label] of componentBounds) {
    componentBounds.set(label, { minX: dWidth, minY: dHeight, maxX: 0, maxY: 0, area: 0 });
  }
  for (let y = 0; y < dHeight; y++) {
    for (let x = 0; x < dWidth; x++) {
      const lbl = labels[y * dWidth + x];
      if (lbl > 0 && componentBounds.has(lbl)) {
        const b = componentBounds.get(lbl);
        b.area++;
        b.minX = Math.min(b.minX, x);
        b.minY = Math.min(b.minY, y);
        b.maxX = Math.max(b.maxX, x);
        b.maxY = Math.max(b.maxY, y);
      }
    }
  }

  // Filter by minimum area
  const totalArea = dWidth * dHeight;
  const minAreaPx = totalArea * minArea;

  const photos = [];
  for (const [, bounds] of componentBounds) {
    if (bounds.area >= minAreaPx) {
      photos.push(bounds);
    }
  }

  // Sort top-to-bottom, left-to-right
  photos.sort((a, b) => {
    const aCenter = a.minY + (a.maxY - a.minY) / 2;
    const bCenter = b.minY + (b.maxY - b.minY) / 2;
    const overlapThreshold = Math.min(a.maxY - a.minY, b.maxY - b.minY) * 0.3;
    if (Math.abs(aCenter - bCenter) < overlapThreshold) {
      return a.minX - b.minX;
    }
    return a.minY - b.minY;
  });

  return { photos, width, height };
}

module.exports = { detectPhotos };
