"""Graph safety fixtures: preserve releases and pinned native bytes."""
from copy import deepcopy
import importlib.util
from pathlib import Path

spec=importlib.util.spec_from_file_location('audit',Path(__file__).with_name('audit-mkr-combined-review.py'))
audit=importlib.util.module_from_spec(spec);spec.loader.exec_module(audit)
def item(coordinate,digest):return {'coordinate':coordinate,'sha256':digest*64}
root=[item('app:existing:1','a')]
native={'dependencies':[item('native:core:2','b')]}
baseline={'inventories':{'releaseRuntimeClasspath':root,'reviewRuntimeClasspath':root}}
combined={'inventories':{'releaseRuntimeClasspath':root,'reviewRuntimeClasspath':root+native['dependencies']+[item(audit.MODULE,'c')]}}
assert audit.validate(baseline,combined,native,'c'*64)['releaseGraphUnchanged']
def rejects(value):
    try:audit.validate(baseline,value,native,'c'*64)
    except ValueError:return
    raise AssertionError('Unsafe graph was accepted')
bad=deepcopy(combined);bad['inventories']['releaseRuntimeClasspath']+=native['dependencies'];rejects(bad)
bad=deepcopy(combined);bad['inventories']['reviewRuntimeClasspath'][1]['sha256']='d'*64;rejects(bad)
bad=deepcopy(combined);bad['inventories']['reviewRuntimeClasspath'].append(item('unknown:runtime:1','e'));rejects(bad)
bad=deepcopy(combined);bad['inventories']['reviewRuntimeClasspath'].pop(1);rejects(bad)
print('PASS release isolation, native checksum retention, unknown and missing dependency rejection')
