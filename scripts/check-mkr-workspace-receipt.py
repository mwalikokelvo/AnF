"""Offline receipt regressions; no app, toolchain, network or user data access."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('receipt', ROOT/'scripts/app-qa/mkr-workspace-receipt.py')
receipt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receipt)

class ReceiptTests(unittest.TestCase):
    def test_content_changes_are_visible_but_generated_schemas_are_excluded(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp)
            file = source/'windows/src-tauri/src/lib.rs'
            file.parent.mkdir(parents=True)
            file.write_text('original')
            before = receipt.snapshot_inputs(source)
            generated = source/'windows/src-tauri/gen/schemas/schema.json'
            generated.parent.mkdir(parents=True)
            generated.write_text('{}')
            self.assertEqual(receipt.snapshot_inputs(source), before)
            file.write_text('changed')
            self.assertNotEqual(receipt.snapshot_inputs(source), before)
            file.unlink()
            with self.assertRaises(ValueError):
                receipt.snapshot_inputs(source)

    def test_seal_then_built_receipt_refuses_stale_or_changed_build_inputs(self):
        with tempfile.TemporaryDirectory() as temp:
            qa = Path(temp)
            (qa/'source').mkdir()
            (qa/'source/fixture.rs').write_text('original')
            binary = qa/'test.exe'
            inputs = {'windows/src/workspace.ts':'a'*64}
            with patch.object(receipt,'context',return_value=(qa,{},binary)), \
                 patch.object(receipt,'production_inputs',return_value=inputs), \
                 patch.object(receipt,'git',side_effect=lambda *args:'' if args[0]=='status' else 'b'*40):
                with patch('sys.argv',['receipt','seal']):
                    receipt.main()
                    with self.assertRaises(FileExistsError):
                        receipt.main()
                binary.write_bytes(b'not a runnable executable')
                with patch('sys.argv',['receipt','built']):
                    (qa/'source/fixture.rs').write_text('drift')
                    with self.assertRaises(ValueError):
                        receipt.main()
                    (qa/'source/fixture.rs').write_text('original')
                    receipt.main()
                built = json.loads((qa/'built-receipt.json').read_text())
                self.assertEqual(built['binarySha256'],receipt.sha(binary))
                self.assertFalse(built['readyForPublication'])
                self.assertEqual(built['sourceReceiptSha256'],receipt.sha(qa/'source-receipt.json'))

    def test_existing_binary_cannot_be_sealed(self):
        with tempfile.TemporaryDirectory() as temp:
            qa = Path(temp)
            binary = qa/'old.exe'
            binary.write_bytes(b'old')
            with patch.object(receipt,'context',return_value=(qa,{},binary)), patch('sys.argv',['receipt','seal']):
                with self.assertRaises(ValueError):
                    receipt.main()
            self.assertFalse((qa/'source-receipt.json').exists())

    def test_non_hosted_context_refused(self):
        with patch.dict(os.environ,{'GITHUB_ACTIONS':'false'}):
            with self.assertRaises(ValueError):
                receipt.context()

    @unittest.skipUnless(os.name == 'nt', 'Windows desktop identity guard')
    def test_explicit_local_mode_still_rejects_non_qa_and_wrong_target(self):
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            root = base/'repo'
            evidence = base/'evidence'
            qa = evidence/'mkr-workspace-qa-test'
            qa.mkdir(parents=True)
            (evidence/'latest-mkr-workspace-qa.json').write_text(json.dumps({'directory':str(qa)}))
            descriptor = {'engineeringOnly':True,'readyForPublication':False,
                          'cargoTarget':str(root/'windows/target')}
            with patch.object(receipt,'ROOT',root), patch.object(receipt,'EVIDENCE',evidence), \
                 patch.dict(os.environ,{'GITHUB_ACTIONS':'false'}):
                for changes in ({'engineeringOnly':False}, {'readyForPublication':True},
                                {'cargoTarget':str(base/'other-target')}):
                    (qa/'engineering.json').write_text(json.dumps({**descriptor,**changes}))
                    with self.assertRaises(ValueError):
                        receipt.context(True)
                (qa/'engineering.json').write_text(json.dumps(descriptor))
                self.assertEqual(receipt.context(True)[2],root/'windows/target/debug/anf-mkr-qa.exe')

if __name__ == '__main__':
    unittest.main()
