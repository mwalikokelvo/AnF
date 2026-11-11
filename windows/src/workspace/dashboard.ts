import {habitState, type KnowledgeNote} from './knowledge-data';
import {h} from '../views/dom';
import {draftTasks,dayName,tasksToIcs} from './dashboard-data';
import {buildBragDocument} from './brag-document';
import {PomodoroSession, playChime} from './pomodoro';
import {auditVaultHealth, vaultHealthToMarkdown, type VaultHealthReport} from './vault-health';
import {SECURITY_CARDS_DECK, evaluateCardAnswer} from './security-cards';
import {ChatwootInboxManager, type ConversationStatus} from './chatwoot-inbox';
import {AppFlowyManager, createAppFlowyBoard} from './appflowy-workspace';
import {CalDeskManager, createCalDeskPanel} from './cal-desk';
import './dashboard.css';

type Source=import('./reader-data').ReadingSource;
type Draft={id:string;name:string;draft:string;sources:Source[]};
type Entry={id:string;name:string};
type Adapter={current:()=>Draft;list:()=>Promise<Entry[]>;load:(id:string)=>Promise<Draft>;open:(id:string,line?:number)=>Promise<void>;capture:(text:string)=>Promise<void>;read:(source:Source)=>void;write:()=>void;notify:(text:string)=>void;allowed:()=>boolean};

