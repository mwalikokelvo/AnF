"""Compile and exercise the shipping NSIS template with QA-only keys and payload.

Never run a production installer here: /D and environment AppData overrides do
not isolate its real uninstall keys. This test renders unique registry identity,
manufacturer, bundle ID, default directory and payload before compiling.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid
import winreg


def render_template(source, values):
    tokens = re.split(r"({{[\s\S]*?}})", source)

    def parse(index=0, closing=None):
        nodes = []
        while index < len(tokens):
            token = tokens[index]
            index += 1
            if not token.startswith("{{"):
                nodes.append(("text", token))
                continue
            expression = token[2:-2].strip().strip("~").strip()
            if expression.startswith("/"):
                if expression[1:] != closing:
                    raise ValueError("Unexpected template block: " + expression)
                return nodes, index
            if expression.startswith("#"):
                kind, name = expression[1:].split(maxsplit=1)
                if kind not in ("if", "each"):
                    raise ValueError("Unsupported template block: " + kind)
                children, index = parse(index, kind)
                nodes.append((kind, name.split()[0], children))
            else:
                nodes.append(("value", expression))
        if closing:
            raise ValueError("Unclosed template block: " + closing)
        return nodes, index

    def emit(nodes, item=None):
        output = []
        for kind, *args in nodes:
            if kind == "text":
                output.append(args[0])
            elif kind == "value":
                output.append(str(item if args[0] == "this" else values[args[0]]))
            elif kind == "if":
                if values[args[0]]:
                    output.append(emit(args[1], item))
            else:
                for current in values[args[0]]:
                    output.append(emit(args[1], current))
        return "".join(output)

    return emit(parse()[0])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nsis", type=Path, required=True)
    parser.add_argument("--headers", type=Path, required=True,
                        help="Tauri generated nsis/x64 directory containing utils and language headers")
    parser.add_argument("--output-root", type=Path, required=True,
                        help="Existing workspace-only tools directory; fixtures are retained")
    args = parser.parse_args()
    source_root = Path(__file__).resolve().parents[2]
    output_root = args.output_root.resolve(strict=True)
    if ".tools" not in output_root.parts:
        raise ValueError("Use a workspace .tools directory for isolated installer fixtures")
    token = "AnF-Installer-QA-" + uuid.uuid4().hex
    work = output_root / token
    work.mkdir()
    key_root = "Software\\" + token
    uninstall_root = key_root + r"\Uninstall"
    run_root = key_root + r"\Run"
    manufacturer = token + r"\Manufacturer"
    manufacturer_root = "Software\\" + manufacturer
    legacy = bytes([67, 111, 117, 99, 111, 117]).decode("ascii")
    current_key = uninstall_root + r"\AnF"
    legacy_key = uninstall_root + "\\" + legacy
    payload = work / "AnF-QA.exe"
    payload.write_bytes(b"Isolated QA payload, never launched.\r\n")
    fixture = work / "fixture.nsi"
    values = {name: "" for name in [
        "signed_plugins_path", "homepage", "license", "installer_icon", "sidebar_image",
        "header_image", "uninstaller_icon", "uninstaller_header_image", "copyright",
        "webview2_bootstrapper_path", "webview2_installer_path", "minimum_webview2_version",
        "uninstaller_sign_cmd", "start_menu_folder"]}
    values.update(compression="zlib", manufacturer=manufacturer, product_name=token,
                  version="0.1.99", version_with_build="0.1.99.0", install_mode="currentUser",
                  main_binary_name="AnF-QA", main_binary_path=str(payload), bundle_id="test." + token,
                  out_file=str(work / "setup.exe"), arch="x64", allow_downgrades="true",
                  display_language_selector="false", install_webview2_mode="skip",
                  webview2_installer_args="", estimated_size="1",
                  installer_hooks=str(source_root / "windows/src-tauri/nsis/hooks.nsh"),
                  additional_plugins_path=str(args.nsis.parent / "Plugins/x86-unicode/additional"),
                  languages=["English"], language_files=[str(args.headers / "English.nsh")])
    for name in ("resources_dirs", "resources", "binaries", "file_associations", "deep_link_protocols", "resources_ancestors"):
        values[name] = []
    source = (source_root / "windows/src-tauri/nsis/installer.nsi").read_text(encoding="utf-8-sig")
    rendered = render_template(source, values)
    prelude = ('!addincludedir "' + str(args.headers.resolve()) + '"\n'
               '!define ANF_UNINSTALL_ROOT "' + uninstall_root + '"\n'
               '!define ANF_RUN_ROOT "' + run_root + '"\n'
               '!define ANF_USER_INSTALL_DIR "' + str(work / "fresh") + '"\n')
    fixture.write_text(prelude + rendered, encoding="utf-8-sig")
    if ('!define ANF_UNINSTALL_ROOT "' + uninstall_root + '"') not in prelude:
        raise ValueError("QA registry override missing")
    # All non-overridden identities, shortcuts and startup names are unique QA values.
    assert token in rendered and '"AnF"' not in re.search(r'!define PRODUCTNAME .*', rendered)[0]
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = 0

    def run(command, name):
        result = subprocess.run(command, capture_output=True, text=True, errors="replace",
                                timeout=120, startupinfo=startup, creationflags=subprocess.CREATE_NO_WINDOW)
        (work / (name + ".log")).write_text(result.stdout + result.stderr, encoding="utf-8")
        if result.returncode:
            raise AssertionError(f"{name} failed ({result.returncode}); see {work}")

    run([str(args.nsis.resolve()), "/V2", str(fixture)], "compile")
    view = winreg.KEY_WOW64_64KEY

    def installed_identity_snapshot():
        # Read-only guard: none of these live application records may change.
        records = {}
        for identity in ("AnF", legacy):
            for key in ("Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\" + identity,
                        "Software\\louisraille\\" + identity):
                values = []
                try:
                    with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ | view) as handle:
                        for index in range(winreg.QueryInfoKey(handle)[1]):
                            values.append(winreg.EnumValue(handle, index))
                except FileNotFoundError:
                    pass
                records[key] = sorted(values)
        return hashlib.sha256(repr(records).encode()).hexdigest()

    live_before = installed_identity_snapshot()

    def write(key, name, value):
        assert key.startswith(key_root + "\\") or key.startswith(manufacturer_root + "\\")
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_WRITE | view) as handle:
            winreg.SetValueEx(handle, name, 0, winreg.REG_SZ, value)

    def read(key, name):
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key, 0, winreg.KEY_READ | view) as handle:
            return winreg.QueryValueEx(handle, name)[0]

    def exists(key):
        try:
            read(key, "DisplayVersion")
            return True
        except FileNotFoundError:
            return False

    def seed(name, directory):
        directory.mkdir(exist_ok=True)
        old = "Old-QA.exe"
        (directory / old).write_text("old fixture", encoding="utf-8")
        (directory / "keep-user-data.txt").write_text("retain this fixture", encoding="utf-8")
        key = uninstall_root + "\\" + name
        for field, value in {"DisplayVersion": "0.1.30", "InstallLocation": '"' + str(directory) + '"',
                             "UninstallString": '"' + str(directory / "uninstall.exe") + '"',
                             "MainBinaryName": old, "DisplayName": token + " before"}.items():
            write(key, field, value)
        write(manufacturer_root + "\\" + name, "", str(directory))

    def install(name, target, explicit=False):
        command = [str(work / "setup.exe"), "/S", "/NS", "/UPDATE"]
        if explicit:
            command.append("/D=" + str(target))
        run(command, "install-" + name)
        assert (target / "AnF-QA.exe").read_bytes() == payload.read_bytes()
        assert read(uninstall_root + "\\" + name, "DisplayVersion") == "0.1.99"
        assert read(uninstall_root + "\\" + name, "DisplayName") == token
        assert read(manufacturer_root + "\\" + name, "") == str(target)

    def uninstall(name, target, updating=True):
        assert target.resolve().is_relative_to(work.resolve())
        options = ["/UPDATE"] if updating else []
        run([str(target / "uninstall.exe"), "/S", *options, "_?=" + str(target)], "uninstall-" + name)
        assert not (target / "AnF-QA.exe").exists()
        assert not exists(uninstall_root + "\\" + name)

    fresh = work / "fresh"
    install("AnF", fresh, True)
    uninstall("AnF", fresh)
    # Manufacturer-only leftovers do not outrank a real legacy uninstall record.
    legacy_dir = work / "legacy"
    seed(legacy, legacy_dir)
    install(legacy, legacy_dir)
    assert not (legacy_dir / "Old-QA.exe").exists()
    assert not exists(current_key)
    current_dir = work / "current"
    seed("AnF", current_dir)
    legacy_before = {field: read(legacy_key, field) for field in ("DisplayVersion", "InstallLocation", "UninstallString")}
    install("AnF", current_dir)
    assert legacy_before == {field: read(legacy_key, field) for field in legacy_before}
    assert not (current_dir / "Old-QA.exe").exists()
    run_value = '"' + str(current_dir / "AnF-QA.exe") + '" '
    write(run_root, token, run_value)
    uninstall(legacy, legacy_dir, updating=False)
    assert exists(current_key) and (current_dir / "AnF-QA.exe").exists()
    assert read(run_root, token) == run_value, "Other installation startup entry removed"
    assert (legacy_dir / "keep-user-data.txt").read_text() == "retain this fixture"
    detached_dir = work / "detached"
    detached_dir.mkdir()
    (detached_dir / "uninstall.exe").write_bytes((current_dir / "uninstall.exe").read_bytes())
    (detached_dir / "AnF-QA.exe").write_bytes(payload.read_bytes())
    run([str(detached_dir / "uninstall.exe"), "/S", "/UPDATE", "_?=" + str(detached_dir)], "uninstall-detached")
    assert exists(current_key) and (current_dir / "AnF-QA.exe").exists()
    uninstall("AnF", current_dir, updating=False)
    try:
        read(run_root, token)
        raise AssertionError("Own startup entry retained")
    except FileNotFoundError:
        pass
    assert (current_dir / "keep-user-data.txt").read_text() == "retain this fixture"
    assert installed_identity_snapshot() == live_before, "Live installed application registry changed"
    report = {"result": "passed", "registryRoot": key_root, "filesRoot": str(work),
              "cases": ["fresh explicit target", "legacy only with stale current manufacturer key",
                        "current preferred when both exist", "legacy uninstaller preserves current installation",
                        "startup entry follows its installation", "detached uninstaller preserves registered installations",
                        "current uninstaller removes own record", "user fixture data retained"],
              "productionRegistryKeysModified": False, "applicationLaunched": False,
              "liveIdentityRegistrySha256BeforeAndAfter": live_before,
              "payload": "small QA file; not the production application/resources"}
    (work / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    if sys.platform != "win32":
        raise SystemExit("This actual NSIS/registry test requires Windows.")
    main()
