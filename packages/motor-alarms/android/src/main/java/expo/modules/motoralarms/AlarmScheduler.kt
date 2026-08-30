package expo.modules.motoralarms

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import java.util.Calendar

/**
 * Single source of truth for alarm state. Everything persists in
 * SharedPreferences so [BootReceiver] can re-arm after a reboot without any
 * JavaScript running.
 */
object AlarmScheduler {
  private const val PREFS = "motor_alarms"
  private const val KEY_DAILY_HOUR = "daily_hour"
  private const val KEY_DAILY_MINUTE = "daily_minute"
  private const val KEY_DAILY_ENABLED = "daily_enabled"
  private const val KEY_STOP_AT = "stop_at"
  private const val KEY_SNOOZE_MINUTES = "snooze_minutes"

  const val ACTION_DAILY = "expo.modules.motoralarms.ACTION_DAILY"
  const val ACTION_STOP = "expo.modules.motoralarms.ACTION_STOP"
  const val ACTION_SNOOZE = "expo.modules.motoralarms.ACTION_SNOOZE"
  const val NOTIF_ID_DAILY = 1001
  const val NOTIF_ID_STOP = 1002
  const val CHANNEL_DAILY = "motor_reminder"
  const val CHANNEL_STOP = "motor_alarm"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun ensureChannels(ctx: Context) {
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ALARM)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val alarmUri = Uri.parse("android.resource://${ctx.packageName}/raw/motor_alarm")

    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_DAILY, "Motor reminder", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Daily reminder that it is someone's motor turn"
        setSound(alarmUri, attrs)
        enableVibration(true)
      }
    )
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_STOP, "Motor stop alarm", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Alarm when the motor run is over and must be switched off"
        setSound(alarmUri, attrs)
        enableVibration(true)
        setBypassDnd(true)
      }
    )
  }

  private fun pending(ctx: Context, action: String): PendingIntent {
    val intent = Intent(ctx, AlarmReceiver::class.java).setAction(action)
    return PendingIntent.getBroadcast(
      ctx, action.hashCode(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun setExact(ctx: Context, pi: PendingIntent, atMs: Long) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val canExact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
    if (canExact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
    else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi)
  }

  // ---- daily reminder ----

  fun scheduleDaily(ctx: Context, hour: Int, minute: Int) {
    prefs(ctx).edit()
      .putInt(KEY_DAILY_HOUR, hour)
      .putInt(KEY_DAILY_MINUTE, minute)
      .putBoolean(KEY_DAILY_ENABLED, true)
      .apply()
    armNextDaily(ctx)
  }

  fun cancelDaily(ctx: Context) {
    prefs(ctx).edit().putBoolean(KEY_DAILY_ENABLED, false).apply()
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(pending(ctx, ACTION_DAILY))
    NotificationManagerCompat.from(ctx).cancel(NOTIF_ID_DAILY)
  }

  fun armNextDaily(ctx: Context) {
    if (!prefs(ctx).getBoolean(KEY_DAILY_ENABLED, false)) return
    val hour = prefs(ctx).getInt(KEY_DAILY_HOUR, 10)
    val minute = prefs(ctx).getInt(KEY_DAILY_MINUTE, 0)
    val at = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, hour)
      set(Calendar.MINUTE, minute)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
    }
    setExact(ctx, pending(ctx, ACTION_DAILY), at.timeInMillis)
  }

  // ---- stop alarm ----

  fun armStop(ctx: Context, atEpochMs: Long) {
    prefs(ctx).edit().putLong(KEY_STOP_AT, atEpochMs).apply()
    setExact(ctx, pending(ctx, ACTION_STOP), atEpochMs)
  }

  fun snooze(ctx: Context, minutes: Int) {
    val at = System.currentTimeMillis() + minutes * 60_000L
    prefs(ctx).edit().putLong(KEY_STOP_AT, at).apply()
    setExact(ctx, pending(ctx, ACTION_STOP), at)
  }

  fun cancelStop(ctx: Context) {
    prefs(ctx).edit().remove(KEY_STOP_AT).apply()
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(pending(ctx, ACTION_STOP))
    NotificationManagerCompat.from(ctx).cancel(NOTIF_ID_STOP)
  }

  fun stopAt(ctx: Context): Long = prefs(ctx).getLong(KEY_STOP_AT, 0L)

  fun setSnoozeMinutes(ctx: Context, minutes: Int) {
    prefs(ctx).edit().putInt(KEY_SNOOZE_MINUTES, minutes).apply()
  }

  fun snoozeMinutes(ctx: Context): Int = prefs(ctx).getInt(KEY_SNOOZE_MINUTES, 5)

  // ---- reliability surfaces ----

  fun canExact(ctx: Context): Boolean {
    if (Build.VERSION.SDK_INT < 31) return true
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return am.canScheduleExactAlarms()
  }

  fun isIgnoringBatteryOptimizations(ctx: Context): Boolean {
    val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
    return pm.isIgnoringBatteryOptimizations(ctx.packageName)
  }

  fun requestIgnoreBatteryOptimizations(ctx: Context): Boolean = try {
    val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
      .setData(Uri.parse("package:${ctx.packageName}"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    ctx.startActivity(intent)
    true
  } catch (_: Exception) {
    false
  }

  fun areNotificationsEnabled(ctx: Context): Boolean =
    NotificationManagerCompat.from(ctx).areNotificationsEnabled()

  fun openExactAlarmSettings(ctx: Context) {
    if (Build.VERSION.SDK_INT < 31) return
    ctx.startActivity(
      Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  fun openNotificationSettings(ctx: Context) {
    ctx.startActivity(
      Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, ctx.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
  }

  /**
   * Best-effort hop into OEM "autostart / start in background" screens
   * (MIUI on the Redmis, HiOS on the Infinix). Returns false when none of the
   * known components exist and we fell back to plain app details.
   */
  fun openAutostart(ctx: Context): Boolean {
    val candidates = listOf(
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
      ComponentName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity"),
      ComponentName("com.xiaomi.misettings", "com.xiaomi.misettings.startupautoboot.StartupAutobootActivity"),
      ComponentName("com.transsion.autostart", "com.transsion.autostart.OftenUsedPermissionActivity"),
      ComponentName("com.ihi.app.control", "com.ihi.app.control.activity.StartActivity")
    )
    val pm = ctx.packageManager
    for (c in candidates) {
      try {
        if (pm.getActivityInfo(c, PackageManager.MATCH_DISABLED_COMPONENTS) != null) {
          ctx.startActivity(
            Intent().setComponent(c).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
          return true
        }
      } catch (_: Exception) {
        // not installed on this phone, try the next
      }
    }
    ctx.startActivity(
      Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.parse("package:${ctx.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    )
    return false
  }
}
