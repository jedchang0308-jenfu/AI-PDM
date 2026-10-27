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
  IfFileExists "$INSTDIR\AipdmWindowsParsing.exe" 0 +3
    nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" stop --no-elevate'
    nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" uninstall --no-elevate'

  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*"
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
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR" /inheritance:r /grant:r "SYSTEM:(OI)(CI)(F)" "BUILTIN\Administrators:(OI)(CI)(F)" "NT SERVICE\AipdmWindowsParsing:(OI)(CI)(RX)"'
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
  IfSilent pairing_done 0
  IfFileExists "$APPDATA\AI-PDM Windows Service\credential.bin" pairing_done 0
    ExecShell "runas" "$INSTDIR\AipdmWindowsConfigurator.exe"
  pairing_done:
SectionEnd

Section "Uninstall"
  SetShellVarContext all
  SetRegView 64
  IfFileExists "$INSTDIR\AipdmWindowsParsing.exe" 0 verify_service_removed
    nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" stop --no-elevate'
    Pop $ServiceResult
    nsExec::ExecToLog '"$INSTDIR\AipdmWindowsParsing.exe" uninstall --no-elevate'
    Pop $ServiceResult

  verify_service_removed:
  nsExec::ExecToLog '"$SYSDIR\sc.exe" query AipdmWindowsParsing'
  Pop $ServiceResult
  ${If} $ServiceResult == 0
    MessageBox MB_ICONSTOP|MB_OK "Windows 服務仍存在，解除安裝已停止並保留檔案，以便重試。"
    Abort
  ${ElseIf} $ServiceResult != 1060
    MessageBox MB_ICONSTOP|MB_OK "無法確認 Windows 服務已移除（代碼 $ServiceResult），解除安裝已停止並保留檔案。"
    Abort
  ${EndIf}

  Delete "$SMPROGRAMS\AI-PDM\解析服務設定.lnk"
  Delete "$SMPROGRAMS\AI-PDM\解除安裝.lnk"
  RMDir "$SMPROGRAMS\AI-PDM"
  RMDir /r "$APPDATA\AI-PDM Windows Service"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\AI-PDM Windows Parsing Service"
  DeleteRegKey HKLM "Software\Jenfu\AI-PDM Windows Service"
  RMDir /r "$INSTDIR"
SectionEnd
