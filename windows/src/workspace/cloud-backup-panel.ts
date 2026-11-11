/**
 * Settings panel for DigitalOcean Spaces / S3-compatible vault backup.
 * Validates config, exports rclone.conf / s3cmd.cfg, and builds a local
 * vault manifest diff preview. Secrets stay in the form only — never written
 * to localStorage (export files are user-initiated downloads).
 */
import { h } from '../views/dom';
import {
  validateS3Config,
  createBackupManifest,
  computeManifestDiff,
  exportRcloneConfig,
  exportS3cmdConfig,
  type S3BackupConfig,
  type S3Provider,
  type BackupFileEntry,
  type BackupManifest,
} from './cloud-backup';

const PREFS_KEY = 'anf-cloud-backup-prefs';

type SavedPrefs = {
  provider: S3Provider;
  endpoint: string;
  region: string;
  bucket: string;
  prefix: string;
  encryptionEnabled: boolean;
};

function loadPrefs(): SavedPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedPrefs>;
      return {
        provider: (parsed.provider as S3Provider) || 'digitalocean-spaces',
        endpoint: parsed.endpoint || 'https://nyc3.digitaloceanspaces.com',
        region: parsed.region || 'nyc3',
        bucket: parsed.bucket || '',
        prefix: parsed.prefix || 'vault',
        encryptionEnabled: parsed.encryptionEnabled !== false,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    provider: 'digitalocean-spaces',
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    bucket: '',
    prefix: 'vault',
    encryptionEnabled: true,
  };
}

function savePrefs(prefs: SavedPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* not remembered this time */
  }
}

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename }) as HTMLAnchorElement;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export type CloudBackupPanelAdapter = {
  listVaultFiles?: () => Promise<BackupFileEntry[]>;
  notify?: (msg: string) => void;
};

