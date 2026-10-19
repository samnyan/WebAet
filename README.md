# WebAet

Browser-local Project DIVA AET layout and animation editor. Vue 3 + TypeScript + Naive UI + Vue Router 4 + vue-i18n 11. No parsing server or .NET runtime required.

## Run

```sh
pnpm install
pnpm dev
pnpm build
pnpm preview
```

If Linux exhausts its file-watch limit, start development with `CHOKIDAR_USEPOLLING=true pnpm dev`. Production previews do not need a file watcher.

## Workflow

1. Open or drop `aet_*.bin`, matching `spr_*.farc` and optionally `spr_db.bin`. Directory selection uses File System Access when supported, with directory-input fallback. Prefer a specific `rom/2d` directory rather than the complete game installation: directory import currently loads matching resources eagerly.
2. Select a scene and composition. ROOT is the last composition; it often contains many independent UI animations, not a single intended game screen. Select a layer and enable **Isolate** to preview one branch, or double-click a composition layer to enter it.
3. Edit transforms in the inspector. Existing animated channels insert/update a key at the current frame; constant channels remain constant. Canvas dragging translates all position keys of a direct layer in the current composition. Nested visual layers can be selected; enter their composition before dragging them.
4. Use the independent bottom timeline to scrub/play, select channels and edit key frame/value/tangent. Drag diamonds to change frame. Timeline supports collapsing, resizing and zooming.
5. Save a `.webaet` draft (Ctrl/Cmd+S), or export an edited AET binary. Exports download new files; originals are never overwritten. Drafts embed original AET bytes and edits, but do not embed sprite companions: reopen companions separately.

Undo/redo covers document edits. Hierarchy checkboxes control preview visibility; the inspector visibility flag changes exported data. Locked layers cannot be transformed. Binary renames currently require printable ASCII; existing Shift-JIS names are preserved unchanged.

## Modules

- `src/core/aet`: framework-independent classic little-endian 32-bit AET parser/types/writer. Writer preserves source records and unknown bytes, appending edited variable-length strings/curve data. Structural scene/layer creation and deletion are intentionally rejected.
- `src/core/resources`: FARC unpacking (classic ECB and MegaMix/Future Tone CBC), sprite database IDs, sprite/TXP parsing and texture decoding. `library.ts` is the browser canvas/image cache adapter.
- `src/core/animation`: Hermite sampling and affine math.
- `src/core/render`: composition evaluation and Canvas2D drawing/hit testing, independent of Vue.
- `src/editor`: Vue document lifecycle, history and local import/download adapter.
- `src/components/editor`: hierarchy, stage, inspector and standalone timeline.
- `src/views`, `src/router`, `src/i18n`: workspace composition and application integration.

Reference implementations inspected: MikuMikuLibrary Aets/Sprites/Textures/Archives, ReDIVA AET interpolation and ReAET composition transforms; UI follows MercuryManager's UMG viewer structure. Texture decoding uses `@bis-toolkit/bcn` (GPLv3); review dependency licensing before redistribution. No commercial fixtures are included.

## Verification and current boundaries

Verified on supplied MegaMix resources:
- 28 classic AET binaries in `rom_steam_it/rom/2d`: parse and byte-identical no-op export.
- Real `aet_gam_cmn.bin`: 582 compositions, 2427 layers; sprite archive decoding and database binding.
- Chromium: inspector edit, undo/redo, key insertion/value change, playback, binary download and project save/reopen.
- Edited browser download independently loaded with MikuMikuLibrary, confirming the edited frame/value.
- Isolated preview: property edits change actual canvas pixels; distinct animation frames change pixels after the edited layer is within the viewport. No page errors in that check.

Not complete game-runtime parity:
- 3D records/camera curves are preserved, but preview only applies 2D transforms; no perspective/camera rendering.
- Sprite-to-sprite alpha Track Matte is previewed with offscreen Canvas2D compositing, following ReDIVA's back-to-front pairing (including inactive mask layers). Browser check: real `aet_gam_cmn.bin` composition 26 paired `gam_cmn_suc_eff01__n.pic` with `gam_cmn_suc_eff02__n.pic`; controlled rectangle geometry using that pair yielded alpha samples `[0, 255, 0]`. This checks pairing and compositing, not visual parity of the original textured effect.
- Sprite matte previews support Alpha, NotAlpha, Luma and NotLuma (enum values verified in MikuMikuLibrary). Luma uses Rec.709 weights on Canvas sRGB values multiplied by mask opacity; exact game color-space/shader behavior is unverified. Chromium controlled half-opacity gray-mask checks produced interior alpha values 128/127/64/191 for modes 1–4 respectively. Pending sprite mattes now persist across recursive composition entry/exit, following ReDIVA runtime traversal; isolation retains the required following mask sprite. Controlled browser checks restructured a real sprite pair across both boundary directions, including an inactive mask; this does not establish original textured game parity. A composition layer’s own matte flag is not interpreted as whole-group masking. Unknown modes use alpha fallback with diagnostics. Unsupported blend modes use normal preview with diagnostics.
- No audio playback, structural layer/scene creation, archive repacking or sprite editing/export.
- English translation infrastructure is installed, but the complete editor interface is not yet translated.
- No game-runtime playback verification has been performed. Independent binary readability is not proof of identical game rendering.
