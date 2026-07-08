# ngDiagram API Review — Fix Work Order

**Scope:** apply the confirmed findings from the 2026-07-06 ngDiagram API review of this showcase, plus one product decision added the same day (F10: lanes resize **manually only** — no auto-resize on child drag).
**Provenance:** multi-agent review (6 docs-grounded reviewers, every finding adversarially verified by 3 independent checkers against the ng-diagram **v1.2.4** docs and the shipped bundle in `node_modules`). Doc references below name the exact guide/symbol that was verified — they are not from memory.

---

## Instructions for the implementing agent

You are expected to be a Claude Code session (Opus). Follow these rules:

1. **Do not trust memory for ng-diagram APIs.** Before deviating from any code sample below, verify the API with the ng-diagram MCP tools (`search_docs`, `get_doc`, `search_symbols`, `get_symbol`) or the workspace `ng-diagram-*` skills. Every sample below was already verified against v1.2.4; if a tool contradicts this document, the tool wins — note the discrepancy in your summary.
2. **Minimal diffs.** Match existing style (existing casts like `as Pick<Node, 'id'> & Partial<Node>`, comment density, naming). No reformatting, no drive-by refactors.
3. **Comments must stay truthful.** Several fixes invalidate existing comments — each fix says what the new comment must state. Never leave a comment that claims a timing reason the code no longer has.
4. **Apply fixes in the order listed.** F3's two edits must land together (see warning there). F10 is a product-decision behavior change that supersedes F4 and shapes the final code in F2 — those sections already show the post-F10 target state; do not "restore" refit calls F10 removes.
5. **Verify after each fix:** `npx ng build` must pass. After all fixes, run the manual scenarios at the end with `npm start`.
6. **Do not touch** the two `setTimeout` calls that remain after all fixes — both inside `onPaletteItemDropped` (lane branch: C1; element branch: F2) — except to set the comments shown in those sections.

Key API fact used throughout (verified via `get_symbol NgDiagramService`): `transaction()` has 4 overloads — a **sync callback *without* options returns `void` and cannot be awaited**; a sync callback **with an options object** (even `{}`) returns `Promise<TransactionResult>` that resolves after the state is committed (`guides/transactions.mdx`: "The transaction promise resolves after all operations inside the callback are complete and the state has been updated"). Always pass the options object when you need to await.

---

## F1 — `runLayout()`: `zoomToFit()` fits stale bounds *(bug — highest priority)*

**File:** `src/app/bpmn/diagram/swimlane.service.ts` (lines ~118–119)

