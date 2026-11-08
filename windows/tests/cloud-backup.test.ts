import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateS3Config,
  createBackupManifest,
  computeManifestDiff,
  exportRcloneConfig,
  exportS3cmdConfig,
  generateAwsV4AuthHeader,
  type S3BackupConfig,
  type BackupFileEntry,
} from '../src/workspace/cloud-backup.js';

test('DigitalOcean Spaces & S3 Cloud Backup Integration', async (t) => {
  const sampleConfig: S3BackupConfig = {
    provider: 'digitalocean-spaces',
    endpoint: 'https://nyc3.digitaloceanspaces.com',
    region: 'nyc3',
    bucket: 'my-anf-vault-backup',
    accessKeyId: 'DO00EXAMPLEKEY',
    secretAccessKey: 'ExampleSecretKey1234567890abcdef',
    prefix: 'vault',
    encryptionEnabled: true,
  };

  await t.test('validateS3Config enforces valid endpoints and bucket names', () => {
    const valid = validateS3Config(sampleConfig);
    assert.equal(valid.valid, true);
    assert.equal(valid.errors.length, 0);

    const invalid = validateS3Config({
      endpoint: 'ftp://bad-url',
      bucket: 'INVALID_CAPS_BUCKET!',
    });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(e => e.includes('http:// or https://')));
    assert.ok(invalid.errors.some(e => e.includes('Bucket name')));
  });

  await t.test('createBackupManifest produces normalized vault manifest', () => {
    const files: BackupFileEntry[] = [
      { path: 'notes\\daily.md', size: 1024, mtime: 1700000000, sha256: 'abcd1234' },
      { path: '/audio/memo.wav', size: 204800, mtime: 1700000001, sha256: 'ef015678' },
    ];

    const manifest = createBackupManifest('MainVault', files);
    assert.equal(manifest.version, 1);
    assert.equal(manifest.vaultName, 'MainVault');
    assert.equal(manifest.totalBytes, 205824);
    assert.ok(manifest.files['notes/daily.md']);
    assert.ok(manifest.files['audio/memo.wav']);
  });

  await t.test('computeManifestDiff calculates upload, unchanged, and delete sets', () => {
    const local = createBackupManifest('Main', [
      { path: 'a.md', size: 100, mtime: 1000, sha256: 'hash-a' },
      { path: 'b.md', size: 250, mtime: 2000, sha256: 'hash-b-new' }, // changed
      { path: 'c.md', size: 300, mtime: 1000, sha256: 'hash-c' },     // new
    ]);

    const remote = createBackupManifest('Main', [
      { path: 'a.md', size: 100, mtime: 1000, sha256: 'hash-a' },     // unchanged
      { path: 'b.md', size: 200, mtime: 1500, sha256: 'hash-b-old' }, // outdated
      { path: 'd.md', size: 400, mtime: 1000, sha256: 'hash-d' },     // deleted locally
    ]);

    const diff = computeManifestDiff(local, remote);
    assert.deepEqual(diff.toUpload.sort(), ['b.md', 'c.md']);
    assert.deepEqual(diff.unchanged, ['a.md']);
    assert.deepEqual(diff.toDelete, ['d.md']);
    assert.equal(diff.bytesToTransfer, 550);
  });

  await t.test('exportRcloneConfig formats valid rclone remote', () => {
    const conf = exportRcloneConfig(sampleConfig, 'do-spaces');
    assert.match(conf, /\[do-spaces\]/);
    assert.match(conf, /type = s3/);
    assert.match(conf, /provider = DigitalOcean/);
    assert.match(conf, /endpoint = nyc3\.digitaloceanspaces\.com/);
    assert.match(conf, /access_key_id = DO00EXAMPLEKEY/);
  });

  await t.test('exportS3cmdConfig formats valid .s3cfg file', () => {
    const conf = exportS3cmdConfig(sampleConfig);
    assert.match(conf, /\[default\]/);
    assert.match(conf, /host_base = nyc3\.digitaloceanspaces\.com/);
    assert.match(conf, /host_bucket = %\(bucket\)s\.nyc3\.digitaloceanspaces\.com/);
    assert.match(conf, /access_key = DO00EXAMPLEKEY/);
  });

  await t.test('generateAwsV4AuthHeader computes deterministic signature', async () => {
    const fixedDate = new Date('2026-11-08T12:00:00Z');
    const auth = await generateAwsV4AuthHeader(
      'GET',
      'https://my-anf-vault-backup.nyc3.digitaloceanspaces.com/manifest.json',
      {},
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // empty sha256
      sampleConfig,
      fixedDate
    );

    assert.equal(auth.amzDate, '20261108T120000Z');
    assert.match(auth.authorization, /^AWS4-HMAC-SHA256 Credential=DO00EXAMPLEKEY\/20261108\/nyc3\/s3\/aws4_request/);
    assert.match(auth.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
    assert.match(auth.authorization, /Signature=[0-9a-f]{64}$/);
  });
});
