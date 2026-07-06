# From subset to full BPMN editor — element & feature gap analysis

*Internal planning note. A complete inventory of what BPMN 2.0 contains, what this app has today, and what would need to be added — node types, edge types, and the cross‑cutting machinery around them — to call it a "fully‑fledged BPMN editor." Each item has a short description and implementation instructions against our current ngDiagram architecture. No code.*

> Companion docs: **[bpmn-validation-findings.md](bpmn-validation-findings.md)** (the validation layer) and **[how-to-build-bpmn-in-angular.md](how-to-build-bpmn-in-angular.md)** (the narrative).

## How to read this

Status legend: **✅ Have** · **🟡 Partial** · **❌ Missing**

Our architecture, for reference (so the instructions are concrete):
- Node type strings + `data` contracts live in `src/app/bpmn/model/bpmn.model.ts`.
- One shared `BpmnNodeComponent` renders every flow element via an `@switch` on type/kind. Swimlanes render through `SwimlaneNodeComponent`. Both are registered in a `NgDiagramNodeTemplateMap`.
- Edges render through one `BpmnEdgeComponent` (varies stroke/arrowheads by `data.kind`), registered in a `NgDiagramEdgeTemplateMap`; SVG markers are declared once in the diagram host.
- Palette entries live in `palette-data.ts`; drop/parenting/layout logic in `swimlane.service.ts` + `elk-layout.service.ts`; engine rules in `diagram-config.ts`.

The recurring instruction below is **data‑driven rendering**: do *not* create 60 components for 60 event shapes. Extend the `data` contract with fields like `eventDefinition`, `markers`, `taskType`, and branch on them inside the existing components.

---

## Current state

| Category | Have today |
|---|---|
| Events | Start, End, Intermediate — **none‑type only** (no triggers) |
| Activities | Task, User Task, Service Task |
| Gateways | Exclusive (XOR), Parallel (AND) |
| Swimlanes | Cosmetic groups (label + order), not participants |
| Connecting objects | Sequence flow, Message flow, Association |
| Data / Artifacts | ❌ none |
| Around the shapes | Palette drag‑drop, per‑lane elkjs layout, theming, inline label edit |

Everything below is what's between here and "full."

---

## 1. Events

**Biggest single gap.** BPMN events are a matrix of **position × trigger (event definition) × behavior**. We have 3 positions at the "none" trigger. Full BPMN is ~60 distinct event shapes.

**Positions:** Start · Intermediate Catching · Intermediate Throwing · Boundary (interrupting) · Boundary (non‑interrupting) · End.
**Triggers (event definitions):** None, Message, Timer, Error, Escalation, Cancel, Compensation, Conditional, Link, Signal, Terminate, Multiple, Parallel‑Multiple.

| Element | Status | Notes |
|---|---|---|
| Start / Intermediate / End (none) | ✅ | shapes exist |
| Message / Timer / Signal / Conditional / Link (start + intermediate) | ❌ | inner glyph per trigger |
| Error / Escalation / Cancel / Compensation | ❌ | mostly boundary + end |
| Terminate end · Multiple · Parallel‑Multiple | ❌ | |
| Boundary events (interrupting & non‑interrupting) | ❌ | needs attachment mechanic — see §9 |

**Description.** A message start event kicks off a process when a message arrives; a timer boundary event fires a deadline on a task; a terminate end event kills the whole process; interrupting vs non‑interrupting boundary events differ by a solid vs dashed ring. The ring style encodes position (thin = start, double = intermediate, thick = end, dashed = non‑interrupting boundary) and the inner glyph encodes the trigger.

**Instructions.**
1. Extend `BpmnNodeData` with `eventDefinition: 'none' | 'message' | 'timer' | 'error' | 'escalation' | 'cancel' | 'compensation' | 'conditional' | 'link' | 'signal' | 'terminate' | 'multiple' | 'parallelMultiple'` and `throwing?: boolean` (catch vs throw).
2. Keep the single event branch in `BpmnNodeComponent`; render the ring from position (as now) and add an inner `@switch (eventDefinition())` that draws the glyph SVG (envelope, clock, lightning, etc.). Throwing events use filled glyphs, catching events use outlined — that's a fill toggle, not a new component.
3. Palette: rather than ~60 tiles, ship the common ones (message/timer start, timer/error boundary, message throw, terminate end) and expose the rest via a trigger picker in the properties panel (§13). This matches the "progressive palette" principle.
4. Boundary events need the attachment mechanic in §9 before they're usable.

---

