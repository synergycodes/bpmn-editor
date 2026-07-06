# How to build a BPMN editor in Angular (and the parts nobody warns you about)

*Adding process modeling to a product sounds like a one-sprint job. Here's what actually happens, and how I ended up doing it with ngDiagram.*

---

It usually starts with a sentence in a planning meeting: *"Can we let users draw their own process here? Something like BPMN."*

Everyone nods. BPMN is a standard, there are open-source libraries, how hard can it be. You spin up a spike, drop in the obvious library, and by Thursday you have boxes and arrows on a canvas. Looks like a win.

Then the real requirements show up. The diagram has to live *inside* your app, match your design system, survive a diagram with a couple hundred nodes, arrange itself when it gets messy, and — the one that always lands late — tell the user *why* their process is broken in a way they can fix without a PhD in workflow theory.

That's the gap between "render BPMN" and "ship a BPMN editor." I spent the last stretch building exactly this in Angular, and I want to walk through where it gets hard and the decisions that actually mattered.

## Why BPMN is deceptively expensive to embed

BPMN was designed to be two things at once: readable enough for business people, precise enough to describe real process logic. Those goals pull in opposite directions, and most of the pain downstream traces back to that tension. A few things you run into fast:

**The notation is enormous, and you don't need most of it.** BPMN 2.0 has 85+ graphical elements. Dozens of event variants alone. But study after study of real-world models shows the same thing: fewer than 20% of the vocabulary gets used, the average diagram leans on about nine constructs, and only four or five are common across models. The distribution is basically Zipf's law — a handful of shapes do all the work and a long tail shows up almost never. So the "complete" palette with 50 icons isn't a feature. It's the wall a new user bounces off.

**Swimlanes break the flat model.** The moment you introduce pools and lanes — and roughly a third of real diagrams do — you're no longer in flat node-and-edge land. Nodes belong to a container, they have to move with it, resize with it, and stay aligned. That's a genuinely different data model, and a lot of "quick" diagramming setups fall over here.

**Generated or hand-edited diagrams turn into spaghetti.** A diagram you can't read is a diagram you can't validate. Auto-layout is the fix, but generic hierarchical layout (think plain dagre) doesn't know what a pool is, or that BPMN wants a consistent left-to-right flow with orthogonal routing and as few edge crossings as possible. You need layout that respects the domain.

**Validation is where tools quietly give up.** Catching syntax problems is easy — a missing arrow, two start events, a dangling connection. Every tool does that. The hard part is *semantic* soundness: deadlocks, bad merges, branches that can never complete. In one analysis of 585 industrial models, 22% contained deadlocks and 42% had faulty merges. Those aren't exotic. And the tools that do detect them tend to report the problem as an internal state-space counterexample — technically correct, completely useless to the person who just wants to know which box to click.

**And then there's the tooling tax.** Which deserves its own section, because it's usually the thing that makes teams go looking for alternatives in the first place.

## The bpmn-js reality check

