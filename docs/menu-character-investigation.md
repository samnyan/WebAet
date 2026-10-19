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

AE UX files were concurrently under reconstruction and were left untouched.

A subsequent mounted-editor smoke check imported the original AET/FARC/database using the actual file input. In composition index 93 at frame 30, the character-01 layer position-X changed from 715 to 735 through the mounted editor's action entry point. Undo restored 715 and redo restored 735. Clicking the actual Export AET toolbar button produced a browser download; reopening those downloaded bytes through the mounted editor preserved 735, reset dirty state, retained the loaded sprite set and reported no editor error. This covers mounted-state/action history and the actual binary-download route, not pointer-level property-panel interaction. The UX files were still uncommitted during this check, so final post-integration UX acceptance remains pending.

## Independent edited-binary readback

A browser-generated edited copy of the original menu AET was loaded independently with MikuMikuLibrary (net8.0, native Linux). The character-01 layer reached from ROOT composition index 93 is stored in composition index 54, layer index 0 (`nswgam_menu_chara_mainmenu_01.pic`). Its position-X key changed from 715 to 735. MikuMikuLibrary confirmed the expected frame/value/tangent, one key, and unchanged scene/composition counts (1 / 94). The native C# checker and edited binary were temporary and removed after execution. This verifies independent readability of this edit, not game execution or universal writer compatibility.

## Source-less placeholder occlusion fix

A mounted frame-30 inspection revealed large opaque red/yellow/cyan/magenta rectangles overlapping the character and menu. These were source-less `p_menu_list*` video layers, not missing textured sprites. ReDIVA `src/CRE/auth_2d.cpp:1372–1432` routes zero-source videos through `DispSprite`, which looks up `layer->name` in the runtime sprite map and returns if absent; it does not render the stored RGB as an opaque solid.

The evaluator now omits zero-source videos with a deduplicated runtime-binding diagnostic. This changes preview evaluation only, not serialized data. All six selected characters remain present at frames 30/60; draw counts are now 74/54 instead of 92/56, with no zero-source draw items and no document dirty state. Mounted screenshot review confirms the character remains visible; green/purple background bands and overlapping menu choices remain, so removal of placeholders does not establish full controller emulation or game parity. Earlier counts/hashes and performance measurements above describe the pre-fix baseline, not current output. TypeScript checking passed.

## Selector lifecycle follow-up (MegaMix v103)

Directly inspected the selector helpers, not just their caller names:

- `Layout_AddSelectorNodeEx` calls `aet_SetPlay(handle, 0)` then the visibility wrapper with false. All six character selector instances created by `MainMenu_InitSubLayout` are initially paused and hidden; simply traversing ROOT at a shared frame does not reproduce that lifecycle.
- `0x14065F8D0` forwards to `aet_SetVisible(*(uint32_t*)(selector + 352), visible)`; renamed and read back as `LayoutSelector_SetAetVisible`.
- `0x140660430` forwards to `aet_GetEnded` on that same handle; renamed and read back as `LayoutSelector_GetAetEnded`.
- `MainMenu_ProcessSubLayoutSelect` waits on the pending selector's ended status before clearing pending index +12704, building `MAINMENU_SWITCH`, and calling the recreation path for the selected index +12692.
- The recreation path `0x140660330` calls `0x14065FA30`, which constructs a new display node via `Layout_CreateDisplayNode` and adds it to the layout. Its mode argument must not be relabeled as a frame/time without tracing `Layout_CreateDisplayNode`.

This establishes per-object play/visibility/completion control and node recreation. It does not establish menu text selection, marker endpoints or the exact clocks of all label/transition objects. No further automatic hiding rules were added. The two newly identified wrappers were renamed, verified by lookup and saved in the IDB.

## Display-node marker modes and original character endpoints

Inspected `app::Layout::CreateDisplayNode` at `0x14028D560`. Its final parameter is a marker-mode selector, not a frame number:

