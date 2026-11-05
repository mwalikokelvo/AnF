# Verification Skill: UI & Feature Validation

## Required Execution Flow
1. Start the local server/build environment (e.g., `npm run dev` or Windows build command).
2. Launch the desktop browser/app automation tool.
3. Execute the interaction path step-by-step:
   - Navigate to the affected view/route.
   - Trigger the modified component/action.
4. Capture proof:
   - Take full-page screenshots showing before and after states.
   - Save artifacts to `.cursor/verification-artifacts/`.
   - Embed screenshots directly in the PR summary.
5. Exit with status 0 only if all acceptance criteria pass.
