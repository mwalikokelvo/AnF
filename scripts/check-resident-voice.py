"""Dependency-free tests of the resident worker's real parsing/path/hash functions."""
import ast,hashlib,json,pathlib,re,subprocess,sys,tempfile,unittest
source=pathlib.Path(__file__).with_name('local-voice-resident.py')
tree=ast.parse(source.read_text(encoding='utf-8'))
namespace={'pathlib':pathlib,'json':json,'hashlib':hashlib,'re':re}
functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('request','job_path','verify')]
assert len(functions)==3
exec(compile(ast.Module(body=functions,type_ignores=[]),str(source),'exec'),namespace)

class ResidentContract(unittest.TestCase):
    def frame(self,**changes):
        value={'v':1,'id':'a'*64,'root':str(source.parent.resolve()),'voice':'amazing','text':'A local sentence.'}
        value.update(changes)
        return (json.dumps(value)+'\n').encode()
    def test_valid_unicode_limit(self):
        value=namespace['request'](self.frame(text='🌻'*600))
        self.assertEqual(len(value['text']),600)
    def test_rejects_invalid_schema_and_versions(self):
        for raw in [b'{}\n',b'null\n',self.frame(v=True),self.frame(v=2),self.frame(extra='x')]:
            with self.assertRaises(ValueError):namespace['request'](raw)
    def test_rejects_paths_and_unknown_voices(self):
        for changes in [{'id':'../escape'},{'id':'A'*64},{'root':'relative'},{'voice':'unknown'},{'text':' '},{'text':'x'*601}]:
            with self.assertRaises(ValueError):namespace['request'](self.frame(**changes))
    def test_bounds_and_newline_are_required(self):
        for raw in [b'x'*8193,self.frame()[:-1],self.frame()+self.frame()]:
            with self.assertRaises(ValueError):namespace['request'](raw)
    def test_hashes_are_rechecked_and_manifest_changes_identified(self):
        with tempfile.TemporaryDirectory(prefix='anf-resident-hash-') as temp:
            root=pathlib.Path(temp).resolve();file=root/'reference.dat';file.write_bytes(b'original')
            manifest={'files':[{'file':file.name,'bytes':8,'sha256':hashlib.sha256(b'original').hexdigest()}]}
            p=root/'provenance.json';p.write_text(json.dumps(manifest))
            first=namespace['verify'](root)
            file.write_bytes(b'modified')
            with self.assertRaises(ValueError):namespace['verify'](root)
            file.write_bytes(b'original');self.assertEqual(first,namespace['verify'](root))
            p.write_text(json.dumps(manifest)+'\n');self.assertNotEqual(first,namespace['verify'](root))
    def test_manifest_cannot_escape_root(self):
        with tempfile.TemporaryDirectory(prefix='anf-resident-path-') as temp:
            base=pathlib.Path(temp);root=base/'root';root.mkdir();outside=base/'outside';outside.write_bytes(b'x')
            (root/'provenance.json').write_text(json.dumps({'files':[{'file':'../outside','bytes':1,'sha256':hashlib.sha256(b'x').hexdigest()}]}))
            with self.assertRaises(ValueError):namespace['verify'](root)
    def test_output_requires_exact_existing_sibling(self):
        with tempfile.TemporaryDirectory(prefix='anf-resident-job-') as temp:
            namespace['base']=pathlib.Path(temp).resolve();key='b'*64
            with self.assertRaises(ValueError):namespace['job_path'](key)
            (namespace['base']/key).mkdir()
            self.assertEqual(namespace['job_path'](key),namespace['base']/key)
    def test_real_entrypoint_refuses_malformed_input_without_protocol_success(self):
        for raw in [b'{}\n',b'x'*8193,self.frame(v=2)]:
            child=subprocess.run([sys.executable,'-I','-B',str(source)],input=raw,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=15)
            self.assertNotEqual(child.returncode,0)
            self.assertEqual(child.stdout,b'')

if __name__=='__main__':unittest.main()
