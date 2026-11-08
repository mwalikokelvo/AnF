/**
 * Storyboard & Cinematic Video Synthesis Engine (Open-Higgsfield-AI Companion)
 *
 * Provides camera trajectory motion control, scene-by-scene storyboard structuring,
 * and Higgsfield prompt serialization for AI video generation and screenplay planning.
 * Follows Ponytail Lazy Senior Dev principles: pure TypeScript, zero dependencies,
 * deterministic execution.
 */

export type ShotType = 'wide' | 'medium' | 'close-up' | 'macro' | 'pov' | 'aerial';

export type CameraMotion =
  | 'static'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'dolly-in'
  | 'dolly-out'
  | 'tracking'
  | 'orbital';

export interface SceneShot {
  id: string;
  sceneNumber: number;
  shotNumber: number;
  title: string;
  shotType: ShotType;
  cameraMotion: CameraMotion;
  motionSpeed: number; // 0.1 to 2.0, default 1.0
  durationSeconds: number; // typically 3-10s
  visualPrompt: string;
  lightingPrompt: string;
  audioPrompt: string;
}

export interface Storyboard {
  title: string;
  aspectRatio: '16:9' | '9:16' | '21:9' | '1:1';
  totalDurationSeconds: number;
  shots: SceneShot[];
}

/**
 * Formats a SceneShot into an Open-Higgsfield-AI motion-controlled diffusion prompt.
 */
export function formatHiggsfieldPrompt(shot: SceneShot): string {
  const motionTag = shot.cameraMotion === 'static'
    ? '[camera: static]'
    : `[camera: ${shot.cameraMotion}, speed: ${shot.motionSpeed.toFixed(1)}]`;

  const parts = [
    motionTag,
    `[framing: ${shot.shotType}]`,
    shot.visualPrompt.trim(),
    shot.lightingPrompt.trim() ? `lighting: ${shot.lightingPrompt.trim()}` : '',
    shot.audioPrompt.trim() ? `sfx: ${shot.audioPrompt.trim()}` : '',
  ].filter(Boolean);

  return parts.join(' | ');
}

/**
 * Analyzes unstructured text (screenplay outline, article, or narrative draft)
 * and generates a structured storyboard with dynamic cinematic camera trajectories.
 */
