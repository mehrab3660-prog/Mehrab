; Inno Setup script - builds a single Setup.exe that installs the extractor
; with no manual pip/playwright steps. Run through GitHub Actions (windows-latest
; ships Inno Setup 6 preinstalled) or locally if you have Inno Setup installed.
;
; Expects "dist\WarehouseSerialExtractor\" to already exist (built by
; build_exe.bat or the CI workflow) before this script runs.

#define MyAppName "Gas Tank Serial Extractor"
#define MyAppVersion "1.0"
#define MyAppExeName "WarehouseSerialExtractor.exe"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=installer_output
OutputBaseFilename=WarehouseSerialExtractorSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64compatible
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "dist\WarehouseSerialExtractor\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Run {#MyAppName} now"; Flags: nowait postinstall skipifsilent
