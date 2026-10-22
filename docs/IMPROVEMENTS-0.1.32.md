# AnF 0.1.32 release changes

This update improves gateway setup, installer upgrade compatibility and OCR.
Release artifacts are only ready after final gates and package verification.

- OmniRoute: guided pinned local setup, explicit model discovery/selection,
  connection versus generation status and a small explicit generation check.
  Gateway Chat preserves the first user message and uses bounded responses.
  The bundled offline model remains independently usable without provider keys.
- Windows installer: chooses existing current registration, otherwise existing
  legacy registration, otherwise a fresh AnF installation. Uninstallers match
  their own installation location before removing identity/startup records.
- OCR: preserves smaller raster pixel grids and bounds both PDF render axes.
  The original scanned-PDF 'seven letters' regression now passes without changing
  the fixture or expected text. A separate retained model diagnostic still reads
  'El' as 'Fl'; general OCR accuracy is not claimed solved.
- Android native music build tooling: correct module namespace and Windows
  Flutter/Gradle invocation, pinned-version probe and upstream-drift rejection.
  This does not supply a native music AAR or prove online playback on a phone.

OmniRoute remains an optional separately installed service; one-click managed
installation is not implemented. Cloud accounts, provider eligibility and quota
remain provider responsibilities. The actual local gateway proof uses a bundled
local model, not a cloud provider. Custom five-voice CPU speech remains Windows-only
and uses the compatible private 0.1.31 voice pack. Android uses installed TTS.

Device/emulator Android installation, production signing, Linux/iOS builds,
provider401 playback repair and Strix scanning remain outstanding as documented in
REMAINING-IMPLEMENTATION-PLAN.md. Every delivered application update includes
verified Windows installer/portable and Android development APK links.