export function generateStoryboardFromText(text: string, title = 'Cinematic Storyboard'): Storyboard {
  const clean = text.trim();
  if (!clean) {
    return {
      title,
      aspectRatio: '16:9',
      totalDurationSeconds: 0,
      shots: [],
    };
  }

  // Split into paragraphs or scenes
  const rawSections = clean
    .split(/\n{2,}|(?=^(?:##|\d+\.|\bINT\.|\bEXT\.))/m)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const shots: SceneShot[] = [];
  const defaultMotions: CameraMotion[] = ['dolly-in', 'tracking', 'pan-right', 'orbital', 'tilt-up', 'close-up' as any];

  let sceneNum = 1;
  for (let i = 0; i < rawSections.length; i++) {
    const section = rawSections[i];
    const firstLine = section.split('\n')[0].replace(/^[#\d.\s]+/, '').trim() || `Scene ${sceneNum}`;
    const body = section.split('\n').slice(1).join(' ').trim() || section;

    // Detect framing intent
    let shotType: ShotType = 'medium';
    const lower = section.toLowerCase();
    if (lower.includes('close-up') || lower.includes('face') || lower.includes('eyes') || lower.includes('whisper')) {
      shotType = 'close-up';
    } else if (lower.includes('wide') || lower.includes('landscape') || lower.includes('city') || lower.includes('sky')) {
      shotType = 'wide';
    } else if (lower.includes('aerial') || lower.includes('drone') || lower.includes('overhead')) {
      shotType = 'aerial';
    } else if (lower.includes('pov') || lower.includes('through eyes') || lower.includes('first person')) {
      shotType = 'pov';
    } else if (lower.includes('detail') || lower.includes('macro') || lower.includes('fingerprint') || lower.includes('micro')) {
      shotType = 'macro';
    }

    // Detect camera motion
    let motion: CameraMotion = 'dolly-in';
    if (shotType === 'wide' || shotType === 'aerial') {
      motion = i % 2 === 0 ? 'dolly-in' : 'pan-right';
    } else if (shotType === 'close-up') {
      motion = i % 2 === 0 ? 'static' : 'dolly-in';
    } else if (lower.includes('run') || lower.includes('walk') || lower.includes('moving') || lower.includes('chase')) {
      motion = 'tracking';
    } else if (lower.includes('pan')) {
      motion = 'pan-left';
    } else if (lower.includes('tilt')) {
      motion = 'tilt-up';
    } else {
      motion = defaultMotions[i % (defaultMotions.length - 1)];
    }

    // Detect lighting
    let lighting = 'natural cinematic lighting, 8k resolution';
    if (lower.includes('night') || lower.includes('dark') || lower.includes('shadow')) {
      lighting = 'dramatic low-key lighting, moody shadows, rim light';
    } else if (lower.includes('sunset') || lower.includes('golden hour') || lower.includes('warm')) {
      lighting = 'golden hour sunlight, warm volumetric haze';
    } else if (lower.includes('neon') || lower.includes('cyber') || lower.includes('club')) {
      lighting = 'neon cyberpunk lighting, contrasting teal and magenta hues';
    }

    // Detect audio cue
    let audio = 'ambient atmospheric soundtrack';
    if (lower.includes('music') || lower.includes('song')) {
      audio = 'orchestral cinematic score';
    } else if (lower.includes('whisper') || lower.includes('quiet')) {
      audio = 'subtle room tone, soft breath acoustics';
    } else if (lower.includes('rain') || lower.includes('storm')) {
      audio = 'heavy rain falling, distant thunder';
    }

    shots.push({
      id: `shot-${i + 1}`,
      sceneNumber: sceneNum,
      shotNumber: i + 1,
      title: firstLine.slice(0, 60),
      shotType,
      cameraMotion: motion,
      motionSpeed: 1.0,
      durationSeconds: shotType === 'wide' ? 6 : 4,
      visualPrompt: body.slice(0, 300),
      lightingPrompt: lighting,
      audioPrompt: audio,
    });

    if (section.startsWith('##') || section.startsWith('INT.') || section.startsWith('EXT.')) {
      sceneNum++;
    }
  }

  const totalDurationSeconds = shots.reduce((acc, s) => acc + s.durationSeconds, 0);

  return {
    title,
    aspectRatio: '16:9',
    totalDurationSeconds,
    shots,
  };
}

/**
 * Serializes a Storyboard into a clean Obsidian / AnF Markdown note with YAML frontmatter.
 */
export function storyboardToMarkdown(sb: Storyboard): string {
  const frontmatter = [
    '---',
    `title: "${sb.title.replace(/"/g, '\\"')}"`,
    'type: storyboard',
    'generator: open-higgsfield-ai',
    `aspect_ratio: "${sb.aspectRatio}"`,
    `total_duration_sec: ${sb.totalDurationSeconds}`,
    `shot_count: ${sb.shots.length}`,
    `created_at: "${new Date().toISOString()}"`,
    '---',
    '',
  ].join('\n');

  const lines = [
    frontmatter,
    `# ${sb.title}`,
    '',
    `> **Format**: ${sb.aspectRatio} | **Estimated Duration**: ${sb.totalDurationSeconds}s | **Total Shots**: ${sb.shots.length}`,
    '',
    '## Shot Breakdown & Motion Controls',
    '',
  ];

  for (const shot of sb.shots) {
    lines.push(`### Shot ${shot.shotNumber}: ${shot.title}`);
    lines.push(`- **Framing**: \`${shot.shotType}\``);
    lines.push(`- **Camera Motion**: \`${shot.cameraMotion}\` (speed: ${shot.motionSpeed.toFixed(1)}x)`);
    lines.push(`- **Duration**: ${shot.durationSeconds}s`);
    lines.push(`- **Visual Prompt**: ${shot.visualPrompt}`);
    lines.push(`- **Lighting**: ${shot.lightingPrompt}`);
    lines.push(`- **Audio / SFX**: ${shot.audioPrompt}`);
    lines.push('');
    lines.push('```higgsfield');
    lines.push(formatHiggsfieldPrompt(shot));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Parses a Storyboard markdown note back into a structured Storyboard object.
 */
export function markdownToStoryboard(markdown: string): Storyboard | null {
  if (!markdown || !markdown.includes('type: storyboard')) {
    return null;
  }

  const titleMatch = markdown.match(/^#\s+(.+)$/m) || markdown.match(/^title:\s*"([^"]+)"/m);
  const title = titleMatch ? titleMatch[1].trim() : 'Storyboard';

  const shots: SceneShot[] = [];
  const shotBlocks = markdown.split(/###\s+Shot\s+(\d+):\s*(.+)/).slice(1);

  for (let i = 0; i < shotBlocks.length; i += 3) {
    const shotNum = parseInt(shotBlocks[i], 10);
    const shotTitle = shotBlocks[i + 1]?.trim() || `Shot ${shotNum}`;
    const blockContent = shotBlocks[i + 2] || '';

    const framingMatch = blockContent.match(/\*\*Framing\*\*:\s*`([^`]+)`/);
    const motionMatch = blockContent.match(/\*\*Camera Motion\*\*:\s*`([^`]+)`(?:\s*\(speed:\s*([\d.]+)x\))?/);
    const durationMatch = blockContent.match(/\*\*Duration\*\*:\s*(\d+)s/);
    const visualMatch = blockContent.match(/\*\*Visual Prompt\*\*:\s*(.+)/);
    const lightingMatch = blockContent.match(/\*\*Lighting\*\*:\s*(.+)/);
    const audioMatch = blockContent.match(/\*\*Audio \/ SFX\*\*:\s*(.+)/);

    shots.push({
      id: `shot-${shotNum}`,
      sceneNumber: 1,
      shotNumber: shotNum,
      title: shotTitle,
      shotType: (framingMatch ? framingMatch[1] : 'medium') as ShotType,
      cameraMotion: (motionMatch ? motionMatch[1] : 'static') as CameraMotion,
      motionSpeed: motionMatch && motionMatch[2] ? parseFloat(motionMatch[2]) : 1.0,
      durationSeconds: durationMatch ? parseInt(durationMatch[1], 10) : 4,
      visualPrompt: visualMatch ? visualMatch[1].trim() : '',
      lightingPrompt: lightingMatch ? lightingMatch[1].trim() : '',
      audioPrompt: audioMatch ? audioMatch[1].trim() : '',
    });
  }

  const totalDurationSeconds = shots.reduce((acc, s) => acc + s.durationSeconds, 0);

  return {
    title,
    aspectRatio: '16:9',
    totalDurationSeconds,
    shots,
  };
}