- mode 1: start `st_in`, end `ed_in`.
- mode 2 (the observed selection recreation path): start `st_in`, loop-start field `st_lp`, end `ed_lp`, flags OR `0x410000`.
- mode 3: start `st_lp`, end `ed_lp`, flags OR `0x10000`.
- mode 4: start `st_out`, end `ed_out`.
- modes 5/6: start `st_sp`, end `ed_sp`; mode 6 additionally ORs `0x800000`.
- mode 7: start `ed_in`, end `st_in`, flags OR 2. Reverse interpretation requires tracing the consuming flags, not merely the names.

Original asset readback in Chromium found all six character branches in scene 0 / ROOT composition index 93 share the following marker frames: `st_in=0`, `ed_in=10`, `st_lp=11`, `ed_lp=1488`, `st_out=1489`, `ed_out=1499`. Each parent layer spans [0,1500), with time offset 0 and scale 1. These are stored marker coordinates; the builder evidence supports entrance-to-loop selection, but exact endpoint wrapping still requires following the AET object's flag/marker consumption. No guessed modulo, shared-clock reset or label-state filtering was implemented.

## Playback parameter application and loop-start override

Further call-chain inspection narrows the earlier "node recreation" wording: `app::Layout::AddChild` moves builder fields into the layout descriptor; `0x140660090` calls `Layout_RegisterSprite` with the existing handle at +352. `0x1402921E0` looks up a nonzero handle, initializes a temporary AET object and copies its state into the existing object. This path reapplies playback parameters; it is not evidence of unconditional handle destruction/new-object allocation.

`0x1402912F0` resolves all three supplied marker strings. After virtual initialization with the start/end markers, a supplied third marker overwrites the object's loop-return field at +32 (not the playback start boundary). Mode 2 initializes from `st_in` through `ed_lp`, then stores `st_lp` for loop return. See the direct MegaMix step evidence below; the previous interpretation of +32 as a start-time field was incorrect.

Separately, ReDIVA `AetObj::Init`/`StepFrame` (`auth_2d.cpp:1012–1183`) initializes the frame from the selected boundary, treats marker end time as inclusive, and on forward loop overflow assigns the start time directly, discarding overshoot rather than taking modulo. Its reverse loop similarly assigns the end boundary. This is reference-source evidence, not confirmation that every MegaMix flag has identical behavior. No controller simulation was added on this evidence alone.

## Direct MegaMix initialization and stepping

Resolved AetObj's vtable from constructor `0x14028E230` (`0x140C8CDE0`), then inspected and renamed:

- `0x14028E4F0` -> `AetObj_InitPlaybackFromArgs`: start boundary +52, inclusive end +56, flags +40, frame +140. It initializes boundaries from scene/layer, overrides them from supplied markers, swaps reversed bounds, and initializes frame to the appropriate endpoint.
- `0x14028EC50` -> `AetObj_StepPlaybackFrame`: pause flag 4 returns without stepping; reverse flag 2 negates progress; loop flag `0x10000`; hold/end flag `0x20000`. Forward overflow uses strict `frame > end`, assigns the start boundary, and with `0x400000` plus a positive +32 loop-return value instead assigns that value. Overshoot is discarded. Reverse overflow assigns end; the special loop-return handling updates the start boundary in that branch rather than behaving as a symmetric modulo.

Consequently the observed mode-2 character playback initializes at 0, can display frame 1488, and on the first forward step exceeding 1488 returns to 11, not 0. The raw scene evaluator remains a stateless arbitrary-frame evaluator; editor-wide transport must not silently inherit this controller policy. Actual timing also depends on frame-rate control/speed and a PV-data multiplier in the step function. This is static executable evidence, not a live game trace. Both function renames were read back and the IDB saved. Menu-label object selection remains unresolved.

## Secondary-menu and version branches

`MainMenu_Init` (`0x1406BE350`) constructs secondary-menu names from `nsw_menu_selector` plus `_arcade_mode` / `_mix_mode`, and initializes the separate secondary-menu controller at +15776. Independently it selects one of `result_c_right_first`, `result_c_right_verb`, `result_c_right` using a runtime configuration byte, then creates a selector for that one name at +18000. Raw ROOT traversal displays all alternatives and cannot infer the configuration byte from the AET.

