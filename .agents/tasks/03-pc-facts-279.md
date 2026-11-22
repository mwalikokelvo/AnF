# 03: PC facts for issue #279 (Kevo heard nothing, 0 of 20 wakes)

**Goal**: in the PC self-test the clips played but Kevo's ears heard nothing at all. Only this PC can say why. Collect facts; change no code and play no sound (the owner is asleep).

**Branch**: none.

**Steps**, in PowerShell, read-only:
1. Microphone privacy: is microphone access on for the PC, and for desktop apps? (`HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone` and its `NonPackaged` subkeys: `Value`, and whether AnF's exe is listed.)
2. Recording devices: `Get-PnpDevice -Class AudioEndpoint | Select Status, FriendlyName` and which one is the default input. Is there a working microphone at all, or only "Stereo Mix" / none?
3. The wake model: in the installed AnF folder, do the `kevo-wake-model` / `kevo-ears` files exist? List names and sizes, and the SHA-256 of each (`Get-FileHash`). Compare with the sizes and hashes in `HANDOFF.md` (entry "#236 wake rate, fixed properly").
4. AnF's own logs from the last self-test run (the app's log folder under `%APPDATA%` or `%LOCALAPPDATA%`): copy any lines with `kevo_ears`, `kws`, `microphone`, `audio`, `cpal` or `error`.
5. Free memory with AnF open and idle (`Get-CimInstance Win32_OperatingSystem`: FreePhysicalMemory).

**Report**: one comment on #279 headed `PC facts (Antigravity)`, with the results of steps 1–5 and your best guess at the cause, labelled as a guess. Put no personal file paths beyond the AnF folders.

**Done when**: #279 has a comment from you starting with `PC facts (Antigravity)`.