**Why:** `model.updateNodes(nodeUpdates)` is followed synchronously by `viewport.zoomToFit(...)`. Mutations apply asynchronously through the middleware pipeline, so the fit is computed from **pre-layout** bounds — the Layout button can leave content cropped or mis-fitted. The documented mechanism for viewport operations after model writes is an awaited transaction with `waitForMeasurements: true` (`guides/transactions.mdx#waitformeasurements`, `guides/state-management.mdx`, `NgDiagramViewportService.zoomToFit` remarks; the docs' own layout-integration example uses exactly this pattern).

**Change 1 —** add the service injection next to the existing ones (top of `SwimlaneService`):

```ts
import {
  NgDiagramModelService,
  NgDiagramNodeService,
  NgDiagramService,
  NgDiagramViewportService,
  type Node,
  type Size,
} from 'ng-diagram';
// ...
private readonly ngDiagram = inject(NgDiagramService);
```

**Change 2 —** replace the end of `runLayout()`:

```ts
// BEFORE
this.model.updateNodes(nodeUpdates);
this.viewport.zoomToFit({ padding: 60 });

// AFTER
// Commit the layout atomically and wait for re-measurement so zoomToFit
// sees the new bounds, not the pre-layout ones.
await this.ngDiagram.transaction(() => {
  this.model.updateNodes(nodeUpdates);
}, { waitForMeasurements: true });
this.viewport.zoomToFit({ padding: 60 });
```

`runLayout()` is already `async` and awaited by `ToolbarComponent.runLayout()`, so the `laying` spinner now correctly covers the whole operation.

**Accept:** build passes; manual scenario M1 below.

---

## F2 — Palette drop (element branch): parent into the lane, no auto-refit *(incorrect-api, reshaped by F10)*

**File:** `src/app/bpmn/diagram/diagram.component.ts` (lines ~56–64)

**Why:** the review found a documented-contract violation here: `refitLanes()` ran synchronously after `groups.addToGroup(...)`, but per the read-after-write contract `getChildren()` cannot see the just-added child in the same frame, so the first refit was always a stale pass (it self-healed only via an undocumented v1.2.4 event emission). F10 removes lane auto-resize entirely, which moots the stale read — the handler now only parents the node. No transaction is needed because nothing reads the model after the write.

The **outer** `setTimeout` stays: the docs are silent on whether the dropped node is committed when `paletteItemDropped` fires, `addToGroup` targets the new node's id, and there is no documented post-drop hook (see "Deliberately kept").

Replace the element branch of `onPaletteItemDropped`:

```ts
// BEFORE
// Parent the element into whichever lane its drop point landed in. Done via
// a deterministic geometric hit-test (not overlap of yet-unmeasured bounds),
// deferred a tick so the new node is in the model.
setTimeout(() => {
  const lane = this.swimlanes.laneAtPoint(event.dropPosition);
  if (lane) this.groups.addToGroup(lane.id, [node.id]);
  // Grow the target lane to contain the new node and re-stack below it.
  this.swimlanes.refitLanes();
}, 0);

// AFTER
// Parent the element into whichever lane its drop point landed in, via a
// deterministic geometric hit-test. Deferred one tick because the docs make
// no commit-timing guarantee for paletteItemDropped, and addToGroup targets
// the new node's id. Lanes do not auto-resize (manual resize only — F10).
setTimeout(() => {
  const lane = this.swimlanes.laneAtPoint(event.dropPosition);
  if (lane) this.groups.addToGroup(lane.id, [node.id]);
}, 0);
```

`DiagramComponent` does **not** need an `NgDiagramService` injection — with the refit gone there is no read-back to sequence. (If a future change reintroduces a model read after `addToGroup`, wrap the write in `await this.ngDiagram.transaction(() => ..., {})` first — the `{}` options argument is required to get the awaitable overload.)

**Accept:** build passes; manual scenario M2 (node is parented; the lane's size does not change).

---

## F3 — `nodeResizeEnded`: drop the `setTimeout` *and* the model read-back *(improvement)*

**Files:** `src/app/bpmn/diagram/diagram.component.ts` (lines ~80–87) **and** `src/app/bpmn/diagram/swimlane.service.ts` (`onLaneResized`, lines ~246–252)

**Why:** the docs guarantee *"The node will have its final size when this event is received"* (`guides/nodes/resizing.mdx#events`, `NodeResizeEndedEvent`), and the payload already carries it — both the deferral and the `getNodeById` read-back work around a guarantee the API explicitly makes.

> **⚠️ These two edits must land in the same commit.** Removing only the `setTimeout` while keeping the `getNodeById` read-back would rest the width read on inference instead of the documented payload guarantee.

**Change 1 —** `diagram.component.ts`:

```ts
// BEFORE
onNodeResizeEnded(event: NodeResizeEndedEvent): void {
  if (isSwimlane(event.node)) {
    // Defer one tick so the committed final size is in the model, then
    // equalise widths and re-stack the lanes below.
    const id = event.node.id;
    setTimeout(() => this.swimlanes.onLaneResized(id), 0);
  }
}

// AFTER
onNodeResizeEnded(event: NodeResizeEndedEvent): void {
  if (isSwimlane(event.node)) {
    // Docs guarantee event.node carries the final size when this fires —
    // no deferral or model read-back needed.
    this.swimlanes.onLaneResized(event.node);
  }
}
```

**Change 2 —** `swimlane.service.ts`, `onLaneResized` now takes the node from the event payload:

```ts
// BEFORE
onLaneResized(laneId: string): void {
  const lane = this.model.getNodeById(laneId);
  if (!isSwimlane(lane)) return;
  const width = lane.size?.width;
  if (width) this.syncLaneWidths(width, laneId);
  this.arrangeLanes();
}

// AFTER
/** `lane` comes from the NodeResizeEndedEvent payload, which the docs
 *  guarantee carries the final size — no model read-back needed. */
onLaneResized(lane: Node): void {
  if (!isSwimlane(lane)) return;
  const width = lane.size?.width;
  if (width) this.syncLaneWidths(width, lane.id);
  this.arrangeLanes();
}
```

The `arrangeLanes()` model reads that follow are safe: the review confirmed the final size is committed by event time, and `syncLaneWidths` writes only widths while `arrangeLanes` consumes only positions and heights (disjoint fields).

**Accept:** build passes; manual scenario M3.

---

## F4 — `nodeDragEnded`: superseded by F10 — delete the handler instead

The original finding still stands for the record (the `setTimeout` was unnecessary: the documented contract is *"Nodes will have their final positions when this event is received"*, `nodeDragEnded` in `DiagramEventMap`). But F10 removes drag-driven lane auto-resize entirely, so do **not** merely un-defer the refit call — delete the whole `onNodeDragEnded` handler as specified in F10. No edits in this section.

---

## F5 — `arrangeLanes()`: fold `order` into the single `updateNodes` batch *(improvement)*

**File:** `src/app/bpmn/diagram/swimlane.service.ts` (`arrangeLanes` lines ~144–173, `setOrder` lines ~43–50)

**Why:** the loop fires one `updateNodeData` per lane via `setOrder()` plus a separate `updateNodes` for positions — up to N+1 non-atomic pipeline dispatches. `runLayout` (line ~100) already folds `data: { ...lane.data, order: index }` into the one batch (`refitLanes` did too, before its deletion in F10); `arrangeLanes` should match (`guides/state-management.mdx` Performance Considerations).

Replace the loop body so a lane gets an entry when it moved **or** its order changed, and delete the now-unused private `setOrder()` method entirely:

```ts
lanes.forEach((lane, index) => {
  const targetX = LANE_ORIGIN.x;
  const targetY = cursorY;
  const dx = targetX - (lane.position?.x ?? targetX);
  const dy = targetY - (lane.position?.y ?? targetY);
  const moved = dx !== 0 || dy !== 0;
  const orderChanged = (lane.data?.order ?? -1) !== index;

  if (moved || orderChanged) {
    updates.push({
      id: lane.id,
      ...(moved ? { position: { x: targetX, y: targetY } } : {}),
      ...(orderChanged
        ? { data: { ...(lane.data ?? { label: 'Lane' }), order: index } }
        : {}),
    } as Pick<Node, 'id'> & Partial<Node>);
  }
  if (moved) {
    for (const child of this.model.getChildren(lane.id)) {
      const p = child.position ?? { x: 0, y: 0 };
      updates.push({ id: child.id, position: { x: p.x + dx, y: p.y + dy } });
    }
  }

  cursorY += lane.size?.height ?? LANE_MIN_CONTENT.height;
});
```

Also update the `arrangeLanes` doc comment: `order` is now written in the same batch, not via a separate call. Keep the `updateNodeData` semantics note (it moves to wherever data is still spread — the docs confirm `updateNodeData` **replaces** the data object wholesale, so the spread stays mandatory).

**Accept:** build passes; manual scenarios M4/M5 (lane reorder buttons still work, order persists).

---

## F6 — Interactive elements: use `data-no-drag` / `data-no-pan` instead of `stopPropagation` *(improvement)*

**Why:** the documented mechanism for interactive elements inside node templates is the `data-no-drag="true"` / `data-no-pan="true"` attributes (`guides/nodes/custom-nodes.mdx#handling-interactive-elements`), not pointer-event suppression.

**Change 1 —** `src/app/bpmn/diagram/nodes/bpmn-node.component.html` (label editor input, lines ~34–45): drop the `(pointerdown)`/`(mousedown)` stopPropagation bindings, add the data attributes. Keep `(dblclick)` stopPropagation (that one guards double-click semantics, not drag/pan) and all keydown/blur handlers:

```html
<input
  #editor
  class="task__input"
  type="text"
  data-no-drag="true"
  data-no-pan="true"
  [value]="label()"
  (dblclick)="$event.stopPropagation()"
  (keydown.enter)="commit(editor.value)"
  (keydown.escape)="cancel()"
  (blur)="commit(editor.value)"
/>
```

**Change 2 —** `src/app/bpmn/diagram/nodes/swimlane-node.component.html` (line ~4): replace the `(pointerdown)="stop($event)"` handler with the data attributes, and delete the now-unused `stop()` method in `swimlane-node.component.ts` (lines ~49–51). Keep the `stopPropagation()` calls inside `moveUp`/`moveDown` (they prevent click-through selection, which is unrelated to drag/pan):

```html
<div class="lane__controls" data-no-drag="true" data-no-pan="true">
```

**Accept:** build passes; manual scenario M6.

---

## F7 — Toolbar: gate Layout/Fit on diagram readiness *(improvement)*

**File:** `src/app/bpmn/toolbar/toolbar.component.ts` + `.html`

**Why:** operations before the diagram finishes initializing "may fail or be ignored" (`guides/model-initialization.mdx#best-practices`); `NgDiagramService.isInitialized: Signal<boolean>` exists for exactly this.

```ts
// toolbar.component.ts — add:
import { NgDiagramService, NgDiagramViewportService } from 'ng-diagram';
// ...
private readonly diagram = inject(NgDiagramService);
protected readonly ready = this.diagram.isInitialized;
```

```html
<!-- toolbar.component.html — Fit button -->
<button type="button" class="btn btn--ghost" (click)="fit()" [disabled]="!ready()" title="Zoom to fit">
<!-- Layout button -->
<button type="button" class="btn btn--primary" (click)="runLayout()"
  [disabled]="!ready() || laying()" ...>
```

**Accept:** build passes; buttons enable once the diagram renders (M7).

---

## F8 — `validateConnection`: type the parameters per the documented signature *(nitpick)*

**File:** `src/app/bpmn/diagram/diagram-config.ts` (lines ~30–31)

**Why:** the documented `LinkingConfig.validateConnection` signature is `(source: Node | null, sourcePort: Port | null, target: Node | null, targetPort: Port | null) => boolean` — the library invokes it with nulls mid-gesture. The runtime `!!source && !!target` guard is already correct; the annotations should stop claiming non-nullability.

```ts
import type { Edge, NgDiagramConfig, Node, Port, Size } from 'ng-diagram';
// ...
validateConnection: (source: Node | null, _sourcePort: Port | null, target: Node | null) =>
  !!source && !!target && !isSwimlane(source) && !isSwimlane(target),
```

**Accept:** build passes (this is type-only; no behavior change).

---

## F9 (optional) — Render edge labels or delete the dead field

**Files:** `src/app/bpmn/diagram/edges/bpmn-edge.component.ts`, `src/app/bpmn/model/bpmn.model.ts`

**Why:** `BpmnEdgeData.label?: string` is declared but never rendered — BPMN branch labels ("yes"/"no") are silently dropped. The documented mechanism is `NgDiagramBaseEdgeLabelComponent` projected inside the base edge (`guides/edges/custom-edges.mdx#adding-edge-labels`). Recommended for a showcase (it demonstrates one more API); deleting the field is the acceptable minimal alternative.

```ts
import { NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent, ... } from 'ng-diagram';
// component imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent]
// add: protected readonly label = computed(() => this.edge().data?.label);
```

```html
<ng-diagram-base-edge [edge]="edge()" ...>
  @if (label()) {
    <ng-diagram-base-edge-label [id]="edge().id + '-label'" [positionOnEdge]="0.5">
      <span class="edge-label">{{ label() }}</span>
    </ng-diagram-base-edge-label>
  }
</ng-diagram-base-edge>
```

Style `.edge-label` to taste (small, background `var(--ngd-*)` token so it reads in both themes). **Accept:** an edge with `data.label` set in the seed shows a midpoint label.

---

## F10 — Remove drag-driven lane auto-resize: lanes resize manually only *(product decision, 2026-07-06)*

**Files:** `src/app/bpmn/diagram/diagram.component.ts`, `diagram.component.html`, `swimlane.service.ts`

**Why:** requested behavior change — dragging a child node (within a lane, between lanes, or dropping one from the palette) must never change a lane's size. Lane geometry changes only through the lane's own resize handles (F3 path), the explicit **Layout** button, and lane add/reorder stacking. This is safe without the refit safety net because the config already keeps the manual path consistent: `resize.getMinNodeSize` (→ `laneMinSize`: width floored globally, height floored at children bounds) and `allowResizeBelowChildrenBounds: false` guarantee a lane can never be shrunk below its content.

**Change 1 —** `diagram.component.ts`: delete the `onNodeDragEnded` and `onGroupMembershipChanged` methods entirely, and remove the now-unused `NodeDragEndedEvent` and `GroupMembershipChangedEvent` types from the ng-diagram import.

**Change 2 —** `diagram.component.html`: remove the two event bindings from `<ng-diagram>`:

```html
(nodeDragEnded)="onNodeDragEnded($event)"
(groupMembershipChanged)="onGroupMembershipChanged($event)"
```

**Change 3 —** the palette element-drop branch no longer calls `refitLanes()` — the final form is shown in F2.

**Change 4 —** `swimlane.service.ts`: after changes 1–3, `refitLanes()` (lines ~175–237) has no callers — delete the method. Update the class doc comment, which advertises "resize-to-fit after a child layout", to describe the manual-only behavior.

**Deliberately NOT removed** (these are the manual/explicit paths, not child-drag auto-resize):
- `onLaneAdded` — a newly dropped lane adopting the shared width is creation-time setup;
- `onLaneResized` / `syncLaneWidths` / `arrangeLanes` — the manual-resize handling this change is keeping;
- `runLayout` — the explicit Layout button still sizes lanes to their content. If the team wants Layout to stop resizing lanes too, that is a **separate decision — ask before changing**.

**Expected UX after this change (accepted):** a node dragged or dropped near a lane's bottom/right edge may visually overflow the lane rectangle until the user manually enlarges the lane. Cross-lane drags no longer trigger any re-stacking. The min-size floor still prevents *shrinking* a lane below its content.

**Accept:** build passes; `refitLanes` absent from the codebase; scenarios M2, M4, M8.

---

## Deliberately kept — do not remove these two `setTimeout`s

After all fixes, exactly two `setTimeout` calls remain — both in `onPaletteItemDropped`. The review confirmed (3/3 verifiers each) these deferrals are **legitimate**: the docs are silent on whether the dropped node is committed when the event fires, and there is no documented post-drop hook.

**C1 — `onPaletteItemDropped`, swimlane branch (line ~53).** `PaletteItemDroppedEvent` carries no documented guarantee that the created node is committed/queryable when the event fires, and `onLaneAdded` both reads the lane back and writes to it. Keep the deferral; update the comment:

```ts
// Docs make no commit-timing guarantee for paletteItemDropped and offer no
// post-drop hook, so defer one tick before reading the new lane back from
// the model (onLaneAdded both reads and writes it).
setTimeout(() => this.swimlanes.onLaneAdded(node.id), 0);
```

**C2 — `onPaletteItemDropped`, element branch (line ~59).** Same rationale; final form and comment are specified in F2.

*(The former third kept deferral — `onGroupMembershipChanged` — is deleted entirely by F10, so there is nothing to keep there.)*

---

## Final verification

**Build:** `npx ng build` — zero errors.

**Manual (`npm start`):**

| # | Scenario | Expected |
|---|---|---|
| M1 | Scatter nodes/lanes, click **Layout** | Everything laid out AND the viewport fits the *new* arrangement exactly (nothing cropped); spinner covers the whole operation |
| M2 | Drag a Task from the palette into a lane | Node is parented into that lane (clicking **Layout** later arranges it inside that lane — proves membership); the lane's size does **not** change on drop |
| M3 | Resize a lane by hand (wider and taller) | Other lanes match the new width immediately; lanes below re-stack flush; no overlap. Try shrinking below a child node — the resize stops at the content bounds |
| M4 | Drag a node from one lane into another | Membership changes (Layout arranges it in the new lane); **neither lane resizes** during or after the drag |
| M5 | Reorder a lane with the ▲/▼ buttons | Lanes swap and re-stack; order survives further operations (orders were written in the same batch) |
| M6 | Double-click a Task label, drag inside the input; press the lane ▲/▼ buttons with a drag motion | Text selection works inside the input without moving the node; lane buttons never start a lane drag |
| M7 | Reload the app | Fit/Layout buttons are disabled until the diagram appears, then enable |
| M8 | Drag a child node around inside its lane, including past the lane's bottom edge | The lane's size never changes; an overflowing node is handled by manually enlarging the lane (and the lane cannot be shrunk back below it) |

**Post-fix sanity greps:** `setTimeout` appears exactly twice in `src/`, both inside `onPaletteItemDropped`; `refitLanes`, `setOrder`, `onNodeDragEnded`, and `onGroupMembershipChanged` no longer exist anywhere (including the `(nodeDragEnded)`/`(groupMembershipChanged)` template bindings); no `(pointerdown)="$event.stopPropagation()"`/`stop($event)` remains in node templates.
