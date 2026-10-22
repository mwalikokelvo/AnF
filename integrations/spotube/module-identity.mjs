export function configureAndroidModule(spec) {
  const anchor = 'flutter:\n  generate: true';
  if (!spec.includes(anchor)) throw Error('Pinned upstream Flutter module configuration changed.');
  return spec.replace(anchor, 'flutter:\n  module:\n    androidX: true\n    androidPackage: com.anf.spotube\n    iosBundleIdentifier: com.anf.spotube\n  generate: true');
}
