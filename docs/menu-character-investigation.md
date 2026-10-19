# Menu character preview investigation

## Reproduction baseline

Use user-provided `rom_steam/rom/2d/` resources (not included in the repository):
- `aet_nswgam_menu.bin`
- `spr_nswgam_menu.farc`
- `spr_db.bin`

Scene: `MAIN`. Composition index: 93 (offset 3528). Frame: 30.
Character branch: `chara_mainmenu_rhythmgame` (layer offset 104912).

## Confirmed observations

Browser-loaded core modules parsed these actual files, bound the database, evaluated the branch and drew its original textures with `drawItems`.

- All menu Sprite source references resolve with these companions.
- Frame 0 produces zero items for this branch; this alone is not missing-resource evidence.
- Frames 30 and 60 produce four branch items without evaluation warnings.
- Frame 30 order: cube01_02, character01 shadow, character01, cube01_01.
- Character01 frame-30 affine matrix: approximately `[0.999833, 0, 0, 0.999833, 634.126, -43.253]`; opacity 1.
- The frame-30 textured image shows a coherent Miku illustration. This establishes a visible branch, NOT agreement with an original game capture. Image extends beyond the viewport, so not seeing an entire body is not by itself a transform bug.
- Full composition frame 30 has 112 draw items and all six main menu character sources (01 through 06); frame 60 has 76 draw items and still all six. Thus raw full-composition playback overlays mutually selectable menu branches. AET evaluation alone does not select the live game's menu state.

## Runtime source comparison

Inspected ReDIVA `src/CRE/auth_2d.cpp`:
- `AetObj::DispComp` (1277): reverse layer traversal.
- `AetObj::DispLayer` (1350): half-open layer visibility, video-active flag, transform and opacity at composition time, then child time `(frame - start) * time_scale + offset_time`.

These paths agree with the current evaluator for the checks above. This is source-level evidence only; it is not an IDA/game-execution verification of MegaMix's particular menu controller.

## MegaMix v103 menu-controller evidence and implemented preview

Inspected the supplied IDA database directly:
- `0x1406C19B0` (`MainMenu_InitSubLayout`): creates six independent selector nodes using `MainMenu_GetLocalizedName(dst, 1, i + 1, 0)`.
- `0x1406BFEB0` (`MainMenu_GetLocalizedName`): kind 1 builds character prefix + underscore + menu suffix; custom is literal `custom`.
- `0x140100240`: initializes the prefix to `chara_mainmenu`; renamed `InitMenuSwitchCharacterPrefix`.
- `0x1401003C0`: initializes the first suffix to `rhythmgame`; renamed `InitMenuSwitchRhythmGameSuffix`.
- `0x1406C1CA0` (`MainMenu_ProcessSubLayoutSelect`): operates on indexed selector objects and uses `MAINMENU_SWITCH`; this is controller logic outside raw AET traversal.

Added a hierarchy selector only when all six exact composition-layer names exist. Choosing a character hides the other five group members and preserves unrelated UI and temporary hiding. Default raw/custom composition mode is retained, preview does not dirty the document or serialize game-state choices. This is a character-only preview aid, not full menu-controller emulation (labels, transitions and independent clocks remain raw).

Mounted Chromium verification imported all three original companion files. Rhythmgame then custom switching updates hierarchy visibility without dirtying data. At frame 30, the selected rhythmgame group produces exactly character source 01 while retaining 92 draw items (rather than the four-item isolated branch); document scene data remains unchanged. Restoring all characters preserves unrelated hiding. No original-game capture comparison was performed.

## Six-branch integration check

Real-resource Chromium core-path verification (not a mounted-UX acceptance test) exercised all six menu choices at frames 30 and 60, drawing at native 1920×1080 with original textures:

- rhythmgame -> character 01
- custom -> character 06
- playlist -> character 02
- gallery -> character 03
- eshop -> character 04
- option -> character 05

Each of the 12 cases emitted exactly one main character source and no evaluation/drawing warnings. Each choice retained 92 draw items at frame 30 and 56 at frame 60. Raster SHA-256 values were distinct between choices and timestamps; this establishes changing output, not original-game visual fidelity.

With the existing scene evaluator retained, changing the real character layer's position-X keys by +20 changed its evaluated matrix immediately (no stale parent/local transform cache). Writing edited AET and reparsing reproduced that matrix within 0.001; restoring original key values restored the exact original matrix. This is core edit/export/reload evidence, not mounted editor undo/redo or game playback verification.

AE UX files were concurrently under reconstruction and were left untouched. Full mounted workflow acceptance remains pending that integration.

## Remaining acceptance gap

Do not mark the character issue fixed based on branch isolation. No newly demonstrated transform or texture-binding defect has been identified in this baseline.

Next: identify how the game's menu controller selects/enables branches, then add an explicit non-mutating preview state model if justified. It must distinguish raw composition playback from a chosen game-like menu state, avoid silently hiding arbitrary layers, preserve paired masks and parent transforms, and never serialize preview choices into AET exports. Verify through the mounted editor with these actual resources and fixed frames. Compare against a game capture before claiming visual parity.
