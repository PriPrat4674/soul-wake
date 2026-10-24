package app.firstlight.alarm;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Bedtime and "still awake?" notifications, with buttons that work without opening the app. */
final class Notifier {
    static final int BEDTIME_ID = 4301;
    static final int ASLEEP_ID = 4302;
    static final int TASK_ID = 4303;

    private Notifier() {}

    static void bedtime(Context c, boolean followUp) {
        String name = Prefs.sp(c).getString("user_name", "");
        String hi = name.isEmpty() ? "" : ", " + name;
        String title = followUp ? "30 minutes are up 🌙" : "Heading to bed" + hi + "? 🌙";
        String text = followUp ? "Time to put the phone down. Sweet dreams 💤" : "Your bedtime is here. Tomorrow-you says thanks 🫶";
        Notification.Builder b = builder(c, Sounds.channel(c, "bedtime", Prefs.sound(c, "message", "chime")))
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(c, 21))
            .addAction(action(c, "Going to sleep 😴", ActionReceiver.SLEEP_NOW, 31))
            .addAction(action(c, "In 30 min", ActionReceiver.SLEEP_LATER, 32));
        if (!followUp) b.addAction(action(c, "Not tonight", ActionReceiver.NOT_TONIGHT, 33));
        post(c, BEDTIME_ID, b.build());
    }

    static void asleepCheck(Context c) {
        String sound = Prefs.sound(c, "asleep", "warm");
        if ("off".equals(sound)) return;
        Notification.Builder b = builder(c, Sounds.channel(c, "asleep", "silent".equals(sound) ? "silent" : "warm"))
            .setContentTitle("Drifting off? 🌙")
            .setContentText("If you're still awake, tap below. If not, sleep well. No need to answer 💤")
            .setAutoCancel(true)
            .addAction(action(c, "Still awake", ActionReceiver.STILL_AWAKE, 34));
        if (Build.VERSION.SDK_INT >= 26) b.setTimeoutAfter(20 * 60 * 1000);
        post(c, ASLEEP_ID, b.build());
    }

    /** "Tea is ready ⏰": a task's wait is over. Tapping opens SoulWake on the task list. */
    static void task(Context c, String title, String text) {
        Notification.Builder b = builder(c, Sounds.channel(c, "bedtime", Prefs.sound(c, "message", "chime")))
            .setContentTitle(title != null ? title : "Next task is ready ⏰")
            .setContentText(text != null ? text : "Time to take your proof photo 📸")
            .setCategory(Notification.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(c, 22));
        post(c, TASK_ID, b.build());
    }

    static void cancel(Context c, int id) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(id);
    }

    private static Notification.Builder builder(Context c, String channel) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        return b.setSmallIcon(R.drawable.ic_stat_sun).setShowWhen(true);
    }

    private static PendingIntent openApp(Context c, int code) {
        Intent i = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Notification.Action action(Context c, String label, String what, int code) {
        Intent i = new Intent(c, ActionReceiver.class).setAction(what);
        PendingIntent pi = PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Action.Builder(null, label, pi).build();
    }

    private static void post(Context c, int id, Notification n) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled()) return;
        try { nm.notify(id, n); } catch (SecurityException ignored) {}
    }
}
