# -*- coding: utf-8 -*-
"""在桌面创建「背单词·每日学习」快捷启动方式（指向 启动学习.bat）"""
import os

DESKTOP = os.path.join(os.path.expanduser('~'), 'Desktop')
BAT = os.path.join(os.path.expanduser('~'), 'Desktop', '看图背单词', '启动学习.bat')
LNK = os.path.join(DESKTOP, '背单词·每日学习.lnk')
WORKDIR = os.path.dirname(BAT)

CHROME_CANDIDATES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Google\Chrome\Application\chrome.exe'),
]
icon = next((c for c in CHROME_CANDIDATES if os.path.exists(c)), r'%SystemRoot%\System32\SHELL32.dll,13')

ps = f'''$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut("{LNK}")
$s.TargetPath = "{BAT}"
$s.WorkingDirectory = "{WORKDIR}"
$s.WindowStyle = 7
$s.IconLocation = "{icon}"
$s.Description = "启动本地背单词学习服务并自动打开学习页面"
$s.Save()
Write-Output ("created: " + (Test-Path "{LNK}"))
'''

ps1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'create_shortcut.ps1')
with open(ps1, 'w', encoding='utf-8-sig') as f:   # 带 BOM，保证 PowerShell 正确读中文
    f.write(ps)
print('ps1 written:', ps1)