export function createDashboard(a:Adapter){
  const habits=h('div',{class:'habit-matrix','aria-label':'Daily habits'});
  const jump=h('div',{class:'resume-grid'}),tasks=h('div',{class:'dashboard-tasks'}),taskCount=h('p',{class:'hint'}),scratch=h('textarea',{'aria-label':'Quick capture',maxlength:8000,placeholder:'A thought, a reminder, a starting point…'}),state=h('p',{role:'status',class:'hint'});
  const kanban=h('div',{class:'dashboard-kanban',hidden:true});
  const colTodo=h('div',{class:'kanban-col'},h('div',{class:'kanban-col-head'},h('span',{text:'To Do'}),h('span',{class:'kanban-badge',text:'0'})),h('div',{class:'kanban-cards'}));
  const colProgress=h('div',{class:'kanban-col'},h('div',{class:'kanban-col-head'},h('span',{text:'In Progress'}),h('span',{class:'kanban-badge',text:'0'})),h('div',{class:'kanban-cards'}));
  const colDone=h('div',{class:'kanban-col'},h('div',{class:'kanban-col-head'},h('span',{text:'Done'}),h('span',{class:'kanban-badge',text:'0'})),h('div',{class:'kanban-cards'}));
  kanban.append(colTodo,colProgress,colDone);
  const button=(text:string,fn:()=>void)=>h('button',{text,type:'button',onclick:fn});
  let kanbanMode=false;
  const toggleView=button('Kanban Board',()=>{
    kanbanMode=!kanbanMode;
    tasks.hidden=kanbanMode;
    kanban.hidden=!kanbanMode;
    toggleView.textContent=kanbanMode?'List View':'Kanban Board';
  });
  let working=false,epoch=0,currentOpenTasks:{text:string;source:string}[]=[];

  const exportIcs=button('Export tasks (.ics)',()=>{
    if(!currentOpenTasks.length){state.textContent='No open tasks to export.';return;}
    const ics=tasksToIcs(currentOpenTasks);
    const blob=new Blob([ics],{type:'text/calendar;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const downloadLink=h('a',{href:url,download:'anf-tasks-'+new Date().toISOString().slice(0,10)+'.ics'});
    downloadLink.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    state.textContent=`Exported ${currentOpenTasks.length} tasks as iCalendar (.ics). Ready for Cal.com, Outlook, or Apple Calendar.`;
  });

  const exportBrag=button('Brag Doc',()=>{
    const doneTasks: {text:string;source?:string}[] = [];
    for(const card of Array.from(colDone.querySelectorAll('.kanban-card'))){
      const t = card.querySelector('.kanban-card-title')?.textContent || '';
      const s = card.querySelector('.kanban-card-source')?.textContent || '';
      if(t) doneTasks.push({text:t, source:s});
    }
    const doc = buildBragDocument({
      completedTasks: doneTasks.length ? doneTasks : [{text:'System reliability and 100% test gate coverage', category:'Quality'}],
      inProgressTasks: currentOpenTasks.map(t => ({text:t.text, source:t.source})),
    });
    const blob=new Blob([doc],{type:'text/markdown;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=h('a',{href:url,download:'brag-document-'+new Date().toISOString().slice(0,10)+'.md'});
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    state.textContent='Generated Brag Document. Ready for engineering reviews.';
  });

  // --- Pomodoro Focus Widget ---
  const pomodoro = new PomodoroSession();
  const pomoDigits = h('span',{class:'pomodoro-digits',text:'25:00'});
  const pomoStateBadge = h('span',{class:'pomodoro-badge',text:'IDLE'});
  const pomoStart = button('Start', () => {
    pomodoro.start();
    try { playChime(undefined, 'start'); } catch {}
  });
  const pomoPause = button('Pause', () => pomodoro.pause());
  const pomoReset = button('Reset', () => pomodoro.reset());
  const pomoLogSession = button('Log Session to Daily Note', () => {
    if (!a.allowed()) return;
    const md = pomodoro.formatSessionMarkdown('Dashboard Focus');
    void a.capture(md).then(() => {
      a.notify('Pomodoro session logged to daily note.');
      state.textContent = 'Pomodoro session captured in today’s log.';
      void refresh();
    }).catch(e => a.notify(String(e)));
  });

  const pomoModeChips = h('div',{class:'pomodoro-chips'},
    button('Focus (25m)', () => { pomodoro.setMode('focus', 'Deep Work'); }),
    button('Short Break (5m)', () => { pomodoro.setMode('short-break', 'Rest'); }),
    button('Long Break (15m)', () => { pomodoro.setMode('long-break', 'Recharge'); })
  );

  pomodoro.subscribe(status => {
    const mins = Math.floor(status.remaining / 60);
    const secs = String(status.remaining % 60).padStart(2, '0');
    pomoDigits.textContent = `${mins}:${secs}`;
    pomoStateBadge.textContent = status.state.toUpperCase();
    pomoStart.disabled = status.state === 'running';
    pomoPause.disabled = status.state !== 'running';
    if (status.state === 'completed') {
      try { playChime(undefined, 'complete'); } catch {}
      a.notify(`Pomodoro ${status.mode} session completed! Take a break or log your focus.`);
    }
  });

  setInterval(() => {
    if (pomodoro.getStatus().state === 'running') {
      pomodoro.tick();
    }
  }, 1000);

  const pomodoroCard = h('div',{class:'pomodoro-widget'},
    h('div',{class:'pomodoro-header'},
      h('span',{class:'eyebrow',text:'FOCUS TIMER'}),
      pomoStateBadge
    ),
    h('div',{class:'pomodoro-display'}, pomoDigits),
    pomoModeChips,
    h('div',{class:'row pomodoro-controls'}, pomoStart, pomoPause, pomoReset, pomoLogSession)
  );

  // --- Vault Health Diagnostics Widget ---
  const vaultScoreBadge = h('span',{class:'vault-score-badge',text:'Not Audited'});
  const vaultSummaryText = h('p',{class:'hint',text:'Check your vault for broken wikilinks, orphan notes, and knowledge graph density.'});
  let lastVaultReport: VaultHealthReport | null = null;

  const exportVaultReportBtn = button('Export Report (.md)', () => {
    if (!lastVaultReport) {
      state.textContent = 'Run an audit first before exporting.';
      return;
    }
    const md = vaultHealthToMarkdown(lastVaultReport);
    const blob = new Blob([md], {type:'text/markdown;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = h('a', {href:url, download:`vault-health-${new Date().toISOString().slice(0,10)}.md`});
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    state.textContent = 'Exported Vault Health Audit report.';
  });
  exportVaultReportBtn.hidden = true;

  const runVaultAuditBtn = button('Run Vault Audit', async () => {
    if (!a.allowed()) return;
    vaultSummaryText.textContent = 'Auditing vault links and knowledge notes…';
    runVaultAuditBtn.disabled = true;
    try {
      const entries = await a.list();
      const notes: KnowledgeNote[] = [];
      for (const entry of entries) {
        const doc = await a.load(entry.id);
        notes.push({id: doc.id, name: doc.name, draft: doc.draft, sources: doc.sources || []});
      }
      const report = auditVaultHealth(notes);
      lastVaultReport = report;
      vaultScoreBadge.textContent = `Score: ${report.healthScore}/100`;
      vaultScoreBadge.setAttribute('data-score', String(report.healthScore));
      vaultSummaryText.textContent = `${report.totalNotes} notes, ${report.totalWikilinks} links · ${report.brokenLinks.length} broken links · ${report.orphanNotes.length} orphans · density ${(report.graphDensity * 100).toFixed(1)}%`;
      exportVaultReportBtn.hidden = false;
      a.notify(`Vault Audit complete: ${report.healthScore}/100 health score.`);
    } catch (e) {
      vaultSummaryText.textContent = 'Vault audit error: ' + String(e);
    } finally {
      runVaultAuditBtn.disabled = false;
    }
  });

  const viewGraphBtn = button('View Knowledge Graph', async () => {
    if (!a.allowed()) return;
    try {
      const entries = await a.list();
      const notes: KnowledgeNote[] = [];
      for (const entry of entries) {
        const doc = await a.load(entry.id);
        notes.push({ id: doc.id, name: doc.name, draft: doc.draft, sources: doc.sources || [] });
      }
      const { openVaultGraphModal } = await import('./vault-graph');
      openVaultGraphModal(notes, {
        onSelectNote: (noteName) => {
          document.dispatchEvent(new CustomEvent('coucou-open-note', { detail: noteName }));
        },
        notify: a.notify,
      });
    } catch (e) {
      a.notify('Failed to load notes for knowledge graph: ' + String(e));
    }
  });

  const vaultHealthCard = h('div',{class:'vault-health-widget'},
    h('div',{class:'vault-health-header'},
      h('span',{class:'eyebrow',text:'VAULT HEALTH & LINKS'}),
      vaultScoreBadge
    ),
    vaultSummaryText,
    h('div',{class:'row'}, runVaultAuditBtn, viewGraphBtn, exportVaultReportBtn)
  );

  // --- Security Challenge Modal ---
  function openSecurityModal() {
    const dialog = h('dialog', {class:'music-dialog security-dialog', 'aria-label':'Clouds Against Humanity'});
    let currentIndex = 0;
    let score = 0;
    const deck = [...SECURITY_CARDS_DECK];

    const cardCategory = h('span', {class:'eyebrow', text: deck[0].category.toUpperCase()});
    const cardTitle = h('h3', {text: deck[0].title});
    const cardScenario = h('p', {class:'security-scenario', text: deck[0].scenario});
    const optionsContainer = h('div', {class:'security-options'});
    const feedbackBox = h('div', {class:'security-feedback', hidden: true});
    const nextBtn = button('Next Challenge', () => {
      currentIndex++;
      if (currentIndex < deck.length) {
        renderCard(deck[currentIndex]);
      } else {
        showFinished();
      }
    });
    nextBtn.hidden = true;
    const closeBtn = button('Close', () => {
      dialog.close();
      dialog.remove();
    });

    function renderCard(card: typeof deck[0]) {
      cardCategory.textContent = card.category.toUpperCase();
      cardTitle.textContent = card.title;
      cardScenario.textContent = card.scenario;
      feedbackBox.hidden = true;
      feedbackBox.replaceChildren();
      nextBtn.hidden = true;
      optionsContainer.replaceChildren();

      for (const opt of card.options) {
        const btn = button(opt.text, () => {
          const res = evaluateCardAnswer(card.id, opt.id);
          if (res.isCorrect) score++;
          feedbackBox.hidden = false;
          feedbackBox.className = `security-feedback ${res.isCorrect ? 'feedback-correct' : 'feedback-incorrect'}`;
          feedbackBox.replaceChildren(
            h('strong', {text: res.isCorrect ? '✓ Correct! ' : '✗ Incorrect. '}),
            h('span', {text: res.explanation})
          );
          for (const child of Array.from(optionsContainer.querySelectorAll('button'))) {
            child.disabled = true;
          }
          nextBtn.hidden = false;
        });
        btn.className = 'security-option-btn';
        optionsContainer.append(btn);
      }
    }

    function showFinished() {
      cardCategory.textContent = 'SESSION COMPLETED';
      cardTitle.textContent = `Security Challenge Score: ${score} / ${deck.length}`;
      cardScenario.textContent = score >= 3 ? 'Outstanding! High cloud resilience and zero-trust posture.' : 'Good review of secure offline architecture.';
      optionsContainer.replaceChildren();
      feedbackBox.hidden = true;
      nextBtn.hidden = true;
    }

    renderCard(deck[0]);
    dialog.append(
      h('div', {class:'dialog-header'}, h('h2', {text:'Clouds Against Humanity · Security Challenge'})),
      cardCategory,
      cardTitle,
      cardScenario,
      optionsContainer,
      feedbackBox,
      h('div', {class:'row'}, nextBtn, closeBtn)
    );
    dialog.addEventListener('cancel', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  // --- Chatwoot Community & Support Modal ---
  function openChatwootModal() {
    const dialog = h('dialog', {class:'music-dialog chatwoot-dialog', 'aria-label':'Chatwoot Support Inbox'});
    const cw = new ChatwootInboxManager();
    let currentFilter: ConversationStatus | undefined = undefined;

    const listContainer = h('div', {class:'chatwoot-list'});
    const threadView = h('div', {class:'chatwoot-thread-view', hidden: true});

    function renderList() {
      listContainer.replaceChildren();
      const convos = cw.listConversations(currentFilter);
      if (!convos.length) {
        listContainer.append(h('p', {class:'hint', text:'No support conversations matching filter.'}));
        return;
      }
      for (const c of convos) {
        const item = h('div', {class:'chatwoot-item', onclick: () => showThread(c.id)},
          h('div', {class:'chatwoot-item-header'},
            h('strong', {text: c.subject}),
            h('span', {class:`badge badge-${c.status}`, text: c.status.toUpperCase()})
          ),
          h('p', {class:'hint', text: `${c.contactName} · channel: ${c.channel} · ${c.messages.length} messages`})
        );
        listContainer.append(item);
      }
    }

    function showThread(id: string) {
      const c = cw.getConversation(id);
      if (!c) return;
      listContainer.hidden = true;
      threadView.hidden = false;
      threadView.replaceChildren();

      const backBtn = button('← Back to Inbox', () => {
        threadView.hidden = true;
        listContainer.hidden = false;
        renderList();
      });

      const exportThreadBtn = button('Export Thread (.md)', () => {
        const md = cw.exportToMarkdown(id);
        const blob = new Blob([md], {type:'text/markdown;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const link = h('a', {href:url, download:`chatwoot-${c.id}.md`});
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        a.notify('Exported support thread to Markdown.');
      });

      const resolveBtn = button(c.status === 'resolved' ? 'Re-open' : 'Mark Resolved', () => {
        cw.updateStatus(id, c.status === 'resolved' ? 'open' : 'resolved');
        showThread(id);
      });

      const msgsDiv = h('div', {class:'chatwoot-messages'});
      for (const m of c.messages) {
        const msgDiv = h('div', {class:`chatwoot-msg chatwoot-msg-${m.sender}`},
          h('strong', {text: `${m.senderName} (${m.sender}): `}),
          h('span', {text: m.text}),
          h('div', {class:'chatwoot-msg-time', text: new Date(m.timestamp).toLocaleTimeString()})
        );
        msgsDiv.append(msgDiv);
      }

      const replyInput = h('input', {type:'text', placeholder:'Type reply as Maintainer…', class:'chatwoot-reply-input'}) as HTMLInputElement;
      const sendReplyBtn = button('Reply', () => {
        const val = replyInput.value.trim();
        if (!val) return;
        cw.replyToConversation(id, val);
        replyInput.value = '';
        showThread(id);
      });

      replyInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') sendReplyBtn.click();
      });

      threadView.append(
        h('div', {class:'row'}, backBtn, resolveBtn, exportThreadBtn),
        h('h3', {text: c.subject}),
        h('p', {class:'hint', text: `From: ${c.contactName} (${c.contactEmail || 'anonymous'}) · Status: ${c.status}`}),
        msgsDiv,
        h('div', {class:'row chatwoot-reply-row'}, replyInput, sendReplyBtn)
      );
    }

    const filterAll = button('All', () => { currentFilter = undefined; renderList(); });
    const filterOpen = button('Open', () => { currentFilter = 'open'; renderList(); });
    const filterPending = button('Pending', () => { currentFilter = 'pending'; renderList(); });
    const filterResolved = button('Resolved', () => { currentFilter = 'resolved'; renderList(); });
    const closeDialog = button('Close', () => { dialog.close(); dialog.remove(); });

    renderList();

    dialog.append(
      h('div', {class:'dialog-header'}, h('h2', {text:'Chatwoot Community & Support Inbox'})),
      h('div', {class:'row filter-row'}, filterAll, filterOpen, filterPending, filterResolved),
      listContainer,
      threadView,
      h('div', {class:'row'}, closeDialog)
    );
    dialog.addEventListener('cancel', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  // --- AppFlowy Workspace Modal ---
  function openAppFlowyModal() {
    const dialog = h('dialog', {class:'music-dialog appflowy-dialog', 'aria-label':'AppFlowy Workspace'});
    const mgr = new AppFlowyManager();
    const board = createAppFlowyBoard(mgr, a.notify);
    const closeDialog = button('Close', () => { dialog.close(); dialog.remove(); });
    dialog.append(
      board,
      h('div', {class:'row', style:'margin-top: 16px;'}, closeDialog)
    );
    dialog.addEventListener('cancel', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  // --- Cal.com Scheduling Desk Modal ---
  function openCalDeskModal() {
    const dialog = h('dialog', {class:'music-dialog caldesk-dialog', 'aria-label':'Cal.com Scheduling Desk'});
    const mgr = new CalDeskManager();
    const desk = createCalDeskPanel(mgr, a.notify);
    const closeDialog = button('Close', () => { dialog.close(); dialog.remove(); });
    dialog.append(
      desk,
      h('div', {class:'row', style:'margin-top: 16px;'}, closeDialog)
    );
    dialog.addEventListener('cancel', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  document.addEventListener('anf-open-appflowy', () => openAppFlowyModal());
  document.addEventListener('anf-open-calcom', () => openCalDeskModal());
  document.addEventListener('anf-open-chatwoot', () => openChatwootModal());
  document.addEventListener('anf-open-security', () => openSecurityModal());

  // --- Productivity & Companion Studio Card ---
  const launchAppFlowy = button('AppFlowy Board', () => openAppFlowyModal());
  const launchCalDesk = button('Cal.com Schedule', () => openCalDeskModal());
  const launchSecurity = button('Security Challenge', () => openSecurityModal());
  const launchChatwoot = button('Community Support', () => openChatwootModal());
  const launchSwarm = button('Swarm Review', async () => {
    const cur = a.current();
    const { openSwarmDialog } = await import('./swarm-dialog');
    openSwarmDialog({
      topic: cur.name || 'Workspace Strategy',
      context: cur.draft || scratch.value || 'Local offline architecture with zero telemetry, privacy, and simplicity.',
      onAppend: (md) => {
        void a.capture('\n\n' + md).then(() => a.notify('Swarm review appended to daily note.'));
      },
      notify: a.notify
    });
  });

  const openVaultSearch = button('Vault Search (Ctrl+K)', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
  });

  const companionStudioCard = h('article',{class:'companion-hub-card'},
    h('div',{class:'companion-hub-header'},
      h('p',{class:'eyebrow',text:'PRODUCTIVITY & COMPANION STUDIO'}),
      h('h3',{text:'Focus, Vault Health & Developer Hub'}),
      h('p',{class:'hint',text:'Local Pomodoro focus timer, BM25 vault search, vault wikilink diagnostics, security challenges, and community support triage.'})
    ),
    h('div',{class:'companion-grid'},
      pomodoroCard,
      vaultHealthCard
    ),
    h('div',{class:'row companion-actions'},
      openVaultSearch,
      launchAppFlowy,
      launchCalDesk,
      toggleView,
      launchSwarm,
      launchSecurity,
      launchChatwoot,
      exportIcs,
      exportBrag
    )
  );

  const capture=button('Save to today’s log',()=>{if(working||!a.allowed())return;working=true;capture.disabled=true;const value=scratch.value;void a.capture(value).then(()=>{if(scratch.value===value){scratch.value='';try{localStorage.removeItem('coucou-quick-capture');}catch{}}state.textContent='Saved in '+dayName()+'.';void refresh();}).catch(e=>state.textContent=String(e).replace(/^Error: /,'')).finally(()=>{working=false;capture.disabled=false;});});
  try{scratch.value=localStorage.getItem('coucou-quick-capture')||'';}catch{}
  scratch.addEventListener('input',()=>{try{localStorage.setItem('coucou-quick-capture',scratch.value);}catch{state.textContent='Scratchpad cannot be saved automatically here; use Save to today’s log.';}});
  const taskDrawer=h('details',{class:'dashboard-task-drawer'},h('summary',{text:'Tasks across your drafts'}),taskCount,h('div',{class:'row'},button('Refresh tasks',()=>void refresh()),toggleView,exportIcs,exportBrag),tasks,kanban);
  const root=h('div',{class:'dashboard'},
    h('div',{class:'dashboard-heading'},
      h('p',{class:'eyebrow',text:'YOUR DAY, YOUR SPACE'}),
      h('h2',{text:'A little space.\nA lot of possibility.'}),
      h('p',{class:'dashboard-subtitle',text:'Read, write and make something yours. Your ideas stay on your devices.'})
    ),
    jump,
    companionStudioCard,
    h('article',{class:'capture-card'},
      h('h3',{text:'Quick capture'}),
      scratch,
      h('div',{class:'row'},capture,button('Open today’s log',()=>{if(!a.allowed())return;void a.list().then(entries=>{const today=entries.find(e=>e.name===dayName());if(today)return a.open(today.id);state.textContent='Save your first thought to create today’s log.';}).catch(e=>a.notify(String(e)));})),
      state
    ),
    h('h3',{text:'Daily habits · last seven days'}),
    habits,
    taskDrawer
  );

  async function refresh(){const request=++epoch;const current=a.current(),source=current.sources[0];jump.replaceChildren(h('article',{class:'resume-card'},h('span',{class:'eyebrow',text:'READING'}),h('h3',{text:source?.name||'No document open'}),source?h('progress',{max:Math.max(1,source.text.length),value:source.reading?.offset||0,'aria-label':'Saved reading progress'}):h('p',{text:'Add a document in Documents.'}),...(source?[button('Resume reading',()=>a.read(source))]:[])),h('article',{class:'resume-card'},h('span',{class:'eyebrow',text:'WRITING'}),h('h3',{text:current.name}),h('p',{class:'draft-snippet',text:current.draft.slice(0,180).replace(/^#{1,6} /gm,'').replace(/\*\*/g,'')||'Empty draft'}),button('Continue writing',a.write)));
    taskCount.textContent='Reading saved drafts…';tasks.replaceChildren();currentOpenTasks=[];let count=0,scanned=0;const daily=new Map<string,Record<string,boolean>>();
    const cardsTodo=colTodo.querySelector('.kanban-cards')!,cardsProgress=colProgress.querySelector('.kanban-cards')!,cardsDone=colDone.querySelector('.kanban-cards')!;
    cardsTodo.replaceChildren();cardsProgress.replaceChildren();cardsDone.replaceChildren();
    let todoN=0,progressN=0,doneN=0;
    try{const entries=await a.list();for(const entry of entries.slice(0,200)){if(request!==epoch)return;const p=entry.id===current.id?current:await a.load(entry.id);scanned++;if(p.name.startsWith('Daily · '))daily.set(p.name,habitState(p.draft));
      for(const task of draftTasks(p.draft)){
        if(task.status==='todo'){
          todoN++;
          if(count<200){currentOpenTasks.push({text:task.text,source:p.name});const row=button(task.text+' — '+p.name,()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));});row.className='dashboard-task';tasks.append(row);count++;}
          if(cardsTodo.childNodes.length<40){const card=h('article',{class:'kanban-card',onclick:()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));}},h('span',{class:'kanban-card-title',text:task.text}),h('span',{class:'kanban-card-source',text:p.name}));cardsTodo.append(card);}
        }else if(task.status==='in-progress'){
          progressN++;
          if(count<200){currentOpenTasks.push({text:task.text,source:p.name});const row=button('⏳ '+task.text+' — '+p.name,()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));});row.className='dashboard-task';tasks.append(row);count++;}
          if(cardsProgress.childNodes.length<40){const card=h('article',{class:'kanban-card',onclick:()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));}},h('span',{class:'kanban-card-title',text:task.text}),h('span',{class:'kanban-card-source',text:p.name}));cardsProgress.append(card);}
        }else if(task.status==='done'){
          doneN++;
          if(cardsDone.childNodes.length<30){const card=h('article',{class:'kanban-card kanban-card-done',onclick:()=>{if(a.allowed())void a.open(p.id,task.line).catch(e=>a.notify(String(e)));}},h('span',{class:'kanban-card-title',text:task.text}),h('span',{class:'kanban-card-source',text:p.name}));cardsDone.append(card);}
        }
      }
    }
    colTodo.querySelector('.kanban-badge')!.textContent=String(todoN);
    colProgress.querySelector('.kanban-badge')!.textContent=String(progressN);
    colDone.querySelector('.kanban-badge')!.textContent=String(doneN);
    if(request===epoch){habits.replaceChildren();for(let ago=6;ago>=0;ago--){const date=new Date();date.setDate(date.getDate()-ago);const name=dayName(date),state=daily.get(name)||{},column=h('div',{},h('span',{text:date.toLocaleDateString(undefined,{weekday:'short'})}));for(const key of ['read','write','reflect']){const input=h('input',{type:'checkbox','aria-label':key+' '+name});input.checked=!!state[key];input.disabled=ago!==0;input.addEventListener('change',()=>{if(!a.allowed()){input.checked=!input.checked;return;}input.disabled=true;void a.capture('- ['+(input.checked?'x':' ')+'] #habit/'+key).then(()=>refresh()).catch(e=>{input.checked=!input.checked;input.disabled=false;a.notify(String(e));});});column.append(h('label',{},input,key));}habits.append(column);}}
    if(request===epoch)taskCount.textContent=`${count}${count===200?'+':''} open tasks · ${scanned} of ${entries.length} drafts checked. Select a task to edit its source.`;
    }catch(e){if(request===epoch){habits.replaceChildren();for(let ago=6;ago>=0;ago--){const date=new Date();date.setDate(date.getDate()-ago);const name=dayName(date),state=daily.get(name)||{},column=h('div',{},h('span',{text:date.toLocaleDateString(undefined,{weekday:'short'})}));for(const key of ['read','write','reflect']){const input=h('input',{type:'checkbox','aria-label':key+' '+name});input.checked=!!state[key];input.disabled=ago!==0;input.addEventListener('change',()=>{if(!a.allowed()){input.checked=!input.checked;return;}input.disabled=true;void a.capture('- ['+(input.checked?'x':' ')+'] #habit/'+key).then(()=>refresh()).catch(e=>{input.checked=!input.checked;input.disabled=false;a.notify(String(e));});});column.append(h('label',{},input,key));}habits.append(column);}}
    if(request===epoch)taskCount.textContent='Could not load tasks: '+String(e);}
  }
  return{root,refresh};
}

export function foldGuidance(root:HTMLElement){for(const panel of Array.from(root.querySelectorAll<HTMLElement>('.workspace-panel,.panel'))){if(['Home','Settings'].includes(panel.getAttribute('aria-label')||''))continue;const copy=Array.from(panel.querySelectorAll<HTMLElement>(':scope > p.hint,:scope > p.muted')).filter(p=>!p.hasAttribute('role'));if(!copy.length)continue;const help=h('details',{class:'view-help'},h('summary',{text:'About this view'}),...copy);panel.append(help);}}
