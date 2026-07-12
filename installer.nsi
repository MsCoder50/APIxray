; --------------------------------
; NSIS Modern UI Installer Script
; APIxray Windows Installer
; --------------------------------

!include "MUI2.nsh"

; General Definitions
Name "APIxray"
OutFile "out\make\APIxray-2.1.0-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\APIxray"
InstallDirRegKey HKCU "Software\APIxray" "Install_Dir"
RequestExecutionLevel user

; Interface Configuration
!define MUI_ABORTWARNING
!define MUI_ICON "src\assets\images\icon.ico"
!define MUI_UNICON "src\assets\images\icon.ico"

; Installer Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Finish Page configuration
!define MUI_FINISHPAGE_RUN "$INSTDIR\APIxray.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Launch APIxray"
!insertmacro MUI_PAGE_FINISH

; Uninstaller Pages
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Languages
!insertmacro MUI_LANGUAGE "English"

; --------------------------------
; Installation Section
; --------------------------------
Section "APIxray Core" SecAPIxray
    SetOutPath "$INSTDIR"
    
    ; Copy all packaged files into installation directory
    File /r "out\APIxray-win32-x64\*.*"

    ; Create Desktop Shortcut with explicit custom icon
    CreateShortCut "$DESKTOP\APIxray.lnk" "$INSTDIR\APIxray.exe" "" "$INSTDIR\resources\icon.ico" 0

    ; Create Start Menu Shortcuts with explicit custom icon
    CreateDirectory "$SMPROGRAMS\APIxray"
    CreateShortCut "$SMPROGRAMS\APIxray\APIxray.lnk" "$INSTDIR\APIxray.exe" "" "$INSTDIR\resources\icon.ico" 0
    CreateShortCut "$SMPROGRAMS\APIxray\Uninstall APIxray.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\resources\icon.ico" 0

    ; Create Uninstaller executable
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Register in Windows "Apps & features" / "Add or Remove Programs"
    WriteRegStr HKCU "Software\APIxray" "Install_Dir" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "DisplayName" "APIxray"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "DisplayVersion" "2.1.0"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "Publisher" "MsCoder50"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "DisplayIcon" "$INSTDIR\resources\icon.ico,0"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "UninstallString" '"$INSTDIR\Uninstall.exe"'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "QuietUninstallString" '"$INSTDIR\Uninstall.exe" /S'
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "InstallLocation" "$INSTDIR"
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "NoModify" 1
    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray" "NoRepair" 1

    ; Tell Windows Explorer to refresh icon cache immediately
    System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd

; --------------------------------
; Uninstaller Section
; --------------------------------
Section "Uninstall"
    ; Remove Shortcuts
    Delete "$DESKTOP\APIxray.lnk"
    Delete "$SMPROGRAMS\APIxray\APIxray.lnk"
    Delete "$SMPROGRAMS\APIxray\Uninstall APIxray.lnk"
    RMDir "$SMPROGRAMS\APIxray"

    ; Delete installation files and folder
    RMDir /r "$INSTDIR"

    ; Clean up registry keys
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\APIxray"
    DeleteRegKey HKCU "Software\APIxray"

    ; Refresh icon cache
    System::Call 'shell32.dll::SHChangeNotify(i 0x08000000, i 0, i 0, i 0)'
SectionEnd
