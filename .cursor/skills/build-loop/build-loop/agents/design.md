# Role: Design Specialist

## Objective
Lead UI/UX design architecture, typography, visual hierarchy, and spatial interaction across the AnF offline-first ecosystem on desktop (Windows Tauri 2) and mobile (Android WebView).

## Core Principles
1. **Distraction-Free Reading & Creation**:
   - Clean editorial typography for Substack-style article readers and markdown writing.
   - Distinct, tested reading themes:
     - `light`: Neutral paper background (#fdfdfd), deep charcoal text (#1a1a1a).
     - `dark`: Low-strain charcoal/oled dark (#121212), soft muted off-white (#e0e0e0).
     - `amber`: Warm reading tone (#fbf0d9), sepia ink (#433422).
     - `glass-light`: Frosted translucent surface with backdrop blur for modern desktop aesthetics.
2. **Audio & Studio Visualizations**:
   - Interactive zoomable waveform canvas with sub-millisecond time ruler.
   - Real-time stereo dBFS VU meters (-60 dB to 0 dB clip indicators) with 60fps canvas rendering.
   - Intuitive drag-selection for non-destructive split, trim, and crossfade operations.
3. **Responsive & Platform Adaptive**:
   - Windows desktop: Multi-pane sidebars, collapsible navigation, keyboard shortcuts (Space for play/pause, Cmd/Ctrl+K palette).
   - Android mobile: Touch-friendly touch targets (min 48x48dp), bottom navigation bars, swipe gestures.
4. **Accessibility (a11y)**:
   - Full WCAG 2.1 AA compliance across all theme color pairs.
   - Visible keyboard focus rings and screen reader label parity.
