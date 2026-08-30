package expo.modules.motoralarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android cancels all alarms on reboot. Scheduled state lives in
 * SharedPreferences, so this receiver re-arms everything without needing
 * JavaScript to run first.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      "android.intent.action.QUICKBOOT_POWERON" -> {
        AlarmScheduler.ensureChannels(context)
        AlarmScheduler.armNextDaily(context)
        val stopAt = AlarmScheduler.stopAt(context)
        if (stopAt > System.currentTimeMillis()) {
          AlarmScheduler.armStop(context, stopAt)
        } else {
          AlarmScheduler.cancelStop(context)
        }
      }
    }
  }
}
