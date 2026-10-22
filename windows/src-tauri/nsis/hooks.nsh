; Use Restart Manager against exact installation paths. A local engine left
; behind when an older app exits can otherwise keep its DLLs/models locked.
!macro NSIS_HOOK_PREINSTALL
  ; Inspect only the selected installation's registered previous executable.
  ReadRegStr $OldMainBinaryName SHCTX "${UNINSTKEY}" "MainBinaryName"
  ${If} $OldMainBinaryName != ""
    ${GetFileName} "$OldMainBinaryName" $0
    ${If} $0 == $OldMainBinaryName
      !insertmacro CheckIfAppIsRunning "$INSTDIR\$OldMainBinaryName" "AnF"
    ${EndIf}
  ${EndIf}
  ; The previous version used anf.exe. Check both names before updating.
  !insertmacro CheckIfAppIsRunning "$INSTDIR\anf.exe" "AnF"
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
  !insertmacro IsShortcutTarget "$SMPROGRAMS\AnF.lnk" "$INSTDIR\anf.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$SMPROGRAMS\AnF.lnk"
    CreateShortcut "$SMPROGRAMS\AnF.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
  !insertmacro IsShortcutTarget "$DESKTOP\AnF.lnk" "$INSTDIR\anf.exe"
  Pop $0
  ${If} $0 = 1
    Delete "$DESKTOP\AnF.lnk"
    CreateShortcut "$DESKTOP\AnF.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${EndIf}
!macroend
