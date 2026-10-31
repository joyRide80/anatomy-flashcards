# Human Atlas

An interactive 3D anatomy explorer built with React, Three.js, and shadcn/ui. Take the adult male reference apart into **2,815 individually selectable meshes**, explore **16 anatomical systems**, and search **3,529 named concepts**.

## Explore

- Orbit, zoom, and select structures directly on the body.
- Toggle individual systems or use skeleton and organ presets.
- Move from assembled anatomy to a spaced inventory of every visible piece.
- Search anatomical names and source identifiers.
- Isolate a selected structure and read its details.
- Use compact controls and detail panels on mobile.

## Run locally

Requires Node.js 22.13 or newer. No API keys or accounts are needed.

```sh
npm ci
npm run dev
```

Open http://localhost:3016 for flash cards. The 3D explorer is at http://localhost:3016/atlas. To build the static site, run `npm run build`; the output is in `dist/`.

## Validate

```sh
npm run check
node scripts/validate-atlas.mjs
node scripts/validate-interactions.mjs
npm run build
```

Validation covers mesh buffers, names and concept membership, nonoverlapping exploded layouts at desktop and mobile aspect ratios, search and inspection contracts, and tap-versus-drag handling. Browser interaction checks have exercised selection, system controls, search, isolation, rotation, and 390×844, 320×568, and 844×390 layouts. Phone controls stay clear of the exploded inventory, and isolated structures fit the space above or beside the detail panel. Physical-device performance and real multitouch hardware have not been tested.

## Anatomy data

The skeleton, muscles, and joints come from [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy), one adult male model, so those layers meet. Z-Anatomy adapts BodyParts3D and distributes that work under **CC BY-SA 2.1 Japan**. Organs, vessels, and nerves remain **BodyParts3D 4.0**, licensed **CC BY 4.0**. Sharing the combined atlas must satisfy both licences. It does not represent every human structure or variation. Individual source meshes are distinct from named concepts, which may group multiple meshes.

The packaged model contains 4,472,926 triangles and downloads approximately 55 MB of compressed geometry. Full credits, source links, and adaptation details are in [ATTRIBUTION.md](public/ATTRIBUTION.md).

This is an educational explorer, not a diagnostic or surgical tool.

## How it works

Geometry is merged into batches. Per-structure GPU textures control translation, visibility, and selection, while component geometry supports accurate picking. Exploded layouts pack only the visible pieces. Rendering updates when the scene changes; orbit controls remain responsive without thousands of separate draw calls.

The optional WebMCP tools expose anatomy search and inspection in compatible browsers. The visible interface works without them.

## Flash cards

The home page and `/study` open a library of 16 prepared anatomy decks. Learners browse by category or region, preview the cards, and start studying immediately. The collection contains 348 subjects with Latin/English names and rendered anatomical views. Spaced repetition uses SM-2 with learning steps, and the same card shares its progress across decks.

Reviews are saved as immutable events in IndexedDB before the next card appears. Selected decks and pending cloud uploads are saved transactionally; removing a deck does not reset its history. The earlier app's custom decks and scheduling states are migrated without deleting the original data. A progress backup can be downloaded or restored from account settings.

For recovery after browser storage loss, configure Supabase email authentication and the tables in `supabase/schema.sql`, then set the root environment variables shown in `.env.example`. Without this connection, the app explicitly offers device-only storage and downloadable backups. See [the web pilot and iOS architecture](docs/web-first-architecture.md) for setup, limitations, and the App Store plan.

Run `npm run learning:validate` for prepared-deck and event-replay checks. With the development server running and Playwright browsers installed, run `npm run learning:browser` for browser persistence, migration, backup, and responsive-layout checks. Set `BROWSER=webkit` to use Playwright WebKit; real iPhone Safari remains a separate device test.

Card images are pre-rendered from the 3D atlas. To regenerate them:

```sh
npm run cards:latin     # optional: refresh Latin terms (TA98 + Wikidata), needs network
npm run cards:catalog   # build public/cards/catalog.json
npm run cards:render    # render public/cards/img/*.webp with headless Chromium (add --force to redo all)
npm run cards:validate
```

Latin terms come from Terminologia Anatomica 1998 (via [ta98-sqlite](https://github.com/mhalle/ta98-sqlite)) and Wikidata, with rules for numbered series such as ribs, vertebrae, and phalanges. Flashcards still teach the previous bone, muscle, and ligament selection where a Z-Anatomy mesh shares that name.

## Rebuilding geometry

The repository includes browser-ready geometry. Rebuilding the BodyParts3D meshes is optional: obtain the official BodyParts3D OBJ archive and English metadata tables, prepare the joined concepts and display-system mappings, run `scripts/convert-anatomy.py`, then `node scripts/optimize-anatomy.mjs` and `node scripts/compress-models.mjs`. Simplification uses a 0.2% relative error limit per structure. The skeleton, muscles, and joints are separate: with the Z-Anatomy blend open, run `scripts/export-zanatomy-systems.py`, then `node scripts/replace-body-systems.mjs`.

## Deploy

Import this repository into Vercel as a Vite project. The included `vercel.json` configures `npm ci`, `npm run build`, and the `dist` output directory. It can also be served by a static host.

## License

Original application code is released under the [MIT License](LICENSE). **The anatomy data has its own CC BY 4.0 license**; preserve the attribution when redistributing it. Third-party dependencies retain their respective licenses.

Issues and pull requests are welcome. Please include reproduction steps and browser/device details for interaction problems.
