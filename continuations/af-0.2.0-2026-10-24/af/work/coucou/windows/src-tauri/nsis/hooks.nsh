; Use Restart Manager against exact installation paths. A local engine left
; behind when an older app exits can otherwise keep its DLLs/models locked.
!macro NSIS_HOOK_PREINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "Coucou"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\local-ai\llama-server.exe" "Coucou offline engine"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro CheckIfAppIsRunning "$INSTDIR\${MAINBINARYNAME}.exe" "Coucou"
  !insertmacro CheckIfAppIsRunning "$INSTDIR\local-ai\llama-server.exe" "Coucou offline engine"
  ; Preserve all user data during upgrades and uninstalls. In particular, do
  ; not remove the inbox, projects, documents, settings or diagnostic log.
!macroend
