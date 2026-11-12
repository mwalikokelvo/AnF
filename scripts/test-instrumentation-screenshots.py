"""Screenshot transport fixtures, not actual Android UI proof."""
import base64
import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('screenshots',Path(__file__).parent/'app-qa/instrumentation_screenshots.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
name='mkr-combined-cold.png';data=b'\x89PNG\r\n\x1a\nfixture'
line='INSTRUMENTATION_RESULT: '+name+'='+base64.b64encode(data).decode()
assert module.extract_screenshots(line,(name,))=={name:data}
for report in ('',line+'\n'+line,line+'!',line.replace('iVBOR','AAAAA')):
    try:module.extract_screenshots(report,(name,))
    except ValueError:pass
    else:raise AssertionError('Invalid transport accepted')
print('PASS screenshot extraction and missing/duplicate/malformed/non-PNG rejection; no run-as/debug flag needed')
