# Editor preview: manual acceptance

Native directory authorization and the main visual review are assigned to the user. They are pending, not automated passes. Do not add a directory-input fallback solely to satisfy the test harness.

## 1. Native directory workflow

Use Chromium at `http://localhost:5173` or HTTPS.

- Click **选择资源目录**, select `diva_main`, grant read access. Cancel once first: the existing document should remain available without a spurious error.
- Let indexing complete. In Project, locate and open `aet_nswgam_menu.bin`; confirm matching Sprite companions load without individually importing them.
- Re-select the same directory to check cached indexing; use **重新扫描** when checking changed files.
- Make an edit, attempt another AET: cancel the unsaved-changes confirmation and confirm the edit remains. Accept on a second attempt and confirm the new document opens.
- Export an edited AET, open it in a fresh page with companions, and inspect the changed value. Never overwrite the supplied game files for this check.

Playwright CLI on localhost can import files but native `showDirectoryPicker` was rejected by its file-chooser interception. This is a harness limitation, not proof that manual selection works or fails.

## 2. Fixed menu visual review

Import the menu AET, `spr_nswgam_menu.farc` and `spr_db.bin`, or load through the directory workflow above. Select scene 0 / ROOT composition index 93 (offset 3528).

- At frames 30 and 60, use **菜单角色（仅预览）** to select rhythmgame and custom. Exactly the chosen character should remain; unrelated UI should not disappear. Return to raw/all to inspect the original overlapping branches.
- At those same frames, compare **子菜单（部分模拟）** Arcade on + Mix off versus the reverse. The inactive off object stays at local frame 6; the active object uses timeline frame clamped to 10–90.
- Check switching to 3D/Isolate suspends that partial simulation; switching compositions resets it. Canvas drag editing is disabled while the partial preview is active; Inspector edits remain real document edits.
- Compare against a game capture only with matching character, version, menu state and animation time. Record those conditions and attach both images when reporting differences.

The partial preview draws its objects above other UI provisionally. It does not resolve game draw order, runtime text, version alternatives or transitions. Native scene/branch PNG exports remain raw composition renders; viewport PNG captures the current partial preview. Do not interpret their expected difference as an export writer defect.

## 3. Editing UX smoke check

- Expand a layer/Transform in the bottom timeline; change one value and inspect the right panel. Undo/redo should synchronize both.
- Drag a key once, undo/redo, then cancel another drag. Try horizontal/vertical scrolling and pointer-centered zoom at a nonzero scroll position.
- Browse the real resource package and thumbnails; reopening the material picker on another layer must target that layer. Browsing alone must not change references or dirty the document.

Automated real-resource edit/download/fresh-page reload, scoped pointer/history checks, resource browsing and partial Stage pixel checks already have evidence in `menu-character-investigation.md`. Repeat only to evaluate actual usability or a reported failure, not as a mandatory exhaustive regression.

## Report format

Record browser/version, input paths, scene/composition/layer, frame, character/submenu mode, expected versus actual, and a screenshot or exported viewport PNG. Mark each section pass/fail/not tested; a successful build does not close these checks.

## Distribution gate

Installed direct runtime dependencies were inspected: `@bis-toolkit/bcn` 1.0.2 declares GPL-3.0-or-later; the other six direct runtime dependencies declare MIT. This is not a full transitive-license audit. Before distributing the compiled application, decide a compatible project license/source-distribution policy and include required license/copyright notices and corresponding-source access as applicable. The repository currently has no tracked root license. Do not silently select a project license on the owner's behalf. This does not block local editing or manual acceptance.
