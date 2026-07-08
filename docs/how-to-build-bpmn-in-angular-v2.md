# How to build a BPMN editor in Angular

*BPMN (Business Process Model and Notation) 2.0 defines well over 100 graphical elements, yet the average real-world process diagram uses only about 9 distinct constructs. You don't need a BPMN platform to ship a process editor – you need a good canvas, a clear subset, and about 1,500 lines of Angular.*

## In short:

This guide builds a working BPMN editor in Angular on ngDiagram (Apache 2.0): a drag-and-drop palette, swimlanes as groups, typed sequence and message flows, and per-lane ELK auto-layout – about 1,500 lines of application code. If you need BPMN 2.0 XML round-trip instead, use bpmn-js and accept its watermark.

A BPMN editor project usually starts with a sentence in a planning meeting: *"Can we let users draw their own process here? Something like BPMN."* By Thursday a spike shows boxes and arrows on a canvas. The gap between that demo and a shippable editor – swimlanes, layout, your design system, your rules – is what this article walks through. The complete project is [on GitHub](https://github.com/synergycodes/bpmn-editor); this article covers what such an editor consists of and how the ngDiagram API powers each part, while the repo holds every implementation detail.

## Pick the foundation first: BPMN platform or diagramming canvas?

If your requirement is importing and exporting standard BPMN 2.0 XML, use [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) – nothing gets you there faster. If your requirement is a process editor that lives inside your Angular product, looks like your product, and enforces your rules, a general diagramming canvas is the better foundation. This article takes the second path.

The distinction matters because of what each choice costs:

- **bpmn-js** gives you BPMN 2.0 semantics and XML round-trip for free. The [bpmn.io license](https://bpmn.io/license/) requires the bpmn.io watermark to stay visible on every rendered diagram, and the code displaying it may not be removed or changed. bpmn.io offers no public commercial exception – the maintainers state on the forum that they don't engage in individual license agreements to remove the watermark, and as far as I can tell no exception has ever been publicly confirmed. bpmn.io also offers no official paid support tier for embedding the library itself – help means the forum, the docs, and the source.
- **GoJS** is a mature, general-purpose canvas with [commercial per-developer licensing](https://gojs.net/latest/license.html) and an official `gojs-angular` wrapper – though the scene graph, events, and templates remain GoJS's own world, rendered to `<canvas>`.
- **JointJS** is open core; BPMN shapes and framework support live in the [paid JointJS+ tier](https://www.jointjs.com/pricing).
- **[ngDiagram](https://www.ngdiagram.dev)** is an Apache 2.0 Angular-native diagramming canvas with no runtime dependencies beyond the standard tslib helper: nodes are Angular components, state is signals, theming is CSS variables, and the default watermark turns off with a documented config flag. It ships no BPMN semantics – you model your own subset, which for an embedded editor you were going to do anyway.

Here is the reframe that decided the library choice for me: for an embedded, branded editor, the "BPMN library" matters less than the "diagramming foundation." Real diagrams use a small subset of the notation anyway – so you will own the BPMN semantics regardless of the library. Once you accept that, the question becomes: which canvas costs the least to build on, in the framework you already use? This article builds on ngDiagram. Full disclosure: I build diagramming tools at [Synergy Codes](https://www.synergycodes.com), the company behind the library – the code below is the argument, and you can judge it directly.

## Why not just wrap bpmn-js or GoJS in Angular?

Wrapping a framework-agnostic library means you own the bridge between its event system and Angular's change detection – permanently, across every upgrade. bpmn-js has no official Angular wrapper, so that bridge is your code:

```ts
// The wrapper you maintain around bpmn-js – event bus in, Angular out.
const eventBus = this.modeler.get('eventBus');
eventBus.on('selection.changed', (e: any) =>
  this.zone.run(() => this.selection.set(e.newSelection)),
);
// ...plus teardown, payload typing, and re-testing on every upgrade.
```

With an Angular-native library, the boundary is Angular-idiomatic instead of a second event world:

```html
<ng-diagram [model]="model$" (selectionChanged)="onSelection($event)" />
```

The `selectionChanged` payload is a TypeScript type from the library (`DiagramEventMap`), not a shape you reverse-engineered from source. State is exposed as signals, so a properties panel or toolbar is a `computed()` away – no subscriptions, no `zone.run`, no `markForCheck`, and it works under `OnPush`. To be precise: ngDiagram has its own internal middleware pipeline, so there is still a library boundary. The difference is that the boundary speaks Angular – typed outputs, signals, dependency injection – instead of an event bus you translate.

## The 9 building blocks of a BPMN editor

An embedded BPMN editor breaks down into 9 building blocks, and ngDiagram has a dedicated API surface for each:

1. **A bootstrapped canvas** – `provideNgDiagram()`, `initializeModel()`, a sized `<ng-diagram>` host
2. **A typed domain model** – your BPMN subset as type strings and `Node<T>` / `Edge<T>` data
3. **Node templates** – 1 Angular component per shape family, registered in `NgDiagramNodeTemplateMap`
4. **Edge templates and markers** – `ng-diagram-base-edge` plus SVG arrowheads via `<ng-diagram-marker>`
5. **A palette** – declarative `NgDiagramPaletteItem` descriptors inside `<ng-diagram-palette-item>`
6. **Swimlanes** – group nodes (`isGroup`), membership rules (`canGroup`), `NgDiagramGroupsService`
7. **Business rules** – 1 typed `NgDiagramConfig`: linking validation, edge materialization, resize floors
8. **Auto-layout** – bring-your-own engine (elkjs) written back inside `transaction({ waitForMeasurements })`
9. **Theming** – `--ngd-*` CSS variables keyed on the `data-theme` attribute you already use

The sections below expand each block: the fundamental API usage in code, the mechanical detail in the repo.

## Step 1 – bootstrap the canvas

An ngDiagram canvas needs 3 things: the provider, the engine stylesheet, and a sized host element. Missing any of them is the classic "blank diagram" bug.

```scss
/* styles.scss */
@import 'ng-diagram/styles.css';

ng-diagram { width: 100%; height: 100%; display: block; }
```

`provideNgDiagram()` goes on the lowest common ancestor of every component that talks to the diagram – here, the editor page composing toolbar, palette, and canvas. The services scope to this subtree, not the application root, so 2 diagrams on one page would not fight over state.

```ts
@Component({
  selector: 'app-editor-page',
  standalone: true,
  imports: [ToolbarComponent, PaletteComponent, DiagramComponent],
  providers: [provideNgDiagram(), ElkLayoutService, SwimlaneService],
  template: `...`, // toolbar + palette + diagram – see the repo
})
export class EditorPageComponent {}
```

The diagram component initializes the model in a field initializer (`initializeModel` must run in an injection context, and a field initializer is one) and binds everything in the template:

```ts
protected readonly model$ = initializeModel(seedModel()); // seed nodes/edges – see the repo
```

```html
<ng-diagram
  [model]="model$"
  [config]="config"
  [nodeTemplateMap]="nodeTemplateMap"
  [edgeTemplateMap]="edgeTemplateMap"
  (paletteItemDropped)="onPaletteItemDropped($event)"
  (nodeResizeEnded)="onNodeResizeEnded($event)"
/>
```

**Checkpoint:** `npm start` shows the seeded diagram, and pan/zoom already works.

## Step 2 – model BPMN as typed data

The entire "which BPMN" decision is one file: type strings that select templates, and typed data contracts. According to [zur Muehlen and Recker's study of 120 real-world BPMN diagrams](https://eprints.qut.edu.au/12916/1/12916.pdf), the average model uses about 9 distinct constructs, and fewer than 20% of the vocabulary sees regular use – measured against the roughly 50 constructs of BPMN 1.x, before BPMN 2.0 more than doubled the count. So this editor models 9 shapes, not 100+ – the model file *is* the subset decision.

```ts
export const BpmnNodeType = {
  Task: 'bpmn-task',
  ExclusiveGateway: 'bpmn-exclusive-gateway',
  Swimlane: 'bpmn-swimlane',
  // ...9 type strings total – events, tasks, gateways, lane
} as const;

export interface BpmnNodeData {
  label: string;
  /** Shape family – drives which template branch renders. */
  kind: 'event' | 'task' | 'gateway';
}

export type BpmnNode = Node<BpmnNodeData>; // typed end-to-end via generics

// The edge side mirrors this: BPMN_EDGE_TYPE, BpmnEdgeKind, BpmnEdgeData – see the repo.
```

ngDiagram carries these types through every API: `Node<BpmnNodeData>` in templates, `updateNodeData` writes, and event payloads. A typo'd property fails at compile time instead of rendering a broken node.

2 modeling decisions do quiet, load-bearing work here. Edge data carries a `kind` (`sequence` / `message` / `association`), and a small predicate – `isLayoutEdge` in the repo – decides that only sequence flows participate in auto-layout, which Step 8 depends on. And each lane's stacking `order` lives in node data rather than array position, which keeps reordering, persistence, and undo consistent because the order is explicit state.

## Step 3 – node templates: BPMN shapes are Angular components

A node template is a standalone Angular component implementing `NgDiagramNodeTemplate<T>` with 1 required input. A map from type string to component decides who renders what – 8 element types share 1 component, and the swimlane gets its own:

```ts
protected readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
  ...BPMN_ELEMENT_TYPES.map((t) => [t, BpmnNodeComponent] as const),
  [BpmnNodeType.Swimlane, SwimlaneNodeComponent],
]);
```

```ts
export class BpmnNodeComponent implements NgDiagramNodeTemplate<BpmnNodeData> {
  node = input.required<Node<BpmnNodeData>>();

  protected readonly label = computed(() => this.node().data?.label ?? '');
  protected readonly isGateway = computed(() => this.node().data?.kind === 'gateway');
  // ...template branches: circles for events, rects for tasks, SVG diamonds for gateways
}
```

Inside the template you use the full Angular toolbox – `@switch` branches per shape, your design tokens, your icons. Connection points are declared as ports, here on all 4 sides:

```html
<ng-diagram-port id="top" type="both" side="top" />
<ng-diagram-port id="right" type="both" side="right" />
<ng-diagram-port id="bottom" type="both" side="bottom" />
<ng-diagram-port id="left" type="both" side="left" />
```

"Nodes are components" pays off concretely in inline label editing: the editor is a native `<input>` inside the node, and ngDiagram's documented `data-no-drag` / `data-no-pan` attributes keep typing and text selection from dragging the node or panning the canvas. Committing the edit is 1 call – `updateNodeData(id, { ...data, label })` – with 1 contract to remember: it replaces the data object wholesale, so spread the existing fields. The full editing flow (double-click to edit, Enter/Escape/blur handling) is in the repo.

One sizing decision matters for everything later: BPMN glyphs are fixed-proportion shapes, so every element sets `autoSize: false` with an explicit size – which also makes sizes safe to read synchronously in the swimlane math of Step 6.

## Step 4 – edge templates: 3 connection kinds, 1 component

BPMN needs 3 connection styles – solid sequence flows, dashed message flows, dotted associations – and 1 edge template covers all of them. The component wraps `ng-diagram-base-edge` and binds its styling inputs from `edge.data.kind`:

```ts
@Component({
  template: `
    <ng-diagram-base-edge
      [edge]="edge()"
      [strokeWidth]="1.6"
      [strokeDasharray]="dasharray()"
      [sourceArrowhead]="sourceArrow()"
      [targetArrowhead]="targetArrow()"
    />
  `,
  imports: [NgDiagramBaseEdgeComponent],
})
export class BpmnEdgeComponent implements NgDiagramEdgeTemplate<BpmnEdgeData> {
  edge = input.required<Edge<BpmnEdgeData>>();
  // computeds map kind → dasharray ('6 4' message, '1 4' association)
  // and kind → marker ids – see the repo
}
```

The arrowheads themselves are ordinary SVG markers, defined once in the diagram host inside `<ng-diagram-marker>`. One detail does the heavy lifting: `fill="context-stroke"` makes every marker inherit its edge's color automatically, so themed edges get themed arrowheads for free.

```html
<ng-diagram-marker>
  <svg><defs>
    <marker id="bpmn-seq-arrow" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="9" markerHeight="9" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
    </marker>
    <!-- message-flow open arrow + open circle: see the repo -->
  </defs></svg>
</ng-diagram-marker>
```

The edge component registers in an `NgDiagramEdgeTemplateMap` exactly like the node map in Step 3 – see the repo. Orthogonal routing – the BPMN house style – is 1 config line, not an algorithm you write: `edgeRouting: { defaultRouting: 'orthogonal' }`. Branch labels ("yes"/"no" on gateway exits) are the natural extension: project `<ng-diagram-base-edge-label [positionOnEdge]="0.5">` inside the base edge.

## Step 5 – a drag-and-drop palette from plain data

The palette is data-first: adding a BPMN shape to it is 1 entry in a const array, no component work. A palette item is a declarative `NgDiagramPaletteItem` descriptor of the node it will create – and the swimlane entry is the reveal that sets up Step 6, because a lane is just a node declared with `isGroup: true`:

```ts
{
  type: BpmnNodeType.Swimlane,
  isGroup: true,
  resizable: true,
  autoSize: false,
  size: { ...LANE_DEFAULT_SIZE },
  data: { label: 'New Lane', order: -1 }, // order assigned on drop
}
```

The markup wraps your own tile design in `<ng-diagram-palette-item>`, with an optional `<ng-diagram-palette-item-preview>` for the drag ghost:

```html
<ng-diagram-palette-item [item]="entry.item">
  <div class="tile">{{ entry.label }}</div>
  <ng-diagram-palette-item-preview>
    <div class="tile-preview">...</div>
  </ng-diagram-palette-item-preview>
</ng-diagram-palette-item>
```

When the user drops a tile, ngDiagram creates the real node and hands it to you in the `(paletteItemDropped)` event, together with `dropPosition` in diagram coordinates – which is exactly what Step 6 needs to decide which lane the element landed in.

## Step 6 – swimlanes are groups (the hard part)

ngDiagram models containers as **groups**: a lane is a node with `isGroup: true`, members reference it through `groupId`, and the engine handles membership on drag, drop-zone highlighting, and children moving with their container. Swimlanes are where flat node-and-edge tools break, because lanes are exactly such containers – and they are common: in [zur Muehlen and Recker's dataset](https://eprints.qut.edu.au/12916/1/12916.pdf), pools appeared in 81% of consulting-built models.

Who may join a lane is 1 predicate in the config:

```ts
grouping: {
  // Only flow elements may be grouped, and only into a swimlane.
  canGroup: (node, group) => isSwimlane(group) && !isSwimlane(node),
},
```

The lane's own template is a group template (`NgDiagramGroupNodeTemplate`): a rotated header band with reorder buttons, a resize adornment, and the engine's drop-zone state exposed as a plain CSS class – `ngDiagramGroupHighlighted` puts `.ng-diagram-group-highlight` on the lane while a node hovers over it, and you style it with your own CSS. The buttons sit behind `data-no-drag`, so pressing them never starts a lane drag. Full template in the repo.

Parenting a dropped element into a lane is a geometric decision: hit-test the drop *point* against the lane rectangles, then call the groups service (`NgDiagramGroupsService`). One honest workaround remains – the docs make no commit-timing guarantee for `paletteItemDropped`, so the handler defers 1 tick before touching the model:

```ts
onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
  const node = event.node;
  if (isSwimlane(node)) {
    setTimeout(() => this.swimlanes.onLaneAdded(node.id), 0);
    return;
  }
  setTimeout(() => {
    const lane = this.swimlanes.laneAtPoint(event.dropPosition);
    if (lane) this.groups.addToGroup(lane.id, [node.id]);
  }, 0);
}
```

The lane geometry itself – stacking lanes flush top-to-bottom, keeping all lanes the same width, normalizing `order` after a reorder – is plain arithmetic over `getChildren()` and 1 batched `updateNodes` call per operation. It lives in a dedicated `SwimlaneService` in the repo; the API insight is that `getChildren()` returns positions in global coordinates, so children move with their lane by a simple delta.

2 product decisions keep that geometry sane, and both are worth stealing:

- **Lanes never move by hand** (`draggable: false`). Reordering happens through the header buttons – killing a whole class of overlap bugs.
- **Lanes resize manually only.** Dragging a child never changes a lane's size; the engine's resize floor (Step 7) guarantees a lane can never be *shrunk* below its content.

Making that second "never" hold takes 1 CSS rule, not an event handler: ngDiagram's built-in group behavior grows a group to keep a dragged child inside its rendered bounds, and it advertises those bounds as an inline `min-width`/`min-height` on the group's host element. Zeroing that min for lanes (`ng-diagram-node:has(.lane) { min-width: 0 !important; min-height: 0 !important; }`) makes the lane follow its explicit model size – and because the auto-grow is driven off the rendered bound, the model size stays put too. "Nodes are DOM elements" paying off once more – the override lives in the repo's `styles.scss`.

**Checkpoint:** drop a task inside a lane – the lane highlights on hover, and the node becomes its child.

## Step 7 – business rules live in the config

Every editor rule in this project – who connects to what, what a drawn edge becomes, how small a lane may get – sits in 1 typed config function of about 30 lines. That is the payoff of owning the semantics: the rules are greppable, not scattered through event handlers.

```ts
export function buildDiagramConfig(laneMinSize: (lane: Node) => Size): NgDiagramConfig {
  return {
    edgeRouting: { defaultRouting: 'orthogonal' },
    resize: {
      // Never let a lane shrink smaller than the elements it holds.
      allowResizeBelowChildrenBounds: false,
      getMinNodeSize: (node: Node): Size =>
        isSwimlane(node) ? laneMinSize(node) : { width: 20, height: 20 },
    },
    grouping: {
      canGroup: (node: Node, group: Node) => isSwimlane(group) && !isSwimlane(node),
    },
    linking: {
      // Swimlanes cannot be connection endpoints. Params are nullable –
      // the engine calls this mid-gesture, before both ends exist.
      validateConnection: (source: Node | null, _sourcePort: Port | null, target: Node | null) =>
        !!source && !!target && !isSwimlane(source) && !isSwimlane(target),
      // Every user-drawn connection materializes as a typed sequence flow.
      finalEdgeDataBuilder: (edge: Edge) => ({
        ...edge,
        type: BPMN_EDGE_TYPE,
        routing: 'orthogonal',
        data: { ...(edge.data ?? {}), kind: BpmnEdgeKind.Sequence },
      }),
    },
  } satisfies NgDiagramConfig;
}
```

ngDiagram's `finalEdgeDataBuilder` deserves a highlight: users can never draw an untyped edge. The domain model from Step 2 is enforced at the gesture level.

The `laneMinSize` callback encodes a subtle rule in about 20 repo lines: lane *width* is global – all lanes share 1 width, so shrinking one lane must not push another lane's content out of bounds – while height is per-lane. And the resize-ended handler (in the repo) shows a habit worth copying: trust documented event contracts. ngDiagram guarantees `event.node` carries the final size when `nodeResizeEnded` fires, so the handler reads the payload directly – no deferral, no model round-trip.

**Checkpoint:** try to connect 2 lanes – the gesture refuses. Draw a task-to-task connection – it lands as a solid, arrowed sequence flow.

## Step 8 – auto-layout with ELK, scoped per lane

ngDiagram ships no built-in auto-layout, and for BPMN that is the right default: generic hierarchical layout does not know what a pool is. You bring your own engine and encode the domain rules yourself. This project uses [elkjs](https://github.com/kieler/elkjs), the JavaScript build of the Eclipse Layout Kernel (ELK), with its `layered` algorithm and `RIGHT` direction – matching BPMN's left-to-right convention.

The domain rule is the interesting part: **each lane is laid out independently, and only the sequence flows inside that lane feed the layout.** The `isLayoutEdge` predicate from Step 2 drops message flows and associations, and a per-lane filter keeps only edges whose both ends live in the lane – so a message flow crossing between lanes never distorts either lane's arrangement. The ELK graph assembly (about 40 repo lines) feeds real measured node sizes in and reads relative positions out.

Writing results back is where most layout integrations go subtly wrong, and it is the one ngDiagram idiom every reader should take away. Apply everything – lane frames and child positions – in 1 batched `updateNodes` call, and because mutations flow through an asynchronous pipeline, fit the viewport only after the engine has re-measured. That is exactly what the documented transaction API is for:

```ts
// Injected services: NgDiagramService, NgDiagramModelService, NgDiagramViewportService.
// Commit the layout atomically and wait for re-measurement, so zoomToFit
// sees the new bounds – not the pre-layout ones.
await this.ngDiagram.transaction(() => {
  this.model.updateNodes(nodeUpdates);
}, { waitForMeasurements: true });
this.viewport.zoomToFit({ padding: 60 });
```

One overload detail that will save you a debugging session: ngDiagram's `transaction()` with a sync callback returns a promise **only when you pass the options object**. Without it, there is nothing to await.

The toolbar that triggers layout is gated on the engine's readiness signal (`NgDiagramService.isInitialized`), so a fast first click cannot fire into an uninitialized diagram. elkjs runs client-side from the bundled build – Layout is a pure-frontend feature, no server round-trip.

**Checkpoint:** scatter nodes across lanes and click Layout. Each lane arranges left to right, lanes size to their content at a uniform width, and the viewport fits the new arrangement exactly.

## Step 9 – theming with the tokens you already have

The whole editor – app chrome, BPMN shapes, and the engine's own canvas and selection styling – themes from 1 attribute flip. ngDiagram keys its `--ngd-*` CSS variables on the same `data-theme` attribute your app already uses, so a theme service that sets `document.documentElement.setAttribute('data-theme', theme)` flips both worlds together. Your BPMN domain colors are ordinary design tokens:

```css
--c-bpmn-event-start: var(--prim-green-500);
--c-bpmn-task: var(--prim-blue-500);
--c-bpmn-gateway: var(--prim-amber-500);
--c-edge-message: var(--prim-purple-500);
```

The watermark question deserves a precise answer, because it decided the bpmn-js comparison: ngDiagram renders a small watermark by default, and the config documents `hideWatermark: true` (plus `watermarkPosition`). Under Apache 2.0, disabling it is legitimate – the difference from bpmn-js is not "watermark vs no watermark," it is "config flag vs license clause."

**Checkpoint:** toggle the theme button – canvas, lanes, shapes, and edges flip together. No second theming system exists to keep in sync.

That is the whole editor: palette, swimlanes, typed edges, per-lane auto-layout, theming – roughly 1,500 lines of application code (TypeScript and templates, styles aside). The repo linked in the intro is a working starting template.

## When you should not build it this way

Do not build on a general canvas when you need standard BPMN 2.0 XML interchange – use bpmn-js – or when diagrams reach tens of thousands of elements, where canvas rendering wins. No library wins every axis, and 2 axes matter here: how much BPMN you get for free, and how much framework-boundary code you own forever.

| | **ngDiagram** | **bpmn-js** | **GoJS** | **JointJS** |
|---|---|---|---|---|
| **BPMN out of the box** | No – you model it yourself | Yes – full BPMN 2.0 XML round-trip, plus ecosystem (properties panel, token simulation) | No – BPMN samples, not a product | BPMN shapes in the paid tier |
| **Angular boundary** | Native – components, signals, typed outputs | No official wrapper – you own the eventBus bridge | Official thin wrapper (`gojs-angular`); scene graph and events remain GoJS's world | No official Angular wrapper (React has one: `@joint/react`) |
| **Nodes rendered as** | Angular components in the DOM | SVG via custom renderers | Canvas scene-graph objects | SVG with its own model |
| **Typed element data** | Generics end-to-end | `businessObject`, largely untyped | String-keyed `setDataProperty` | Partial typings |
| **Licensing / branding** | Apache 2.0; default watermark disableable via config | Free, but license-mandated watermark | Commercial, per-developer | Open core; advanced tier commercial |
| **Maturity** | v1.x (2026; first public release 2025), backed by Synergy Codes | A decade of production use, Camunda-backed | Since 2012, paid support and updates included with license | Since 2011, commercial support in paid tier |
| **Best when…** | Branded, custom editor in an Angular product | Standard BPMN interchange, fast | Heavy general diagramming at extreme scale, vendor support | SVG diagramming with commercial support |

Read the table honestly and the answer is "it depends" – which is the correct answer:

- **Building an embedded, branded editor inside an Angular product?** That is ngDiagram's home turf: the editor is your Angular code end-to-end – components as nodes, signals as state, your design tokens as the theme – under an Apache 2.0 license with no per-developer cost. Every building block in this article mapped to a first-class API: groups, palette, linking config, transactions.
- **Need `.bpmn` XML in and out?** Use bpmn-js. Nothing else gets you standards compliance faster, watermark and all.
- **Rendering 10,000+ elements?** GoJS's canvas rendering genuinely wins at that scale. ngDiagram's docs demonstrate 500 nodes rendered without any tuning, and viewport virtualization – only elements near the viewport render to the DOM – is the documented lever beyond that. Real BPMN models run dozens to hundreds of elements, not tens of thousands.
- **Can you accept a v1.x library?** ngDiagram trades a decade of Stack Overflow answers for a codebase small enough to read, an Apache 2.0 license, and Angular-native ergonomics. Whether that trade is good depends on how much of the problem you were going to own anyway.

## The trade you're actually making

Choosing a diagramming canvas over a BPMN platform means you own the BPMN parts: the semantics, the validation rules, the XML serialization if you ever need it. ngDiagram hands you the canvas and stays out of the way; it does not hand you a BPMN engine. For an embedded, on-brand, Angular-native editor – the case this article built – that is the right trade, and the 9 blocks above are what "owning it" actually costs: about 1,500 lines, most of which are your business rules. The parts you would expect to be hard – container membership, drop-zone highlighting, typed edge creation, transactional writes – were each 1 ngDiagram API away.

The useful move is to name which half of the problem is yours before picking a tool. Teams get burned in both directions – reaching for a full BPMN platform when they needed a canvas, or hand-rolling a canvas when they needed the standard. Semantic validation – deadlocks, faulty merges, the errors users cannot see – is the next layer of "owning it," and it deserves its own article.

## FAQ

**Can ngDiagram import or export BPMN 2.0 XML?**
ngDiagram is a general diagramming library, so BPMN 2.0 XML support is not built in – the model round-trips as JSON out of the box (`toJSON()` / `initializeModel`), and a `.bpmn` import/export mapping is code you can write on top of the typed model when you need it. If standards-compliant XML interchange is the core requirement, bpmn-js remains the better foundation.

**How is this different from wrapping bpmn-js in an Angular component?**
A wrapper makes the render work; the bridge is what you maintain. With bpmn-js you translate its internal event bus into Angular change detection, type its payloads yourself, and re-verify the bridge on every upgrade. An Angular-native library exposes typed outputs and signals directly, so that layer does not exist.

**How many elements can a DOM-rendered diagram handle?**
Hundreds of nodes work out of the box, and ngDiagram documents viewport virtualization for larger models – only elements near the viewport render to the DOM. At tens of thousands of elements, canvas-based libraries like GoJS hold the advantage. Real-world BPMN diagrams average about 9 construct types and rarely exceed a few hundred elements.

**How do users draw connections between elements?**
Users drag between ports: every element declares 4 bidirectional ports, and 1 config predicate (`validateConnection`) validates each connection, blocking lanes from being endpoints. `finalEdgeDataBuilder` then materializes every drawn connection as a typed sequence flow, so untyped edges cannot exist.

**What are the alternatives to bpmn-js in an Angular app?**
The alternatives are general diagramming canvases you model BPMN on yourself: ngDiagram (Apache 2.0, Angular-native components and signals), GoJS (commercial, canvas-rendered, official `gojs-angular` wrapper), and JointJS (open core, BPMN shapes in the paid tier). bpmn-js remains the only option with BPMN 2.0 XML round-trip built in.

**Can the ngDiagram watermark be removed?**
Yes. ngDiagram renders a small watermark by default, and the documented `hideWatermark: true` config disables it. The library is Apache 2.0, so disabling it is legitimate – unlike bpmn-js, whose license requires its watermark to remain visible.

**What is ngDiagram and who maintains it?**
ngDiagram is an open-source Angular diagramming library built from scratch by Synergy Codes and released under Apache 2.0, with no runtime dependencies beyond the standard tslib helper. It provides composable building blocks – nodes, edges, groups – with native Angular patterns: components, services, dependency injection, and signal-based change detection, plus CSS variables for theming. It targets production use with hundreds of nodes – workflow editors, org charts, industrial schematics, network topologies – with full guides at [ngdiagram.dev/docs](https://www.ngdiagram.dev/docs).
