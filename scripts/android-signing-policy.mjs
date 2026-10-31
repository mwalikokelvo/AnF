// Public baseline fingerprints, independently verified from the shipped APKs.
export const androidBaselineSigners = {
  legacy: '27789eee03090b2aa4c5fbf37737c8e4dbda61352c2557c076aec233ef4a7a2a',
  anf: '51a4f7d3677a4e63335b274ad8ce9b532c8816501057ad9d3cfc328136b32e1e',
};
export function verifiedAndroidSigner(output, {legacy = false, requireBaseline = true} = {}) {
  const certificates = [...output.matchAll(/^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})\r?$/gm)];
  if (certificates.length !== 1) throw Error('Expected exactly one verified APK signer.');
  const certificate = certificates[0][1];
  if (requireBaseline && certificate !== androidBaselineSigners[legacy ? 'legacy' : 'anf']) {
    throw Error('APK signer differs from this application’s existing baseline; in-place update refused.');
  }
  return certificate;
}