export function createCloudBackupPanel(adapter: CloudBackupPanelAdapter = {}): {
  root: HTMLElement;
} {
  const prefs = loadPrefs();
  const status = h('p', {
    role: 'status',
    class: 'hint',
    text: 'Configure an S3-compatible target. Access keys are used only for export — they are not stored on disk.',
  });

  const provider = h('select', {
    'aria-label': 'Backup provider',
  }) as HTMLSelectElement;
  for (const [value, label] of [
    ['digitalocean-spaces', 'DigitalOcean Spaces'],
    ['minio', 'MinIO'],
    ['aws-s3', 'Amazon S3'],
    ['cloudflare-r2', 'Cloudflare R2'],
    ['backblaze-b2', 'Backblaze B2'],
    ['custom-s3', 'Custom S3'],
  ] as const) {
    const opt = h('option', { value, text: label }) as HTMLOptionElement;
    if (value === prefs.provider) opt.selected = true;
    provider.append(opt);
  }

  const endpoint = h('input', {
    type: 'url',
    'aria-label': 'S3 endpoint URL',
    placeholder: 'https://nyc3.digitaloceanspaces.com',
    value: prefs.endpoint,
  }) as HTMLInputElement;
  const region = h('input', {
    'aria-label': 'Region',
    placeholder: 'nyc3',
    value: prefs.region,
    maxlength: 64,
  }) as HTMLInputElement;
  const bucket = h('input', {
    'aria-label': 'Bucket name',
    placeholder: 'my-anf-vault',
    value: prefs.bucket,
    maxlength: 63,
  }) as HTMLInputElement;
  const prefix = h('input', {
    'aria-label': 'Object key prefix',
    placeholder: 'vault',
    value: prefs.prefix,
    maxlength: 128,
  }) as HTMLInputElement;
  const accessKey = h('input', {
    'aria-label': 'Access key ID',
    placeholder: 'Access key (session only)',
    autocomplete: 'off',
    maxlength: 128,
  }) as HTMLInputElement;
  const secretKey = h('input', {
    type: 'password',
    'aria-label': 'Secret access key',
    placeholder: 'Secret key (session only — never saved)',
    autocomplete: 'new-password',
    maxlength: 256,
  }) as HTMLInputElement;
  const encryption = h('input', {
    type: 'checkbox',
    'aria-label': 'Prefer client-side encryption before upload',
  }) as HTMLInputElement;
  encryption.checked = prefs.encryptionEnabled;

  const diffBox = h('pre', {
    class: 'cloud-backup-diff',
    text: 'Manifest diff preview appears here after you build a local vault inventory.',
  });

  function readConfig(): Partial<S3BackupConfig> {
    return {
      provider: provider.value as S3Provider,
      endpoint: endpoint.value.trim(),
      region: region.value.trim(),
      bucket: bucket.value.trim(),
      accessKeyId: accessKey.value.trim(),
      secretAccessKey: secretKey.value.trim(),
      prefix: prefix.value.trim() || undefined,
      encryptionEnabled: encryption.checked,
    };
  }

  function persistNonSecrets(): void {
    savePrefs({
      provider: provider.value as S3Provider,
      endpoint: endpoint.value.trim(),
      region: region.value.trim(),
      bucket: bucket.value.trim(),
      prefix: prefix.value.trim() || 'vault',
      encryptionEnabled: encryption.checked,
    });
  }

  const button = (text: string, fn: () => void) =>
    h('button', { type: 'button', text, onclick: fn });

  const validateBtn = button('Validate target', () => {
    const cfg = readConfig();
    const result = validateS3Config(cfg);
    persistNonSecrets();
    if (result.valid) {
      status.textContent = `Target looks valid: ${cfg.bucket} @ ${cfg.endpoint}`;
      adapter.notify?.(status.textContent);
    } else {
      status.textContent = 'Fix: ' + result.errors.join(' · ');
    }
  });

  const exportRcloneBtn = button('Export rclone.conf', () => {
    const cfg = readConfig();
    const result = validateS3Config(cfg);
    if (!result.valid) {
      status.textContent = 'Fix: ' + result.errors.join(' · ');
      return;
    }
    persistNonSecrets();
    downloadText('anf-rclone.conf', exportRcloneConfig(cfg as S3BackupConfig), 'text/plain;charset=utf-8');
    status.textContent = 'Downloaded anf-rclone.conf. Store it privately — it contains your keys.';
    adapter.notify?.(status.textContent);
  });

  const exportS3cmdBtn = button('Export .s3cfg', () => {
    const cfg = readConfig();
    const result = validateS3Config(cfg);
    if (!result.valid) {
      status.textContent = 'Fix: ' + result.errors.join(' · ');
      return;
    }
    persistNonSecrets();
    downloadText('anf.s3cfg', exportS3cmdConfig(cfg as S3BackupConfig), 'text/plain;charset=utf-8');
    status.textContent = 'Downloaded anf.s3cfg. Store it privately — it contains your keys.';
    adapter.notify?.(status.textContent);
  });

  const previewDiffBtn = button('Preview vault manifest diff', async () => {
    status.textContent = 'Building local vault inventory…';
    try {
      const files = adapter.listVaultFiles
        ? await adapter.listVaultFiles()
        : [
            { path: 'notes/README.md', size: 120, mtime: Date.now() - 86_400_000 },
            { path: 'notes/daily.md', size: 2400, mtime: Date.now() },
          ];
      const local = createBackupManifest('AnF Vault', files);
      let remote: BackupManifest = {
        version: 1,
        vaultName: 'AnF Vault',
        timestamp: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        totalBytes: 0,
        files: {},
      };
      try {
        const cached = localStorage.getItem('anf-cloud-backup-last-manifest');
        if (cached) remote = JSON.parse(cached) as BackupManifest;
      } catch {
        /* use empty remote */
      }
      const diff = computeManifestDiff(local, remote);
      try {
        localStorage.setItem('anf-cloud-backup-last-manifest', JSON.stringify(local));
      } catch {
        /* ignore */
      }
      diffBox.textContent = [
        `Local: ${Object.keys(local.files).length} files · ${local.totalBytes} bytes`,
        `Upload: ${diff.toUpload.length} · Delete remote: ${diff.toDelete.length} · Unchanged: ${diff.unchanged.length}`,
        `Bytes to transfer: ${diff.bytesToTransfer}`,
        '',
        diff.toUpload.length ? 'To upload:\n- ' + diff.toUpload.slice(0, 40).join('\n- ') : 'Nothing new to upload.',
        diff.toDelete.length ? '\nRemote-only (would delete):\n- ' + diff.toDelete.slice(0, 20).join('\n- ') : '',
      ]
        .filter(Boolean)
        .join('\n');
      status.textContent = `Manifest diff ready · ${diff.toUpload.length} to upload · ${diff.bytesToTransfer} bytes.`;
      adapter.notify?.(status.textContent);
    } catch (e) {
      status.textContent = 'Manifest preview failed: ' + String(e);
    }
  });

  const root = h(
    'div',
    { class: 'cloud-backup-panel' },
    h('h3', { text: 'Cloud Backup (S3 / Spaces)' }),
    h('p', {
      class: 'hint',
      text: 'Offline-first vault can sync to DigitalOcean Spaces or any S3-compatible bucket via rclone / s3cmd. AnF never uploads without your export step.',
    }),
    h('div', { class: 'settings-grid' },
      h('label', {}, 'Provider', provider),
      h('label', {}, 'Endpoint', endpoint),
      h('label', {}, 'Region', region),
      h('label', {}, 'Bucket', bucket),
      h('label', {}, 'Prefix', prefix),
      h('label', {}, 'Access key', accessKey),
      h('label', {}, 'Secret key', secretKey),
      h('label', { class: 'row' }, encryption, ' Prefer encrypt-before-upload')
    ),
    h('div', { class: 'row' }, validateBtn, exportRcloneBtn, exportS3cmdBtn, previewDiffBtn),
    status,
    diffBox
  );

  return { root };
}
