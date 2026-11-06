import packageJson from '../package.json' with { type: 'json' };

export function androidVersionLabel(): string {
  return `AnF ${packageJson.version} · Android`;
}
