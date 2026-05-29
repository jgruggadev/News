param(
    [string]$TaskName = "DailyMacroBriefing",
    [string]$DailyTime = "09:00",
    [string]$VerificationTaskName = "DailyMacroBriefingVerify",
    [switch]$ScheduleVerificationRunTonight,
    [switch]$EnableScheduling
)

$ErrorActionPreference = "Stop"

if (-not $EnableScheduling) {
    Write-Host "AI Receptionist scheduling is disabled."
    Write-Host "No Windows scheduled task was created. Use shutdown-ai-receptionist.ps1 as Administrator to remove existing tasks."
    exit 0
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$scriptPath = Join-Path $root "run-daily-briefing.ps1"

if (-not (Test-Path $scriptPath)) {
    throw "run-daily-briefing.ps1 not found in $root"
}

$parts = $DailyTime -split ':'
if ($parts.Count -lt 2) {
    throw "DailyTime must be like 09:00 or 9:30"
}
$hour = [int]$parts[0]
$minute = [int]$parts[1]
$base = Get-Date
$at = Get-Date -Year $base.Year -Month $base.Month -Day $base.Day -Hour $hour -Minute $minute -Second 0

$userId = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

$triggerDaily = New-ScheduledTaskTrigger -Daily -At $at

$triggerLogon = New-ScheduledTaskTrigger -AtLogOn -User $userId
$triggerLogon.Delay = 'PT90S'

$cimUnlock = Get-CimClass -Namespace Root/Microsoft/Windows/TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger
$triggerUnlock = New-CimInstance -CimClass $cimUnlock -ClientOnly -Property @{
    Enabled     = $true
    UserId      = $userId
    StateChange = 8
}
$triggerUnlock.Delay = 'PT90S'

$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType Interactive

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -WakeToRun `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 72)

Register-ScheduledTask -TaskName $TaskName -Action $action `
    -Trigger @($triggerDaily, $triggerLogon, $triggerUnlock) `
    -Principal $principal -Settings $settings -Force | Out-Null

Write-Host "Scheduled task '$TaskName' registered with:"
Write-Host "  - Daily at $($at.ToString('HH:mm')) (if the PC is on)"
Write-Host "  - At logon (first session after boot; 90s delay for network)"
Write-Host "  - On workstation unlock (wake from sleep; 90s delay)"
Write-Host "run-daily-briefing.ps1 runs at most once per calendar day (see output\.last-briefing-day)."

if ($ScheduleVerificationRunTonight) {
    $now = Get-Date
    $verifyAt = Get-Date -Year $now.Year -Month $now.Month -Day $now.Day -Hour 22 -Minute 30 -Second 0
    if ($now -ge $verifyAt) {
        $verifyAt = $verifyAt.AddDays(1)
        Write-Warning "10:30 PM today has already passed; verification run scheduled for $($verifyAt.ToString('yyyy-MM-dd HH:mm')) instead."
    }

    Unregister-ScheduledTask -TaskName $VerificationTaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

    $verifyTrigger = New-ScheduledTaskTrigger -Once -At $verifyAt
    $verifySettings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -WakeToRun `
        -MultipleInstances IgnoreNew `
        -ExecutionTimeLimit (New-TimeSpan -Hours 2)

    Register-ScheduledTask -TaskName $VerificationTaskName -Action $action -Trigger $verifyTrigger `
        -Principal $principal -Settings $verifySettings -Force | Out-Null

    Write-Host "Verification task '$VerificationTaskName' scheduled once at $($verifyAt.ToString('yyyy-MM-dd HH:mm')) (local)."
    Write-Host "After it runs, remove it with: Unregister-ScheduledTask -TaskName '$VerificationTaskName' -Confirm:`$false"
}

Write-Host "Reminder: set Windows timezone to Eastern Time (US & Canada) if you want ET morning timing."
Write-Host "Check output\schedule-run.log after each run to confirm the job completed."
