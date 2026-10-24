import pathlib, re
root=pathlib.Path(__file__).resolve().parent
music=root/'spotube/spotube-master'
path=music/'pubspec.yaml'
text=path.read_text(encoding='utf-8')
text=re.sub(r'(      url: https://github.com/media-kit/media-kit\n)(?!      ref:)',r'\1      ref: d310049f24196250d876efb02b9ff56fa9ef5068\n',text)
assert text.count('ref: d310049f24196250d876efb02b9ff56fa9ef5068')==7
path.write_text(text,encoding='utf-8')
environment=music/'.env'
if not environment.exists():
    environment.write_text('LASTFM_API_KEY=\nLASTFM_API_SECRET=\nHIDE_DONATIONS=1\nENABLE_UPDATE_CHECK=0\nRELEASE_CHANNEL=stable\n',encoding='utf-8')
print('Media-kit revisions pinned; existing environment preserved.')
