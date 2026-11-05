"""Validate actual merged manifest/generated shortcuts, without installing an app."""
import argparse
import json
import xml.etree.ElementTree as ET

A = '{http://schemas.android.com/apk/res/android}'
IDS = {'com.anf.workspace', 'com.coucou.workspace',
       'com.anf.workspace.musicdev', 'com.coucou.workspace.musicdev'}


def validate(manifest, shortcuts, application_id):
    def require(condition, message):
        if not condition:
            raise ValueError(message)
    require(application_id in IDS, 'Unsupported application identity')
    legacy = application_id.startswith('com.coucou.')
    namespace = 'com.coucou.workspace' if legacy else 'com.anf.workspace'
    launcher, tile = namespace + '.MainActivity', namespace + '.QuickNoteTile'
    require(manifest.get('package') == application_id, 'Merged manifest identity mismatch')
    app = manifest.find('application')
    require(app is not None, 'Missing application')
    launchers = []
    for entry in list(app):
        if entry.tag not in ('activity', 'activity-alias'):
            continue
        for intent in entry.findall('intent-filter'):
            actions = {n.get(A + 'name') for n in intent.findall('action')}
            categories = {n.get(A + 'name') for n in intent.findall('category')}
            if 'android.intent.action.MAIN' in actions and 'android.intent.category.LAUNCHER' in categories:
                launchers.append(entry)
    require(len(launchers) == 1, 'Exactly one launcher must be declared')
    entry = launchers[0]
    require(entry.get(A + 'name') == launcher, 'Saved launcher component changed')
    require(entry.get(A + 'exported') == 'true', 'Launcher must be exported')
    metadata = entry.findall('meta-data')
    require(any(n.get(A + 'name') == 'android.app.shortcuts' and n.get(A + 'resource') == '@xml/shortcuts'
                for n in metadata), 'Launcher shortcut metadata missing')
    if legacy:
        require(entry.tag == 'activity-alias' and entry.get(A + 'targetActivity') == 'com.anf.workspace.MainActivity',
                'Legacy launcher must forward to the retained implementation')
        require(any(n.get(A + 'name') == 'com.anf.workspace.MainActivity' for n in app.findall('activity')),
                'Alias target activity missing')
    tiles = [service for service in app.findall('service')
             if any(n.get(A + 'name') == 'android.service.quicksettings.action.QS_TILE'
                    for intent in service.findall('intent-filter') for n in intent.findall('action'))]
    require(len(tiles) == 1 and tiles[0].get(A + 'name') == tile, 'Saved tile component changed')
    require(tiles[0].get(A + 'permission') == 'android.permission.BIND_QUICK_SETTINGS_TILE'
            and tiles[0].get(A + 'exported') == 'true', 'Tile permission/export boundary changed')
    media = [service for service in app.findall('service')
             if any(n.get(A + 'name') == 'androidx.media3.session.MediaSessionService'
                    for intent in service.findall('intent-filter') for n in intent.findall('action'))]
    require(len(media) == 1 and media[0].get(A + 'name') == namespace + '.PlaybackService'
            and media[0].get(A + 'exported') == 'false', 'Private media-service identity or boundary changed')
    quick = [n for n in shortcuts.findall('shortcut') if n.get(A + 'shortcutId') == 'quick_note']
    require(len(quick) == 1, 'Quick-note shortcut missing or duplicated')
    intents = quick[0].findall('intent')
    require(len(intents) == 1, 'Unexpected quick-note intent stack')
    require(intents[0].get(A + 'targetPackage') == application_id, 'Shortcut points at another installed package')
    require(intents[0].get(A + 'targetClass') == launcher, 'Shortcut bypasses saved launcher component')
    require(intents[0].get(A + 'action') in ('com.anf.QUICK_NOTE', 'com.coucou.QUICK_NOTE'),
            'Unsupported quick-note action')
    return {'applicationId': application_id, 'launcher': launcher, 'tile': tile, 'mediaService': namespace + '.PlaybackService',
            'generatedInputsVerified': True, 'installedUpgradeVerified': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--shortcuts', required=True)
    parser.add_argument('--application-id', required=True)
    args = parser.parse_args()
    print(json.dumps(validate(ET.parse(args.manifest).getroot(), ET.parse(args.shortcuts).getroot(), args.application_id)))
