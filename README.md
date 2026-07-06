# BPMN Editor · ngDiagram

A BPMN process editor built with **Angular 19** and **[ng-diagram](https://www.ngdiagram.dev)**.
Swimlanes are modelled as ng-diagram groups, and an **elkjs** layered ("digraph")
layout arranges each lane's contents on demand. Styled with the Synergy Codes
brand (purple + lime) via design tokens, with a light/dark toggle.

## Features

- **BPMN elements** — start / end / intermediate events, task / user task /
  service task activities, and exclusive / parallel gateways. One shared node
  template renders them all.
- **Connections** — sequence flow (solid, filled arrow), message flow (dashed,
  hollow circle → open arrow) and association (dotted). Only sequence flows are
  fed to layout; message flows, associations and anything flagged
  `layoutExclude` are ignored (`isLayoutEdge` in `bpmn.model.ts`).
- **Swimlanes** — ng-diagram groups. Full-width pools with a rotated header,
  drop-zone highlighting, and up/down buttons to reorder them in the stack.
  Elements dropped over a lane are auto-parented into it.
- **Layout button** (never automatic) —
  - each lane's children get an **elkjs layered** layout (`elk.algorithm:
    'layered'`, `direction: RIGHT`), scoped to that lane only — cross-lane and
    non-sequence edges never influence a lane's layout;
  - lanes are then stacked top→bottom by a **dedicated swimlane algorithm**,
    aligned to a **uniform width**, and **resized to fit** their content.
- **Manual resizing** — lanes resize on both axes; a width change syncs every
  lane to keep them equal (`nodeResizeEnded` → `syncLaneWidths`).
- **Palette** — drag & drop for every element and for swimlanes.
- **Theming** — two-tier design tokens (`src/tokens.css`); `data-theme` on
  `<html>` drives both the app chrome and ng-diagram's own `--ngd-*` tokens.

## Architecture

- `src/app/bpmn/model/` — type strings, data contracts, palette data, geometry
  constants, and layout-validity helpers.
- `src/app/bpmn/diagram/` — the `<ng-diagram>` host, config, seed model, node &
  edge templates, and the layout services:
  - `layout/elk-layout.service.ts` — the elkjs wrapper (per-lane layered layout).
  - `swimlane.service.ts` — ordering, vertical arrangement, equal-width
    alignment, resize-to-fit, and reorder.
- `src/app/bpmn/palette/`, `toolbar/`, `pages/` — the palette, toolbar (Layout /
  Fit / theme) and the routed editor shell that owns `provideNgDiagram()`.

`provideNgDiagram()` lives on `EditorPageComponent` (not the app root) because
the ng-diagram services inject the host `ElementRef`.

## Development

```
npm start      # ng serve → http://localhost:4200/
npm run build  # production build
npm test       # Karma + Jasmine
```
