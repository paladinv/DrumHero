package com.codingmonkey.drumhero

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import java.util.Calendar

data class LocalPracticeReminder(val enabled: Boolean = false, val hour: Int = 19, val minute: Int = 0)

private const val REMINDER_PREFS = "drum-hero-local-reminder"
private const val REMINDER_CHANNEL = "practice-reminders"
private const val REMINDER_ACTION = "com.codingmonkey.drumhero.PRACTICE_REMINDER"
private const val REMINDER_NOTIFICATION_ID = 7341
private const val REMINDER_PENDING_INTENT_ID = 7342

fun readLocalPracticeReminder(context: Context): LocalPracticeReminder {
    val preferences = context.getSharedPreferences(REMINDER_PREFS, Context.MODE_PRIVATE)
    return LocalPracticeReminder(
        enabled = preferences.getBoolean("enabled", false),
        hour = preferences.getInt("hour", 19).coerceIn(0, 23),
        minute = preferences.getInt("minute", 0).coerceIn(0, 59),
    )
}

fun saveLocalPracticeReminder(context: Context, reminder: LocalPracticeReminder) {
    context.getSharedPreferences(REMINDER_PREFS, Context.MODE_PRIVATE).edit()
        .putBoolean("enabled", reminder.enabled)
        .putInt("hour", reminder.hour.coerceIn(0, 23))
        .putInt("minute", reminder.minute.coerceIn(0, 59))
        .apply()
    if (reminder.enabled) scheduleLocalPracticeReminder(context, reminder) else cancelLocalPracticeReminder(context)
}

fun scheduleLocalPracticeReminder(context: Context, reminder: LocalPracticeReminder) {
    if (!reminder.enabled || !notificationsAllowed(context)) {
        cancelLocalPracticeReminder(context)
        return
    }
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    val calendar = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, reminder.hour.coerceIn(0, 23))
        set(Calendar.MINUTE, reminder.minute.coerceIn(0, 59))
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
        if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
    }
    val pendingIntent = reminderPendingIntent(context) ?: return
    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, calendar.timeInMillis, pendingIntent)
}

fun cancelLocalPracticeReminder(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
    reminderPendingIntent(context)?.let(alarmManager::cancel)
}

private fun reminderPendingIntent(context: Context): PendingIntent? {
    val intent = Intent(context, PracticeReminderReceiver::class.java).setAction(REMINDER_ACTION)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    return PendingIntent.getBroadcast(context, REMINDER_PENDING_INTENT_ID, intent, flags)
}

private fun notificationsAllowed(context: Context): Boolean = Build.VERSION.SDK_INT < 33 ||
    context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

class PracticeReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != REMINDER_ACTION || !notificationsAllowed(context)) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(NotificationChannel(REMINDER_CHANNEL, "Practice reminders", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val openApp = PendingIntent.getActivity(
            context,
            REMINDER_NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0),
        )
        val notificationBuilder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, REMINDER_CHANNEL)
        } else {
            Notification.Builder(context)
        }
        val notification = notificationBuilder.setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle("A little practice goes a long way")
            .setContentText("Open Drum Hero for a focused rhythm session.")
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .build()
        runCatching { manager.notify(REMINDER_NOTIFICATION_ID, notification) }
        scheduleLocalPracticeReminder(context, readLocalPracticeReminder(context))
    }
}

class PracticeReminderBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action !in setOf(
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_TIME_CHANGED,
                Intent.ACTION_TIMEZONE_CHANGED,
            )) return
        scheduleLocalPracticeReminder(context, readLocalPracticeReminder(context))
    }
}
