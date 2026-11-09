import { h } from '../views/dom';

export type AskTextOptions = {
  title?: string;
  defaultValue?: string;
  okLabel?: string;
  cancelLabel?: string;
};

export type AskConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/** In-app text entry matching native `prompt()` (null = cancel, string = OK including empty). */
export function askText(message: string, options: AskTextOptions = {}): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const input = h('input', {
    type: 'text',
    'aria-label': message,
    value: options.defaultValue ?? '',
  }) as HTMLInputElement;
  const dialog = h('dialog', {
    class: 'music-dialog',
    'aria-label': options.title ?? message,
  });
  return new Promise(resolve => {
    const finish = (value: string | null) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const submit = () => finish(input.value);
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
    dialog.append(
      h('h3', { text: options.title ?? message }),
      input,
      button(options.okLabel ?? 'OK', submit),
      button(options.cancelLabel ?? 'Cancel', () => finish(null)),
    );
    dialog.addEventListener('cancel', () => finish(null), { once: true });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/** In-app confirmation matching native `confirm()`. */
export function askConfirm(message: string, options: AskConfirmOptions = {}): Promise<boolean> {
  if (typeof document === 'undefined') return Promise.resolve(false);
  const dialog = h('dialog', {
    class: 'music-dialog',
    'aria-label': options.title ?? 'Confirm',
  });
  return new Promise(resolve => {
    const finish = (value: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(
      h('h3', { text: options.title ?? 'Confirm' }),
      h('p', { text: message }),
      button(options.confirmLabel ?? 'OK', () => finish(true)),
      button(options.cancelLabel ?? 'Cancel', () => finish(false)),
    );
    dialog.addEventListener('cancel', () => finish(false), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  });
}

function button(label: string, fn: () => void) {
  return h('button', { type: 'button', text: label, onclick: fn });
}
