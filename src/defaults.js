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
  blur: 1,
  scale: 0.5,
  erode: 5,
};

module.exports = { IMAGE_EXTENSIONS, DEFAULTS };
