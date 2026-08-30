package expo.modules.motoralarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationManagerCompat

/** Handles notification button presses: snooze re-arms the stop alarm. */
class AlarmActionReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmScheduler.ACTION_SNOOZE -> {
        NotificationManagerCompat.from(context).cancel(AlarmScheduler.NOTIF_ID_STOP)
        AlarmScheduler.snooze(context, intent.getIntExtra("minutes", 5))
      }
    }
  }
}
