/**
 * AppFlowy Local-First Workspace & Relational Grid Database
 * Native AppFlowy integration providing interactive Kanban boards and
 * customizable relational table databases with zero cloud requirements.
 */
import { h } from '../views/dom';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export interface AppFlowyCard {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate?: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppFlowyDatabase {
  id: string;
  name: string;
  cards: AppFlowyCard[];
}

const STORAGE_KEY = 'anf-appflowy-board';

export class AppFlowyManager {
  private db: AppFlowyDatabase;
  private listeners: (() => void)[] = [];

  constructor() {
    this.db = this.load();
  }

  private load(): AppFlowyDatabase {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.cards)) {
          return parsed;
        }
      }
    } catch {}

    // Default starter AppFlowy workspace
    return {
      id: 'appflowy-default',
      name: 'Project Workspace',
      cards: [
        {
          id: 'card-1',
          title: 'Architect offline-first studio pipeline',
          description: 'Ensure all media processing stays private and local on device.',
          status: 'done',
          priority: 'urgent',
          tags: ['architecture', 'security'],
          dueDate: '2026-11-15',
          createdAt: Date.now() - 86400000,
          updatedAt: Date.now(),
        },
        {
          id: 'card-2',
          title: 'Integrate Cap screen recording engine',
          description: 'Embed WebM/MP4 recording studio directly in AnF.',
          status: 'in_progress',
          priority: 'high',
          tags: ['cap', 'video'],
          dueDate: '2026-11-18',
          createdAt: Date.now() - 43200000,
          updatedAt: Date.now(),
        },
        {
          id: 'card-3',
          title: 'Configure Cal.com appointment scheduler',
          description: 'Design visual calendar and slot generator desk.',
          status: 'todo',
          priority: 'medium',
          tags: ['calcom', 'scheduling'],
          dueDate: '2026-11-20',
          createdAt: Date.now() - 21600000,
          updatedAt: Date.now(),
        },
      ],
    };
  }

  save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    } catch {}
    for (const l of this.listeners) {
      try { l(); } catch {}
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  getCards(filterStatus?: TaskStatus): AppFlowyCard[] {
    return filterStatus ? this.db.cards.filter(c => c.status === filterStatus) : [...this.db.cards];
  }

  addCard(card: Omit<AppFlowyCard, 'id' | 'createdAt' | 'updatedAt'>): AppFlowyCard {
    const newCard: AppFlowyCard = {
      ...card,
      id: 'card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.db.cards.push(newCard);
    this.save();
    return newCard;
  }

  updateCard(id: string, updates: Partial<Omit<AppFlowyCard, 'id' | 'createdAt'>>): boolean {
    const card = this.db.cards.find(c => c.id === id);
    if (!card) return false;
    Object.assign(card, updates, { updatedAt: Date.now() });
    this.save();
    return true;
  }

  moveCard(id: string, newStatus: TaskStatus): boolean {
    return this.updateCard(id, { status: newStatus });
  }

  deleteCard(id: string): boolean {
    const before = this.db.cards.length;
    this.db.cards = this.db.cards.filter(c => c.id !== id);
    if (this.db.cards.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  exportMarkdownTable(): string {
    let md = `| Title | Status | Priority | Due Date | Tags |\n| --- | --- | --- | --- | --- |\n`;
    for (const c of this.db.cards) {
      md += `| ${c.title.replace(/\|/g, '-')} | ${c.status} | ${c.priority} | ${c.dueDate || 'N/A'} | ${c.tags.join(', ')} |\n`;
    }
    return md;
  }
}

/**
 * Visual AppFlowy Kanban & Relational Grid View Component
 */
export function createAppFlowyBoard(manager: AppFlowyManager, notify?: (msg: string) => void): HTMLElement {
  const container = h('div', { class: 'appflowy-workspace' });

  let activeView: 'kanban' | 'grid' = 'kanban';

  const header = h('div', { class: 'appflowy-header' });
  const viewToggleBtn = h('button', { type: 'button', class: 'chip', text: 'Switch to Database Grid' }) as HTMLButtonElement;
  const addCardBtn = h('button', { type: 'button', class: 'primary', text: '+ Add Card' }) as HTMLButtonElement;
  const exportBtn = h('button', { type: 'button', text: 'Export Table (.md)' }) as HTMLButtonElement;

  header.append(
    h('div', { class: 'appflowy-title-wrap' },
      h('strong', { text: 'AppFlowy Workspace' }),
      h('span', { class: 'badge quiet', text: 'Local-First' })
    ),
    h('div', { class: 'row' }, viewToggleBtn, addCardBtn, exportBtn)
  );

  const mainView = h('div', { class: 'appflowy-main' });

  function renderKanban(): HTMLElement {
    const kanbanGrid = h('div', { class: 'appflowy-kanban-board' });
    const cols: { status: TaskStatus; label: string }[] = [
      { status: 'todo', label: 'To Do' },
      { status: 'in_progress', label: 'In Progress' },
      { status: 'review', label: 'Review' },
      { status: 'done', label: 'Done' },
    ];

    for (const col of cols) {
      const cards = manager.getCards(col.status);
      const colEl = h('div', { class: 'appflowy-column' });
      const colHead = h('div', { class: 'appflowy-column-head' },
        h('span', { text: col.label }),
        h('span', { class: 'badge', text: String(cards.length) })
      );
      const cardsList = h('div', { class: 'appflowy-cards-list' });

      for (const card of cards) {
        const cardEl = h('div', { class: 'appflowy-card', 'data-priority': card.priority });
        const cardTitle = h('strong', { class: 'appflowy-card-title', text: card.title });
        const cardDesc = card.description ? h('p', { class: 'hint', text: card.description }) : null;
        const priorityBadge = h('span', { class: `badge priority-${card.priority}`, text: card.priority.toUpperCase() });
        const tagsRow = h('div', { class: 'appflowy-card-tags' }, ...card.tags.map(t => h('span', { class: 'tag-chip', text: '#' + t })));

        // Move button dropdown
        const nextStatus: Record<TaskStatus, TaskStatus> = {
          todo: 'in_progress',
          in_progress: 'review',
          review: 'done',
          done: 'todo',
        };
        const nextLabels: Record<TaskStatus, string> = {
          todo: 'Start →',
          in_progress: 'Review →',
          review: 'Done ✓',
          done: 'Reopen ↺',
        };

        const moveBtn = h('button', {
          type: 'button',
          class: 'appflowy-move-btn',
          text: nextLabels[card.status],
          onclick: () => {
            manager.moveCard(card.id, nextStatus[card.status]);
            render();
          },
        });

        const deleteBtn = h('button', {
          type: 'button',
          class: 'appflowy-del-btn',
          text: '✕',
          title: 'Delete card',
          onclick: () => {
            manager.deleteCard(card.id);
            render();
          },
        });

        const cardFooter = h('div', { class: 'appflowy-card-footer' }, priorityBadge, h('div', { class: 'row' }, moveBtn, deleteBtn));
        cardEl.append(cardTitle, cardDesc || '', tagsRow, cardFooter);
        cardsList.append(cardEl);
      }

      colEl.append(colHead, cardsList);
      kanbanGrid.append(colEl);
    }
    return kanbanGrid;
  }

  function renderGrid(): HTMLElement {
    const tableWrap = h('div', { class: 'appflowy-grid-wrap' });
    const table = h('table', { class: 'appflowy-grid-table' });
    const thead = h('thead', {},
      h('tr', {},
        h('th', { text: 'Title' }),
        h('th', { text: 'Status' }),
        h('th', { text: 'Priority' }),
        h('th', { text: 'Due Date' }),
        h('th', { text: 'Tags' }),
        h('th', { text: 'Actions' })
      )
    );
    const tbody = h('tbody');

    for (const card of manager.getCards()) {
      const tr = h('tr');
      const titleTd = h('td', { text: card.title });
      const statusTd = h('td', { text: card.status.replace('_', ' ') });
      const priorityTd = h('td', {}, h('span', { class: `badge priority-${card.priority}`, text: card.priority }));
      const dueTd = h('td', { text: card.dueDate || '—' });
      const tagsTd = h('td', { text: card.tags.join(', ') || '—' });

      const delBtn = h('button', {
        type: 'button',
        text: 'Delete',
        onclick: () => {
          manager.deleteCard(card.id);
          render();
        },
      });

      const actionsTd = h('td', {}, delBtn);
      tr.append(titleTd, statusTd, priorityTd, dueTd, tagsTd, actionsTd);
      tbody.append(tr);
    }

    table.append(thead, tbody);
    tableWrap.append(table);
    return tableWrap;
  }

  function render(): void {
    mainView.replaceChildren(activeView === 'kanban' ? renderKanban() : renderGrid());
  }

  viewToggleBtn.addEventListener('click', () => {
    activeView = activeView === 'kanban' ? 'grid' : 'kanban';
    viewToggleBtn.textContent = activeView === 'kanban' ? 'Switch to Database Grid' : 'Switch to Kanban Board';
    render();
  });

  exportBtn.addEventListener('click', () => {
    const md = manager.exportMarkdownTable();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = h('a', { href: url, download: `appflowy-database-${Date.now()}.md` }) as HTMLAnchorElement;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    notify?.('Exported AppFlowy relational database table.');
  });

  addCardBtn.addEventListener('click', () => {
    const title = prompt('Card Title:');
    if (!title || !title.trim()) return;
    const desc = prompt('Description (optional):') || '';
    const tagsInput = prompt('Tags (comma-separated):') || '';
    const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    manager.addCard({
      title: title.trim(),
      description: desc.trim(),
      status: 'todo',
      priority: 'medium',
      tags,
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    });
    render();
    notify?.('Card added to AppFlowy board.');
  });

  render();
  manager.subscribe(render);

  container.append(header, mainView);
  return container;
}
