## 2023-11-10 - BotEngine frame rendering optimization
**Learning:** `bodyPath` calculates vertices of a squircle involving heavy pow/sin/cos calculations within `requestAnimationFrame` context (typically 60 times a second). Since the base variables are loop dependent and constant, recomputing them dynamically is wasteful.
**Action:** Extract loop-dependent static data into typed arrays (Float64Array) via a static class cache variable for quick lookup.
