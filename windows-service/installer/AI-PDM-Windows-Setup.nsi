Unicode true
RequestExecutionLevel admin
SetCompressor /SOLID lzma
SetCompressorDictSize 32

!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef STAGE
  !error "STAGE is required"
!endif
!ifndef OUTPUT
  !error "OUTPUT is required"
!endif
!ifndef PRODUCT_VERSION
  !error "PRODUCT_VERSION is required"
!endif

Name "AI-PDM Windows Parsing Service"
OutFile "${OUTPUT}"
InstallDir "$PROGRAMFILES64\AI-PDM Windows Service"
BrandingText "Jenfu AI-PDM"
ShowInstDetails show
ShowUninstDetails show
AllowSkipFiles off

!define MUI_ABORTWARNING
!define MUI_ICON "${NSISDIR}\Contrib\Graphics\Icons\orange-install.ico"
!define MUI_UNICON "${NSISDIR}\Contrib\Graphics\Icons\orange-uninstall.ico"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "TradChinese"
!insertmacro MUI_LANGUAGE "English"

Var ServiceResult
Var ServiceRemoveAttempts
Var WrapperOpenAttempts
Var WrapperOpenError

; WinSW 2.12 `stop` returns before shutdown; `stopwait` waits for STOPPED.
; Reuse the same checked teardown for an upgrade and an uninstall. A missing
; service is normal after an interrupted upgrade; any other failure keeps files.
!macro DefineRemoveExistingService Prefix
Function ${Prefix}RemoveExistingService
  nsExec::ExecToLog '"$SYSDIR\sc.exe" query AipdmWindowsParsing'
  Pop $ServiceResult
  ${If} $ServiceResult == 0
    IfFileExists "$INSTDIR\AipdmWindowsParsing.exe" wrapper_present
      MessageBox MB_ICONSTOP|MB_OK "舊解析服務仍存在，但找不到服務程式。安裝已停止並保留現有檔案。"
      Abort
    wrapper_present:
    nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" stopwait --no-elevate'
    Pop $ServiceResult
    ${If} $ServiceResult != 0
      MessageBox MB_ICONSTOP|MB_OK "無法等待舊解析服務停止（代碼 $ServiceResult）。已停止操作並保留現有檔案。"
      Abort
    ${EndIf}
    nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" uninstall --no-elevate'
    Pop $ServiceResult
    ${If} $ServiceResult != 0
      MessageBox MB_ICONSTOP|MB_OK "舊解析服務移除失敗（代碼 $ServiceResult）。已停止操作並保留現有檔案。"
      Abort
    ${EndIf}
  ${EndIf}
  StrCpy $ServiceRemoveAttempts 0
  service_remove_wait:
    nsExec::ExecToLog '"$SYSDIR\sc.exe" query AipdmWindowsParsing'
    Pop $ServiceResult
    ${If} $ServiceResult == 0
    ${OrIf} $ServiceResult == 1072
      IntOp $ServiceRemoveAttempts $ServiceRemoveAttempts + 1
      ${If} $ServiceRemoveAttempts < 40
        Sleep 250
        Goto service_remove_wait
      ${EndIf}
    ${EndIf}
  ${If} $ServiceResult != 1060
    MessageBox MB_ICONSTOP|MB_OK "無法確認舊解析服務已移除（代碼 $ServiceResult）。已停止操作並保留現有檔案。"
    Abort
  ${EndIf}

  ; STOPPED and SCM deletion can precede process image release. Probe only the
  ; existing product wrapper, without creating/truncating/writing it. Bound the
  ; wait and preserve the actual Win32 error instead of allowing skipped files.
  IfFileExists "$INSTDIR\AipdmWindowsParsing.exe" 0 wrapper_ready
  StrCpy $WrapperOpenAttempts 0
  wrapper_wait:
    System::Call 'kernel32::CreateFileW(w "$INSTDIR\AipdmWindowsParsing.exe", i 0x40000000, i 7, p 0, i 3, i 0, p 0) p.r0 ?e'
    Pop $WrapperOpenError
    StrCmp $0 "-1" wrapper_busy
    System::Call 'kernel32::CloseHandle(p r0)'
    Goto wrapper_ready
    wrapper_busy:
    IntOp $WrapperOpenAttempts $WrapperOpenAttempts + 1
    ${If} $WrapperOpenAttempts >= 40
      DetailPrint "DEV125_WRAPPER_NOT_WRITABLE: Win32=$WrapperOpenError"
      MessageBox MB_ICONSTOP|MB_OK "舊解析程式尚無法覆寫（Windows 代碼 $WrapperOpenError）。已停止操作並保留現有檔案，請回報此代碼。"
      Abort
    ${EndIf}
    Sleep 250
    Goto wrapper_wait
  wrapper_ready:
