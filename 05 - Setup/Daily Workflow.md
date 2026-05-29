# Daily Workflow

## 9:00 AM Briefing Routine

1. Open Obsidian to this vault: C:\Users\jtalb\OneDrive\News.
2. Read [[Latest Daily Briefing]].
3. Open two or three source links that matter most.
4. Update [[Living Macro Thesis]].
5. Add process feedback to [[Feedback Log]].
6. Pick one topic to research deeper.

## Manual Run

``powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\run-daily-briefing.ps1 -Force
``

## Generate Without Email

``powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\run-daily-briefing.ps1 -Force -SkipEmail
``
