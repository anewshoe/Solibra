// Deterministic cleanup of the supplied official JPGs; no generated artwork.
// Usage: node scripts/prepare-solibra-emotes.cjs /path/to/originals
const { createRequire } = require('node:module');
const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const sharp = createRequire(require.resolve('next/package.json'))('sharp');

async function convert(variant, directory) {
  const { data: rgb, info: { width, height } } = await sharp(path.join(directory, `${variant} emote solibra.jpg`))
    .toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const count = width * height;
  const distance = new Int16Array(count).fill(-1);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const neighbors = i => [i % width ? i - 1 : -1, i % width < width - 1 ? i + 1 : -1, i >= width ? i - width : -1, i < count - width ? i + width : -1];
  function background(i) {
    const r = rgb[i * 3], g = rgb[i * 3 + 1], b = rgb[i * 3 + 2];
    return Math.min(r, g, b) >= 248 && Math.max(r, g, b) - Math.min(r, g, b) <= 8;
  }
  function seed(i) {
    if (distance[i] === -1 && background(i)) { distance[i] = 0; queue[tail++] = i; }
  }
  for (let x = 0; x < width; x++) { seed(x); seed(count - width + x); }
  for (let y = 0; y < height; y++) { seed(y * width); seed(y * width + width - 1); }
  // The megaphone and raised arm enclose one background gap, visually verified
  // in the official 913 × 760 JPG. Seed that gap explicitly, never light eyes/pages.
  if (variant === 'announce' && width === 913 && height === 760) seed(410 * width + 620);
  // Flood from the canvas edges only. Enclosed light details remain opaque.
  while (head < tail) for (const n of neighbors(queue[head++])) if (n >= 0) seed(n);
  const backgroundCount = tail;
  // Limit matte cleanup to a five-pixel band along the external outline.
  head = 0;
  while (head < tail) {
    const i = queue[head++];
    if (distance[i] >= 6) continue;
    for (const n of neighbors(i)) if (n >= 0 && distance[n] === -1) {
      distance[n] = distance[i] + 1; queue[tail++] = n;
    }
  }
  const rgba = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) {
    rgb.copy(rgba, i * 4, i * 3, i * 3 + 3);
    rgba[i * 4 + 3] = distance[i] === 0 ? 0 : 255;
    if (distance[i] < 1 || distance[i] > 5) continue;
    // Estimate the nearby solid foreground, then undo its white JPG matte.
    let closest = -1, squaredDistance = Infinity;
    const x = i % width, y = Math.floor(i / width);
    for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) {
      if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
      const n = i + dy * width + dx, d = dx * dx + dy * dy;
      if ((distance[n] === -1 || distance[n] === 6) && d < squaredDistance) { closest = n; squaredDistance = d; }
    }
    if (closest === -1) continue;
    let numerator = 0, denominator = 0;
    for (let c = 0; c < 3; c++) {
      const foreground = 255 - rgb[closest * 3 + c];
      numerator += (255 - rgb[i * 3 + c]) * foreground;
      denominator += foreground * foreground;
    }
    const alpha = denominator ? Math.min(1, Math.max(0, numerator / denominator)) : 1;
    rgba[i * 4 + 3] = Math.round(alpha * 255);
    if (alpha > 0 && alpha < 1) for (let c = 0; c < 3; c++) {
      rgba[i * 4 + c] = Math.round(Math.min(255, Math.max(0, 255 + (rgb[i * 3 + c] - 255) / alpha)));
    }
  }
  const destination = path.join(__dirname, '../public/solibra/emotes', `${variant}.png`);
  await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toFile(destination);
  console.log(`${variant}: ${width} × ${height}; ${backgroundCount} connected background pixels removed`);
}

async function main() {
  if (!process.argv[2]) throw new Error('Provide the directory containing the four original official JPGs.');
  await mkdir(path.join(__dirname, '../public/solibra/emotes'), { recursive: true });
  for (const variant of ['celebrate', 'announce', 'reading', 'wave']) await convert(variant, process.argv[2]);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
