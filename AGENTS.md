# Repository Guidelines

## Project Structure & Module Organization
- `app/` contains Expo Router screens and layouts (tabs live in `app/(tabs)/`).
- `src/` holds app logic: state in `src/store/`, utilities in `src/utils/`, data/services in `src/services/`, and shared types in `src/types/`.
- `__tests__/` contains Jest tests and mocks (`__tests__/__mocks__/`).
- `assets/` contains app icons and splash assets.
- Config lives in `app.json`, `eas.json`, `tsconfig.json`, and `jest.config.js`.

## Build, Test, and Development Commands
- `npm run start` starts the Expo dev server.
- `npm run ios` / `npm run android` / `npm run web` runs the app on a specific platform.
- `npm test` runs Jest tests once.
- `npm run test:coverage` runs Jest with coverage reporting.
- `npm run build:ios` / `npm run build:preview` builds iOS via EAS (production/preview profiles).
- `npm run submit:ios` submits the latest iOS build to the store.

## Coding Style & Naming Conventions
- TypeScript with `strict` enabled (see `tsconfig.json`); keep types explicit when inference is unclear.
- Indentation is 2 spaces; match existing file style for imports and line breaks.
- File naming: camelCase for modules in `src/` (e.g., `budgetStore.ts`), kebab-case for routes where used by Expo Router.
- Use descriptive component and hook names; keep store actions as verb phrases (`setLoading`, `addTransaction`).

## Testing Guidelines
- Jest with `ts-jest` (see `jest.config.js`); tests live in `__tests__/` and are named `*.test.ts`.
- Add mocks under `__tests__/__mocks__/` when stubbing native or third-party modules.
- Prefer unit tests for parsing and reporting logic in `src/services/` and `src/utils/`.

## Commit & Pull Request Guidelines
- Commits use short, imperative summaries (e.g., “Fix sheet type detection”, “Add unit tests”).
- PRs should include: a concise description, test results (`npm test` or `npm run test:coverage`), and screenshots for UI changes.
- Link related issues or tickets when applicable.

## Configuration & Security Notes
- Avoid committing secrets; use Expo/OS keychain via `expo-secure-store` for sensitive values.
- Update `app.json` and `eas.json` when changing app identity, build profiles, or release settings.
