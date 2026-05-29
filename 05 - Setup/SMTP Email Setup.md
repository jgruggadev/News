# SMTP Email Setup

Goal: send the daily briefing to jtalbans@iu.edu every day at 9:00 AM Eastern.

## Information Needed

Fill in these six items:

1. SMTP provider: usually Gmail or Google Workspace.
2. SMTP host: for Gmail, smtp.gmail.com.
3. SMTP port: for Gmail, 587.
4. SMTP username: the sending email address, for example yourname@gmail.com.
5. SMTP password: use a Google App Password, not your normal Google password.
6. From address: usually the same as the SMTP username.

## Gmail App Password Steps

1. Open your Google Account.
2. Turn on 2-Step Verification if it is not already enabled.
3. Search Google Account settings for App passwords.
4. Create an app password for Mail on Windows.
5. Save the generated 16-character password somewhere secure.
6. Use that app password as BRIEFING_SMTP_PASS.

## Set The Variables In PowerShell

Replace the placeholders and run these in a new PowerShell window:

``powershell
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_HOST','smtp.gmail.com','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_PORT','587','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_USER','your-email@gmail.com','User')
[Environment]::SetEnvironmentVariable('BRIEFING_SMTP_PASS','your-google-app-password','User')
[Environment]::SetEnvironmentVariable('BRIEFING_EMAIL_FROM','your-email@gmail.com','User')
``

Close PowerShell, open a new PowerShell window, then test:

``powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\scripts\send-briefing-email.ps1 -BriefingPath .\output\daily-briefing.html -To jtalbans@iu.edu -Subject "Daily Macro Briefing Test" -Test
``

## Enable The 9:00 AM Schedule

Only do this after the test email works:

``powershell
cd "C:\Users\jtalb\OneDrive\News"
powershell.exe -ExecutionPolicy Bypass -File .\setup-scheduled-task.ps1 -EnableScheduling -DailyTime 09:00
``

Make sure Windows is set to Eastern Time.

## What I Still Need From You

- Confirm the email address that should send the briefing.
- Confirm whether you want Gmail, IU Google Workspace, or another SMTP provider.
- Provide or set the app password locally. Do not paste the app password into chat unless you explicitly want me to configure it for this machine.
