package expo.modules.motoralarms

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MotorAlarmsModule : Module() {
  private val ctx: Context?
    get() = appContext.reactContext

  override fun definition() = ModuleDefinition {
    Name("MotorAlarms")

    AsyncFunction("scheduleDaily") { hour: Int, minute: Int ->
      val c = ctx ?: throw IllegalStateException("no context")
      AlarmScheduler.scheduleDaily(c, hour, minute)
    }

    AsyncFunction("cancelDaily") {
      ctx?.let { AlarmScheduler.cancelDaily(it) }
    }

    AsyncFunction("armStopAlarm") { atEpochMs: Double ->
      val c = ctx ?: throw IllegalStateException("no context")
      AlarmScheduler.armStop(c, atEpochMs.toLong())
    }

    AsyncFunction("cancelStopAlarm") {
      ctx?.let { AlarmScheduler.cancelStop(it) }
    }

    AsyncFunction("snoozeStopAlarm") { minutes: Int ->
      ctx?.let { AlarmScheduler.snooze(it, minutes) }
    }

    AsyncFunction("setSnoozeMinutes") { minutes: Int ->
      ctx?.let { AlarmScheduler.setSnoozeMinutes(it, minutes) }
    }

    Function("isIgnoringBatteryOptimizations") {
      ctx?.let { AlarmScheduler.isIgnoringBatteryOptimizations(it) } ?: false
    }

    Function("exactAlarmsEnabled") {
      ctx?.let { AlarmScheduler.canExact(it) } ?: false
    }

    Function("notificationsEnabled") {
      ctx?.let { AlarmScheduler.areNotificationsEnabled(it) } ?: false
    }

    Function("openAutostartSettings") {
      ctx?.let { AlarmScheduler.openAutostart(it) } ?: false
    }

    Function("openAppDetails") {
      ctx?.let { AlarmScheduler.openAppDetails(it) }
    }

    AsyncFunction("requestIgnoreBatteryOptimizations") {
      ctx?.let { AlarmScheduler.requestIgnoreBatteryOptimizations(it) }
    }

    AsyncFunction("openExactAlarmSettings") {
      ctx?.let { AlarmScheduler.openExactAlarmSettings(it) }
    }

    AsyncFunction("openNotificationSettings") {
      ctx?.let { AlarmScheduler.openNotificationSettings(it) }
    }
  }
}
