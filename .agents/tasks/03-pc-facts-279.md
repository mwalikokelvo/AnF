# 03: PC facts for issue #279 (Kevo heard nothing, 0 of 20 wakes)

**Goal**: in the PC self-test the clips played but Kevo's ears heard nothing at all. Only this PC can say why. Collect facts; change no code and play no sound (the owner is asleep).

**Branch**: none.

**Steps**, in PowerShell, read-only:
1. Microphone privacy: is microphone access on for the PC, and for desktop apps? (`HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone` and its `NonPackaged` subkeys: `Value`, and whether AnF's exe is listed.)
2. Recording devices: `Get-PnpDevice -Class AudioEndpoint | Select Status, FriendlyName` and which one is the default input. Is there a working microphone at all, or only "Stereo Mix" / none?
3. The wake model: list the files in `%LOCALAPPDATA%\Coucou\kevo-ears\models` (where `kevo_ears.rs` `models_dir()` keeps them) with names, sizes and full SHA-256 (`Get-FileHash`). Compare the sizes with the ones in `HANDOFF.md` (entry "#236 wake rate, fixed properly"). If the folder is missing or empty, say so: that alone would explain 0 of 20.
4. Kevo's log, `%LOCALAPPDATA%\Coucou\kevo\kevo-log.jsonl`, from the last self-test run. **This log can hold anything said in the room, and #279 is public.** Never paste log lines. Report only: how many lines mention `kevo_ears`, `kws`, `microphone`, `cpal` or `error`, and for those lines only the event name and the error message text. Leave out every `text`, `heard`, `reply` or other speech field. If a line can't be reduced to that safely, leave it out.
5. Free memory with AnF open and idle (`Get-CimInstance Win32_OperatingSystem`: FreePhysicalMemory).

**Report**: one comment on #279 headed `PC facts (Antigravity)`, with the results of steps 1–5 and your best guess at the cause, labelled as a guess. Put no personal file paths beyond the AnF folders.

**Done when**: #279 has a comment from you starting with `PC facts (Antigravity)`.
