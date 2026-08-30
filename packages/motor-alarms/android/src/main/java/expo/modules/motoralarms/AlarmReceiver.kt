package expo.modules.motoralarms

import android.app.Notification
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/** Fires when a scheduled alarm goes off: posts the notification and re-arms dailies. */
class AlarmReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    AlarmScheduler.ensureChannels(context)
    when (intent.action) {
      AlarmScheduler.ACTION_DAILY -> {
        notify(context, AlarmScheduler.NOTIF_ID_DAILY, dailyNotification(context))
        AlarmScheduler.armNextDaily(context)  // tomorrow's turn
      }
      AlarmScheduler.ACTION_STOP -> {
        notify(context, AlarmScheduler.NOTIF_ID_STOP, stopNotification(context))
      }
    }
  }

  private fun notify(context: Context, id: Int, notification: Notification) {
    try {
      NotificationManagerCompat.from(context).notify(id, notification)
    } catch (_: SecurityException) {
      // notifications not granted; the alarm itself still fired and woke the app
    }
  }

  private fun launchIntent(context: Context): PendingIntent? {
    val intent = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    return PendingIntent.getActivity(
      context, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  private fun dailyNotification(context: Context): Notification =
    NotificationCompat.Builder(context, AlarmScheduler.CHANNEL_DAILY)
      .setSmallIcon(R.drawable.ic_motor_stat)
      .setContentTitle("Motor time")
      .setContentText("Water motor turn — open to see whose day it is")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 400, 200, 400))
      .setContentIntent(launchIntent(context))
      .setFullScreenIntent(FullScreen.intent(context, "daily"), true)
      .build()
      .apply { flags = flags or Notification.FLAG_INSISTENT }

  private fun stopNotification(context: Context): Notification {
    val snooze = PendingIntent.getBroadcast(
      context, 1,
      Intent(context, AlarmActionReceiver::class.java)
        .setAction(AlarmScheduler.ACTION_SNOOZE)
        .putExtra("minutes", AlarmScheduler.snoozeMinutes(context)),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val notification = NotificationCompat.Builder(context, AlarmScheduler.CHANNEL_STOP)
      .setSmallIcon(R.drawable.ic_motor_stat)
      .setContentTitle("Stop the motor")
      .setContentText("The motor run is over — go switch it off, then confirm in the app")
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setOngoing(true)
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 400, 200, 400, 200, 400))
      .addAction(0, "Snooze ${AlarmScheduler.snoozeMinutes(context)} min", snooze)
      .setContentIntent(launchIntent(context))
      .setFullScreenIntent(FullScreen.intent(context, "stop"), true)
      .build()
    notification.flags = notification.flags or Notification.FLAG_INSISTENT
    return notification
  }
}
