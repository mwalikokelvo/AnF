/**
 * Additional Kevo actions for shopping list, to-do list, and Pomodoro.
 * Import and spread into KEVO_ACTIONS in kevo-actions.ts:
 * import { EXTRA_KEVO_ACTIONS } from './kevo-extra-actions';
 * export const KEVO_ACTIONS = [ ...existing, ...EXTRA_KEVO_ACTIONS ];
 */

import type { KevoActionDefinition, KevoActionExecutionResult } from './kevo-actions';
import type { JarvisActionContext } from './jarvis-voice-agent';
import {
  addShoppingItem,
  listShoppingItems,
  clearShoppingList,
  formatShoppingList,
  removeShoppingItem,
} from './kevo-shopping-list';
import {
  addTodo,
  listTodos,
  completeTodo,
  clearCompletedTodos,
  formatTodos,
} from './kevo-todo-list';
import { startPomodoro, stopPomodoro, getPomodoroStatus } from './kevo-pomodoro';

export const EXTRA_KEVO_ACTIONS: KevoActionDefinition[] = [
  {
    name: 'shopping_add',
    description: 'Adds an item to the shopping list.',
    parameters: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Item name' },
        quantity: { type: 'number', description: 'Optional quantity' },
      },
      required: ['item'],
    },
    execute: async (args: { item: string; quantity?: number }) => {
      const name = (args?.item || '').trim();
      if (!name) {
        return { handled: false, actionName: 'shopping_add', speechReply: 'What should I add to the shopping list, sir?', status: 'failure', verified: false };
      }
      addShoppingItem(name, args.quantity);
      return { handled: true, actionName: 'shopping_add', speechReply: `Added ${name} to the shopping list.`, status: 'success', verified: true };
    },
  },
  {
    name: 'shopping_list',
    description: 'Reads out the current shopping list.',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({
      handled: true,
      actionName: 'shopping_list',
      speechReply: formatShoppingList(),
      status: 'success',
      verified: true,
    }),
  },
  {
    name: 'shopping_clear',
    description: 'Clears the entire shopping list.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const n = clearShoppingList();
      return { handled: true, actionName: 'shopping_clear', speechReply: n ? `Cleared ${n} item${n === 1 ? '' : 's'} from the shopping list.` : 'The shopping list was already empty.', status: 'success', verified: true };
    },
  },
  {
    name: 'todo_add',
    description: 'Adds a task to the to-do list.',
    parameters: {
      type: 'object',
      properties: { task: { type: 'string', description: 'Task description' } },
      required: ['task'],
    },
    execute: async (args: { task: string }) => {
      const t = (args?.task || '').trim();
      if (!t) return { handled: false, actionName: 'todo_add', speechReply: 'What task should I add, sir?', status: 'failure', verified: false };
      addTodo(t);
      return { handled: true, actionName: 'todo_add', speechReply: `Added "${t}" to your to-do list.`, status: 'success', verified: true };
    },
  },
  {
    name: 'todo_list',
    description: 'Lists open to-do items.',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({
      handled: true,
      actionName: 'todo_list',
      speechReply: formatTodos(),
      status: 'success',
      verified: true,
    }),
  },
  {
    name: 'todo_complete',
    description: 'Marks a to-do item as done.',
    parameters: {
      type: 'object',
      properties: { task: { type: 'string', description: 'Task name or id' } },
      required: ['task'],
    },
    execute: async (args: { task: string }) => {
      const ok = completeTodo(args.task || '');
      return {
        handled: true,
        actionName: 'todo_complete',
        speechReply: ok ? 'Task marked complete.' : 'I could not find that open task.',
        status: ok ? 'success' : 'failure',
        verified: ok,
      };
    },
  },
  {
    name: 'pomodoro_start',
    description: 'Starts a Pomodoro focus timer (default 25 min work / 5 min break).',
    parameters: {
      type: 'object',
      properties: {
        work: { type: 'number', description: 'Work minutes' },
        break: { type: 'number', description: 'Break minutes' },
      },
    },
    execute: async (args: { work?: number; break?: number }) => ({
      handled: true,
      actionName: 'pomodoro_start',
      speechReply: startPomodoro(args.work || 25, args.break || 5),
      status: 'success',
      verified: true,
    }),
  },
  {
    name: 'pomodoro_stop',
    description: 'Stops the running Pomodoro.',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({
      handled: true,
      actionName: 'pomodoro_stop',
      speechReply: stopPomodoro(),
      status: 'success',
      verified: true,
    }),
  },
  {
    name: 'pomodoro_status',
    description: 'Reports the current Pomodoro status.',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({
      handled: true,
      actionName: 'pomodoro_status',
      speechReply: getPomodoroStatus(),
      status: 'success',
      verified: true,
    }),
  },
];
