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

## Code formatting

Prettier formats Vue single-file components, TypeScript, styles and documentation. It uses two-space indentation, single quotes, no semicolons and a 100-column print width. Vue `<script>` and `<style>` contents are not additionally indented; HTML whitespace sensitivity keeps Prettier's default `css` behavior.

- `pnpm format`: format the project manually when needed.
- `pnpm format:check`: check formatting without changing files.
- `pnpm install`: installs the Husky Git hook through the `prepare` script.
- `git commit`: automatically runs Prettier on supported staged files through lint-staged and stages the formatting changes. Unstaged changes in partially staged files are temporarily hidden and restored afterward; a formatter failure blocks the commit.

Only staged files are formatted on commit; existing files are not reformatted until they are staged or `pnpm format` is run. Formatting does not replace type checking or structural code review.
