# Reporting Checklists

The binding checklist is chosen at intake (Phase 1) and worked item-by-item at
Phase 5. A reporting checklist is a **conduct-and-reporting contract**: if the
work itself lacks a required item (e.g., no external validation), the paper
must *say so* in Limitations — the checklist is not satisfied by silence.

## Selection table

| Study type | Checklist | Use it for |
|---|---|---|
| Medical imaging AI (any ML on medical images) | **CLAIM 2024** (Checklist for AI in Medical Imaging) | Development, testing, reporting of imaging-AI; supersedes CLAIM 2015 |
| Clinical prediction / risk model | **TRIPOD+AI** (2024) | Model development & evaluation; registration if prospective |
| Observational (cohort/case-control/cross-sectional) | **STROBE** | Any non-interventional human-subjects study |
| Diagnostic accuracy study | **STARD 2015** | Test-vs-reference comparison studies |
| Randomized trial | **CONSORT** (→ usually out of scope for this skill; be honest) | Interventions |
| CS venue (CVPR/NeurIPS/ICLR…) | Venue reproducibility statement + checklist | Code/data availability, compute, seeds |

Related-work corpus building is NOT this skill's job — lit-search owns it
(measurable recall, PRISMA counts if a defensible corpus claim is needed).

## How to run the pass (Phase 5)

1. Fetch the official checklist (record version + URL in `paper_plan.md`) —
   do not reconstruct from memory.
2. Make a two-column table: checklist item → manuscript location (section,
   paragraph) or **"not applicable because…"** / **"absent — must be disclosed
   in Limitations"**.
3. Absent-and-required items resolve in one of exactly three ways: add the
   reporting, add the disclosure, or the user explicitly accepts the gap
   (recorded in `paper_plan.md`).
4. Save the completed table next to the draft (`checklist_<name>.md`) — many
   journals want it at submission.

## Items that fail silently (watch for these)

- **Data provenance:** source, licensing/consent basis, and any preprocessing
  that could leak across splits.
- **Split discipline:** train/val/test separation unit (patient, not image),
  external-test set or the explicit absence of one.
- **Reference standard:** who defined ground truth, with what qualifications,
  and its own error characteristics.
- **Failure and subgroup analysis:** performance where the model is weakest,
  not just the headline Dice/AUC.
- **Compute/reproducibility:** hardware, seeds, code availability — CS venues
  increasingly gate on this.
- **Human/animal oversight:** IRB/ethics approval or exemption statement.
