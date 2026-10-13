; Use Restart Manager against exact installation paths. A local engine left
; behind when an older app exits can otherwise keep its DLLs/models locked.
!macro NSIS_HOOK_PREINSTALL
  ; The previous version used coucou.exe. Check both names before updating.
  !insertmacro CheckIfAppIsRunning "$INSTDIR\coucou.exe" "AnF"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "AnF"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\local-ai\llama-server.exe" "AnF offline engine"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "AnF"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\local-ai\llama-server.exe" "AnF offline engine"
  ; Preserve all user data during upgrades and uninstalls. In particular, do
  ; not remove the inbox, projects, documents, settings or diagnostic log.
!macroend

; Remove legacy visible shortcuts only when they target this installation.
!macro NSIS_HOOK_POSTINSTALL
  !insertmacro IsShortcutTarget "$SMPROGRAMS\Coucou.lnk" "$INSTDIR\coucou.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\Coucou.lnk"
    CreateShortcut "$SMPROGRAMS\AnF.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
  !insertmacro IsShortcutTarget "$DESKTOP\Coucou.lnk" "$INSTDIR\coucou.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$DESKTOP\Coucou.lnk"
    CreateShortcut "$DESKTOP\AnF.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
!macroend
