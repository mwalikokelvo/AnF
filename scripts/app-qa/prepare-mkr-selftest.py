"""Add a native page-load self-test ONLY to an existing disposable QA snapshot."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[2]
EVIDENCE=ROOT.parent/'anf-pr47-evidence'
qa=Path(json.loads((EVIDENCE/'latest-mkr-workspace-qa.json').read_text(encoding='utf-8'))['directory'])
assert qa.parent==EVIDENCE and qa.name.startswith('mkr-workspace-qa-')
app=qa/'source/windows/src-tauri'
assert 'name = "anf-mkr-qa"' in (app/'Cargo.toml').read_text(encoding='utf-8')
p=app/'src/lib.rs';text=p.read_text(encoding='utf-8')
assert 'mod qa_native;' not in text
text=text.replace('mod mkr_native;', 'mod mkr_native;\nmod qa_native;',1)
text=text.replace('.invoke_handler(tauri::generate_handler![','.invoke_handler(tauri::generate_handler![\n            qa_native::qa_native_ack_mode,qa_native::qa_native_ack_waiting,qa_native::qa_native_release_ack,qa_native::qa_native_info,qa_native::qa_native_result,',1)
original='let win = WebviewWindowBuilder::new(&handle, "workspace", workspace_url)'
assert text.count(original)==1
text=text.replace(original, original+'''
                .on_page_load(|window,payload| {
                    if payload.event()==tauri::webview::PageLoadEvent::Finished {
                        let _=window.eval(include_str!("../mkr-native-selftest.js"));
                    }
                })''',1)
for source,dest in [('mkr_qa_native.rs',app/'src/qa_native.rs'),('mkr-native-selftest.js',app/'mkr-native-selftest.js')]:
    dest.write_text((ROOT/'scripts/app-qa/fixtures'/source).read_text(encoding='utf-8'),encoding='utf-8')
p.write_text(text,encoding='utf-8')
backend=app/'src/mkr_native.rs'
text=backend.read_text(encoding='utf-8')
original='workspace(&window)?;\n    acknowledge(&state.0, &token, paused)'
assert text.count(original)==1
text=text.replace(original,'workspace(&window)?;\n    if crate::qa_native::capture_ack(&token,paused)? {return Ok(());}\n    let paused=crate::qa_native::pause_ack_value(paused);\n    acknowledge(&state.0, &token, paused)',1)
backend.write_text(text,encoding='utf-8')
print('Prepared test-only native page-load runner; production source/gate unchanged.')
