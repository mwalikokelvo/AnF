"""Source collector bounds/provenance tests; no network and no source execution."""
import importlib.util
import io
import hashlib
import json
from pathlib import Path
import stat
import tempfile
import unittest
import zipfile

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('sources',root/'integrations/mkr-music/collect-source-artifacts.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
review_spec=importlib.util.spec_from_file_location('review_sources',root/'integrations/mkr-music/review-source-artifacts.py')
review_module=importlib.util.module_from_spec(review_spec);review_spec.loader.exec_module(review_module)

def archive(name,content=b'// fixture',mode=None):
    data=io.BytesIO()
    with zipfile.ZipFile(data,'w') as output:
        entry=zipfile.ZipInfo(name)
        if mode is not None:entry.external_attr=mode<<16
        output.writestr(entry,content)
    return data.getvalue()

class SourceArtifactTests(unittest.TestCase):
    def test_source_cache_requires_exact_binary_and_intact_local_bytes(self):
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder);source=directory/'sources.jar'
            source.write_bytes(archive('src/Fixture.kt'))
            coordinate='org.example:fixture:1';binary_sha='a'*64
            report=directory/'source-artifacts.json'
            item={'coordinate':coordinate,'binarySha256':binary_sha,'status':'downloaded',
                  'file':str(source),'bytes':source.stat().st_size,
                  'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'url':module.source_url(coordinate)}
            report.write_text(json.dumps({'artifacts':[item]}),encoding='utf-8')
            self.assertEqual(module.cached_source(report,coordinate,binary_sha)[0],source.read_bytes())
            self.assertIsNone(module.cached_source(report,coordinate,'b'*64))
            source.write_bytes(b'tampered')
            with self.assertRaises(ValueError):module.cached_source(report,coordinate,binary_sha)
            report.write_text(json.dumps({'artifacts':[item,item]}),encoding='utf-8')
            with self.assertRaises(ValueError):module.cached_source(report,coordinate,binary_sha)
    def test_offline_review_rejects_tampered_sources_and_keeps_native_review_gate(self):
        with tempfile.TemporaryDirectory() as folder:
            directory=Path(folder);binary=directory/'runtime.jar';binary.write_bytes(archive('native/fixture.dll',b'not executable'))
            source=directory/'sources.jar';source.write_bytes(archive('src/Fixture.kt',b'// SPDX-License-Identifier: Apache-2.0\npackage fixture'))
            digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
            coordinate='org.example:fixture:1'
            audit=directory/'audit.json';audit.write_text(json.dumps({'dependencies':[{'coordinate':coordinate,'file':str(binary),'sha256':digest(binary)}]}),encoding='utf-8')
            report=directory/'source-artifacts.json';report.write_text(json.dumps({'auditSha256':digest(audit),'readyForPublication':False,'artifacts':[{'coordinate':coordinate,'binarySha256':digest(binary),'status':'downloaded','file':str(source),'sha256':digest(source),'url':'https://repo.maven.apache.org/maven2/fixture-sources.jar','bytes':source.stat().st_size,'archive':{'noticeEntryNames':[]}}]}),encoding='utf-8')
            result=review_module.review(audit,report)
            self.assertFalse(result['readyForPublication']);self.assertFalse(result['sourceCompleteDistributionPrepared'])
            self.assertTrue(result['dependencies'][0]['nativeSourceReviewRequired'])
            self.assertFalse(result['dependencies'][0]['licenseAndSourceCorrespondenceApproved'])
            self.assertEqual(result['dependencies'][0]['observedHeaderSignals'],{'SPDX-prefix:Apache-2.0':1})
            source.write_bytes(b'tampered source')
            with self.assertRaises(ValueError):review_module.review(audit,report)
    def test_repository_is_fixed_for_exact_coordinates(self):
        self.assertEqual(module.source_url('io.ktor:ktor-client-core-jvm:3.5.2'),'https://repo.maven.apache.org/maven2/io/ktor/ktor-client-core-jvm/3.5.2/ktor-client-core-jvm-3.5.2-sources.jar')
        self.assertTrue(module.source_url('com.github.TeamNewPipe:NewPipeExtractor:v0.26.1').startswith('https://jitpack.io/'))
        self.assertEqual(module.VARIANT_BINARY_NAMES,{'io.github.dokar3:quickjs-kt-jvm:1.0.14':'quickjs-jvm.jar'})
        for value in ['org.foo:thing:../secret','org.foo:../thing:1','com.github.other:thing:1','org.foo:thing:1?token=abc','org.foo:thing:1:more']:
            with self.assertRaises(ValueError):module.source_url(value)
    def test_archive_inventory_does_not_approve_distribution(self):
        result=module.inspect_archive(archive('src/main/kotlin/Fixture.kt'))
        self.assertEqual(result['sourceFiles'],1)
        self.assertIs(result['sourceCorrespondenceApproved'],False)
        self.assertEqual(module.inspect_archive(archive('META-INF/LICENSE'))['noticeEntryNames'],['META-INF/LICENSE'])
    def test_paths_and_links_are_refused_without_extraction(self):
        for name in ['../escape.java','/absolute.java','C:/escape.java']:
            with self.assertRaises(ValueError):module.inspect_archive(archive(name))
        raw=archive('dir/escape.java').replace(b'dir/escape.java',b'dir'+bytes([92])+b'escape.java')
        with self.assertRaises(ValueError):module.inspect_archive(raw)
        with self.assertRaises(ValueError):module.inspect_archive(archive('link',b'target',stat.S_IFLNK|0o777))
    def test_malformed_and_oversized_are_refused(self):
        with self.assertRaises(zipfile.BadZipFile):module.inspect_archive(b'not a jar')
        previous=module.MAX_ARCHIVE
        try:
            module.MAX_ARCHIVE=10
            with self.assertRaises(ValueError):module.inspect_archive(archive('Fixture.java'))
        finally:module.MAX_ARCHIVE=previous

if __name__=='__main__':unittest.main()
