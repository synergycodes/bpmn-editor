# BPMN validation — findings & scope analysis

*Internal planning note. What it would take to add diagram validation to the editor: how the problem is layered, how many rules are actually involved, and what our current app is missing beyond its small node set. No implementation — scope only.*

## TL;DR

Building a *validator* is not one project — it's three, stacked, with sharply different cost curves. The cheap tier (connection / well‑formedness rules) is a couple of weeks and would make the editor feel smart. The expensive tier (behavioral soundness — deadlocks / livelocks) is a research‑grade problem; doing it *well* (fast + human‑readable + one‑click fix) is literally a 2024 paper, not a sprint. The real prerequisite for any of it is a **semantic model we don't currently have** — today our diagram is a visual graph, not a BPMN process. The gap that matters most is not the number of node types.

---

## The four tiers of BPMN validation

Validation isn't a single thing. The spec and the mature tools separate cleanly into levels, and the effort roughly **10×'s per level**.

### Tier 0 — Schema / XSD
Does the BPMN XML conform to the OMG schema. Only relevant if we import/export real `.bpmn` files. We store an ng‑diagram model instead, so this is **N/A** unless interchange becomes a goal.

### Tier 1 — Connection & meta‑model well‑formedness
The spec's *Sequence Flow Connection Rules* and *Message Flow Connection Rules* tables — which element type may connect to which. Effectively a ~10×10 source→target matrix that collapses to **~15–25 practical rules**. Examples:

- A start event has no incoming flow; an end event has no outgoing flow.
- A sequence flow's endpoints must both be flow nodes.
- **A sequence flow may cross lanes but never a pool boundary.**
- **A message flow must cross pools and may never connect two objects in the same participant.**
- A start event can't be a message‑flow source; an end event can't be a message‑flow target.

**Local, deterministic, cheap.** This is the "syntax is easy" half of the problem.

### Tier 2 — Process‑level structure & cheap anti‑patterns
Graph‑reachability checks over the whole process. This is where **bpmnlint** lives — its current rule set is **~25 concrete rules**, e.g. `start-event-required`, `end-event-required`, `no-disconnected`, `no-implicit-split` (a task with two outgoing flows instead of a gateway), `no-implicit-end`, `fake-join`, `superfluous-gateway`, `conditional-flows` (a diverging XOR/OR needs conditions), `single-blank-start-event`.

Moderate difficulty. Crucially, a *few* Tier‑2 checks catch a big share of real breakage — the classic **AND‑split → XOR‑join** mismatch (the schematic in the research brief) is a cheap structural pattern that flags a large fraction of deadlocks **without any token analysis**.

### Tier 3 — Behavioral soundness
The three sub‑properties:

1. **Option to complete** — no deadlock; every instance can finish.
2. **Proper completion** — no leftover tokens / multi‑merge.
3. **No dead activities** — every activity is reachable in some run.

Requires mapping the diagram to a Petri net / workflow graph and exploring the state space (Woflan, LoLA, SESE decomposition). This is the "semantics is hard" half. It is **not a list of rules** — it's an analysis engine. The frontier result (*BPMN Analyzer 2.0*) proves it can run in <500 ms on 4,000+ element models with interactive counterexamples and fixes, but that's years of specialist work, and it's the moat precisely because it's hard.

### Scope table

| Tier | What it catches | ~Rules / effort | Difficulty |
|---|---|---|---|
| 0 · Schema | Malformed XML | N/A (no XML today) | trivial-if-needed |
| 1 · Connections | Illegal links, pool/lane crossing | ~15–25 rules · days–2 wks | low (deterministic) |
| 2 · Structure | Missing start/end, disconnected, implicit gateways, AND/XOR mismatch | ~25 rules · 2–4 wks | moderate (graph algos) |
| 3 · Soundness | Deadlock, livelock, dead tasks, multi‑merge | engine, not rules · months | hard (state-space / research) |

A genuinely useful validator is **Tiers 1–2 (~40–60 rules)** plus a decision about how far into Tier 3 to go. Tiers 1–2 are roughly **80% of the perceived "it catches my mistakes" value for ~20% of the cost.**

### Why it matters in practice
From the industrial dataset in the research brief (585 real models): **22% contained deadlocks, 42% had faulty (multi‑)merges.** These errors are common, not exotic — but the tools that detect them usually report an internal state‑space counterexample, which is useless to the person who just wants to know which box to click. That presentation gap is the opportunity, not the detection itself.

