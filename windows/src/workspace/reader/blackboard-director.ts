/**
 * Blackboard / Chalkboard SVG Stage Director
 * 
 * Generates synchronized chalkboard visual cues, diagrams, and connecting arrows
 * timed to speech turns in classroom debates or audiobook lectures.
 * 
 * Inspired by THU-MAIC/OpenMAIC multi-modal stage direction and chalkboard scripts.
 */

export interface ChalkboardElement {
  id: string;
  type: 'title' | 'concept_box' | 'arrow' | 'underline';
  timestampSec: number;
  speaker: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  targetId?: string;
}

export class BlackboardDirector {
  private elements: ChalkboardElement[] = [];

  public addElement(elem: ChalkboardElement): void {
    this.elements.push(elem);
    this.elements.sort((a, b) => a.timestampSec - b.timestampSec);
  }

  /**
   * Automatically parses dialogue turns and generates synchronized chalkboard elements
   */
  public generateFromDialogueTurns(turns: Array<{ speaker: string; text: string; startSec: number }>): ChalkboardElement[] {
    const generated: ChalkboardElement[] = [];
    let currentY = 80;

    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i];
      const headingMatch = turn.text.match(/(?:topic is|focus on|let's discuss|consider)\s+([^.!?]+)/i);
      if (headingMatch && i === 0) {
        generated.push({
          id: 'bb_title',
          type: 'title',
          timestampSec: turn.startSec,
          speaker: turn.speaker,
          x: 40,
          y: 40,
          text: headingMatch[1].trim().toUpperCase()
        });
      }

      // Concept box from key nouns
      const words = turn.text.split(/\s+/).filter(w => w.length > 5);
      const mainConcept = words[0] || 'Concept';

      const boxId = 'bb_box_' + i;
      generated.push({
        id: boxId,
        type: 'concept_box',
        timestampSec: turn.startSec + 1.5,
        speaker: turn.speaker,
        x: 60 + (i % 2) * 200,
        y: currentY,
        width: 160,
        height: 60,
        text: mainConcept
      });

      if (i > 0) {
        generated.push({
          id: 'bb_arrow_' + i,
          type: 'arrow',
          timestampSec: turn.startSec + 2.5,
          speaker: turn.speaker,
          x: 140,
          y: currentY - 20,
          targetId: boxId,
          text: 'leads to'
        });
      }

      currentY += 90;
    }

    this.elements = generated;
    return generated;
  }

  /**
   * Compiles the chalkboard state at a given playback timestamp into clean SVG
   */
  public renderSvgAtTime(timeSec: number, width = 600, height = 400): string {
    const activeElements = this.elements.filter(e => e.timestampSec <= timeSec);

    const parts: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
      `<style>
        .board-bg { fill: #1c2826; }
        .chalk-text { fill: #f3f4f6; font-family: 'Comic Sans MS', cursive, sans-serif; font-size: 16px; }
        .chalk-title { fill: #fef08a; font-family: sans-serif; font-weight: bold; font-size: 20px; }
        .chalk-box { fill: none; stroke: #e5e7eb; stroke-width: 2; stroke-dasharray: 6,4; }
        .chalk-arrow { stroke: #38bdf8; stroke-width: 2.5; fill: none; marker-end: url(#arrowhead); }
      </style>`,
      `<defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#38bdf8" />
        </marker>
      </defs>`,
      `<rect width="${width}" height="${height}" rx="8" class="board-bg" stroke="#78350f" stroke-width="8" />`
    ];

    for (const elem of activeElements) {
      if (elem.type === 'title') {
        parts.push(`<text x="${elem.x}" y="${elem.y}" class="chalk-title">${elem.text}</text>`);
      } else if (elem.type === 'concept_box') {
        parts.push(`<rect x="${elem.x}" y="${elem.y}" width="${elem.width || 150}" height="${elem.height || 50}" rx="6" class="chalk-box" />`);
        parts.push(`<text x="${elem.x + 12}" y="${elem.y + 32}" class="chalk-text">${elem.text}</text>`);
      } else if (elem.type === 'arrow') {
        parts.push(`<line x1="${elem.x}" y1="${elem.y}" x2="${elem.x + 60}" y2="${elem.y + 40}" class="chalk-arrow" />`);
      }
    }

    parts.push(`</svg>`);
    return parts.join('\n');
  }

  public getElements(): ChalkboardElement[] {
    return [...this.elements];
  }
}
