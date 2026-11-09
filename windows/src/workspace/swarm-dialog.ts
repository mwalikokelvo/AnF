import {h} from '../views/dom';
import {simulateSwarmConsensus, simulationToMarkdownNote} from './swarm-simulation';

export function openSwarmDialog(options: {
  topic: string;
  context: string;
  onAppend?: (markdown: string) => void;
  notify: (msg: string) => void;
}) {
  const result = simulateSwarmConsensus(options.topic, [options.context]);
  const md = simulationToMarkdownNote(result);

  const dialog = h('dialog', {class: 'music-dialog swarm-dialog', 'aria-label': 'MiroFish Swarm Review'});
  
  // Header with stance and score
  const stanceColor = result.dominantStance === 'favorable' ? '#4aa793' : result.dominantStance === 'cautious' ? '#f5b64c' : '#e64a19';
  
  const header = h('div', {class: 'swarm-header'},
    h('div', {style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'},
      h('h3', {text: `MiroFish Swarm · ${result.topic}`}),
      h('span', {
        style: `font-size:12px;font-weight:700;padding:3px 10px;border-radius:12px;text-transform:uppercase;background:${stanceColor}22;color:${stanceColor};border:1px solid ${stanceColor}`,
        text: `${result.dominantStance} (${result.consensusScore}%)`
      })
    ),
    h('p', {class: 'hint', text: result.synthesis})
  );

  // 4 Persona perspective cards in a responsive grid
  const cardsContainer = h('div', {style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin:16px 0;max-height:380px;overflow-y:auto;padding-right:4px'});

  for (const p of result.perspectives) {
    const pColor = p.stance === 'favorable' ? '#4aa793' : p.stance === 'cautious' ? '#f5b64c' : '#e64a19';
    const card = h('div', {style: 'background:var(--surface,#182a2d);border:1px solid var(--line,#385052);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px'},
      h('div', {style: 'display:flex;justify-content:space-between;align-items:flex-start'},
        h('strong', {style: 'font-size:14px;color:var(--ink,#edf4ef)', text: p.agentName}),
        h('span', {style: `font-size:10px;font-weight:700;padding:2px 6px;border-radius:8px;background:${pColor}22;color:${pColor};text-transform:uppercase`, text: `${p.stance} · ${p.score}`})
      ),
      h('span', {style: 'font-size:11px;color:var(--muted,#8fa0a3)', text: p.role}),
      h('p', {style: 'font-size:13px;line-height:1.45;margin:4px 0', text: p.assessment}),
      h('div', {style: 'font-size:11px;color:var(--accent,#79e4b4);margin-top:auto'},
        h('span', {style: 'display:block;font-weight:600', text: 'Key focus:'}),
        ...p.keyPoints.map(pt => h('span', {style: 'display:block;color:var(--ink,#edf4ef)', text: `• ${pt}`}))
      )
    );
    cardsContainer.append(card);
  }

  // Consensus points & friction points
  const pointsBox = h('div', {style: 'margin:12px 0;padding:12px;background:var(--surface,#182a2d);border-radius:10px;border:1px solid var(--line,#385052)'},
    h('div', {style: 'margin-bottom:8px'},
      h('strong', {style: 'font-size:12px;text-transform:uppercase;color:var(--accent,#79e4b4)', text: 'Consensus Points'}),
      ...result.consensusPoints.map(cp => h('p', {style: 'margin:2px 0;font-size:12px', text: `✓ ${cp}`}))
    ),
    result.frictionPoints.length ? h('div', {},
      h('strong', {style: 'font-size:12px;text-transform:uppercase;color:#f5b64c', text: 'Friction Points'}),
      ...result.frictionPoints.map(fp => h('p', {style: 'margin:2px 0;font-size:12px', text: `⚠ ${fp}`}))
    ) : null
  );

  // Actions
  const appendBtn = options.onAppend ? h('button', {
    type: 'button',
    class: 'primary',
    text: 'Insert Review to Draft',
    onclick: () => {
      options.onAppend!(md);
      options.notify('Swarm simulation review inserted into document.');
      dialog.close();
      dialog.remove();
    }
  }) : null;

  const exportBtn = h('button', {
    type: 'button',
    text: 'Export Review (.md)',
    onclick: () => {
      const blob = new Blob([md], {type: 'text/markdown;charset=utf-8'});
      const url = URL.createObjectURL(blob);
      const a = h('a', {href: url, download: `swarm-review-${new Date().toISOString().slice(0, 10)}.md`});
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      options.notify('Exported Swarm simulation report.');
    }
  });

  const closeBtn = h('button', {
    type: 'button',
    text: 'Close',
    onclick: () => { dialog.close(); dialog.remove(); }
  });

  dialog.append(header, cardsContainer, pointsBox, h('div', {class: 'row', style: 'margin-top:14px;gap:8px'}, ...(appendBtn ? [appendBtn] : []), exportBtn, closeBtn));
  dialog.addEventListener('cancel', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
}
