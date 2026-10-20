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

1. In Chromium on a secure origin (HTTPS or localhost), choose the `diva_main` resource directory. Scanning indexes paths only, not resource bytes. The index is cached in IndexedDB and reused after selecting the same directory again; use **重新扫描** after files change. Use the left **库 / Project** panel to browse resources; opening an indexed AET loads its Sprite companions on demand. Single-click selects a library preview, while double-click opens the resource. The directory-picker workflow still needs post-refactor end-to-end acceptance; the single-file import/edit/download/fresh-page reopen path has been checked. Other browsers can open/drop `aet_*.bin`, matching `spr_*.farc` and optionally `spr_db.bin`; directory-handle selection has no directory-input fallback.
2. Select a scene and composition. ROOT is the last composition; it often contains many independent UI animations, not a single intended game screen. Select a layer and enable **Isolate** to preview one branch, or double-click a composition layer to enter it.
3. Edit transforms in the inspector. Existing animated channels insert/update a key at the current frame; constant channels remain constant. Canvas dragging translates all position keys of a direct layer in the current composition. Nested visual layers can be selected; enter their composition before dragging them.
4. Use the independent bottom timeline to scrub/play, select channels and edit key frame/value/tangent. Drag diamonds to change frame. Timeline supports collapsing, resizing and zooming. Its viewport-sized Canvas draws only visible rows/time ranges and aggregates dense keys by pixel column; playback moves a separate playhead overlay. Use wheel to scroll vertically, Shift-wheel horizontally, middle-button/Alt-drag to pan, and Ctrl/Cmd-wheel to zoom around the pointer. Scrubbing is coalesced per animation frame with an exact final seek; dragging near a horizontal edge auto-scrolls. Key drags preview locally and commit once on release (undoable); pointer cancellation discards the drag. Follow-playhead is opt-in and applies only during playback. Paired `st_*` / `ed_*` markers define selectable playback segments (inclusive end frame). Edit existing marker names/frames in the inspector; invalidated pairs reset segment selection to the full range. Marker creation/deletion is not supported.
5. Timeline operations include preview speed/reverse, layer-time ranges, curve copy/paste, numeric offsets, curve reversal and retiming. **整层重定时** shares the earliest animated key as the pivot across 2D/3D channels, preserving constant channels; it does not retime layer visibility, markers or child-composition time mapping. Preview reverse does not edit data; **反转轨道动画** does.
6. Save a `.webaet` draft (Ctrl/Cmd+S), or export an edited AET binary. Exports download new files; originals are never overwritten. Drafts embed original AET bytes and edits, but do not embed sprite companions: reopen companions separately.

7. Export viewport PNG, native-size scene PNG, or native-size selected-branch PNG. Native exports optionally omit the scene background; branch export retains parent transforms and paired sprite masks, but ignores temporary hiding. These use the editor renderer, not the game renderer.
8. Use **关闭资源** to release the current document, history and Sprite/decoded texture resources while retaining the directory index. Unsaved changes require confirmation.

The bottom status bar contains a notification bell, task progress/cancellation and diagnostics popup. Diagnostics include unresolved Sprite references across all scenes, with search and copying of filtered results. The inspector exposes per-source IDs and resolution metadata without decoding textures. Cancellation stops archive workers and subsequent loads; an in-flight file read or synchronous parse cannot be interrupted immediately.

Undo/redo covers document edits. Hierarchy checkboxes control preview visibility; the inspector visibility flag changes exported data. Locked layers cannot be transformed. Binary renames currently require printable ASCII; existing Shift-JIS names are preserved unchanged.

## Current workspace

