import os

ws = r'C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows\src\workspace'

replacements = {
    'audio/audio-denoise.ts': [('../../../shared/audio/denoise', '../../../../shared/audio/denoise')],
    'audio/audio-queue.ts': [('../../../shared/audio/queue', '../../../../shared/audio/queue')],
    'audio/audio-studio.ts': [('../views/dom', '../../views/dom')],
    'audio/music-hub.ts': [
        ('../views/dom', '../../views/dom'),
        ('./media-kinds', '../media-kinds')
    ],
    'audio/native-music-player.ts': [('../views/dom', '../../views/dom')],
    'audio/speech-player.ts': [('../views/dom', '../../views/dom')],
    'audio/spotube-desktop.ts': [('../views/dom', '../../views/dom')],
    'ai/answer-evidence.ts': [('../../../shared/domain/answer-evidence', '../../../../shared/domain/answer-evidence')],
    'ai/followups.ts': [('../../../shared/domain/followups', '../../../../shared/domain/followups')],
    'reader/knowledge-data.ts': [('../../../shared/domain/knowledge-data', '../../../../shared/domain/knowledge-data')],
    'reader/library-data.ts': [('../../../shared/domain/library-data', '../../../../shared/domain/library-data')],
    'reader/library.ts': [('../views/dom', '../../views/dom')],
    'reader/quick-capture.ts': [('../views/dom', '../../views/dom')],
    'reader/reader-data.ts': [('../../../shared/domain/reader-data', '../../../../shared/domain/reader-data')],
    'reader/reader.ts': [
        ('../views/dom', '../../views/dom'),
        ('./speech-player', '../audio/speech-player'),
        ('./article-publishing', '../editor/article-publishing'),
        ('./ocr-client', '../ai/ocr-client')
    ],
    'editor/reply-to-draft.ts': [
        ('../views/dom', '../../views/dom'),
        ('./knowledge-data', '../reader/knowledge-data')
    ],
    'editor/writing.ts': [
        ('../views/dom', '../../views/dom'),
        ('./ocr-client', '../ai/ocr-client')
    ],
    'storage/backup-tools.ts': [('../views/dom', '../../views/dom')],
    'storage/snapshot-panel.ts': [('../views/dom', '../../views/dom')],
    'storage/vault-panel.ts': [('../views/dom', '../../views/dom')],
    'marketplace/addons-core.ts': [('../views/dom', '../../views/dom')],
    'marketplace/apps-catalog.ts': [('../views/dom', '../../views/dom')]
}

for rel_path, reps in replacements.items():
    filepath = os.path.join(ws, rel_path.replace('/', os.sep))
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        for src, dest in reps:
            content = content.replace(f"'{src}'", f"'{dest}'").replace(f'"{src}"', f'"{dest}"')
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {rel_path}")
