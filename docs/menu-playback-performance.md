# Real menu playback performance baseline

## Scope

Measured the actual browser renderer with original `aet_nswgam_menu.bin`, `spr_nswgam_menu.farc` and `spr_db.bin`. This is a core-renderer playback baseline, not full editor/timeline performance and not game-rendering parity.

- Headless Chromium 156.0.8078.4, Linux x86_64.
- Browser viewport 1440×900, DPR 1; visible canvas backing 1920×1080, unscaled.
- Scene 0, composition index 93 / offset 3528, rhythmgame character preview, other UI retained.
- Frame range 30–149, 180 requestAnimationFrame-driven samples after 30 warmup draws.
- Real texture decoding and drawing; interactive hit-area generation enabled.
- No evaluator/drawing warnings; 38–92 draw items per sampled frame.

## Results (milliseconds)

- Cold frame 30: evaluation 2.0, draw including lazy texture preparation 2839.3.
- Warm evaluation: mean 0.49, median 0.40, p95 0.70, max 15.20.
- Warm draw submission: mean 17.26, median 15.40, p95 24.30, max 31.10.
- requestAnimationFrame interval: mean 19.92, median 16.70, p95 33.40, max 33.40.

Timing is local wall-clock data from one run. Canvas draw timing includes synchronous work but does not isolate completed GPU raster/compositor cost. Headless rendering is not equivalent to a user's desktop GPU. Do not advertise these values as universal FPS or full-editor performance.

## Cold texture follow-up

All eight menu textures use BC5 luma/chroma conversion. Sequential preparation retained all eight textures (110100480 bytes within the 134217728-byte default budget); this case did not demonstrate cache eviction/thrashing. Standalone decode of a 2048×2048 atlas took roughly 522–586 ms in the profiling run. One preparation outlier reached 2468 ms, so decode alone must not be claimed to explain every cold stall.

Replaced the YCbCr conversion loop's per-pixel temporary RGBA array with direct Uint8ClampedArray channel writes. In a same-page baseline-versus-change comparison, all eight original textures were decoded three times by each implementation: every output byte matched. For texture 1 (2048×2048), baseline samples were 545.8/567.8/544.4 ms versus 443.5/472.7/441.5 ms after the change. Other atlas samples also decreased, but this fixed-order local experiment is not a controlled cross-machine benchmark. This reduces allocation in cold conversion only; it does not establish improved warm playback or eliminate first-frame blocking. The temporary baseline module was removed after comparison.

A second scoped change shares Cb/Cr interpolation geometry, precomputes horizontal coordinates and computes vertical coordinates once per row (Float64 weights preserve arithmetic precision). Against the preceding committed decoder, eight original textures × three runs matched every output byte; three controlled odd-size/edge-clamped fixtures also matched. Execution order alternated between implementations. Texture 1 baseline samples were 448.1/474.9/475.7 ms versus 296.2/294.8/314.0 ms with coordinate reuse. This remains synchronous decoding and does not establish a new full-frame FPS figure.

## Interpretation and next boundary

At this native canvas size the measured cost is drawing/texture preparation, not scene-index lookup or parent evaluation. No further evaluator caching is justified by this baseline. Cold decode preparation must be measured separately before proposing preload, async decode or cache-budget changes; the observed first draw does not prove which texture or decode stage dominates. Warm drawing also warrants profiling independently of the AE timeline work.

The current UX reconstruction files were left untouched. Full-editor playback and post-integration property-panel interaction remain separate acceptance gates. Binary compatibility and game visual parity remain distinct from this measurement.
