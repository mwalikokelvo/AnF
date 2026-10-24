"""Read-only Tauri manifest/resource inventory. Python 3.11+, standard library only."""
import argparse
import glob
import json
from pathlib import Path
import re
import tomllib


def inspect(project):
    root = Path(project).resolve()
    candidates = (root, root / 'windows', root / 'build-work/af/work/coucou/windows')
    desktop = next((p for p in candidates if (p / 'src-tauri/tauri.conf.json').is_file()), None)
    if desktop is None:
        raise ValueError('No src-tauri/tauri.conf.json found in the provided project or known desktop paths.')
    backend = desktop / 'src-tauri'
    config = json.loads((backend / 'tauri.conf.json').read_text(encoding='utf-8-sig'))
    cargo = tomllib.loads((backend / 'Cargo.toml').read_text(encoding='utf-8-sig'))
    plugins = set()
    for table in (cargo, *cargo.get('target', {}).values()):
        plugins.update(k for k in table.get('dependencies', {}) if k.startswith('tauri-plugin-'))
    registration = (backend / 'src/lib.rs').read_text(encoding='utf-8-sig') if (backend / 'src/lib.rs').exists() else ''
    registration += (backend / 'src/main.rs').read_text(encoding='utf-8-sig')
    resources = config.get('bundle', {}).get('resources', {})
    patterns = resources.keys() if isinstance(resources, dict) else resources
    missing = [p for p in patterns if not glob.glob(str(backend / p))]
    capabilities = []
    for path in sorted((backend / 'capabilities').glob('*.json')):
        value = json.loads(path.read_text(encoding='utf-8-sig'))
        capabilities.append({k: value.get(k) for k in ('identifier', 'windows', 'permissions')})
    package = json.loads((desktop / 'package.json').read_text(encoding='utf-8-sig'))
    return {
        'desktopPath': str(desktop), 'productName': config.get('productName'),
        'version': config.get('version'), 'pluginDependencies': sorted(plugins),
        'pluginRegistrationSymbols': sorted(set(re.findall(r'tauri_plugin_[a-z_]+::', registration))),
        'capabilities': capabilities, 'missingDefaultResourcePatterns': missing,
        'npmScripts': package.get('scripts', {}),
        'scope': 'Static source inspection only; no compile, installation, device or security acceptance claim.',
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(inspect(args.project), indent=2))
    except (ValueError, OSError) as error:
        parser.exit(2, f'Inspection failed: {error}\n')
