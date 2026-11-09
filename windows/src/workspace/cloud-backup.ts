/**
 * DigitalOcean Spaces & S3-Compatible Cloud Backup Integration
 *
 * Implements S3-compatible remote backup target configuration, manifest diffing,
 * exportable CLI sync configurations (rclone / s3cmd), and AWS Signature Version 4
 * request authorization using the standard Web Crypto API.
 * Follows Ponytail Lazy Senior Dev principles: pure TypeScript, standard Web APIs, 0 deps.
 */

export type S3Provider =
  | 'digitalocean-spaces'
  | 'minio'
  | 'aws-s3'
  | 'cloudflare-r2'
  | 'backblaze-b2'
  | 'custom-s3';

export interface S3BackupConfig {
  provider: S3Provider;
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix?: string;
  encryptionEnabled: boolean;
}

export interface BackupFileEntry {
  path: string;
  size: number;
  mtime: number;
  sha256?: string;
}

export interface BackupManifest {
  version: 1;
  vaultName: string;
  timestamp: string;
  totalBytes: number;
  files: Record<string, BackupFileEntry>;
}

export interface ManifestDiff {
  toUpload: string[];
  toDelete: string[];
  unchanged: string[];
  bytesToTransfer: number;
}

/**
 * Validates and normalizes S3 backup configuration.
 */
export function validateS3Config(config: Partial<S3BackupConfig>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.endpoint?.trim()) errors.push('Endpoint is required.');
  else if (!/^https?:\/\//i.test(config.endpoint)) errors.push('Endpoint must start with http:// or https://.');

  if (!config.bucket?.trim()) errors.push('Bucket name is required.');
  else if (!/^[a-z0-9.-]{3,63}$/.test(config.bucket.trim())) errors.push('Bucket name must be 3-63 characters (lowercase, numbers, dots, hyphens).');

  if (!config.accessKeyId?.trim()) errors.push('Access Key ID is required.');
  if (!config.secretAccessKey?.trim()) errors.push('Secret Access Key is required.');

  return { valid: errors.length === 0, errors };
}

/**
 * Creates a structured vault backup manifest.
 */
export function createBackupManifest(vaultName: string, files: BackupFileEntry[]): BackupManifest {
  const fileMap: Record<string, BackupFileEntry> = {};
  let totalBytes = 0;

  for (const f of files) {
    const cleanPath = f.path.replace(/\\/g, '/').replace(/^\/+/, '');
    fileMap[cleanPath] = {
      path: cleanPath,
      size: f.size,
      mtime: f.mtime,
      sha256: f.sha256,
    };
    totalBytes += f.size;
  }

  return {
    version: 1,
    vaultName,
    timestamp: new Date().toISOString(),
    totalBytes,
    files: fileMap,
  };
}

/**
 * Calculates diff between local manifest and remote backup manifest.
 */
export function computeManifestDiff(local: BackupManifest, remote: BackupManifest): ManifestDiff {
  const toUpload: string[] = [];
  const unchanged: string[] = [];
  const toDelete: string[] = [];
  let bytesToTransfer = 0;

  for (const [path, localFile] of Object.entries(local.files)) {
    const remoteFile = remote.files[path];
    if (!remoteFile) {
      toUpload.push(path);
      bytesToTransfer += localFile.size;
    } else if (
      (localFile.sha256 && remoteFile.sha256 && localFile.sha256 !== remoteFile.sha256) ||
      localFile.size !== remoteFile.size ||
      localFile.mtime > remoteFile.mtime
    ) {
      toUpload.push(path);
      bytesToTransfer += localFile.size;
    } else {
      unchanged.push(path);
    }
  }

  for (const path of Object.keys(remote.files)) {
    if (!local.files[path]) {
      toDelete.push(path);
    }
  }

  return {
    toUpload,
    toDelete,
    unchanged,
    bytesToTransfer,
  };
}

/**
 * Exports standard rclone.conf section for the configured S3 / Spaces target.
 */
