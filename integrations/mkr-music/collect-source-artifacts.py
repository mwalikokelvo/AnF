"""Collect exact-coordinate source archives as review evidence, never execute them.

No license approval, publication or complete-corresponding-source claim follows
from downloading a sources JAR. Native libraries/toolchains/build recipes still
need separate review. Only the existing locked binary audit is accepted.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import re
import stat
import time
import urllib.error
import urllib.request
import uuid
import zipfile

HERE = Path(__file__).resolve().parent
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_TOTAL = 256 * 1024 * 1024
VARIANT_BINARY_NAMES = {'io.github.dokar3:quickjs-kt-jvm:1.0.14':'quickjs-jvm.jar'}

def source_url(coordinate):
    parts = coordinate.split(':')
    if len(parts) != 3 or any(not re.fullmatch(r'[A-Za-z0-9_.-]+', p) or p in ('.', '..') for p in parts):
        raise ValueError('Unsupported source coordinate')
    group, artifact, version = parts
    jitpack = group in ('com.github.TeamNewPipe', 'com.github.MetrolistGroup.innertubex')
    if group.startswith('com.github.') and not jitpack:
        raise ValueError('Unreviewed JitPack group')
    host = 'https://jitpack.io' if jitpack else 'https://repo.maven.apache.org/maven2'
    return f'{host}/{group.replace(".", "/")}/{artifact}/{version}/{artifact}-{version}-sources.jar'

def inspect_archive(data):
    if len(data) > MAX_ARCHIVE:
        raise ValueError('Source archive exceeds bound')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 50000 or sum(e.file_size for e in entries) > 300 * 1024 * 1024:
            raise ValueError('Expanded source archive exceeds bound')
        notices, sources, native, classes = [], 0, 0, 0
        for entry in entries:
            name = entry.orig_filename
            if (name.startswith('/') or chr(92) in name or ':' in name or any(ord(c)<32 for c in name) or
                any(p == '..' for p in PurePosixPath(name).parts) or
                stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1 or
                entry.file_size > 32 * 1024 * 1024):
                raise ValueError('Unsafe source archive entry')
            if entry.is_dir():
                continue
            suffix = PurePosixPath(name).suffix.lower()
            sources += suffix in ('.kt', '.java', '.scala', '.c', '.cpp', '.h', '.hpp', '.rs')
            native += suffix in ('.dll', '.so', '.dylib', '.exe')
            classes += suffix == '.class'
            if re.search(r'(^|/)(license|licence|notice|copying|copyright)([._/-]|$)', name, re.I):
                notices.append(name)
        return {'entries': len(entries), 'sourceFiles': sources, 'nativeBinaryEntries': native,
                'classEntries': classes, 'noticeEntryNames': notices[:100],
                'sourceCorrespondenceApproved': False}

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise urllib.error.HTTPError(req.full_url, code, 'Source redirect refused', headers, fp)

def fetch(url, limit):
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(url, headers={'User-Agent':'AnF-Source-Review/1.0', 'Accept-Encoding':'identity'})
    with opener.open(request, timeout=20) as response:
        length = response.headers.get('Content-Length')
        if response.status != 200 or (length and int(length) > limit):
            raise ValueError('Unexpected or oversized source response')
        data = bytearray()
        while True:
            chunk = response.read(min(65536, limit + 1 - len(data)))
            if not chunk:
                break
            data.extend(chunk)
            if len(data) > limit:
                raise ValueError('Source download exceeds bound')
        return bytes(data)

def cached_source(report_file, coordinate, binary_sha):
    """Reuse exact reviewed bytes only; a cache never grants source approval."""
    if report_file is None:
        return None
    report_file = report_file.resolve()
    if report_file.stat().st_size > 1048576:
        raise ValueError('Source cache report exceeds bound')
    report = json.loads(report_file.read_text(encoding='utf-8'))
    matches = [a for a in report['artifacts'] if a['coordinate'] == coordinate]
    if len(matches) > 1:
        raise ValueError('Duplicate cached coordinate')
    if not matches or matches[0].get('binarySha256') != binary_sha:
        return None
    item = matches[0]
    if item.get('status') != 'downloaded':
        return None
    file = Path(item['file'])
    if (item.get('url') != source_url(coordinate) or file.is_symlink() or file.is_junction()
        or file.resolve().parent != report_file.parent or not file.is_file()
        or file.stat().st_size > MAX_ARCHIVE):
        raise ValueError('Unsupported cached source')
    data = file.read_bytes()
    if len(data) != item['bytes'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise ValueError('Cached source changed')
    inspect_archive(data)
    return data, item

def collect(audit, output, reuse_report=None):
    original = audit.read_bytes()
    payload = json.loads(original)
    dependencies = payload['dependencies']
    if len(dependencies) > 128:
        raise ValueError('Unexpected runtime graph')
    locked = set()
    for line in (HERE/'engine/gradle.lockfile').read_text(encoding='utf-8').splitlines():
        if line and not line.startswith('#') and '=' in line:
            coordinate, configs = line.split('=',1)
            if 'runtimeClasspath' in configs.split(','):
                locked.add(coordinate)
    if len({d['coordinate'] for d in dependencies}) != len(dependencies):
        raise ValueError('Duplicate runtime coordinates')
    if any(d['coordinate'] not in locked for d in dependencies):
        raise ValueError('Runtime source request is not in the locked graph')
    # Collect primary Maven Central artifacts first; independent JitPack
    # availability must never cause substitution through a different host.
    dependencies = sorted(dependencies,key=lambda d:(source_url(d['coordinate']).startswith('https://jitpack.io'),d['coordinate']))
    # Validate ALL coordinates and audited binary bytes before network or writes.
    for dep in dependencies:
        source_url(dep['coordinate'])
        binary = Path(dep['file'])
        if not binary.is_file() or binary.is_symlink() or binary.is_junction():
            raise ValueError('Audited runtime input is unavailable')
        group, artifact, version = dep['coordinate'].split(':')
        expected_name = VARIANT_BINARY_NAMES.get(dep['coordinate'],f'{artifact}-{version}.jar')
        if (binary.name != expected_name or binary.parents[1].name != version or
            binary.parents[2].name != artifact or binary.parents[3].name != group):
            raise ValueError('Audited binary cache path does not match coordinate')
        with binary.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != dep['sha256']:
                raise ValueError('Audited runtime binary changed')
    output.mkdir(parents=True, exist_ok=False)
    report = {'schema':1,'auditSha256':hashlib.sha256(original).hexdigest(),
              'readyForPublication':False,'sourceCompleteDistributionPrepared':False,
              'nativeAndToolchainSourceReviewRequired':True,'artifacts':[]}
    total = 0
    try:
        for dep in dependencies:
            coordinate = dep['coordinate']
            url = source_url(coordinate)
            item = {'coordinate':coordinate,'binarySha256':dep['sha256'],'url':url,
                    'sourceReviewRequired':True,'status':'not-fetched'}
            report['artifacts'].append(item)
            try:
                cached = cached_source(reuse_report, coordinate, dep['sha256'])
                data = cached[0] if cached else fetch(url, min(MAX_ARCHIVE, MAX_TOTAL-total))
                if total + len(data) > MAX_TOTAL:
                    raise ValueError('Source collection exceeds bound')
                total += len(data)
                sha = hashlib.sha256(data).hexdigest()
                details = inspect_archive(data)
                file = output/(coordinate.replace(':','__')+'-sources.jar')
                with file.open('xb') as stream:
                    stream.write(data)
                item.update(status='downloaded',file=str(file),bytes=len(data),sha256=sha,archive=details)
                if cached:
                    item['reusedVerifiedBytes'] = True
                    item['repositorySha256Matches'] = cached[1].get('repositorySha256Matches')
                    if 'checksumHttpStatus' in cached[1]:
                        item['checksumHttpStatus'] = cached[1]['checksumHttpStatus']
                    continue
                try:
                    checksum = fetch(url+'.sha256',1024).decode('ascii').strip()
                    if not re.fullmatch(r'[a-fA-F0-9]{64}(\s+\S+)?',checksum):
                        raise ValueError('Unexpected repository checksum')
                    if checksum.split()[0].lower() != sha:
                        raise ValueError('Repository source checksum mismatch')
                    item['repositorySha256Matches'] = True
                except urllib.error.HTTPError as error:
                    item['repositorySha256Matches'] = None
                    item['checksumHttpStatus'] = error.code
                    if error.code in (401,403,429):
                        item['reviewNote'] = 'Checksum access refused; no retries or alternate identity.'
                        report['stoppedForAccessOrRateLimit'] = True
                        break
            except urllib.error.HTTPError as error:
                item.update(status='unavailable',httpStatus=error.code)
                if error.code in (401,403,429):
                    report['stoppedForAccessOrRateLimit'] = True
                    break
            except (ValueError, OSError, zipfile.BadZipFile) as error:
                item.update(status='review-error',errorType=type(error).__name__)
                # Integrity/format/transport problems stop this run, never weaken
                # the checks or retry the same source through a different host.
                report['stoppedForReviewError'] = True
                break
            time.sleep(0.15)
    finally:
        report['downloadedBytes'] = sum(a.get('bytes',0) for a in report['artifacts'] if not a.get('reusedVerifiedBytes'))
        report['collectedBytes'] = total
        report['reusedCount'] = sum(bool(a.get('reusedVerifiedBytes')) for a in report['artifacts'])
        report['downloadedCount'] = sum(a['status']=='downloaded' for a in report['artifacts'])
        report['remainingCoordinates'] = [d['coordinate'] for d in dependencies[len(report['artifacts']):]]
        (output/'source-artifacts.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--audit',type=Path,default=HERE/'engine/build/reports/runtime-dependencies.json')
    parser.add_argument('--reuse-source-report',type=Path)
    args = parser.parse_args()
    output = HERE/'engine/build/source-review'/str(uuid.uuid4())
    result = collect(args.audit, output, args.reuse_source_report)
    print(json.dumps({'report':str(output/'source-artifacts.json'),'downloaded':result['downloadedCount'],
                      'bytes':result['downloadedBytes'],'reused':result['reusedCount'],'stopped':bool(result.get('stoppedForAccessOrRateLimit') or result.get('stoppedForReviewError')),
                      'readyForPublication':False}))
    raise SystemExit(0 if result['downloadedCount']==len(result['artifacts']) and not result['remainingCoordinates']
                     and not result.get('stoppedForReviewError') and not result.get('stoppedForAccessOrRateLimit') else 2)
