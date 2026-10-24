package app.firstlight.alarm;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import java.util.Calendar;
import java.util.Iterator;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Schedules alarms with Android's AlarmManager so they fire even when the app is closed.
 * Wake-ups use setAlarmClock (the same API the Clock app uses: exact, allowed in Doze,
 * and shown in the status bar). Gentle prompts use exact-while-idle alarms.
 */
final class AlarmScheduler {
    static final String EXTRA_ID = "fl_id";
    static final String EXTRA_KIND = "fl_kind";
    static final String EXTRA_TITLE = "fl_title";
    static final String EXTRA_TEXT = "fl_text";

    private AlarmScheduler() {}

    static boolean isRinging(String kind) {
        return "wake".equals(kind) || "test".equals(kind) || "snooze".equals(kind) || "checkin".equals(kind) || "punish".equals(kind) || "nap".equals(kind);
    }

    static void schedule(Context c, JSONObject alarm) {
        try {
            JSONObject all = Prefs.obj(c, Prefs.ALARMS);
            all.put(alarm.getString("id"), alarm);
            Prefs.put(c, Prefs.ALARMS, all);
            arm(c, alarm);
        } catch (JSONException ignored) {}
    }

    static void cancel(Context c, String id) {
        JSONObject all = Prefs.obj(c, Prefs.ALARMS);
        all.remove(id);
        Prefs.put(c, Prefs.ALARMS, all);
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        PendingIntent pi = pending(c, id, "", PendingIntent.FLAG_NO_CREATE);
        if (am != null && pi != null) am.cancel(pi);
    }

    /** After a reboot, time change or app update: put every saved alarm back. */
    static void rescheduleAll(Context c) {
        JSONObject all = Prefs.obj(c, Prefs.ALARMS);
        long now = System.currentTimeMillis();
        Iterator<String> keys = all.keys();
        while (keys.hasNext()) {
            JSONObject a = all.optJSONObject(keys.next());
            if (a == null) continue;
            if (a.optLong("at") < now - 60_000) {
                if (a.optBoolean("repeatDaily")) a = rollForward(a, now);
                else continue;
            }
            arm(c, a);
        }
        Prefs.put(c, Prefs.ALARMS, all);
    }

    /** Called when a repeating alarm fires: book the same time tomorrow. */
    static void bookNext(Context c, String id) {
        JSONObject all = Prefs.obj(c, Prefs.ALARMS);
        JSONObject a = all.optJSONObject(id);
        if (a == null) return;
        if (!a.optBoolean("repeatDaily")) {
            all.remove(id);
            Prefs.put(c, Prefs.ALARMS, all);
            return;
        }
        try {
            all.put(id, rollForward(a, System.currentTimeMillis() + 60_000));
        } catch (JSONException ignored) {}
        Prefs.put(c, Prefs.ALARMS, all);
        arm(c, all.optJSONObject(id));
    }

    static JSONObject rollForward(JSONObject a, long after) {
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(a.optLong("at"));
        int h = cal.get(Calendar.HOUR_OF_DAY), m = cal.get(Calendar.MINUTE);
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(after);
        next.set(Calendar.HOUR_OF_DAY, h);
        next.set(Calendar.MINUTE, m);
        next.set(Calendar.SECOND, 0);
        next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= after) next.add(Calendar.DAY_OF_MONTH, 1);
        try {
            a.put("at", next.getTimeInMillis());
        } catch (JSONException ignored) {}
        return a;
    }

    static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
    }

    private static void arm(Context c, JSONObject a) {
        if (a == null) return;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        String id = a.optString("id"), kind = a.optString("kind", "wake");
        long at = a.optLong("at");
        PendingIntent fire = pending(c, id, kind, a.optString("title", null), a.optString("text", null), PendingIntent.FLAG_UPDATE_CURRENT);
        try {
            if (isRinging(kind)) {
                Intent show = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                PendingIntent showPi = PendingIntent.getActivity(c, 7, show, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi), fire);
            } else if (canExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
            }
        } catch (SecurityException e) {
            // Exact alarms not allowed (user turned the permission off): best effort.
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire);
        }
    }

    private static PendingIntent pending(Context c, String id, String kind, int flags) {
        return pending(c, id, kind, null, null, flags);
    }

    /** title/text are only used by plain notifications (kind "task"). Extras don't affect matching, so cancel still works. */
    private static PendingIntent pending(Context c, String id, String kind, String title, String text, int flags) {
        Intent i = new Intent(c, AlarmReceiver.class).setAction("app.firstlight.ALARM." + id)
            .putExtra(EXTRA_ID, id).putExtra(EXTRA_KIND, kind);
        if (title != null) i.putExtra(EXTRA_TITLE, title);
        if (text != null) i.putExtra(EXTRA_TEXT, text);
        return PendingIntent.getBroadcast(c, id.hashCode(), i, flags | PendingIntent.FLAG_IMMUTABLE);
    }
}
