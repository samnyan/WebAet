# WebAet Implementation Plan

**Goal:** Browser-local Project DIVA AET layout and animation editing using real MegaMix assets.

**Architecture:** Independent TypeScript binary codec, animation evaluator, sprite/resource adapters and renderer. Vue editor components own interaction only. Preserve source bytes and unsupported records during binary export. Commercial fixtures remain outside repository; never overwrite originals during testing.

**Tech Stack:** Vue 3, TypeScript, Vite, pnpm, Naive UI, Vue Router 4, vue-i18n 11.

## 1. Foundation
- Configure `src/router`, `src/i18n`, app providers and editor route.
- Reference MercuryManager UMG hierarchy / inspector / canvas and separate collapsible bottom timeline.
- Verify `pnpm build`, commit foundation.

## 2. Binary codec
- Inspect MikuMikuLibrary Aets and ReDIVA classic AET, sprite and FARC implementations.
- Implement typed document and bounds-checked parser in `src/core/aet`; preserve original offsets and unknown bytes.
- Export edits through original-record patches and appended variable-size records; reject unsupported variants.
- Verify byte-identical no-op roundtrip and changed curves reparse against actual game files, commit.

## 3. Resources and layout
- Implement local file/folder inputs (File System Access where available, directory input fallback), companion sprite/texture loading.
- Separate `src/core/resources` from reusable `src/core/render` and Vue stage wrapper.
- Add scene/composition navigation, layer hierarchy, inspector, visibility and selection; precise unsupported diagnostics.
- Verify actual assets in browser, commit.

## 4. Animation editing
- Implement Hermite sampling, parent/nested transforms and playback time mapping according to reference code.
- Independent bottom timeline: scrubbing, tracks, keyframe selection and frame/value/tangent editing, add/delete.
- Undo/redo, project draft and binary download; original assets remain untouched.
- Verify edited export reopens and animation changes, commit.

## 5. Delivery
- Browser-driven true asset workflow, build/typecheck, inspect staged files and commit.
- Document supported formats, missing rendering semantics and run commands. No claim of full game fidelity without corresponding evidence.
