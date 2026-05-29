param(
    [switch]$KeepDisabledScripts
)

$ErrorActionPreference = "Continue"

$taskNames = @(
    "DailyMacroBriefing",
    "DailyMacroBriefingVerify"
)

Write-Host "Shutting down AI Receptionist scheduled automation..."

foreach ($taskName in $taskNames) {
    try {
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
        if ($task.State -eq "Running") {
            Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        }
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
        Write-Host "Removed scheduled task: $taskName"
    } catch {
        Write-Host "No scheduled task removed for $taskName. It may already be gone, or this shell is not elevated."
    }
}

$matchingProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -like "*AI Receptionist*" -or
        $_.CommandLine -like "*run-daily-briefing.ps1*" -or
        $_.CommandLine -like "*generate-briefing.ps1*"
    }

foreach ($process in $matchingProcesses) {
    try {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
        Write-Host "Stopped running process: $($process.Name) ($($process.ProcessId))"
    } catch {
        Write-Host "Could not stop process $($process.ProcessId): $($_.Exception.Message)"
    }
}

if (-not $KeepDisabledScripts) {
    $marker = Join-Path $PSScriptRoot "output\AI_RECEPTIONIST_SCHEDULER_DISABLED.txt"
    New-Item -ItemType Directory -Path (Split-Path -Parent $marker) -Force | Out-Null
    "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') Scheduler shutdown requested." |
        Add-Content -Path $marker -Encoding utf8
}

Write-Host ""
Write-Host "Done. If either task said it was not removed, run this script from PowerShell as Administrator:"
Write-Host "  powershell.exe -ExecutionPolicy Bypass -File `"$PSCommandPath`""
