# Kevo roll_dice

New offline action for Kevo (formerly JARVIS).

Say "roll a die", "roll 2d20" or similar.

- Default: 1d6
- count: 1-10
- sides: 2-100

Fully offline, no network, no new dependencies.

Tests in windows/tests/kevo-dice.test.ts.

The action is defined in kevo-actions.ts (to be restored/patched on this branch).
