import { describe, it, expect, beforeEach } from 'vitest';
import { addTodo, listTodos, completeTodo, formatTodos } from './kevo-todo-list';

const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  global.localStorage = {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => {},
    length: 0,
    key: () => null,
  } as any;
});

describe('kevo-todo-list', () => {
  it('adds and lists open todos', () => {
    addTodo('write report');
    addTodo('review PR');
    expect(listTodos().length).toBe(2);
    expect(formatTodos()).toContain('write report');
  });

  it('completes a todo', () => {
    addTodo('test feature');
    expect(completeTodo('test feature')).toBe(true);
    expect(listTodos().length).toBe(0);
  });
});