FunctionEnd
!macroend

!insertmacro DefineRemoveExistingService ""
!insertmacro DefineRemoveExistingService "un."

Function .onInit
  SetRegView 64
  ReadRegStr $0 HKCR "SwDocumentMgr.SwDMClassFactory\CLSID" ""
  ${If} $0 == ""
    MessageBox MB_ICONSTOP|MB_OK "找不到相容的 SOLIDWORKS Document Manager x64 COM。請先安裝公司合法授權的 Document Manager，再重新執行安裝。"
    Abort
  ${EndIf}
FunctionEnd

Section "AI-PDM Windows Parsing Service" SEC_MAIN
  SetShellVarContext all
  SetRegView 64
  Call RemoveExistingService

  SetOutPath "$INSTDIR"
  ClearErrors
  File /r "${STAGE}\*"
  IfErrors 0 payload_ready
    MessageBox MB_ICONSTOP|MB_OK "解析程式檔案未完整寫入，安裝已停止。請勿將此版本視為安裝完成。"
    Abort
  payload_ready:
  nsExec::ExecToLog '"$INSTDIR\AipdmDocumentManagerProbe.exe" verify'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "SOLIDWORKS Document Manager x64 runtime 與安裝包不相容（代碼 $ServiceResult）。安裝已停止，未修改 COM 註冊。"
    Abort
  ${EndIf}
  WriteRegStr HKLM "Software\Jenfu\AI-PDM Windows Service" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\Jenfu\AI-PDM Windows Service" "Version" "${PRODUCT_VERSION}"

  CreateDirectory "$APPDATA\AI-PDM Windows Service"
  CreateDirectory "$APPDATA\AI-PDM Windows Service\logs"
  nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" install --no-elevate'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "Windows 服務安裝失敗（代碼 $ServiceResult）。安裝已停止。"
    Abort
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\sc.exe" sidtype AipdmWindowsParsing unrestricted'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "Windows 服務 SID 設定失敗（代碼 $ServiceResult）。安裝已停止。"
    Abort
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR" /inheritance:r /grant:r "SYSTEM:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "BUILTIN\Users:(OI)(CI)(RX)" "NT SERVICE\AipdmWindowsParsing:(OI)(CI)(RX)"'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "程式目錄權限設定失敗（代碼 $ServiceResult）。安裝已停止。"
    Abort
  ${EndIf}
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$APPDATA\AI-PDM Windows Service" /inheritance:r /grant:r "SYSTEM:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "NT SERVICE\AipdmWindowsParsing:(OI)(CI)(M)"'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "資料目錄權限設定失敗（代碼 $ServiceResult）。安裝已停止。"
    Abort
  ${EndIf}
  nsExec::ExecToLog '"$INSTDIR\AipdmDocumentManagerProbe.exe" receipt'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "Document Manager runtime 證據寫入失敗（代碼 $ServiceResult）。安裝已停止。"
    Abort
  ${EndIf}

  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "DisplayName" "AI-PDM Windows Parsing Service"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "DisplayVersion" "${PRODUCT_VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "Publisher" "Jenfu Machinery"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "DisplayIcon" "$INSTDIR\AipdmWindowsConfigurator.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "NoModify" 1
  WriteRegDWORD HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service" "NoRepair" 1
  CreateDirectory "$SMPROGRAMS\AI-PDM"
  CreateShortCut "$SMPROGRAMS\AI-PDM\解析服務設定.lnk" "$INSTDIR\AipdmWindowsConfigurator.exe"
  CreateShortCut "$SMPROGRAMS\AI-PDM\解除安裝.lnk" "$INSTDIR\Uninstall.exe"
  nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" start --no-elevate'
  Pop $ServiceResult
  ${If} $ServiceResult != 0
    MessageBox MB_ICONSTOP|MB_OK "解析服務啟動失敗（代碼 $ServiceResult）。安裝尚未完成，請回報此代碼。"
    Abort
  ${EndIf}
  IfSilent pairing_done 0
  ExecShell "runas" "$INSTDIR\AipdmWindowsConfigurator.exe"
  pairing_done:
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  SetRegView 64
  Call un.RemoveExistingService

  Delete "$SMPROGRAMS\AI-PDM\解析服務設定.lnk"
  Delete "$SMPROGRAMS\AI-PDM\解除安裝.lnk"
  RMDir "$SMPROGRAMS\AI-PDM"
  RMDir /r "$APPDATA\AI-PDM Windows Service"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service"
  DeleteRegKey HKLM "Software\Jenfu\AI-PDM Windows Service"
  RMDir /r "$INSTDIR"
SectionEnd