## 2. Activities & tasks

| Element | Status | Description |
|---|---|---|
| Task (undefined) | ✅ | generic activity |
| User Task | ✅ | human step |
| Service Task | ✅ | automated/system step |
| Send Task | ❌ | sends a message (filled envelope marker) |
| Receive Task | ❌ | waits for a message (outline envelope) |
| Script Task | ❌ | runs a script |
| Business Rule Task | ❌ | evaluates a decision/DMN |
| Manual Task | ❌ | offline human step |
| **Markers** | | |
| Loop | ❌ | repeats while a condition holds |
| Multi‑instance (parallel/sequential) | ❌ | runs N times; ∥ or ≡ marker |
| Compensation | ❌ | undo activity; rewind marker |
| **Subprocesses** | | |
| Embedded subprocess (expand/collapse) | ❌ | nested process inline — see §10 |
| Call activity | ❌ | reference to a global/reusable process (bold border) |
| Event subprocess | ❌ | dashed‑border subprocess triggered by an event |
| Transaction | ❌ | double‑bordered subprocess with cancel semantics |
| Ad‑hoc subprocess | ❌ | unordered activities (~ marker) |

**Description.** Task *types* differ only by a small corner icon and their execution semantics; markers are small icons at the bottom‑center (loop ↺, multi‑instance ∥/≡, compensation ⏪). Subprocesses are containers that can be collapsed to a single box or expanded to show their internals.

**Instructions.**
1. Add `taskType: 'task' | 'user' | 'service' | 'send' | 'receive' | 'script' | 'businessRule' | 'manual'` and `markers: Array<'loop' | 'multiInstanceParallel' | 'multiInstanceSequential' | 'compensation'>` to `BpmnNodeData`.
2. In the task branch of `BpmnNodeComponent`: keep the current top‑left type icon (switch on `taskType`) and add a bottom‑center marker row that maps `markers[]` to glyphs. Data‑driven; still one component.
3. Subprocesses are **groups** (like swimlanes) — reuse the group mechanism (`isGroup: true`, `groupId` on children) but with subprocess styling and the expand/collapse behavior in §10. Call activity / transaction / event‑subprocess are the same shape with different borders (bold / double / dashed) → a `subprocessType` flag on the group data.

---

## 3. Gateways

| Element | Status | Description |
|---|---|---|
| Exclusive (XOR) | ✅ | one path chosen by conditions |
| Parallel (AND) | ✅ | all paths taken |
| Inclusive (OR) | ❌ | one or more paths (circle marker) |
| Event‑based | ❌ | path chosen by which event fires first (pentagon marker) |
| Complex | ❌ | custom merge/split logic (✳ marker) |
| Exclusive/Parallel event‑based (instantiating) | ❌ | start a process via events |

**Description.** All gateways are the same diamond; only the inner marker and the merge/split semantics change. Event‑based gateways must be followed by catching events or receive tasks.

**Instructions.**
1. Add `gatewayType: 'exclusive' | 'parallel' | 'inclusive' | 'eventBased' | 'complex'` (already implicit in our two type strings — generalize it) and `gatewayDirection: 'diverging' | 'converging' | 'mixed' | 'unspecified'` (needed by validation, §12 in the findings doc).
2. Extend the gateway `@switch` in `BpmnNodeComponent` to draw the extra markers on the shared diamond. No new components.

---

## 4. Data elements ❌ (whole category missing)

| Element | Description |
|---|---|
| Data Object | a document/data produced or consumed (page‑with‑folded‑corner) |
| Data Object collection | multiple instances (∥ marker) |
| Data Input / Data Output | process‑level I/O (arrow overlay) |
| Data Store | persistent store (cylinder) |

**Description.** Data elements are *not* flow nodes — they don't sit on the sequence flow. They connect to activities via **data associations** (dotted arrows) and are ignored by control‑flow layout/validation.

**Instructions.**
1. New node type(s) with a `category: 'data'` marker so `isBpmnElement`/layout logic can **exclude** them from sequence‑flow layout (mirror how message/association edges are excluded via `isLayoutEdge`).
2. New `BpmnDataNodeComponent` (or a data branch) for the page/cylinder shapes.
3. Requires the **data association** edge type (§7).

---

## 5. Swimlanes 🟡 (cosmetic today)

| Element | Status | Description |
|---|---|---|
| Pool | 🟡 | we have a lane‑like group; not a true participant |
| Lane (nested within pool) | ❌ | sub‑partition inside a pool |
| Black‑box pool (collapsed) | ❌ | a participant with no internal detail |
| Multiple pools (collaboration) | ❌ | more than one process interacting |