If you search "BPMN library," you land on [bpmn-js](https://bpmn.io/) almost immediately. It's the de facto open-source standard, it's genuinely good at what it does, and for a lot of use cases it's the right call. It reads and writes real BPMN 2.0 XML out of the box, which is not nothing.

But there are three things worth knowing before you commit, especially for a commercial product:

1. **The watermark is not optional.** The [bpmn.io license](https://bpmn.io/license/) requires that the "powered by bpmn.io" logo stays visible on every rendered diagram, and the code that displays it can't be removed or modified. Teams have asked for a commercial exception. As far as I can tell, it has never been granted. If your product is white-labeled or sold to enterprises that care about branding, that's a hard conversation.
2. **Deep customization fights you.** The extension model is fine for shallow tweaks and painful for anything structural. Ask anyone who's tried to add custom collapse/expand behavior. The advanced-customization docs are thin, and there's no paid support tier to fall back on — you're reading source and forum threads.
3. **It's framework-agnostic, which in an Angular app means "you wrap it."** You end up bridging its internal event model into Angular's world, and the two never quite feel like one thing.

None of this makes bpmn-js bad. It makes it a specific trade: you get standards compliance and BPMN semantics for free, and you pay for it in branding constraints and a customization ceiling. GoJS and JointJS sit at the other end — mature, powerful, well-documented, but commercially licensed and, again, not Angular-native. You're building BPMN on top of a general canvas either way.

Which is the realization that reframed the whole thing for me: **for an embedded, branded editor, the "BPMN library" is often less important than the "diagramming foundation."** Once you accept that you're going to own the BPMN semantics anyway, the question becomes: what gives me the best canvas to build on, in the framework I already use?

## Where ngDiagram fit the problem

I went with [ngDiagram](https://www.ngdiagram.dev/), an open-source (Apache 2.0) diagramming library that's built specifically for Angular — signals, standalone components, custom templates, no external dependencies. I'm not going to pretend it's a magic BPMN button; it isn't one, and I'll get to that. But for this particular problem it lined up well, and here's concretely why.

**Nodes are just Angular components.** Every BPMN element — start/end events as circles, tasks as rounded rectangles, gateways as diamonds — is a normal standalone component with its own template and styles. That sounds mundane until you've fought a canvas library's shape DSL. Want the task label to be editable inline, or the gateway to be an SVG polygon so it stays a crisp square? It's just Angular. Theming and dark mode fall out of CSS variables, the same tokens the rest of the app uses.

**Swimlanes map cleanly onto groups.** ngDiagram has a first-class group concept: a node can be a group, and other nodes reference it as their parent. That's exactly the pool/lane model — children track the container, membership updates when you drag a node across, and you get drop-zone highlighting for free. I still had to write the logic for keeping lanes the same width and re-stacking them so they don't overlap, but I was writing *business rules*, not fighting the rendering layer.

**Layout is bring-your-own, which is the point.** There's no built-in auto-layout, and I've come around to seeing that as a feature. I ran [elkjs](https://github.com/kieler/elkjs) with its layered algorithm, but scoped per lane — only the sequence flows inside a lane feed the layout, so a message flow crossing between pools doesn't distort anything. Then I write the computed positions back through the model and resize the lanes to fit. Generic auto-layout couldn't have known those rules; because layout was mine to define, the BPMN-specific behavior was straightforward.

**No watermark, full control of the render.** This is the direct counter to the bpmn-js licensing issue. The canvas is mine. It looks like the product, not like a third party's demo.

A rough sense of the shape, not the whole thing:

```ts
// A palette item is just a typed node; a swimlane is a node flagged as a group
{ type: 'bpmn-task', data: { label: 'Review', kind: 'task' } }
{ type: 'bpmn-swimlane', isGroup: true, data: { label: 'Finance' } }

// Elements render through your own Angular components, keyed by type
new NgDiagramNodeTemplateMap([
  ['bpmn-task', BpmnNodeComponent],
  ['bpmn-swimlane', SwimlaneNodeComponent],
]);
```

The interesting work wasn't the API calls. It was deciding that only "real" sequence flows should influence layout, that lanes resize to their content, that a node moving between lanes shouldn't leave the diagram overlapping. That logic is the actual product, and having a canvas that stayed out of the way made it writable.

## An honest comparison

No library wins on every axis. Here's how I'd actually lay it out for the specific job of *embedding a custom, branded process editor in an Angular product*:

| | **ngDiagram** | **bpmn-js** | **GoJS** | **JointJS** |
|---|---|---|---|---|
| **BPMN out of the box** | No — you model it yourself | Yes — full BPMN 2.0 XML round-trip | No — BPMN samples, not a product | BPMN shapes in the paid tier |
| **Framework fit (Angular)** | Native (signals, components) | Wrap it yourself | Wrap it yourself | Wrap it yourself |
| **Licensing / branding** | Apache 2.0, no watermark | Free, but mandatory bpmn.io watermark | Commercial license | Open core; advanced/BPMN is commercial |
| **Customization ceiling** | High — nodes are your components | Medium — extension model, then friction | High — but its own shape model | High — but its own shape model |
| **Maturity / ecosystem** | Younger, smaller | Large, BPMN-focused | Large, general-purpose | Large, general-purpose |
| **Best when…** | You want a branded, custom editor in Angular | You need standard BPMN import/export fast | You need heavy general diagramming + support | You want SVG diagramming with commercial support |

Read that table honestly and the answer is "it depends," which is the correct answer. If what you need is to import a `.bpmn` file, let people tweak it, and export valid XML for an execution engine — bpmn-js will get you there faster than anything, watermark and all. If you're doing large-scale general diagramming and want a vendor to call, GoJS and JointJS have earned their reputations.

Where ngDiagram pulls ahead is a narrower but very common spot: you're in an Angular app, the editor has to feel like *your* product, you're going to define your own subset of BPMN and your own rules anyway, and you'd rather not ship someone else's logo or pay per seat to do it. For that job it's the least friction I've found. Not because the others are bad — because they're solving a slightly different problem.

## The trade you're actually making

To keep this fair: choosing a general Angular diagramming library over a dedicated BPMN library means **you own the BPMN parts.** The semantics, the validation rules, the XML serialization if you need it — that's on you. ngDiagram hands you an excellent canvas and stays out of the way; it does not hand you a BPMN engine.

For my case that was the right trade, because the value was in the *embedded, on-brand, Angular-native* experience and in the specific rules we wanted to enforce — not in standards-body XML compliance. If your value is the opposite, weight the table differently. Either way, the useful move is to name which half of the problem is actually yours before you pick the tool. Most of the frustration I've seen comes from teams reaching for a full BPMN platform when they needed a canvas, or hand-rolling a canvas when they needed the standard.

If you want to see the group/swimlane and per-lane layout approach in a running app, it works well as a starting template rather than a from-scratch build — which is roughly how mine began.

---

*If you've embedded a diagram editor in a product, I'm curious where your pain landed — the notation, the layout, the licensing, or the validation. That last one is a rabbit hole worth its own article.*

<br>

---
---

## Appendix — future articles in this series *(internal planning note, not for publication)*

Same shape as this piece: lead with a concrete business problem a mid/senior dev would recognize, then show how ngDiagram addresses it. Ordered roughly by how strongly they map to real pain from the BPMN research and to things the library is genuinely good at.

1. **"Validation your users can actually act on."** Business problem: your editor flags errors as cryptic messages nobody can fix, so support tickets pile up. Angle: inline, explain-and-fix validation — a red dot on the exact gateway, a plain-English sentence, and a one-click fix — instead of a model-checker counterexample. (Maps to P4/W2; the highest-differentiation topic.)

2. **"Auto-layout that doesn't produce spaghetti."** Business problem: generated or user-edited diagrams become unreadable, so nobody trusts them. Angle: pairing elkjs with domain rules, and why generic hierarchical layout isn't enough for containers/lanes. (P5/W3.)

3. **"Swimlanes, pools, and nested containers without losing your mind."** Business problem: the flat node-edge model breaks the moment structure appears. Angle: modeling hierarchy with groups, membership on drag, resize-to-content. (P6 data model.)

4. **"From LLM output to a diagram that isn't broken."** Business problem: you let AI generate the process, and half the results are structurally invalid. Angle: a validation harness that intercepts model output, enforces rules, and drives a self-correction loop. (P7 — strong given the current AI wave.)

5. **"Building an org-chart / hierarchy editor in Angular."** Business problem: HR/people tooling needs editable hierarchies, and spreadsheets don't cut it. Angle: tree layout, collapse/expand, drag-to-reparent. (Leans on existing org-chart work.)

6. **"Single-line diagrams and technical schematics in the browser."** Business problem: engineering domains need precise, connection-aware diagrams that generic tools can't express. Angle: custom node geometry, ports, orthogonal routing, clean SVG export. (Leans on existing SLD/circuit work.)

7. **"A workflow / automation builder your non-devs can use."** Business problem: every SaaS eventually wants a visual "if this then that." Angle: node palette, typed ports, connection validation, runtime handoff.

8. **"Export a diagram to clean SVG/PNG for reports and docs."** Business problem: people need to share and print diagrams outside the app. Angle: editable, on-brand exports rather than DOM screenshots.

9. **"White-labeling a diagram editor: theming and dark mode with design tokens."** Business problem: the editor has to match every customer's brand. Angle: CSS-variable theming, light/dark, no third-party watermark.

10. **"Migrating off GoJS / mxGraph to an open-source Angular stack."** Business problem: license costs or a deprecated dependency (mxGraph is archived) force a move. Angle: what maps over cleanly, what you rebuild, how to de-risk it.

11. **"Rendering large diagrams without the canvas melting."** Business problem: performance falls apart at hundreds of nodes. Angle: virtualization, measured rendering, what to avoid.

12. **"Real-time collaborative diagram editing in Angular."** Business problem: two people open the same process and clobber each other. Angle: a CRDT/Yjs adapter over the diagram model.