- Left **库 / Project** and **图层树 / Layers** tabs separate resource browsing from composition/layer navigation. Right **场景 / Scene** and **效果 / Effects** tabs expose scene settings and the selected layer.
- The standalone bottom timeline lists the current composition's layers. Expand a layer and its property groups for inline values and previous/add/next-key controls; Transform contains the 3D group. Timeline and Inspector share editing/history commands. Open **动画工具** for bulk curve operations rather than looking for the old footer controls or layer dropdown.
- For the recognized six-branch MegaMix main menu, Stage offers **菜单角色（仅预览）**. It filters only the character branches and preserves other UI/temporary hiding. The default shows raw branches. Stage also offers opt-in **子菜单（部分模拟）** when the four exact arcade/mix branches exist: active `on` samples timeline frame clamped to 10–90, inactive `off` stays at frame 6, preserving unrelated UI. It is limited to 2D/non-isolated viewing, disables canvas drag editing, and resets on composition/document navigation. Objects are provisionally drawn above other UI; game object order, version overlays, runtime text bindings and transitions are not simulated. Viewport PNG captures this preview; native scene/branch PNG still evaluates the original composition. This is not a complete menu controller. Source-less runtime-bound layers are omitted with a diagnostic, not rendered as solid rectangles.
- **导出 AET** downloads a new binary and does not clear the current document's dirty flag. To inspect it, open the download with its companions in a fresh page, or explicitly close/switch the active document. Importing another AET into an already open editor may only update the library; it does not automatically replace the active document.

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

- Post-refactor real-menu checks: Inspector input/undo/redo/actual download/fresh-page reopen preserved the edited value and selected-branch PNG hash; timeline pointer drag from key frame 11 to 30 survived actual download/reopen with all 23 curve keys' values/tangents preserved and all evaluated Sprite references resolved.
- Timeline/Inspector inputs synchronized in both directions; real key drag undo/redo/cancel, wheel scrolling and pointer-anchored zoom at nonzero scroll offsets passed scoped browser checks. Frame-only updates retained the row model and static key-canvas raster.
- Warm mounted playback with collapsed versus expanded Transform controls showed no observed callback-pacing regression in the sampled character composition. These are local headless RAF observations, not delivered rendering FPS or universal performance guarantees. See `docs/menu-playback-performance.md`; rendering/roundtrip evidence and remaining menu gaps are in `docs/menu-character-investigation.md`.

Not complete game-runtime parity:
- 3D transforms now use full homogeneous parent/composition matrices before orthographic projection, using ReDIVA rotation order and coordinate signs. Checked 2422 real 2D layers against the prior affine formula and mixed 3D rotation/anchor math against Chromium DOMMatrix. The 3D observation view can toggle an editor-only perspective approximation using 12×12 subdivided textured quads, preserving painter order and matte compositing. Near-plane intersections are clipped in local-plane coordinates for both mesh rendering and hit polygons; a controlled Chromium crossing-plane fixture remained visible/selectable, while a fully behind-camera fixture was omitted. Constant-depth sprites use one exact affine draw (uniform half-opacity interior verified); tilted planes still have triangle-seam quality limitations. Scratch canvases are reused for matte/perspective rendering; this does not establish a measured FPS improvement. Spatial guides currently appear only in orthographic mode. Browser checks cover depth scaling, actual raster pixels and switching a real imported resource. Camera Eye translation is applied before composition transforms following the inspected ReDIVA runtime path; full AET camera perspective is not implemented. Neither observation mode establishes game-rendering parity.
- Sprite-to-sprite alpha Track Matte is previewed with offscreen Canvas2D compositing, following ReDIVA's back-to-front pairing (including inactive mask layers). Browser check: real `aet_gam_cmn.bin` composition 26 paired `gam_cmn_suc_eff01__n.pic` with `gam_cmn_suc_eff02__n.pic`; controlled rectangle geometry using that pair yielded alpha samples `[0, 255, 0]`. This checks pairing and compositing, not visual parity of the original textured effect.
- Sprite matte previews support Alpha, NotAlpha, Luma and NotLuma (enum values verified in MikuMikuLibrary). Luma uses Rec.709 weights on Canvas sRGB values multiplied by mask opacity; exact game color-space/shader behavior is unverified. Chromium controlled half-opacity gray-mask checks produced interior alpha values 128/127/64/191 for modes 1–4 respectively. Pending sprite mattes now persist across recursive composition entry/exit, following ReDIVA runtime traversal; isolation retains the required following mask sprite. Controlled browser checks restructured a real sprite pair across both boundary directions, including an inactive mask; this does not establish original textured game parity. A composition layer’s own matte flag is not interpreted as whole-group masking. Unknown modes use alpha fallback with diagnostics. Unsupported blend modes use normal preview with diagnostics.
- No audio playback, structural layer/scene creation, archive repacking or sprite editing/export.
- English translation infrastructure is installed, but the complete editor interface is not yet translated.
- No game-runtime playback verification has been performed. Independent binary readability is not proof of identical game rendering.
