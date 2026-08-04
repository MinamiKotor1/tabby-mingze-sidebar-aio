# Repository Guidelines

## Project Structure & Module Organization

This repository builds a Tabby plugin that combines SSH, Telnet, and RDP connections in one sidebar. `src/index.ts` registers the Angular module and Tabby providers. UI code lives in `src/components/`; runtime behavior in `src/services/`; extension points and defaults in `src/providers/`; shared interfaces in `src/models/`; and pure helpers in `src/utils/`. Regression tests are under `tests/`. Webpack writes the publishable bundle to generated `dist/`.

## Build, Test, and Development Commands

- `npm ci`: install the exact Angular 15 and Tabby 1.0.197 dependency set from the lock file.
- `npm run build`: compile TypeScript and SCSS, then create the production CommonJS bundle at `dist/index.js`.
- `npm test`: run all `node:test` suites through `tsx`.
- `npm run watch`: rebuild continuously while editing the plugin.
- `npm pack --dry-run --ignore-scripts`: inspect the publish set; only `dist/` and package metadata should appear.

There is no standalone development server; exercise the built plugin in a compatible Tabby installation.

## Coding Style & Naming Conventions

Use four-space indentation, single quotes, no semicolons, and trailing commas in multiline declarations. Use `PascalCase` for classes and interfaces, `camelCase` for methods and variables, and `UPPER_SNAKE_CASE` for exported constants. Follow existing filenames such as `rdp.service.ts` and `settingsTab.component.ts`. Prefer explicit types at service boundaries. In SCSS, reuse Tabby variables such as `--theme-bg` and `--theme-primary`.

## Testing Guidelines

Use `tests/*.test.ts` and Node's built-in assertions. Add focused coverage for parsers, migrations, and profile round trips. There is no numeric coverage threshold. Before submitting, run `npm test`, `npx tsc --noEmit`, and `npm run build`; manually verify affected sidebar and connection flows in Tabby.

## Commit & Pull Request Guidelines

History uses terse messages such as `update` and `update 2026.2.10`. Reserve dated messages for releases; otherwise use a concise imperative summary such as `Fix sidebar resize handling`. Pull requests should explain visible behavior and compatibility effects, list verification performed, link issues, and include screenshots for UI changes.

## Security & Compatibility

Never commit credentials or local Tabby profiles. Store passwords through Tabby Vault or the host credential store, and remove plaintext only after a secure write succeeds. Existing SSH profiles are backward-compatible data: preserve unknown top-level and `options` fields, and make migrations additive whenever possible.
