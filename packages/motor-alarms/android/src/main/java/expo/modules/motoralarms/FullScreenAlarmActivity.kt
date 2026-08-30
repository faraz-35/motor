package expo.modules.motoralarms

import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat

/**
 * Full-screen takeover shown by the alarm's full-screen intent: lights the
 * screen over the lockscreen and rings (the insistent notification sound)
 * until dismissed. On MIUI without the "display pop-up windows in background"
 * permission this never launches and the heads-up notification is the
 * fallback — which is why that permission is in the app's checklist.
 */
class FullScreenAlarmActivity : Activity() {

  companion object {
    const val EXTRA_KIND = "kind"
    const val KIND_DAILY = "daily"
    const val KIND_STOP = "stop"
  }

  private val kind by lazy { intent?.getStringExtra(EXTRA_KIND) ?: KIND_STOP }
  private val notifId
    get() = if (kind == KIND_DAILY) AlarmScheduler.NOTIF_ID_DAILY else AlarmScheduler.NOTIF_ID_STOP

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setShowWhenLocked(true)
    setTurnScreenOn(true)

    val isStop = kind == KIND_STOP
    val title = if (isStop) "STOP THE MOTOR" else "MOTOR TIME"
    val body = if (isStop)
      "The run is over — switch the motor off, then confirm in the app"
    else
      "Water motor turn — open the app to see whose day it is"

    val dp = resources.displayMetrics.density
    val pad = (dp * 28).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(0xFF09090B.toInt())
      setPadding(pad, pad, pad, pad)
    }
    val titleView = TextView(this).apply {
      text = title
      textSize = if (isStop) 36f else 32f
      setTextColor(if (isStop) 0xFFF87171.toInt() else 0xFF22D3EE.toInt())
      typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
      gravity = Gravity.CENTER
    }
    val bodyView = TextView(this).apply {
      text = body
      textSize = 16f
      setTextColor(0xFFA1A1AA.toInt())
      gravity = Gravity.CENTER
      setPadding(0, pad, 0, pad * 2)
    }
    val open = Button(this).apply {
      text = "Open app"
      setOnClickListener { launchMain() }
    }
    val dismiss = Button(this).apply {
      text = "Dismiss"
      setOnClickListener { finish() }
    }
    root.addView(titleView)
    root.addView(bodyView)
    root.addView(open)
    root.addView(dismiss)
    setContentView(root)
  }

  private fun launchMain() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      startActivity(it)
    }
    finish()
  }

  override fun onDestroy() {
    // the insistent sound loops until its notification is cancelled — either
    // button here counts as "acknowledged"
    NotificationManagerCompat.from(this).cancel(notifId)
    super.onDestroy()
  }
}

/** PendingIntents targeting the takeover screen. */
object FullScreen {
  fun intent(ctx: Context, kind: String): PendingIntent =
    PendingIntent.getActivity(
      ctx, kind.hashCode(),
      Intent(ctx, FullScreenAlarmActivity::class.java)
        .putExtra(FullScreenAlarmActivity.EXTRA_KIND, kind)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
}