export function exportRcloneConfig(config: S3BackupConfig, remoteName = 'anf-backup'): string {
  const endpointHost = config.endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const isSpaces = config.provider === 'digitalocean-spaces' || endpointHost.includes('digitaloceanspaces.com');

  const lines = [
    `[${remoteName}]`,
    'type = s3',
    `provider = ${isSpaces ? 'DigitalOcean' : 'Other'}`,
    `access_key_id = ${config.accessKeyId.trim()}`,
    `secret_access_key = ${config.secretAccessKey.trim()}`,
    `endpoint = ${endpointHost}`,
    `region = ${config.region.trim() || 'us-east-1'}`,
    'acl = private',
  ];

  return lines.join('\n') + '\n';
}

/**
 * Exports standard .s3cfg configuration for s3cmd CLI.
 */
export function exportS3cmdConfig(config: S3BackupConfig): string {
  const endpointHost = config.endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const lines = [
    '[default]',
    `access_key = ${config.accessKeyId.trim()}`,
    `secret_key = ${config.secretAccessKey.trim()}`,
    `host_base = ${endpointHost}`,
    `host_bucket = %(bucket)s.${endpointHost}`,
    `bucket_location = ${config.region.trim() || 'us-east-1'}`,
    'use_https = True',
  ];

  return lines.join('\n') + '\n';
}

/**
 * Generates an AWS Signature Version 4 Authorization header using Web Crypto API.
 */
export async function generateAwsV4AuthHeader(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  payloadSha256Hex: string,
  config: S3BackupConfig,
  requestDate: Date = new Date()
): Promise<{ authorization: string; amzDate: string }> {
  const parsed = new URL(urlStr);
  const isoDate = requestDate.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHmmssZ
  const dateStamp = isoDate.slice(0, 8); // YYYYMMDD
  const region = config.region || 'us-east-1';
  const service = 's3';

  const canonicalHeaders: Record<string, string> = {
    host: parsed.host,
    'x-amz-content-sha256': payloadSha256Hex,
    'x-amz-date': isoDate,
  };

  for (const [k, v] of Object.entries(headers)) {
    canonicalHeaders[k.toLowerCase()] = v.trim();
  }

  const sortedHeaderKeys = Object.keys(canonicalHeaders).sort();
  const canonicalHeadersStr = sortedHeaderKeys.map(k => `${k}:${canonicalHeaders[k]}\n`).join('');
  const signedHeadersStr = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    parsed.pathname || '/',
    parsed.search.slice(1),
    canonicalHeadersStr,
    signedHeadersStr,
    payloadSha256Hex,
  ].join('\n');

  const canonicalReqHashHex = await sha256Hex(canonicalRequest);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    isoDate,
    credentialScope,
    canonicalReqHashHex,
  ].join('\n');

  const signingKey = await getSignatureKey(config.secretAccessKey, dateStamp, region, service);
  const signatureBytes = await hmacSha256(signingKey, stringToSign);
  const signatureHex = bytesToHex(new Uint8Array(signatureBytes));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signatureHex}`;

  return {
    authorization: authHeader,
    amzDate: isoDate,
  };
}

async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(digest));
}

async function hmacSha256(key: CryptoKey | ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  let cryptoKey: CryptoKey;
  if (key instanceof ArrayBuffer) {
    cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } else if (key instanceof Uint8Array) {
    const copy = new Uint8Array(key.length);
    copy.set(key);
    cryptoKey = await crypto.subtle.importKey('raw', copy.buffer as ArrayBuffer, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  } else {
    cryptoKey = key;
  }

  const encoded = new TextEncoder().encode(data);
  return crypto.subtle.sign('HMAC', cryptoKey, encoded);
}

async function getSignatureKey(key: string, dateStamp: string, regionName: string, serviceName: string): Promise<ArrayBuffer> {
  const kSecret = new TextEncoder().encode('AWS4' + key);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  return hmacSha256(kService, 'aws4_request');
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}
