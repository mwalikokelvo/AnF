import os, re

ws = r'C:\Users\mwali\.gemini\antigravity\scratch\AnF\windows\src\workspace'
domains = ['audio', 'ai', 'reader', 'editor', 'storage', 'marketplace']

for d in domains:
    d_path = os.path.join(ws, d)
    for f in os.listdir(d_path):
        if not f.endswith('.ts'):
            continue
        filepath = os.path.join(d_path, f)
        with open(filepath, 'r', encoding='utf-8') as fp:
            content = fp.read()
        
        matches = re.findall(r"from\s+['\"]([^'\"]+)['\"]", content)
        for imp in matches:
            if imp.startswith('.'):
                target = os.path.normpath(os.path.join(d_path, imp))
                if not (os.path.exists(target + '.ts') or os.path.exists(target + '.d.ts') or os.path.isdir(target)):
                    print(f"{d}/{f} -> {imp}")
