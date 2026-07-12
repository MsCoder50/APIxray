; --------------------------------
; Inno Setup Script for APIxray
; --------------------------------

#define MyAppName "APIxray"
#define MyAppVersion "2.1.0"
#define MyAppPublisher "MsCoder50"
#define MyAppURL "https://github.com/MsCoder50/APIxray"
#define MyAppExeName "APIxray.exe"
#define MyAppId "com.mscoder.apixray"

[Setup]
; AppId uniquely identifies this application. Do not use the same AppId value in installers for other applications.
AppId={{D64E7682-1D5E-4B02-849F-2BF65E26E552}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DisableProgramGroupPage=yes
OutputDir=out\make
OutputBaseFilename=APIxray-{#MyAppVersion}-Setup
SetupIconFile=src\assets\images\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\resources\icon.ico
ChangesAssociations=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "out\APIxray-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\resources\icon.ico"; AppUserModelID: "{#MyAppId}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\resources\icon.ico"; AppUserModelID: "{#MyAppId}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
