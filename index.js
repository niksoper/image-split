#!/usr/bin/env node

const { program } = require("commander");
const path = require("path");
const fs = require("fs");
const { IMAGE_EXTENSIONS, DEFAULTS } = require("./src/defaults");
const { processImage } = require("./src/process");

program
  .name("image-split")
  .description(
    "Split scanned images containing multiple photos into individual files"
  )
  .argument("<inputDir>", "Directory containing scanned images (required)")
  .argument("[outputDir]", "Directory to save cropped photos (default: {inputDir}/output_{timestamp})")
  .option("--min-area <fraction>", "Minimum photo area as a fraction of total image area. Detected regions smaller than this are ignored as noise", parseFloat, DEFAULTS.minArea)
  .option("--padding <pixels>", "Pixels to add (positive) or remove (negative) around each detected photo edge. Use a negative value to eliminate any remaining white border", parseInt, DEFAULTS.padding)
  .option("--threshold <value>", "Brightness cutoff (0-255) for distinguishing photos from the light scanner background. Pixels brighter than this are treated as background", parseInt, DEFAULTS.threshold)
  .option("--blur <sigma>", "Gaussian blur radius applied during detection to smooth out noise and small details within photos", parseFloat, DEFAULTS.blur)
  .option("--scale <factor>", "Downscale factor (0-1) for the detection pass. Smaller values are faster but give less precise crop boundaries", parseFloat, DEFAULTS.scale)
  .option("--erode <pixels>", "Erosion radius applied to the detection mask to separate photos that are close together. Increase if adjacent photos are merged", parseInt, DEFAULTS.erode)
  .option("--rotate <count>", "Number of 90-degree clockwise rotations (1-4) to apply to each output image. Useful when scanned photos have the wrong orientation", parseInt)
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
