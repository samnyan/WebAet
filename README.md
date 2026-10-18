# WebAet

Browser-local Project DIVA AET editor. Vue 3 + TypeScript + Naive UI + Router + vue-i18n 11.

```sh
pnpm install
pnpm dev
pnpm build
```

Architecture: `src/core` contains framework-independent codecs, animation and rendering; `src/components/editor` contains editor interaction; `src/views` composes the workspace. Original game resources are never checked into this repository.
