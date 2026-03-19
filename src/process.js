const sharp = require("sharp");
const path = require("path");
const { detectPhotos } = require("./detect");

/**
 * Process a single scanned image: detect photos, refine crop boundaries at full
 * resolution, apply padding and rotation, then save each photo as a separate PNG.
 *
 * @param {string} inputPath - Absolute path to the scanned image file
 * @param {string} outputDir - Absolute path to the output directory
 * @param {string} filename - Original filename (used to derive output names)
 * @param {object} opts - Processing options
 * @param {number} opts.padding - Pixels to add (positive) or remove (negative) around each photo edge
 * @param {number} opts.threshold - Brightness cutoff (0-255) for background detection
 * @param {number} opts.scale - Downscale factor used during detection
 * @param {number} [opts.rotate] - Number of 90-degree clockwise rotations (1-4) to apply
 * @param {number} opts.blur - Gaussian blur sigma for detection
 * @param {number} opts.erode - Erosion radius for detection
 * @param {number} opts.minArea - Minimum photo area fraction for detection
 */
async function processImage(inputPath, outputDir, filename, opts) {
  const { padding, threshold, scale, rotate } = opts;
  const { photos, width, height } = await detectPhotos(inputPath, opts);

  if (photos.length === 0) {
    console.log("  No photos detected.");
    return;
  }

  console.log(`  Found ${photos.length} photo(s).`);

  const baseName = path.parse(filename).name;

  for (let i = 0; i < photos.length; i++) {
    const bounds = photos[i];
    const upscale = 1 / scale;
    let left = Math.max(0, Math.round(bounds.minX * upscale) - padding);
    let top = Math.max(0, Math.round(bounds.minY * upscale) - padding);
    let right = Math.min(width, Math.round((bounds.maxX + 1) * upscale) + padding);
    let bottom = Math.min(height, Math.round((bounds.maxY + 1) * upscale) + padding);

    // Refine crop at full resolution to trim remaining background pixels
    const coarseCropW = right - left;
    const coarseCropH = bottom - top;
    const cropGray = await sharp(inputPath)
      .extract({ left, top, width: coarseCropW, height: coarseCropH })
      .grayscale()
      .raw()
      .toBuffer();

    let trimLeft = coarseCropW, trimTop = coarseCropH, trimRight = 0, trimBottom = 0;
    for (let cy = 0; cy < coarseCropH; cy++) {
      for (let cx = 0; cx < coarseCropW; cx++) {
        if (cropGray[cy * coarseCropW + cx] < threshold) {
          trimLeft = Math.min(trimLeft, cx);
          trimTop = Math.min(trimTop, cy);
          trimRight = Math.max(trimRight, cx);
          trimBottom = Math.max(trimBottom, cy);
        }
      }
    }

    if (trimRight >= trimLeft && trimBottom >= trimTop) {
      // Refine bounds: convert trim offsets to absolute coordinates and apply padding
      // Negative padding shrinks the crop inward, removing edge pixels
      left = Math.max(0, left + trimLeft - padding);
      top = Math.max(0, top + trimTop - padding);
      right = Math.min(width, left + (trimRight - trimLeft + 1) + padding * 2);
      bottom = Math.min(height, top + (trimBottom - trimTop + 1) + padding * 2);

      // Ensure minimum 1px crop
      if (right <= left) right = left + 1;
      if (bottom <= top) bottom = top + 1;
    }

    const cropWidth = right - left;
    const cropHeight = bottom - top;

    const outputName = `${baseName}_${i + 1}.png`;
    const outputPath = path.join(outputDir, outputName);

    let pipeline = sharp(inputPath)
      .extract({ left, top, width: cropWidth, height: cropHeight });

    if (rotate >= 1 && rotate <= 4) {
      pipeline = pipeline.rotate(rotate * 90);
    }

    await pipeline.png().toFile(outputPath);

    console.log(`  Saved: ${outputName} (${cropWidth}x${cropHeight} at ${left},${top})`);
  }
}

module.exports = { processImage };