**Description.** In real BPMN a **pool = a participant that owns one process**; **lanes** sub‑divide a pool (by role/system). Sequence flows stay inside a pool; message flows cross pools. A black‑box pool is an empty bar representing an external party.

**Instructions.**
1. Promote swimlanes from cosmetic groups to a **participant model**: a pool group owns a process; lanes are nested groups (`groupId` → pool). This is the same refactor called out in the validation doc and unlocks the pool‑crossing connection rules.
2. Support **horizontal nesting** (lanes inside a pool) in the layout/resize logic we already wrote for lanes.
3. Add a "collapsed/black‑box" flag that renders the pool as an empty labeled bar.

---

## 6. Artifacts ❌

| Element | Description |
|---|---|
| Text Annotation | a comment attached to any element via an association |
| Group (visual) | a dashed rounded box that visually groups elements **without** affecting flow or containment |

**Instructions.**
1. Text annotation: a lightweight node (bracket + text), connected by an **association**. Excluded from layout/validation.
2. Visual "Group" is distinct from our functional swimlane group — it's a non‑parenting overlay box. Model as a node with no `groupId` semantics; purely decorative.

---

## 7. Connecting objects

| Element | Status | Description |
|---|---|---|
| Sequence flow (normal) | ✅ | control flow |
| Conditional sequence flow | ❌ | has a condition; mini‑diamond at source |
| Default sequence flow | ❌ | fallback path; slash at source |
| Message flow | ✅ | cross‑pool message (dashed, hollow circle → arrow) |
| Association | ✅ | links artifacts |
| Data association | ❌ | dotted arrow to/from data elements |

**Description.** Conditional and default flows are *variants* of the sequence flow distinguished by a source decoration; data associations are directional dotted arrows specific to data elements.

**Instructions.**
1. Add `condition?: string` and `isDefault?: boolean` to `BpmnEdgeData`; render the mini‑diamond / slash decoration at the source in `BpmnEdgeComponent`. (Validation later checks that diverging XOR/OR gateways have conditions + one default.)
2. Data association is a new `kind` in the edge component (dotted, open arrowhead), and like message/association it's `layoutExclude`.

---

## 8. Semantic / domain model ❌ (the enabler)

Covered in depth in **[bpmn-validation-findings.md](bpmn-validation-findings.md)**. Short version: our nodes carry a visual `type` + coarse `kind`, not BPMN semantics. Almost every item above needs new `data` attributes (event definitions, task types, markers, gateway direction, conditions, containment). **Design the `data` contracts as one coherent domain model rather than accreting flags per feature** — it's the backbone the whole editor reads from.

---

## 9. Boundary events — attachment mechanic ❌

**Description.** A boundary event is an event *glued to the edge* of an activity; moving/deleting the activity moves/deletes the event, and it spawns an exception flow.

**Instructions.**
1. Model the attachment as a parent reference (`attachedToRef`) + a relative position on the host's perimeter.
2. On host move/resize, reposition attached events (a small service reacting to `nodeDragEnded`/`nodeResizeEnded`, like our swimlane refit); on host delete, cascade‑delete them.
3. Exclude boundary events from being dropped freely — they only attach to activities (gate in the drop handler / `validateConnection`).

---

## 10. Subprocess expand / collapse & drill‑down ❌

**Description.** A subprocess can be a collapsed box (with a ⊞) or expanded to reveal its child flow inline; users often "drill in" to edit the inner process on its own canvas.

**Instructions.**
1. Reuse the group mechanism; add a `collapsed` flag. Collapsed → render as a single task‑sized box with a ⊞ marker and hide children. Expanded → behave like a resizable container (we already have group resize/refit).
2. Optional drill‑down: swap the visible model to the subprocess's children (a "breadcrumb" navigation) — this is an editor‑UX feature, not a rendering one. Note bpmn‑js's difficulty here is exactly the kind of thing our custom‑component approach handles more cleanly.

---

## 11. Sequence flow conditions & default paths ❌
See §7. Needed for both correct semantics and validation. Requires the properties panel (§13) to edit condition expressions.

---

## 12. Properties panel ❌ (per‑element attributes)

**Description.** Every element type has editable attributes (name, id, event definition + its config, task implementation, gateway default flow, multi‑instance cardinality, condition expressions…). This is where the "progressive palette" pays off — rare variants are configured here rather than cluttering the palette.

