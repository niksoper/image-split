#!/usr/bin/env node

const sharp = require("sharp");
const { program } = require("commander");
const path = require("path");
const fs = require("fs");

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tiff",
  ".tif",
  ".webp",
  ".bmp",
]);

const DEFAULTS = {
  minArea: 0.01,
  padding: 10,
  threshold: 225,
  blur: 5,
  scale: 0.25,
};

program
  .name("image-split")
  .description(
    "Split scanned images containing multiple photos into individual files"
  )
  .argument("<inputDir>", "Directory containing scanned images (required)")
  .argument("[outputDir]", "Directory to save cropped photos (default: {inputDir}/output_{timestamp})")
  .option("--min-area <fraction>", "Minimum photo area as a fraction of total image area. Detected regions smaller than this are ignored as noise", parseFloat, DEFAULTS.minArea)
  .option("--padding <pixels>", "Extra pixels added around each detected photo when cropping to avoid clipping edges", parseInt, DEFAULTS.padding)
  .option("--threshold <value>", "Brightness cutoff (0-255) for distinguishing photos from the light scanner background. Pixels brighter than this are treated as background", parseInt, DEFAULTS.threshold)
  .option("--blur <sigma>", "Gaussian blur radius applied during detection to smooth out noise and small details within photos", parseFloat, DEFAULTS.blur)
  .option("--scale <factor>", "Downscale factor (0-1) for the detection pass. Smaller values are faster but give less precise crop boundaries", parseFloat, DEFAULTS.scale)
  .action(async (inputDir, outputDir, opts) => {
    const absInput = path.resolve(inputDir);

    if (!outputDir) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      outputDir = path.join(absInput, `output_${timestamp}`);
    }

    const absOutput = path.resolve(outputDir);

    if (!fs.existsSync(absInput)) {
      console.error(`Input directory does not exist: ${absInput}`);
      process.exit(1);
    }

    fs.mkdirSync(absOutput, { recursive: true });

    const files = fs.readdirSync(absInput).filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTENSIONS.has(ext);
    });

    if (files.length === 0) {
      console.log("No image files found in input directory.");
      return;
    }

    console.log(`Found ${files.length} image(s) to process.`);

    for (const file of files) {
      const inputPath = path.join(absInput, file);
      console.log(`\nProcessing: ${file}`);
      try {
        await processImage(inputPath, absOutput, file, opts);
      } catch (err) {
        console.error(`  Error processing ${file}: ${err.message}`);
      }
    }

    console.log("\nDone.");
  });

if (process.argv.length <= 2) {
  program.help();
}

program.parse();

async function processImage(inputPath, outputDir, filename, opts) {
  const { minArea: MIN_AREA_FRACTION, padding: PADDING, threshold: BG_THRESHOLD, blur: BLUR_SIGMA, scale: DETECTION_SCALE } = opts;
  const metadata = await sharp(inputPath).metadata();
  const { width, height } = metadata;

  // Downscale for detection: faster processing and naturally bridges small gaps
  const dWidth = Math.round(width * DETECTION_SCALE);
  const dHeight = Math.round(height * DETECTION_SCALE);

  const blurred = await sharp(inputPath)
    .grayscale()
    .resize(dWidth, dHeight, { fit: "fill" })
    .blur(BLUR_SIGMA)
    .raw()
    .toBuffer();

  // Create binary mask: 1 = photo (dark in blurred), 0 = background (light)
  const mask = new Uint8Array(dWidth * dHeight);
  for (let i = 0; i < blurred.length; i++) {
    mask[i] = blurred[i] < BG_THRESHOLD ? 1 : 0;
  }

  // Find connected components using flood fill
  const labels = new Int32Array(dWidth * dHeight);
  let nextLabel = 1;
  const componentBounds = new Map();

  for (let y = 0; y < dHeight; y++) {
    for (let x = 0; x < dWidth; x++) {
      const idx = y * dWidth + x;
      if (mask[idx] === 1 && labels[idx] === 0) {
        const bounds = floodFill(
          mask,
          labels,
          dWidth,
          dHeight,
          x,
          y,
          nextLabel
        );
        componentBounds.set(nextLabel, bounds);
        nextLabel++;
      }
    }
  }

  const totalArea = dWidth * dHeight;
  const minArea = totalArea * MIN_AREA_FRACTION;

  const photos = [];
  for (const [label, bounds] of componentBounds) {
    if (bounds.area >= minArea) {
      photos.push(bounds);
    }
  }

  if (photos.length === 0) {
    console.log("  No photos detected.");
    return;
  }

  console.log(`  Found ${photos.length} photo(s).`);

  // Sort photos top-to-bottom, left-to-right
  photos.sort((a, b) => {
    const aCenter = a.minY + (a.maxY - a.minY) / 2;
    const bCenter = b.minY + (b.maxY - b.minY) / 2;
    // If vertically overlapping significantly, sort left-to-right
    const overlapThreshold = Math.min(a.maxY - a.minY, b.maxY - b.minY) * 0.3;
    if (Math.abs(aCenter - bCenter) < overlapThreshold) {
      return a.minX - b.minX;
    }
    return a.minY - b.minY;
  });

  const baseName = path.parse(filename).name;

  for (let i = 0; i < photos.length; i++) {
    const bounds = photos[i];
    // Map from downscaled coordinates back to original resolution and apply padding
    const scale = 1 / DETECTION_SCALE;
    const left = Math.max(0, Math.round(bounds.minX * scale) - PADDING);
    const top = Math.max(0, Math.round(bounds.minY * scale) - PADDING);
    const right = Math.min(
      width,
      Math.round((bounds.maxX + 1) * scale) + PADDING
    );
    const bottom = Math.min(
      height,
      Math.round((bounds.maxY + 1) * scale) + PADDING
    );

    const cropWidth = right - left;
    const cropHeight = bottom - top;

    const outputName = `${baseName}_photo_${i + 1}.png`;
    const outputPath = path.join(outputDir, outputName);

    await sharp(inputPath)
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toFile(outputPath);

    console.log(
      `  Saved: ${outputName} (${cropWidth}x${cropHeight} at ${left},${top})`
    );
  }
}

function floodFill(mask, labels, width, height, startX, startY, label) {
  const bounds = {
    minX: startX,
    minY: startY,
    maxX: startX,
    maxY: startY,
    area: 0,
  };

  const stack = [startX, startY];
  labels[startY * width + startX] = label;

  while (stack.length > 0) {
    const y = stack.pop();
    const x = stack.pop();

    bounds.area++;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (mask[nIdx] === 1 && labels[nIdx] === 0) {
        labels[nIdx] = label;
        stack.push(nx, ny);
      }
    }
  }

  return bounds;
}
