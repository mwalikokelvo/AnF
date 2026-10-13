# AnF 0.1.20

The Android release is locally built and signed with the supplied original release key. The alternate APK uses the supplied original debug key. Both contain the same release build. Install over the existing app; never uninstall an existing app just to bypass a signature conflict. The earlier temporary CI debug APK from chat has a different key.

Both platforms have the new AnF design and branding. Windows frontend builds and rendered UI checks passed. A new Windows native installer is pending: GitHub refused to start its job because recent payments failed or the Actions spending limit needs increasing. The older Coucou installer is not the new AnF version.

Verification: TypeScript/Vite build, Android release/debug build with release lint, packaged assets and signer identities, 72 rendered views across themes and widths, browser draft/appearance persistence, existing data/sync regressions, and old/new encrypted-backup compatibility. Current native installed-update tests were blocked by GitHub billing; previous 0.1.19 installed-update tests passed. No claim of new Windows installation testing is made yet.

Windows installation records and data locations retain legacy identities so the new visible name does not abandon existing data. Android package ID, browser origin, databases, key aliases and backup authentication remain stable. New encrypted backups use .anfpack, and old .coucoupack files remain readable.

The Windows installer remains unsigned and has an unresolved Defender detection in the repository. Public Windows publication is paused. Do not disable antivirus.

Once Actions is restored, dispatch windows.yml with baseline_run=38415985060, and android.yml with baseline_run=38444710493 on codex/release-builds. After the Windows native build passes, use windows.yml's downloads_run and android_download_branch=codex/app-downloads-0.1.20 to upload private draft release assets. The original signing keys and passwords remain outside the repository and CI.
