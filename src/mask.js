/**
 * Flood fill from a starting pixel to find a connected component of foreground pixels.
 * Marks visited pixels in the labels array and returns the bounding box of the component.
 *
 * @param {Uint8Array} mask - Binary mask (1 = foreground, 0 = background)
 * @param {Int32Array} labels - Array tracking which component each pixel belongs to (mutated in place)
 * @param {number} width - Mask width in pixels
 * @param {number} height - Mask height in pixels
 * @param {number} startX - X coordinate of the seed pixel
 * @param {number} startY - Y coordinate of the seed pixel
 * @param {number} label - Integer label to assign to this component
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, area: number }} Bounding box and area of the component
 */
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

/**
 * Apply morphological erosion to a binary mask using a square kernel.
 * Erosion shrinks foreground regions, which widens gaps between adjacent photos.
 * A pixel is kept as foreground only if all pixels within the given radius are also foreground.
 *
 * @param {Uint8Array} mask - Binary mask (1 = foreground, 0 = background)
 * @param {number} width - Mask width in pixels
 * @param {number} height - Mask height in pixels
 * @param {number} radius - Erosion radius in pixels. 0 returns a copy of the original mask
 * @returns {Uint8Array} New eroded binary mask
 */
function erode(mask, width, height, radius) {
  if (radius <= 0) return new Uint8Array(mask);
  const result = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let allFg = true;
      for (let dy = -radius; dy <= radius && allFg; dy++) {
        for (let dx = -radius; dx <= radius && allFg; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            allFg = false;
          } else if (mask[ny * width + nx] === 0) {
            allFg = false;
          }
        }
      }
      result[y * width + x] = allFg ? 1 : 0;
    }
  }
  return result;
}

/**
 * Expand component labels from an eroded mask onto the original (non-eroded) mask.
 * Uses BFS from all labelled pixels to assign unlabelled foreground pixels to the
 * nearest labelled component. This recovers accurate bounding boxes after erosion.
 *
 * @param {Uint8Array} mask - Original binary mask (1 = foreground, 0 = background)
 * @param {Int32Array} labels - Label array from flood fill on the eroded mask (mutated in place)
 * @param {number} width - Mask width in pixels
 * @param {number} height - Mask height in pixels
 */
function expandLabelsToOriginalMask(mask, labels, width, height) {
  // Assign unlabelled foreground pixels to the nearest labelled component
  // via BFS from all labelled pixels
  const queue = [];
  for (let i = 0; i < mask.length; i++) {
    if (labels[i] > 0) {
      queue.push(i);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;
    const label = labels[idx];

    for (const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]) {
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (mask[nIdx] === 1 && labels[nIdx] === 0) {
        labels[nIdx] = label;
        queue.push(nIdx);
      }
    }
  }
}

module.exports = { floodFill, erode, expandLabelsToOriginalMask };
