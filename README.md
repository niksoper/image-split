# image-split

Split scanned images containing multiple photos into individual files.

## Setup

```sh
pnpm install
```

## Usage

```sh
pnpm start <inputDir> [outputDir] [options]
```

- **`inputDir`** (required) — Directory containing scanned images
- **`outputDir`** (optional) — Directory to save cropped photos. Defaults to `{inputDir}/output_{timestamp}`

### Examples

Split all images in `scans/` and write output to `photos/`:

```sh
pnpm start scans photos
```

Use the default output directory:

```sh
pnpm start scans
```

Remove white borders by using negative padding:

```sh
pnpm start scans photos --padding -5
```

Rotate output photos 180°:

```sh
pnpm start scans photos --rotate 2
```

Increase erosion to separate photos that are close together:

```sh
pnpm start scans photos --erode 10
```

Lower the brightness threshold for darker backgrounds:

```sh
pnpm start scans photos --threshold 200
```

Combine multiple options:

```sh
pnpm start scans photos --padding -3 --rotate 2 --erode 8 --threshold 210
```

## Options

| Option | Default | Description |
|---|---|---|
| `--padding <pixels>` | `10` | Pixels to add (positive) or remove (negative) around each detected photo edge. Use a negative value to eliminate any remaining white border |
| `--threshold <value>` | `225` | Brightness cutoff (0–255) for distinguishing photos from the light scanner background. Pixels brighter than this are treated as background |
| `--erode <pixels>` | `5` | Erosion radius applied to the detection mask to separate photos that are close together. Increase if adjacent photos are merged |
| `--blur <sigma>` | `1` | Gaussian blur radius applied during detection to smooth out noise and small details within photos |
| `--scale <factor>` | `0.5` | Downscale factor (0–1) for the detection pass. Smaller values are faster but give less precise crop boundaries |
| `--min-area <fraction>` | `0.01` | Minimum photo area as a fraction of total image area. Detected regions smaller than this are ignored as noise |
| `--rotate <count>` | — | Number of 90° clockwise rotations (1–4) to apply to each output image |
