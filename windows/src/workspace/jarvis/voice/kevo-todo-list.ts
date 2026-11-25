/**
 * Kevo To-Do List: simple local task list for voice commands.
 * Stored in localStorage under 'kevo-todo-list'.
 */

export interface TodoItem {
  id: string;
  task: string;
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

const STORAGE_KEY = 'kevo-todo-list';

function load(): TodoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(items: TodoItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch { /* ignore */ }
}

export function addTodo(task: string): TodoItem {
  const items = load();
  const item: TodoItem = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    task: task.trim(),
    done: false,
    createdAt: Date.now(),
  };
  items.push(item);
  save(items);
  return item;
}

export function listTodos(includeDone = false): TodoItem[] {
  const items = load();
  return includeDone ? items : items.filter((t) => !t.done);
}

export function completeTodo(taskOrId: string): boolean {
  const items = load();
  const item = items.find(
    (t) => t.id === taskOrId || t.task.toLowerCase() === taskOrId.toLowerCase()
  );
  if (!item || item.done) return false;
  item.done = true;
  item.completedAt = Date.now();
  save(items);
  return true;
}

export function clearCompletedTodos(): number {
  const items = load();
  const remaining = items.filter((t) => !t.done);
  const removed = items.length - remaining.length;
  save(remaining);
  return removed;
}

export function formatTodos(): string {
  const open = listTodos(false);
  if (open.length === 0) return 'You have no open to-do items, sir.';
  const lines = open.map((t, idx) => `${idx + 1}. ${t.task}`);
  return `You have ${open.length} open task${open.length === 1 ? '' : 's'}: ${lines.join('; ')}.`;
}