`MainMenu_InitSecondaryMenu` (`0x1406BD450`) iterates both choices and two suffix variants, creating four separate selector instances with mode 2 for one variant and mode 1 for the other. Every instance is passed through `Layout_AddSelectorNodeEx`, the verified pause-and-hide helper. The suffix strings are runtime globals at `0x140DED090` and the following string slot; their values were not resolved in this pass, so no suffix names are asserted. The `MainMenu_CleanupSelectorModel` label points to a thunk into `0x1619DED70`; the name alone is not proof it merely cleans up or hides the secondary menu.

This demonstrates why the visible arcade/mix alternatives and version overlays cannot be resolved by choosing a character alone. A preview extension needs an explicit version and secondary-menu state, with activation/transition evidence; it must not silently select a version or strip all non-character alternatives. No UI or evaluator rule was added in this investigation.

## Secondary-menu transition completion

`0x1406BDF00`, renamed and read back as `MainMenuSecondary_CompletePendingSwitch`, checks pending index +2212 against -1, waits for that selector's AET ended status, clears the pending index, builds `MAINMENU_SWITCH`, then applies mode 2 to the current index +2208 selector at base +120 with stride 504. This independently confirms the secondary menu is not simply a set of alternatives sharing ROOT's clock.

The thunk previously named `MainMenu_CleanupSelectorModel` leads to `0x1619DED70`: decoded constants select bases +120 and +1192, and the body applies mode 4 (out markers) to one selected and one alternate instance while resetting state bytes. This is not evidence of immediate hiding/deletion. `0x161A04B90`, reached by the switch-request thunk, contains an unresolved jump at `0x161A04BA8`; its incomplete pseudocode is insufficient to assert all activation behavior. No speculative preview rule was added.

The function rename was verified in the live database. The subsequent IDB save timed out while the worker reported it was still saving, so persistence of this last rename is not confirmed.

## Recovered secondary switch-request instructions

Defined code at the previously unanalysed fallthrough `0x161A04BA8` and inspected its actual instructions (no executable byte patch). The block loops two choices at base +120 / stride 504. For the requested choice it applies mode 3, pauses/hides the paired selector at +1072, and records the old current index at +2212. For the other choice it pauses/hides the main selector and calls `0x1406BDDE0`; after the loop it stores the requested index at +2208. This supersedes the earlier statement that this entire path remained unavailable in pseudocode.

`0x1406BDDE0` positions the alternate selector (base +1192 / stride 504) at `ed_in`, then calls `0x14065F940`, which explicitly sets play=false and visible=true. The nonselected choice is therefore a paused visible alternate, not simply hidden and not a running exit animation. Renamed these helpers to `MainMenuSecondary_ShowInactiveAtEntranceEnd` and `LayoutSelector_PauseAndShow`, and read both names back. IDB save again timed out while saving, so their persistence is not confirmed. Mapping the two runtime suffix globals to exact asset branches remains necessary before implementing a selector simulation.

## Remaining acceptance gap

Do not mark the character issue fixed based on branch isolation. No newly demonstrated transform or texture-binding defect has been identified in this baseline.

Follow-up regression evidence for the source-less fix: compared with the previous production evaluator for all six choices at frames 0/15/30/60/90/149 (36 cases). After removing only zero-source draw items from the baseline, complete ordered textured items, paths, matrices, opacity, blend and recursive matte pairing were unchanged. No-op export of the evaluated document remained byte-identical. Across these cases 492 placeholder occurrences were removed. Temporary baseline code was deleted.

Next: trace the remaining menu-label/transition branches and independent clocks in the controller before expanding preview selection. The existing character selector is implemented, but it is not a full controller model. Do not hide additional UI by guessed names or label this game-like menu playback until runtime evidence establishes which objects are enabled and at what local time. Obtain a game reference capture for visual parity; after the separate AE UX agent commits, perform final pointer-level property editing and directory-load acceptance. Current binary readback and mounted action/download evidence remain valid within their documented scope.
