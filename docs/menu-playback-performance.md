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

## Mounted-editor warm playback observation after UX integration work

At HEAD `2334871` plus the other agent's still-uncommitted AE UX files, measured the served editor (not a standalone core canvas) with original menu AET/FARC/sprite database. Chromium 156 headless, viewport 1440×900, DPR 1, actual Stage backing 840×465, scene 0 / ROOT offset 3528, no isolation or runtime controller filtering. This intentionally measures raw overlapping ROOT, not a faithful menu state. The differing canvas size, scene contents and code state make this **not a before/after comparison** to the native-size baseline above.

Enabled the mounted timeline's actual workspace playback flag, allowed 30 RAF callbacks to warm, then observed 180 RAF callbacks over 3016.8 ms. Frame advanced from 58.938 to 239.934 with 180 distinct sampled values. RAF interval mean 16.665 ms, median 16.7, p95 17.8, max 27.2. No editor error was reported. Stage-context `drawImage` instrumentation counted 5246 calls with 10.8 ms total synchronous submission time across the sample; offscreen matte work, other Canvas calls and deferred raster/GPU work are excluded, so this is **not total draw cost** and does not attribute the whole-page bottleneck. Instrumentation was restored and playback stopped after sampling; no temporary files were created.

This establishes warm full-page playback advancement and observed RAF pacing at this viewport on this machine; it does not establish rendered-frame delivery or improvement over the native-canvas baseline. It does not verify full menu correctness, cold-start latency, timeline editing interactions, independent-object Stage integration, game parity, or a universal 60 FPS guarantee. Recheck only if subsequent relevant UX/rendering changes invalidate this observation; it is not final acceptance of another agent's uncommitted files.

## Collapsed versus expanded mounted timeline

At HEAD `058ac5c` plus concurrent material-browser work (not modified/staged here), original menu AET/FARC/database, scene 0 / composition 60 / selected layer 70752, viewport 1600×1000, Stage backing 1000×610, headless Chromium. Inspector remained visible. Each condition used 30 warmup RAF callbacks and 120 observed callbacks. Collapsed: 1 row / 0 timeline inputs, frame 33.660→153.648, RAF median 16.7ms / p95 17.3ms / max 26.4ms. Expanded Transform: 13 rows / 8 timeline inputs, frame 58.986→178.980, median 16.6ms / p95 17.2ms / max 27.3ms. Neither sample had an interval above 33.4ms or an editor error.

Both samples retained row-model identity, issued zero clearRect calls to the key Canvas, and retained identical key-raster pixels while playback advanced. Instrumentation was restored and browser closed. Frame intervals differed after warmup (including first-use texture work in the first warmup); this is not a controlled identical-frame speedup comparison. It establishes no observed warm callback-pacing regression in this small real composition when its visible Transform inputs were expanded, not native ROOT performance, cold latency, long-task attribution or delivered rendering FPS. No additional performance optimization was justified by this sample.

## Interpretation and next boundary

At this native canvas size the measured cost is drawing/texture preparation, not scene-index lookup or parent evaluation. No further evaluator caching is justified by this baseline. Cold decode preparation must be measured separately before proposing preload, async decode or cache-budget changes; the observed first draw does not prove which texture or decode stage dominates. Warm drawing also warrants profiling independently of the AE timeline work.

The current UX reconstruction files were left untouched. Full-editor playback and post-integration property-panel interaction remain separate acceptance gates. Binary compatibility and game visual parity remain distinct from this measurement.