---

## What our app is currently missing (beyond the small node set)

The node subset is the least of it. The real gaps are structural, and they're prerequisites — you can't write rules against a model that doesn't carry the information.

1. **A semantic model, separate from the visual one.** Today a node is a `type` string plus `data.kind` of `'event' | 'task' | 'gateway'`, and an edge is `data.kind` of `'sequence' | 'message' | 'association'`. That's a *drawing*, not a process. Validation needs real attributes: event trigger + throw/catch (none/message/timer/error…), gateway **direction** (diverging vs converging) and type, activity markers (loop, multi‑instance, subprocess/call), sequence‑flow **conditions** and **default** flow, and containment (which process / pool / subprocess each node belongs to). This model is arguably a bigger lift than the rules, because every rule reads from it.

2. **Pools as participants, not cosmetic groups.** Our swimlanes are ng‑diagram groups with a label and an order — pure visuals. The single most characteristic BPMN rule set ("sequence stays inside a pool, messages cross pools") is *unwriteable* until a swimlane is a participant that owns a process. This also ties back to the swimlane layout logic we already special‑cased.

3. **A validation engine + rule registry.** None today. The only enforcement is `validateConnection` blocking a swimlane as a connection endpoint, and `finalEdgeDataBuilder` stamping every drawn edge as a sequence flow. There's no rule pipeline, no run‑on‑change, no result model.

4. **Connection‑rule enforcement.** Beyond the swimlane block, anything connects to anything. No Tier‑1 matrix at all.

5. **An error model + surfacing UX — the actual differentiator.** A marker on the *specific* offending element, a plain‑language sentence ("this AND‑split has no matching join — one branch will hang"), and a one‑click fix. We have zero of this. It's the highest‑value / lowest‑commodity work: Tiers 1–2 detection is commodity, but *comprehensible + fixable* presentation is not.

6. **Soundness analysis.** Nonexistent, hardest, optional depending on ambition.

7. **Supporting elements that carry rules (not just shapes).** Default / conditional flows, boundary events, subprocess start/end, data objects / associations. Some overlap with "more node types," but the point is they bring *constraints* — adding the shape without the rule is half a feature.

8. **BPMN 2.0 interchange (XML).** We persist an ng‑diagram model, not BPMN XML. If interop with Camunda or other engines ever matters, that's a separate serialization layer (and Tier‑0 schema validation comes with it).

---

## Recommended sequencing

The order that de‑risks the effort:

1. **Model refactor first** — promote swimlanes to participants and give elements real BPMN attributes. Unlocks everything else and is the true long pole.
2. **Tier‑1 connection rules** — cheap, deterministic, immediately makes the editor feel intelligent (and hardens the AI‑generation path).
3. **Error / quick‑fix UX on a handful of high‑value Tier‑2 checks** — start/end required, disconnected, AND‑split → XOR‑join. The demo‑able differentiator; catches a disproportionate share of real deadlocks *without* Tier 3.
4. **Tier‑3 soundness** only if it becomes the product thesis — and there, seriously consider wrapping / porting an existing analyzer rather than building state‑space exploration from scratch.

**Net:** a credible validator is a few weeks of work if we stop at Tiers 1–2 with good error UX; it becomes a multi‑month, specialist effort the moment "guarantee no deadlocks" is a requirement. The gap that matters most isn't the number of node types — it's that we have a *picture* of a process, not a *model* of one.

---

## Sources

- [bpmnlint — rules directory](https://github.com/bpmn-io/bpmnlint/tree/main/rules) · [bpmn.io — validate with bpmnlint](https://bpmn.io/blog/posts/2018-bpmnlint.html)
- [BPMN sequence vs message flow rules — Visual Paradigm](https://www.visual-paradigm.com/support/documents/vpuserguide/2821/286/56998_sequenceandm.html)
- [Message Flow connection rules — Bizagi](https://help.bizagi.com/platform/en/message_flow_connection_rules.htm)
- [Instantaneous, Comprehensible, and Fixable Soundness Checking of Realistic BPMN Models — arXiv 2407.03965](https://arxiv.org/abs/2407.03965)
- [BPMN Analyzer 2.0 — arXiv 2408.06028](https://arxiv.org/html/2408.06028v1)
- Research brief: *BPMN. Gdzie boli i gdzie jest miejsce dla ngDiagram* (internal) — industrial-model error rates (22% deadlocks, 42% multi‑merge across 585 models), vocabulary-usage data.
