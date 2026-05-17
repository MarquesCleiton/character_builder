# Character Builder

## Overview

Character Builder is a local-first Angular app for composing 2D characters from PNG layers, randomizing combinations, and exporting a final PNG at 1536x2752 with transparency.

## Stack

- Angular 16 + TypeScript
- Bootstrap 5
- PWA service worker for offline use

## Local Development

```bash
npm run start
```

Open `http://localhost:4200/` in your browser.

## Build

```bash
npm run build
```

The output is written to `dist/character-builder`.

## App Structure

- `src/app/presentation` for pages and UI components
- `src/app/domain` for core models
- `src/app/infrastructure` for local state and export services
- `src/app/shared` for constants

## Export Rules

- Output format: PNG
- Size: 1536x2752
- Layer order: pernas -> base -> boca -> olhos
