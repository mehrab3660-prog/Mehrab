' اجرای بی‌صدای برنامه - بدون باز شدن پنجره‌ی سیاه cmd
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = scriptDir
shell.Run "pythonw.exe """ & scriptDir & "\gui_scrape_symfa.py""", 0, False
