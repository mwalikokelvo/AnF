"""Local metadata evidence, NOT license clearance or a source-complete package.

Reads the locked runtime audit and cached POM/source files only. No network,
external XML entities, executable inputs or publication changes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

MAX_METADATA = 1_048_576


def pom_evidence(data: bytes) -> dict:
    if len(data) > MAX_METADATA or b"<!doctype" in data.lower() or b"<!entity" in data.lower():
        raise ValueError("Unsafe or oversized dependency metadata")
    root = ET.fromstring(data)

    def text(element, name):
        child = element.find("{*}" + name)
        return (child.text or "").strip()[:2000] if child is not None else ""

    licenses = []
    for element in root.findall("{*}licenses/{*}license"):
        licenses.append({key: text(element, key) for key in ("name", "url", "distribution")})
    scm = root.find("{*}scm")
    parent = root.find("{*}parent")
    return {
        "declaredLicenses": licenses,
        "licenseInheritanceUnresolved": not bool(licenses),
        "scm": {key: text(scm, key) for key in ("url", "connection", "tag")} if scm is not None else {},
        "projectUrl": text(root, "url"),
        "parent": {key: text(parent, key) for key in ("groupId", "artifactId", "version")} if parent is not None else {},
        "sourceReviewRequired": True,
    }


def fingerprint(file: Path) -> str:
    if file.is_symlink() or not file.is_file() or file.stat().st_size > 536_870_912:
        raise ValueError("Unsupported dependency input")
    digest = hashlib.sha256()
    with file.open("rb") as stream:
        for block in iter(lambda: stream.read(65_536), b""):
            digest.update(block)
    return digest.hexdigest()


def version_findings(dependencies: list[dict]) -> list[dict]:
    ktor = sorted({item["coordinate"].split(":")[2] for item in dependencies
                   if item["coordinate"].startswith("io.ktor:")})
    return [{"kind": "mixed-ktor-modules", "versions": ktor,
             "reviewRequired": True, "causeOfEarlierFailureEstablished": False}] if len(ktor) > 1 else []


def parent_evidence(cache: Path, parent: dict, seen=None, depth=0) -> list[dict]:
    """Follow exact cached parent coordinates, never properties or remote URLs."""
    values = [parent.get(key, "") for key in ("groupId", "artifactId", "version")]
    if depth >= 8 or not all(re.fullmatch(r"[A-Za-z0-9_.-]+", value) and value not in (".", "..") for value in values):
        return []
    coordinate = ":".join(values)
    seen = set() if seen is None else seen
    if coordinate in seen:
        return []
    seen.add(coordinate)
    directory = cache.joinpath(*values)
    if directory.is_symlink() or not directory.is_dir():
        return []
    folders = sorted(directory.iterdir())
    if len(folders) > 64:
        raise ValueError("Parent metadata exceeds cache bound")
    result = []
    for folder in folders:
        if folder.is_symlink() or not folder.is_dir():
            continue
        file = folder / f"{values[1]}-{values[2]}.pom"
        if not file.is_file() or file.is_symlink():
            continue
        if file.stat().st_size > MAX_METADATA:
            raise ValueError("Parent metadata exceeds byte bound")
        data = file.read_bytes()
        evidence = pom_evidence(data)
        result.append({"coordinate": coordinate, "sha256": hashlib.sha256(data).hexdigest(),
                       "hashRecordedOnly": True, **evidence})
        if not evidence["declaredLicenses"]:
            result.extend(parent_evidence(cache, evidence["parent"], seen, depth + 1))
    return result


def cached_metadata(artifact: dict) -> dict:
    file = Path(artifact["file"])
    if file.suffix != ".jar" or fingerprint(file) != artifact["sha256"]:
        raise ValueError("Dependency differs from locked runtime audit")
    group, name, version = artifact["coordinate"].split(":")
    version_root = file.parent.parent
    expected_pom = f"{name}-{version}.pom"
    expected_sources = f"{name}-{version}-sources.jar"
    poms, sources = [], []
    folders = sorted(version_root.iterdir())
    if len(folders) > 64:
        raise ValueError("Dependency cache exceeds metadata bound")
    for folder in folders:
        if folder.is_symlink() or not folder.is_dir():
            continue
        for expected, output in ((expected_pom, poms), (expected_sources, sources)):
            found = folder / expected
            if found.is_file() and not found.is_symlink():
                if expected.endswith(".pom"):
                    if found.stat().st_size > MAX_METADATA:
                        raise ValueError("Dependency metadata exceeds bound")
                    data = found.read_bytes()
                    evidence = pom_evidence(data)
                    parents = parent_evidence(version_root.parent.parent.parent, evidence["parent"]) if not evidence["declaredLicenses"] else []
                    output.append({"sha256": hashlib.sha256(data).hexdigest(),
                                   "hashRecordedOnly": True, **evidence,
                                   "cachedParentEvidence": parents,
                                   "cachedLicenseDeclarationFound": bool(evidence["declaredLicenses"] or any(item["declaredLicenses"] for item in parents))})
                else:
                    output.append({"name": expected, "sha256": fingerprint(found),
                                   "sourceCorrespondenceReviewed": False})
    return {"coordinate": artifact["coordinate"], "artifactSha256": artifact["sha256"],
            "embeddedNoticeEntries": artifact["noticeEntries"], "cachedPomEvidence": poms,
            "cachedSourceArchives": sources, "sourceReviewRequired": True,
            "metadataMissing": not bool(poms)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    base = Path(__file__).resolve().parent
    parser.add_argument("--audit", type=Path, default=base / "engine/build/reports/runtime-dependencies.json")
    parser.add_argument("--output", type=Path, default=base / "engine/build/reports/dependency-review.json")
    args = parser.parse_args()
    if args.audit.stat().st_size > MAX_METADATA:
        raise ValueError("Runtime audit exceeds bound")
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    if audit["schema"] != 1 or audit["readyForPublication"] is not False or len(audit["dependencies"]) > 256:
        raise ValueError("Invalid engineering runtime audit")
    records = [cached_metadata(item) for item in audit["dependencies"]]
    supplementary = json.loads((base / "dependency-evidence.json").read_text(encoding="utf-8"))
    if supplementary["schema"] != 1 or supplementary["readyForPublication"] is not False:
        raise ValueError("Invalid supplementary review evidence")
    jdk_sources = Path(audit["jdkHome"]) / "lib/src.zip"
    result = {"schema": 1, "readyForPublication": False, "sourceCompleteDistributionPrepared": False,
              "dependencyCount": len(records), "dependencies": records,
              "versionReviewFindings": version_findings(audit["dependencies"]),
              "pinnedUpstreamFileObservations": supplementary["observations"],
              "jdk": {"javaSourcesPresent": jdk_sources.is_file(),
                      "javaSourcesSha256": fingerprint(jdk_sources) if jdk_sources.is_file() else None,
                      "completeJdkCorrespondingSourceReviewed": False},
              "notes": ["POM declarations are evidence, not license approval.",
                        "Only exact locally cached parent coordinates were followed; no unresolved property was guessed.",
                        "A source JAR or Java src.zip alone does not prove complete corresponding source."]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(f"PASS: {len(records)} exact dependency hashes audited; "
          f"{sum(bool(item['cachedPomEvidence']) for item in records)} cached POM records; "
          f"{sum(bool(item['cachedSourceArchives']) for item in records)} cached source archives. "
          "Publication and source-completeness remain unapproved.")


if __name__ == "__main__":
    main()
