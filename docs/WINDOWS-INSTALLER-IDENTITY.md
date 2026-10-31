# Windows installer identity compatibility

AnF 0.1.31 changed the installer uninstall key and saved install folder while
renaming the product. That prevented the installer from discovering an existing
legacy installation. It could create a second install instead of updating the
existing directory and Add/Remove Programs entry.

The installer now chooses its registry identity before language, maintenance and
install-location handling. An existing current uninstall record wins; otherwise an
existing legacy record wins; a fresh install uses the AnF identity and default
folder. A saved manufacturer folder without an uninstall record does not outrank
an existing legacy installation. Legacy registry identity is encoded in the source
and used only for compatibility; the displayed product name remains AnF.

All maintenance/version queries and registry writes use the selected identity.
Registered install paths are unquoted and normalized before comparison, and the
selected path supplies the verified directory for maintenance uninstall commands.
The generated uninstaller matches its own installation directory to a current or
legacy record rather than blindly choosing the newest product identity. If no
record matches, it does not delete either uninstall key. Startup entries are
removed only when their executable points to that uninstaller's installation.
The installer checks the registered previous executable for locks and only removes
an old executable name when it is a basename within the selected directory.

## Isolated executable verification

`scripts/app-qa/windows-installer-identity.py` renders the actual shipping NSIS
template with a tiny inert payload and a unique QA-only uninstall registry root,
manufacturer, product name, startup root, bundle ID and default directory. It
compiles and executes that fixture installer and its generated uninstallers.
Fixtures/logs are retained under the supplied workspace `.tools` directory.

The test verifies fresh explicit-target installation; legacy-only upgrade even
with stale current manufacturer data; current precedence when both exist;
uninstallation of the legacy copy without disturbing the current copy; startup
entry ownership; a detached uninstaller with no matching record; removal of the
current copy's own record; and preservation of fixture user files. It hashes live
current/legacy installed registry metadata before and after to prove it remained
unchanged. It never launches an application or executes a production installer.

Example (Windows, with the existing cached NSIS/Tauri headers):

```powershell
python scripts/app-qa/windows-installer-identity.py `
  --nsis C:/Users/USER/AppData/Local/tauri/NSIS/makensis.exe `
  --headers windows/target/release/nsis/x64 `
  --output-root ../.tools
```

The current Windows configuration is `currentUser`, x64. The executable smoke
test covers that shipping configuration; it does not claim elevated per-machine
or interactive multi-user installation testing. The small fixture establishes
installer identity behavior rather than production payload integrity or native
application startup. Those require the final packaged release checks separately.
Do not use `/D` or environment AppData overrides alone to run a production
installer on a workstation: they do not redirect its real uninstall registry keys.
