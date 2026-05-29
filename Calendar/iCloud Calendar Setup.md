# iCloud Calendar Setup For Obsidian

Plugin detected in this vault: `obsidian-full-calendar`.

## First Diagnosis

The installed plugin is the original Full Calendar plugin. It supports remote ICS and CalDAV calendars, but remote calendars are generally read-only in the original plugin. If you want stronger two-way calendar sync, consider Full Calendar Remastered instead.

## Best Simple Option: Public iCloud ICS Read-Only

Use this if you only need to view iCloud events inside Obsidian.

1. Open Apple Calendar / iCloud Calendar.
2. Select the calendar.
3. Enable public sharing for that calendar.
4. Copy the `webcal://...` URL.
5. Change `webcal://` to `https://`.
6. In Obsidian Full Calendar, add a remote ICS calendar using that URL.

Pros: easiest and usually most reliable.

Tradeoff: read-only and requires public calendar link privacy tradeoff.

## Private iCloud CalDAV Option

Use this if you want private authenticated access.

In Full Calendar, add a CalDAV calendar with:

```text
Server URL: https://caldav.icloud.com
Username: your Apple ID email
Password: Apple app-specific password
```

Important: use the actual generated app-specific password, not the label/name of the password.

## Apple App-Specific Password Steps

1. Go to `https://appleid.apple.com`.
2. Sign in.
3. Make sure two-factor authentication is enabled.
4. Go to `Sign-In and Security`.
5. Open `App-Specific Passwords`.
6. Generate a new password named `Obsidian Calendar`.
7. Copy the generated password.
8. Paste that generated password into Obsidian Full Calendar.

## Common Errors

### 401 Unauthorized

Usually means one of these:

- You used your Apple ID password instead of an app-specific password.
- You used the app password label instead of the generated password.
- Username is not the exact Apple ID email.
- Extra spaces were pasted into the password.

### Calendar Loads But Events Do Not Edit

The original Full Calendar plugin supports remote calendars primarily as read-only. For two-way sync, use Full Calendar Remastered or keep editable events as local Obsidian notes.

### No Calendars Found

Try:

```text
https://caldav.icloud.com/
```

instead of:

```text
https://caldav.icloud.com
```

If that still fails, create a public ICS calendar subscription as the fallback.

## Recommended Setup For This Vault

Use two calendar layers:

1. `Calendar/` local Obsidian events for study blocks, IMW prep, deadlines, and briefing workflow.
2. iCloud remote calendar as read-only context.

This keeps your research workflow editable while still showing personal calendar events.
