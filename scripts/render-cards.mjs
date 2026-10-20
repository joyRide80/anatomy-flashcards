// Renders flash card images for every catalog structure into public/cards/img/.
// Usage: node scripts/render-cards.mjs [--only id,id] [--force] [--views 2] [--size 720]
import { readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const only = option("only", "")?.split(",").filter(Boolean);
const force = args.includes("--force");
const views = Number(option("views", 2));
const size = Number(option("size", 720));

const root = fileURLToPath(new URL("..", import.meta.url));
const catalogUrl = new URL("../public/cards/catalog.json", import.meta.url);
const imageDir = new URL("../public/cards/img/", import.meta.url);
await mkdir(imageDir, { recursive: true });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const exists = (url) =>
  access(url).then(
    () => true,
    () => false,
  );

const server = await createServer({
  root: `${root}web`,
  configFile: `${root}vite.config.ts`,
  server: { port: 3917, strictPort: false, host: "127.0.0.1" },
  logLevel: "warn",
});
await server.listen();
const base = server.resolvedUrls.local[0].replace(/\/$/, "");
const browser = await chromium.launch({
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});

try {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
  });
  page.on("pageerror", (e) => console.error("page error:", e.message));
  await page.goto(`${base}/render-cards`);
  await page.waitForFunction(
    () => window.cardRenderer?.ready || window.cardRenderer?.error,
    null,
    { timeout: 300_000 },
  );
  const error = await page.evaluate(() => window.cardRenderer.error);
  if (error) throw new Error(error);
  console.log(
    "WebGL renderer:",
    await page.evaluate(() => {
      const gl = document.querySelector("canvas").getContext("webgl2");
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unknown";
    }),
  );

  const catalog = JSON.parse(await readFile(catalogUrl));
  const ids = only?.length ? only : catalog.structures.map((s) => s.id);
  const results = new Map();
  const started = Date.now();
  for (const [n, id] of ids.entries()) {
    const structure = catalog.structures.find((s) => s.id === id);
    if (!structure) throw new Error(`Unknown structure ${id}`);
    const done = await Promise.all(
      structure.images.map((img) =>
        exists(new URL(`../public${img.src}`, import.meta.url)),
      ),
    );
    if (!force && structure.images.length && done.every(Boolean)) continue;
    const rendered = await page.evaluate(
      ([id, options]) => window.cardRenderer.render(id, options),
      [id, { views, size }],
    );
    const images = [];
    for (const { view, dataUrl } of rendered) {
      const file = `${id}-${slug(view)}.webp`;
      await writeFile(
        new URL(file, imageDir),
        Buffer.from(dataUrl.split(",")[1], "base64"),
      );
      images.push({ src: `/cards/img/${file}`, view });
    }
    for (const old of structure.images)
      if (!images.some((img) => img.src === old.src))
        await rm(new URL(`../public${old.src}`, import.meta.url), {
          force: true,
        });
    results.set(id, images);
    console.log(
      `[${n + 1}/${ids.length}] ${id}: ${images.map((i) => i.view).join(", ")}`,
    );
  }

  const latest = JSON.parse(await readFile(catalogUrl));
  for (const s of latest.structures)
    if (results.has(s.id)) s.images = results.get(s.id);
  await writeFile(catalogUrl, JSON.stringify(latest) + "\n");
  console.log(
    `Rendered ${results.size} structures in ${Math.round((Date.now() - started) / 1000)}s.`,
  );
} finally {
  await browser.close();
  await server.close();
}
