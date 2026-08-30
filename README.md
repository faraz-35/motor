# Motor

Household water-motor turn tracker for the family. Every phone gets the daily
reminder and the stop alarm locally (they fire even with no internet); the
Supabase backend keeps the turn rotation, swap requests, and the who-actually-ran-it
log in sync across phones.

## How it works

- **Turns** rotate deterministically: day-number modulo member count, in join
  order. Accepted swaps are stored as per-date overrides — the coverer takes the
  requester's date, the requester repays by taking the coverer's next date.
- **Alarms are local-first.** The daily reminder (default 10:00) and the
  T+10-min stop alarm are exact `AlarmManager` alarms re-armed after reboots by
  a boot receiver. The server only feeds state; alarms never depend on it.
  The stop alarm rings on **every** phone in the household (redundancy in case
  the starter's phone dies). Snooze = 5 min, unlimited.
- **Device auth**: the project has anonymous sign-ins disabled, so each phone
  claims one of 12 pre-provisioned pool users (`claim_device_account()` RPC)
  and signs in with a password grant. Household join is a 6-char code.

## Layout

- `app/` — Expo (SDK 57, React Native) app. `src/logic` is pure and unit-tested;
  `src/state/AppContext.tsx` reconciles the native alarm engine with server state.
- `packages/motor-alarms/` — local Expo native module (Kotlin): exact alarms,
  boot restore, full-screen insistent stop alarm, snooze, battery-optimization /
  exact-alarm / autostart helpers.
- `server/` — SQL migrations + test harnesses against the live Supabase project.
- `scripts/` — asset generators, APK build + release scripts.

## Dev commands

```zsh
cd server && npm run migrate        # apply pending migrations
cd server && node scripts/seed-pool.mjs   # (re)fill device account pool
cd server && npm test               # REST e2e (wipes data — dev DB only!)
cd server && node scripts/sql-test.mjs    # SQL-level RPC logic test
cd app && npm run test              # unit tests (rotation + alarm logic)
cd app && npm run typecheck
zsh scripts/build-android.sh        # signed release APK (needs expo prebuild first)
zsh scripts/release.sh v1.0.0       # tag + GitHub release with the APK
```

`server/.env` (gitignored) holds `DATABASE_URL`, `SUPABASE_SERVICE_KEY`, keys.
The keystore (`motor.keystore` + `keystore.env`, both gitignored, on Faraz's Mac) signs every release —
losing it means siblings must uninstall before updating.

## Phone setup (the part that actually matters)

Alarms only ring reliably if Android lets them. On each phone, once:

1. Install the APK (allow "unknown sources" for the browser/WhatsApp).
2. Family tab → **Make alarms reliable**: allow notifications, allow exact
   alarms, exempt from battery optimization (green checkmarks).
3. Autostart (manual on their ROMs):
   - **Redmi (MIUI)**: Security app → Permissions → Autostart → enable Motor.
     Also Settings → Apps → Motor → Battery saver → "No restrictions".
   - **Infinix (HiOS)**: Phone Master/HiOS settings → autostart for Motor; keep
     it off "smart" battery cleaning lists.
4. Test once: Today tab → "I'm starting the motor" → lock the phone → the stop
   alarm must ring 10 minutes later with screen off.

## Future cleanup

If anonymous sign-ins ever get enabled on the Supabase project,
`app/src/db/client.ts::ensureDeviceSession` collapses to `signInAnonymously()`
and the whole `device_accounts` pool + `0002_device_pool.sql` can be dropped.
