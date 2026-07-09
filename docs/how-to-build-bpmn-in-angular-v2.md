# How to build a BPMN editor in Angular with ngDiagram

## In short:

This tutorial builds a BPMN editor on [ngDiagram](https://www.ngdiagram.dev). The editor gets a palette of shapes you drag onto the canvas, swimlanes, 3 typed connection styles, and per-lane auto-layout – about 1,700 lines of application code in total. The complete project is [on GitHub](https://github.com/synergycodes/bpmn-editor).

## What we will build

The editor breaks down into 9 features, and each one maps to one ngDiagram API:

1. **A working canvas** – `provideNgDiagram()`, `initializeModel()`, a sized `<ng-diagram>` host
2. **A typed model** – your BPMN subset as type strings and `Node<T>` / `Edge<T>` data
3. **Node shapes** – one component per shape family (events, tasks, gateways) plus one for the lane, registered in a template map
4. **Edges and arrowheads** – `ng-diagram-base-edge` plus SVG markers
5. **A drag-and-drop palette** – plain data objects inside `<ng-diagram-palette-item>`
6. **Swimlanes** – group nodes (`isGroup`), membership rules, `NgDiagramGroupsService`
7. **Editor rules** – one typed config: connection checks, edge creation, resize limits
8. **Auto-layout** – bring your own engine (elkjs)
9. **Theming** – `--ngd-*` CSS variables

Each step below adds one feature and introduces the API behind it. The code samples come from the finished project – clone the repo and follow along. The article walks through the code that matters for ngDiagram; the repo holds the rest (styles, the toolbar and palette UI, helper internals). BPMN is only the example: the same building blocks make org charts, data pipelines, or network diagrams.

## Why not bpmn-js?

[bpmn-js](https://bpmn.io/toolkit/bpmn-js/) is the right choice when you need standard BPMN 2.0 XML import and export – it is the fastest way to get that. It comes with 2 costs. Its license requires a visible watermark on every diagram, with no public paid option to remove it. And it has no official Angular wrapper, so you maintain the bridge between its event bus and Angular yourself.

This tutorial uses a different approach: a general diagramming canvas plus your own small BPMN model. Real diagrams use a small part of the notation, so you will define your own subset either way. ngDiagram is Angular-native – nodes are components, state is signals, theming is CSS variables – so every step below stays inside normal Angular patterns.

Full disclosure: I build diagramming tools at [Synergy Codes](https://www.synergycodes.com), the company behind ngDiagram. Judge the code below for yourself. GoJS and JointJS are alternative diagramming libraries you could build a BPMN editor on – a comparison of all 4 options is at the end of the article.

## Step 1 – set up the canvas

Start by installing the library: `npm i ng-diagram`. The library supports Angular 18 or newer; the project in this tutorial uses Angular 19. A canvas then needs 3 things: the provider, the engine stylesheet, and a host element with a real size. If the diagram renders blank, one of these 3 is missing.

```scss
/* src/styles.scss */
@import 'ng-diagram/styles.css';

ng-diagram { width: 100%; height: 100%; display: block; }
```

`provideNgDiagram()` goes on the component that wraps the whole editor – toolbar, palette, and canvas. Do not put it at the application root: the services attach to the diagram's DOM subtree, so they must live inside it. This scoping also keeps 2 diagrams on one page independent, if you ever need it.

```ts
// src/app/bpmn/pages/editor-page.component.ts (imports omitted)
@Component({
  selector: 'app-editor-page',
  standalone: true,
  imports: [ToolbarComponent, PaletteComponent, DiagramComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ElkLayoutService and SwimlaneService are app services for steps 6 and 8.
  providers: [provideNgDiagram(), ElkLayoutService, SwimlaneService],
  templateUrl: './editor-page.component.html', // toolbar + palette + diagram
  styleUrl: './editor-page.component.scss',
})
export class EditorPageComponent {}
```

Inside the wrapper lives the diagram component – the owner of the `<ng-diagram>` canvas. In step 1 the class only creates the model; `initializeModel` needs an injection context, and a field initializer is one:

```ts
// src/app/bpmn/diagram/diagram.component.ts (imports omitted)
@Component({
  selector: 'app-bpmn-diagram',
  standalone: true,
  imports: [NgDiagramComponent, NgDiagramBackgroundComponent, NgDiagramMarkerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './diagram.component.html',
  styleUrl: './diagram.component.scss',
})
export class DiagramComponent {
  protected readonly model$ = initializeModel(seedModel()); // seed nodes and edges

  // Added by the later steps: the template maps (steps 3–4), the config
  // (step 7), and the drop/resize handlers (step 6).
}
```

Its template binds everything to `<ng-diagram>`:

```html
<!-- src/app/bpmn/diagram/diagram.component.html -->
<ng-diagram
  [model]="model$"
  [config]="config"
  [nodeTemplateMap]="nodeTemplateMap"
  [edgeTemplateMap]="edgeTemplateMap"
  (paletteItemDropped)="onPaletteItemDropped($event)"
  (nodeResized)="onNodeResized($event)"
>
  <ng-diagram-background type="dots" />
</ng-diagram>
```

This template is the finished shape – the config, the template maps, and the event handlers come from steps 3–7. The minimal working canvas is just `<ng-diagram [model]="model$" />` with the dotted background child.

**In the app:** after `npm start`, the seeded diagram renders – pan and zoom already work.

## Step 2 – describe BPMN as data

In ngDiagram, a diagram is data: an element on the canvas is a plain object with a `type` string and a `data` object. The whole "which BPMN" decision lives in a single model file, and it defines exactly those 2 things for every element: its type strings and its data shapes.

BPMN 2.0 defines well over 100 graphical elements, but you do not need them all. According to [zur Muehlen and Recker's study](https://eprints.qut.edu.au/12916/1/12916.pdf) of 120 real-world BPMN diagrams, the average model uses about 9 distinct constructs. So this editor models 9 shapes: events, tasks, gateways, and the swimlane ("lane" from here on).

First, the type strings. A `type` selects which Angular component renders the element – in step 3 a template map does the matching. Every object in the model carries one: a seed node looks like `{ id: 'start', type: BpmnNodeType.StartEvent, position: …, data: { label: 'Start' } }`.

```ts
// src/app/bpmn/model/bpmn.model.ts
export const BpmnNodeType = {
  Task: 'bpmn-task',
  ExclusiveGateway: 'bpmn-exclusive-gateway',
  Swimlane: 'bpmn-swimlane',
  // ...9 type strings total – events, tasks, gateways, lane
} as const;

export const BPMN_EDGE_TYPE = 'bpmn-edge';
```

Second, the data shapes. Each element family declares an interface for its `data` object – the fields your app stores on the element:

```ts
// src/app/bpmn/model/bpmn.model.ts (continued)
export interface BpmnNodeData {
  label: string;
}

export interface SwimlaneData {
  label: string;
  /** Vertical stacking order (0 = topmost lane). */
  order: number;
}

export interface BpmnEdgeData {
  /** Line style. Defined as the BpmnEdgeKind const in the repo. */
  kind: 'sequence' | 'message' | 'association';
  /** Shown at the middle of the edge; editable in step 4. */
  label?: string;
  // (layout flags and index signatures trimmed – see the repo)
}

export type BpmnNode = Node<BpmnNodeData>;
export type SwimlaneNode = Node<SwimlaneData>;
export type BpmnEdge = Edge<BpmnEdgeData>;
```

The aliases at the end hand these interfaces to ngDiagram's generics. From here on, every API that touches a node – templates, updates, event payloads – sees `Node<BpmnNodeData>`, so a typo in a field name fails at compile time instead of rendering a broken node.

2 of these fields matter later. The edge `kind` picks the line style in step 4. The lane `order` drives the vertical stacking in step 6.


## Step 3 – nodes are Angular components

Every BPMN shape is a normal Angular component, and each of the 3 shape families – events, tasks, gateways – gets its own. This step builds the task template and registers it at the end.

### The template structure

ngDiagram asks a node template for exactly 2 things: implement `NgDiagramNodeTemplate<T>` – which boils down to one required input named `node` – and render whatever markup you like. Inside that markup, 2 standard library pieces appear in every template: the `ngDiagramNodeSelected` directive on the wrapper (it adds the `ng-diagram-node-selected` class while the node is selected, so your CSS styles that state) and `<ng-diagram-port>` elements for connections. The task template's structure:

```html
<!-- src/app/bpmn/diagram/templates/nodes/task-node/task-node.component.html (structure) -->
<div class="task-node" ngDiagramNodeSelected [node]="node()">

  <!-- your own markup: the rounded rectangle, the type icon, the label -->

  <ng-diagram-port id="top" type="both" side="top" />
  <ng-diagram-port id="right" type="both" side="right" />
  <ng-diagram-port id="bottom" type="both" side="bottom" />
  <ng-diagram-port id="left" type="both" side="left" />
</div>
```

A port's `type` takes `source`, `target`, or `both` and controls whether a connection may start or end there; edges reference ports by their `id`. Hovering anywhere over the node lights the ports up – that is the engine's `ng-diagram-port-hoverable-over-node` host class, set once in the base class below.

### The editable label

Now the custom part – the markup in the middle. The label is editable inline: a double-click swaps the text for a native `<input>`, and 2 ngDiagram attributes make an input inside a node usable – `data-no-drag` and `data-no-pan` keep typing from dragging the node or panning the canvas. (`.inline-editor` carries the field's styling and `<app-icon>` renders from the app's SVG sprite – see the repo.)

```html
<!-- task-node.component.html – the markup inside the wrapper -->
<div class="task" [class.task--typed]="type() !== T.Task">
  @switch (type()) {
    @case (T.UserTask) { <app-icon class="task__icon" name="person" /> }
    @case (T.ServiceTask) { <app-icon class="task__icon" name="gear" /> }
  }

  @if (editing()) {
    <input
      #editor
      class="inline-editor task__input"
      type="text"
      data-no-drag="true"
      data-no-pan="true"
      [value]="label()"
      (dblclick)="$event.stopPropagation()"
      (keydown.enter)="commit(editor.value)"
      (keydown.escape)="cancel()"
    />
  } @else {
    <span class="task__label" (dblclick)="startEdit($event)" title="Double-click to rename">
      {{ label() }}
    </span>
  }
</div>
```

### The component and its base

The component class is only metadata – the logic sits in a shared base:

```ts
// src/app/bpmn/diagram/templates/nodes/task-node/task-node.component.ts (imports omitted)
@Component({
  selector: 'app-task-node',
  standalone: true,
  imports: [IconComponent, NgDiagramPortComponent, NgDiagramNodeSelectedDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-node.component.html',
  styleUrl: './task-node.component.scss',
})
export class TaskNodeComponent extends BpmnElementNode {}
```

`BpmnElementNode` is shared by all 3 element families. It implements the required `node` input, exposes the type and label computeds the template reads, and saves edited labels through `updateNodeData` on `NgDiagramModelService` – the injectable service that owns all model reads and writes.

```ts
// src/app/bpmn/diagram/templates/nodes/bpmn-element-node.ts (imports omitted)
@Directive({
  // Engine-provided hover styling: highlights all ports while over the node.
  host: { class: 'ng-diagram-port-hoverable-over-node' },
})
export abstract class BpmnElementNode
  extends InlineEditableLabel
  implements NgDiagramNodeTemplate<BpmnNodeData>
{
  private readonly model = inject(NgDiagramModelService);

  node = input.required<Node<BpmnNodeData>>();

  /** Templates only see class members – expose the type consts for @case. */
  protected readonly T = BpmnNodeType;
  protected readonly type = computed(() => this.node().type ?? '');
  protected readonly label = computed(() => this.node().data?.label ?? '');

  protected saveLabel(label: string): void {
    this.model.updateNodeData(this.node().id, { ...this.node().data, label });
  }
}
```

The editing state machine itself – enter on double-click, focus the field, save on Enter or a press outside, cancel on Escape – lives one level higher in `InlineEditableLabel`, a small app directive shared by all node and edge templates; a host plugs in by implementing `saveLabel` (see the repo).

`EventNodeComponent` and `GatewayNodeComponent` are the same kind of shell: their templates `@switch` on the node type to pick the glyph – a circle style per event type, a diamond with an x or + mark – with the editable label below it. Both are in the repo.

### Registering the templates

With the components ready, register them. A template map matches each `type` string from step 2 to a component, and the shape families are arrays in the model file:

```ts
// src/app/bpmn/model/bpmn.model.ts – the shape families: events, tasks, gateways.
export const EVENT_TYPES: readonly BpmnNodeType[] = [
  BpmnNodeType.StartEvent,
  BpmnNodeType.EndEvent,
  BpmnNodeType.IntermediateEvent,
];
export const TASK_TYPES: readonly BpmnNodeType[] = [
  BpmnNodeType.Task,
  BpmnNodeType.UserTask,
  BpmnNodeType.ServiceTask,
];
export const GATEWAY_TYPES: readonly BpmnNodeType[] = [
  BpmnNodeType.ExclusiveGateway,
  BpmnNodeType.ParallelGateway,
];
```

```ts
// src/app/bpmn/diagram/diagram.component.ts
protected readonly nodeTemplateMap = new NgDiagramNodeTemplateMap([
  ...EVENT_TYPES.map((t) => [t, EventNodeComponent] as const),
  ...TASK_TYPES.map((t) => [t, TaskNodeComponent] as const),
  ...GATEWAY_TYPES.map((t) => [t, GatewayNodeComponent] as const),
  [BpmnNodeType.Swimlane, SwimlaneNodeComponent], // the lane – a group template, step 6
]);
```

**In the app:** double-click a task's label and rename it – Enter saves, Escape cancels.

## Step 4 – edges: 3 line styles, 1 component

BPMN needs 3 connection styles – solid sequence flows, dashed message flows, dotted associations – and one edge component covers all of them.

### The template structure

An edge template mirrors the node contract: implement `NgDiagramEdgeTemplate<T>` – one required input named `edge` – and render `<ng-diagram-base-edge>`, the library component that draws the routed path. Your template only configures it: the dasharray and the arrowhead ids come from computeds that read `edge.data.kind` (shown below).

```html
<!-- src/app/bpmn/diagram/templates/edges/bpmn-edge.component.html -->
<ng-diagram-base-edge
  [edge]="edge()"
  [strokeDasharray]="dasharray()"
  [sourceArrowhead]="sourceArrow()"
  [targetArrowhead]="targetArrow()"
  [attr.title]="!label() && !editing() ? 'Double-click to add a label' : null"
  (dblclick)="startEdit($event)"
>
  @if (editing() || label()) {
    <ng-diagram-base-edge-label [id]="edge().id + '-label'" [positionOnEdge]="0.5">
      <!-- label text, or an input while editing – see the repo -->
    </ng-diagram-base-edge-label>
  }
</ng-diagram-base-edge>
```

### The inline label

Labels sit in `<ng-diagram-base-edge-label>`, positioned along the path – `0.5` is the middle, which fits the "yes" / "no" labels on gateway exits. Double-click on the edge edits the label inline, the same pattern as node labels; an empty value removes it, and the `title` tooltip invites the user to add one.

The class is again mostly metadata plus a few computeds:

```ts
// src/app/bpmn/diagram/templates/edges/bpmn-edge.component.ts (imports omitted)
@Component({
  selector: 'app-bpmn-edge',
  standalone: true,
  imports: [NgDiagramBaseEdgeComponent, NgDiagramBaseEdgeLabelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bpmn-edge.component.html',
  styleUrl: './bpmn-edge.component.scss',
})
export class BpmnEdgeComponent
  extends InlineEditableLabel
  implements NgDiagramEdgeTemplate<BpmnEdgeData>
{
  edge = input.required<Edge<BpmnEdgeData>>();

  protected readonly label = computed(() => this.edge().data?.label ?? '');

  private readonly kind = computed<BpmnEdgeKind>(
    () => (this.edge().data?.kind ?? BpmnEdgeKind.Sequence) as BpmnEdgeKind,
  );

  protected readonly dasharray = computed(() => {
    switch (this.kind()) {
      case BpmnEdgeKind.Message:
        return '6 4';
      case BpmnEdgeKind.Association:
        return '1 4';
      default:
        return undefined;
    }
  });

  // sourceArrow / targetArrow pick the marker ids the same way,
  // and saveLabel stores the edited label – see the repo.
}
```

### Selection styling

Selection needs no code at all. The base edge adds the `.selected` class to itself and reads the `--edge-*` CSS variables, so the selected stroke is 2 CSS rules:

```scss
/* src/app/bpmn/diagram/templates/edges/bpmn-edge.component.scss */
ng-diagram-base-edge {
  --edge-stroke-width: 1.6;
}
ng-diagram-base-edge.selected {
  --edge-stroke: var(--c-brand);
  --edge-stroke-width: 2.2;
}
```

### Arrowheads

Arrowheads are plain SVG markers, defined once inside `<ng-diagram-marker>`, next to the `<ng-diagram>` element in the diagram component's template. One useful detail: `fill="context-stroke"` makes each marker inherit the color of its edge, so themed (and selected) edges get matching arrowheads for free.

```html
<!-- src/app/bpmn/diagram/diagram.component.html -->
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

To put a marker on an edge, pass its id to the `[sourceArrowhead]` / `[targetArrowhead]` inputs from the template structure above. That is all the arrow computeds do – `undefined` means no arrowhead:

```ts
// src/app/bpmn/diagram/templates/edges/bpmn-edge.component.ts (fragment)
protected readonly targetArrow = computed(() => {
  switch (this.kind()) {
    case BpmnEdgeKind.Message:
      return 'bpmn-msg-end';
    case BpmnEdgeKind.Association:
      return undefined;
    default:
      return 'bpmn-seq-arrow';
  }
});
```

### Registration and routing

The edge component registers in an `NgDiagramEdgeTemplateMap`, exactly like the node map in step 3 (see the repo). Orthogonal routing – the standard style for BPMN diagrams – is one line in step 7's config: `edgeRouting: { defaultRouting: 'orthogonal' }`.

**In the app:** double-click an edge to give it a label. Select the edge – the stroke and the arrowhead turn brand-colored.

## Step 5 – a palette from plain data

A palette is a side panel with tiles that users drag onto the canvas to create new elements. ngDiagram's part is one wrapper component: put your own tile markup inside `<ng-diagram-palette-item [item]="…">` and the engine makes the tile draggable. `<ng-diagram-palette-item-preview>` is the optional ghost shown while dragging:

```html
<!-- src/app/bpmn/palette/palette.component.html -->
<ng-diagram-palette-item [item]="entry.item">
  <div class="tile" [title]="entry.label">
    <div class="tile__art">
      <app-icon [name]="entry.glyph" />
    </div>
    <div class="tile__label">{{ entry.label }}</div>
  </div>
  <ng-diagram-palette-item-preview>
    <div class="tile-preview">
      <app-icon [name]="entry.glyph" />
    </div>
  </ng-diagram-palette-item-preview>
</ng-diagram-palette-item>
```

The `item` input is a plain object describing the node the drop will create. This editor keeps all entries in a const array – adding a shape to the palette is one entry, no component work. The lane's `item` also prepares step 6, because a lane is a node with `isGroup: true`:

```ts
// src/app/bpmn/model/palette-data.ts – the `item` field of the lane's entry.
{
  type: BpmnNodeType.Swimlane,
  isGroup: true,
  resizable: true,
  rotatable: false,
  autoSize: false,
  size: { ...LANE_DEFAULT_SIZE },
  // `order` is assigned on drop (append to the bottom of the stack).
  data: { label: 'New Lane', order: -1 } as SwimlaneData as BasePaletteItemData,
}
```

`autoSize: false` with an explicit `size` appears on every element in this editor: BPMN shapes have fixed proportions, and fixed sizes are also what the swimlane math in step 6 relies on.

On drop, ngDiagram creates the real node and hands it to you in the `(paletteItemDropped)` event, together with `dropPosition` in diagram coordinates. Step 6 uses both.

**In the app:** drag a tile from the palette onto the canvas – a new node appears at the drop point.

## Step 6 – swimlanes are groups

ngDiagram models containers as groups. A lane is a node with `isGroup: true`, members point to it through `groupId`, and the engine handles the rest: membership on drag, highlight when a node hovers over a lane, children moving with their lane.

### Membership rules

One function in the config decides which nodes may join a lane:

```ts
// src/app/bpmn/diagram/diagram-config.ts
grouping: {
  // Only flow elements may be grouped, and only into a swimlane.
  canGroup: (node, group) => isSwimlane(group) && !isSwimlane(node),
},
```

### The lane template

A group template follows the same contract as the node templates from step 3, with `NgDiagramGroupNodeTemplate` as the interface. The lane wraps itself in the engine's resize adornment – the selection frame with drag handles – and adds one more directive, `ngDiagramGroupHighlighted`:

```html
<!-- src/app/bpmn/diagram/templates/nodes/swimlane-node/swimlane-node.component.html -->
<ng-diagram-node-resize-adornment>
  <div class="lane" ngDiagramNodeSelected ngDiagramGroupHighlighted [node]="node()">
    <div class="lane__header" [style.width.px]="headerWidth">
      <div class="lane__controls" data-no-drag="true" data-no-pan="true">
        <button type="button" class="lane__btn" title="Move lane up" (click)="moveUp($event)">
          <app-icon name="triangle-up" />
        </button>
        <button type="button" class="lane__btn" title="Move lane down" (click)="moveDown($event)">
          <app-icon name="triangle-down" />
        </button>
      </div>
      <!-- inline-editable title – see the repo -->
    </div>
    <div class="lane__body"></div>
  </div>
</ng-diagram-node-resize-adornment>
```

`ngDiagramGroupHighlighted` exposes the drop-zone state: while a node hovers over the lane, it adds `.ng-diagram-group-highlight`, and you style that class with your own CSS. The reorder buttons in the header sit behind `data-no-drag`, so clicking them never drags the lane.

### Parenting on drop

For elements already on the diagram, this needs no code at all: dropping a node onto a group adds it to the group automatically. Only a drop from the palette needs extra handling – the engine creates the node, but into which lane it lands is your call. The handler checks which lane rectangle contains the drop point; `paletteItemDropped` fires after the node is committed to the model, so it can re-parent right away through `NgDiagramGroupsService`:

```ts
// src/app/bpmn/diagram/diagram.component.ts
onPaletteItemDropped(event: PaletteItemDroppedEvent): void {
  const node = event.node;
  if (isSwimlane(node)) {
    this.swimlanes.onLaneAdded(node.id); // stack + width-match the new lane
    return;
  }
  const lane = this.swimlanes.laneAtPoint(event.dropPosition);
  if (lane) this.groups.addToGroup(lane.id, [node.id]);
}
```

### Lane geometry

The lane geometry lives in a dedicated `SwimlaneService` in the repo: it stacks lanes top to bottom, keeps all lanes the same width, and normalizes `order` after a reorder. Each operation is plain arithmetic over `getChildren()` (also on `NgDiagramModelService`) plus one batched `updateNodes` call.

### Live resize

Resizing itself comes for free: the `<ng-diagram-node-resize-adornment>` wrapper from the lane template gives the lane its drag handles, and for a standalone node that is all you need. Lanes add extra behavior on top of it – width sync and stacking – and restyle the adornment.

The diagram template from step 1 binds the `(nodeResized)` event: it fires on every tick of a resize gesture, so while the user drags a lane, the other lanes follow live – widths stay equal, the stack stays flush (`SwimlaneService.onLaneResized`).

Lanes resize from the right and bottom edges only – the rest of the resize adornment is switched off with a small CSS override (a first-class option for this is planned in the adornment API):

```scss
/* src/app/bpmn/diagram/templates/nodes/swimlane-node/swimlane-node.component.scss */
:host ::ng-deep {
  .resize-line--top,
  .resize-line--left {
    pointer-events: none;
  }

  .resize-handle--top-left,
  .resize-handle--top-right,
  .resize-handle--bottom-left {
    display: none;
  }
}
```

The adornment's look itself is themable – the engine exposes `--ngd-resize-*` variables, and the app points them at its brand tokens:

```scss
/* src/styles.scss */
/* Engine bridge – point ngDiagram's themable tokens at the brand. */
:root {
  --ngd-resize-line-border-color: var(--c-brand);
  --ngd-resize-handle-background-color: var(--c-surface-2);
  --ngd-resize-handle-border-color: var(--c-brand);
  --ngd-resize-handle-border-radius: 2px;
}
```

**In the app:** drop a task from the palette into a lane – it becomes the lane's child. Then drag it over another lane – that lane highlights, and releasing moves the node into it.

## Step 7 – editor rules live in the config

`NgDiagramConfig` is the engine's central settings object, passed once through the `[config]` binding from step 1. Its options are grouped by feature – `linking`, `grouping`, `resize`, `edgeRouting`, `zoom`, `snapping`, and more – and most of them are plain values or small callbacks the engine consults during gestures.

This editor uses 4 of those groups to enforce its BPMN rules: which elements may connect, what type a drawn edge gets, how small a lane may get, and how edges are routed.

```ts
// src/app/bpmn/diagram/diagram-config.ts
export function buildDiagramConfig(laneMinSize: (lane: Node) => Size): NgDiagramConfig {
  return {
    edgeRouting: {
      defaultRouting: 'orthogonal',
    },
    resize: {
      // Never let a lane (or any node) shrink smaller than the elements it holds.
      allowResizeBelowChildrenBounds: false,
      getMinNodeSize: (node: Node): Size =>
        isSwimlane(node) ? laneMinSize(node) : { width: 20, height: 20 },
    },
    grouping: {
      // Only real flow elements may be grouped, and only into a swimlane.
      canGroup: (node: Node, group: Node) => isSwimlane(group) && !isSwimlane(node),
    },
    linking: {
      // Swimlanes cannot be connection endpoints.
      validateConnection: (source: Node | null, _sourcePort: Port | null, target: Node | null) =>
        !!source && !!target && !isSwimlane(source) && !isSwimlane(target),
      // Every user-drawn connection becomes a typed sequence flow.
      finalEdgeDataBuilder: (edge: Edge) =>
        ({
          ...edge,
          type: BPMN_EDGE_TYPE,
          routing: 'orthogonal',
          data: { ...(edge.data ?? {}), kind: BpmnEdgeKind.Sequence },
        }) as Edge,
    },
  } satisfies NgDiagramConfig;
}
```

The diagram component builds this config once, handing it the lane minimum-size callback from `SwimlaneService`, and binds it to `[config]` from step 1:

```ts
// src/app/bpmn/diagram/diagram.component.ts
protected readonly config = buildDiagramConfig((lane) => this.swimlanes.laneMinSize(lane));
```

The key line is `finalEdgeDataBuilder`: every user-drawn connection becomes a typed sequence flow, so an untyped edge cannot exist. The model from step 2 is enforced at the gesture level.

`laneMinSize` computes the width floor from all lanes' content: lanes share the same width, so shrinking one lane must not push another lane's content out of bounds. Height is set per lane.

**In the app:** connect 2 tasks – the edge is created as a solid sequence flow with an arrowhead. Then try to shrink a lane below its content – the resize stops at the minimum size.

## Step 8 – auto-layout with ELK, per lane

ngDiagram ships no built-in auto-layout – you bring your own engine. This project uses [elkjs](https://github.com/kieler/elkjs) with the `layered` algorithm and `RIGHT` direction, because BPMN reads left to right.

The Layout button in the toolbar calls `SwimlaneService.runLayout()`. It lays out each lane's children with ELK – only the sequence flows inside that lane count, so cross-lane message flows never distort the arrangement – then a pure helper turns the results into lane frames and child positions: every lane gets the width of the widest content, and the lanes stack to fit. Everything lands in one batched `updateNodes` call, and the viewport stays where the user left it:

```ts
// src/app/bpmn/diagram/swimlanes/swimlane.service.ts
async runLayout(): Promise<void> {
  const lanes = this.lanes();
  if (lanes.length === 0) return;

  const layoutEdges = this.model.edges().filter((e) => isLayoutEdge(e as BpmnEdge));

  // Layout each lane's children independently (cross-lane edges ignored).
  const perLane = await Promise.all(
    lanes.map(async (lane) => {
      const children = this.childrenOf(lane.id).filter(isBpmnElement);
      const result = await this.elk.layoutLane(children, layoutEdges);
      return { lane, children, result };
    }),
  );

  this.model.updateNodes(computeAutoLayoutUpdates(perLane));
}
```

The details live next to it in the repo: `swimlanes/lane-auto-layout.ts` computes the updates, and `layout/elk-layout.service.ts` wraps the ELK call.

If you would rather show the whole diagram after a layout instead of leaving the viewport alone, wrap the write in a transaction that waits for re-measurement and call `zoomToFit` after it – it needs the new bounds, not the pre-layout ones:

```ts
// Example – NgDiagramService.transaction + NgDiagramViewportService.zoomToFit.
await this.ngDiagram.transaction(() => {
  this.model.updateNodes(computeAutoLayoutUpdates(perLane));
}, { waitForMeasurements: true });
this.viewport.zoomToFit({ padding: 60 });
```

**In the app:** scatter nodes across lanes and click Layout in the toolbar. Each lane arranges left to right, and all lanes share the same width.

## Step 9 – theming with CSS tokens

The whole editor themes from one attribute: `data-theme` on `<html>`. Two sets of CSS variables react to it – the app's own design tokens and ngDiagram's `--ngd-*` tokens, which ship with a light and a dark theme built in. A small `ThemeService` writes the attribute and persists the choice; the toolbar button toggles it (see the repo).

The app tokens live in `src/tokens.css`. Components use semantic names, and each theme block points those names at different colors – flipping the attribute recolors every shape:

```css
/* src/tokens.css (fragment) */
:root,
html[data-theme='light'] {
  --c-bpmn-node-fill: var(--prim-gray-100);
  --c-bpmn-node-stroke: var(--prim-gray-600);
}

html[data-theme='dark'] {
  --c-bpmn-node-fill: var(--prim-gray-700);
  --c-bpmn-node-stroke: var(--prim-gray-450);
}
```

The engine's canvas, selection ring, and default node colors theme themselves the same way. To restyle them, override the `--ngd-*` variables – this project keeps the engine defaults apart from the resize-adornment variables from step 6; an override looks like this:

```css
/* Example – e.g. in src/styles.scss. Point engine tokens at your palette. */
html[data-theme='dark'] {
  --ngd-diagram-background-color: var(--c-canvas);
  --ngd-node-stroke-primary-hover: var(--c-brand);
}
```

**In the app:** flip the theme with the toolbar button. Canvas, lanes, shapes, and edges change together.

## Summary

That is the whole editor – and look at what we did not have to build: drag and drop, coordinate math, model state, selection, resizing, grouping, edge routing. ngDiagram did the heavy, tedious work, so the editor's ~1,700 lines are almost entirely business logic: BPMN types, lane geometry, editor rules. And where a default did not fit, we overrode exactly the piece we needed – a config callback, a CSS variable, a template. The library is not a black box; it is built to be configured and changed.

The [repo](https://github.com/synergycodes/bpmn-editor) is a working starting template: swap the model file and the templates, and the same building blocks give you an org chart or a pipeline editor instead of BPMN.

## When to pick a different library

Use bpmn-js when you need standard BPMN 2.0 XML interchange. Use GoJS or JointJS when diagrams grow very large – they render to canvas or plain SVG, which scales further than a component per node. For an embedded, branded editor inside an Angular product, ngDiagram is the direct fit.

| | **ngDiagram** | **bpmn-js** | **GoJS** | **JointJS** |
|---|---|---|---|---|
| **BPMN out of the box** | No – you model it yourself | Yes – full BPMN 2.0 XML round-trip | No – samples, not a product | Shapes in the paid tier |
| **Angular integration** | Native – components, signals, typed outputs | No official wrapper – you own the bridge | Official thin wrapper (`gojs-angular`) | No official Angular wrapper |
| **Nodes rendered as** | Angular components in the DOM | SVG via custom renderers | Canvas scene-graph objects | SVG with its own model |
| **Licensing** | Apache 2.0; watermark off via config | Free, but license-mandated watermark | Commercial, per developer | Open core; advanced tier paid |
| **Best when…** | Branded editor in an Angular product | You need `.bpmn` XML files in and out | Large-scale diagrams | Large-scale diagrams |

For scale, keep the numbers in view: real-world BPMN models run dozens to hundreds of elements, not tens of thousands. ngDiagram handles hundreds of nodes without tuning. For larger diagrams, it documents viewport virtualization: only elements near the viewport render to the DOM.

## FAQ

**Can ngDiagram import or export BPMN 2.0 XML?**
Not out of the box. The model round-trips as JSON (`toJSON()` / `initializeModel`), and you can write a `.bpmn` mapping on top of the typed model when you need it. If standard XML interchange is the core requirement, use bpmn-js.

**How many elements can a DOM-rendered diagram handle?**
Hundreds of nodes work without tuning, and ngDiagram documents viewport virtualization for larger models. Real-world BPMN diagrams rarely exceed a few hundred elements.

**How do users draw connections between elements?**
They drag between ports. A config function (`validateConnection`) checks each connection and blocks lanes from being endpoints. A second function (`finalEdgeDataBuilder`) turns every drawn connection into a typed sequence flow.

**Can the ngDiagram watermark be removed?**
Yes. The documented `hideWatermark: true` config disables it. ngDiagram is Apache 2.0, so this is allowed by the license – unlike bpmn-js, whose license requires its watermark to stay visible.

**What is ngDiagram and who maintains it?**
ngDiagram is an open-source Angular diagramming library built from scratch by [Synergy Codes](https://www.synergycodes.com) and released under Apache 2.0. It provides composable building blocks – nodes, edges, groups – with native Angular patterns: components, services, dependency injection, and signal-based change detection. It targets production use with hundreds of nodes: workflow editors, org charts, industrial schematics, network topologies. Full guides live at [ngdiagram.dev/docs](https://www.ngdiagram.dev/docs).
