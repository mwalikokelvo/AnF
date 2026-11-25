/**
 * Concept Simulator & Socratic Tutor for AnF & ThingsBook
 * 
 * Compiles dynamic, interactive HTML5/Canvas mental models and Socratic
 * guided inquiry directly from reading passages or essay drafts.
 * Inspired by THU-MAIC/OpenMAIC + luwill/research-skills.
 */

export interface SimulatorVariable {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export interface ConceptSimulation {
  title: string;
  description: string;
  variables: SimulatorVariable[];
  htmlWidget: string;
}

export interface SocraticDialogue {
  targetConcept: string;
  foundationalQuestion: string;
  counterInquiry: string;
  reflectionHints: string[];
}

export const ConceptSimulatorCore = {
  /**
   * Detect whether a passage describes a dynamic mathematical or quantitative system.
   */
  detectSimulatableConcept(text: string): 'exponential_growth' | 'equilibrium' | 'oscillation' | null {
    const lower = String(text || '').toLowerCase();
    if (/\b(exponential|compound|half-life|decay|retention curve|population growth)\b/.test(lower)) {
      return 'exponential_growth';
    }
    if (/\b(equilibrium|supply and demand|market clearing|balance of power)\b/.test(lower)) {
      return 'equilibrium';
    }
    if (/\b(oscillation|pendulum|wave|frequency|cycle|feedback loop)\b/.test(lower)) {
      return 'oscillation';
    }
    return null;
  },

  /**
   * Build a self-contained interactive Canvas widget with live controls.
   */
  generateSimulation(type: 'exponential_growth' | 'equilibrium' | 'oscillation', title?: string): ConceptSimulation {
    if (type === 'exponential_growth') {
      const variables: SimulatorVariable[] = [
        { id: 'rate', label: 'Growth Rate (r)', min: 0.01, max: 0.5, step: 0.01, value: 0.1, unit: '%' },
        { id: 'initial', label: 'Initial Value (P0)', min: 1, max: 100, step: 1, value: 10 },
        { id: 'steps', label: 'Time Horizon (t)', min: 5, max: 50, step: 1, value: 25, unit: 'steps' }
      ];

      const htmlWidget = `
<div class="sim-container" style="font-family:sans-serif;padding:12px;background:#18181b;color:#f4f4f5;border-radius:8px;">
  <h4 style="margin:0 0 8px;">${title || 'Exponential Dynamic Simulator'}</h4>
  <canvas id="simCanvas" width="400" height="200" style="background:#09090b;border-radius:4px;display:block;width:100%;max-width:400px;"></canvas>
  <div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
    <label>Rate: <input type="range" id="sim_rate" min="0.01" max="0.5" step="0.01" value="0.1"></label>
    <label>Initial: <input type="range" id="sim_init" min="1" max="100" step="1" value="10"></label>
  </div>
</div>`;

      return {
        title: title || 'Exponential Growth / Decay Simulator',
        description: 'Interactive simulation demonstrating compound scaling over time.',
        variables,
        htmlWidget,
      };
    }

    // Default oscillation
    const variables: SimulatorVariable[] = [
      { id: 'frequency', label: 'Frequency (f)', min: 0.5, max: 5.0, step: 0.1, value: 1.0, unit: 'Hz' },
      { id: 'damping', label: 'Damping Factor (d)', min: 0, max: 0.5, step: 0.02, value: 0.05 }
    ];

    const htmlWidget = `
<div class="sim-container" style="font-family:sans-serif;padding:12px;background:#18181b;color:#f4f4f5;border-radius:8px;">
  <h4 style="margin:0 0 8px;">${title || 'Harmonic Oscillation Simulator'}</h4>
  <canvas id="simCanvas" width="400" height="200" style="background:#09090b;border-radius:4px;display:block;width:100%;max-width:400px;"></canvas>
</div>`;

    return {
      title: title || 'Harmonic Oscillation Simulator',
      description: 'Interactive simulation demonstrating cyclical waves and damping.',
      variables,
      htmlWidget,
    };
  },

  /**
   * Structure a Socratic inquiry session instead of direct answers.
   */
  createSocraticInquiry(concept: string, passageText: string): SocraticDialogue {
    const clean = passageText.slice(0, 300);
    return {
      targetConcept: concept,
      foundationalQuestion: `What underlying assumptions must hold for "${concept}" to remain valid in: "${clean}"?`,
      counterInquiry: `If we inverted the primary variable in this passage, what secondary consequences would immediately follow?`,
      reflectionHints: [
        'Consider the boundary conditions where this claim fails.',
        'Distinguish between direct causation and concurrent correlation.',
        'Evaluate how feedback delays alter the outcome over time.'
      ]
    };
  }
};