**Instructions.**
1. A right‑hand panel bound to the current selection (`NgDiagramSelectionService.selection()`), rendering a form driven by the selected element's type/`data`.
2. A schema‑driven form (the sibling single‑line‑diagram project uses Formly for exactly this) keeps it maintainable as attributes grow. Group fields, conditional visibility, and inline validation messages belong here.

---

## 13. BPMN 2.0 XML interchange (import/export) ❌

**Description.** We persist an ng‑diagram model. Real BPMN portability means reading/writing **BPMN 2.0 XML** — both the semantic model *and* `BPMNDI` (diagram interchange: positions, sizes, waypoints). This is what lets a diagram move to/from Camunda, Signavio, etc.

**Instructions.**
1. A serialization layer mapping our domain model ↔ BPMN XML (semantic elements) + a DI mapper for geometry.
2. Only worth it if interop is a goal; it's a sizable, self‑contained module and brings Tier‑0 schema validation with it. Decide explicitly.

---

## 14. Editor UX (table stakes for "full") 🟡

| Capability | Status | Instruction |
|---|---|---|
| Palette drag‑drop | ✅ | done |
| Auto‑layout | ✅ | per‑lane elkjs; extend to subprocesses/nested pools |
| Theming / dark mode | ✅ | done |
| Inline rename | 🟡 | tasks only; extend to all labeled elements |
| Multi‑select + box‑select | ❓ | ng‑diagram supports; wire up + group ops |
| Copy / paste / duplicate | ❌ | clipboard over the model |
| Undo / redo | ❌ | check ng‑diagram history support; else command stack |
| Align / distribute | ❌ | selection ops |
| Context menu | ❌ | right‑click actions (change type, attach event, delete) |
| Minimap + zoom controls | 🟡 | ng‑diagram provides a minimap component; add toolbar |
| Keyboard shortcuts | ❌ | delete, copy, nudge, rotate |
| Accessibility | ❌ | focus, ARIA, keyboard reachability |

---

## 15. Validation ❌
Its own workstream — see **[bpmn-validation-findings.md](bpmn-validation-findings.md)**. Depends on §8 (domain model) and §5 (real pools).

---

## 16. Diagram types beyond a process (scope note)

BPMN 2.0 also defines three other diagram kinds. These are **likely out of scope** unless explicitly wanted — flag as a deliberate boundary:
- **Collaboration** — multiple pools exchanging messages (partially reachable once §5 lands).
- **Choreography** — message‑exchange‑centric diagrams with their own shapes.
- **Conversation** — high‑level communication overview.

---

## Suggested phasing

A pragmatic order that maximizes "feels complete" per unit of effort:

- **Phase 1 — Rich elements (data‑driven).** Task types + markers, all gateway types, common event definitions (message/timer/error/terminate), conditional & default flows. Mostly `data` fields + `@switch` glyphs in the existing components. High visual payoff, low structural risk.
- **Phase 2 — Real containers.** Promote pools/lanes to participants; embedded subprocess with expand/collapse; boundary events. This is the big structural lift and unlocks collaboration + validation.
- **Phase 3 — Configuration & correctness.** Properties panel; sequence‑flow conditions; Tier‑1/Tier‑2 validation with explain‑and‑fix UX (per the validation doc).
- **Phase 4 — Data & artifacts.** Data objects/stores, data associations, text annotations, visual groups.
- **Phase 5 — Interop & polish.** BPMN XML import/export; undo/redo, copy/paste, align, context menu, a11y.
- **Later / optional.** Full soundness analysis; choreography & conversation diagrams.

**Bottom line.** The shapes are the visible 20%. The 80% that actually separates a demo from a product is the connective tissue: a real domain model, pools as participants, boundary‑event attachment, subprocess nesting, a properties panel, and validation. The good news is that our single‑component, data‑driven rendering approach and ng‑diagram's group model make Phase 1 cheap and Phase 2 tractable — the two places where generic BPMN toolkits tend to get stuck.

## Sources
- [BPMN 2.0 element reference — Camunda](https://camunda.com/bpmn/reference/)
- [Learning BPMN Events — Visual Paradigm](https://www.visual-paradigm.com/guide/bpmn/bpmn-events/)
- [Interrupting vs non‑interrupting events — Modern Analyst](https://www.modernanalyst.com/Careers/InterviewQuestions/tabid/128/ID/2555/What-is-the-difference-between-an-interrupting-event-and-non-interrupting-event-in-BPMN.aspx)
- OMG BPMN 2.0 specification (element taxonomy, connection rules, DI)
