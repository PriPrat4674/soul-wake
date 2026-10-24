package app.firstlight.alarm;

import android.content.Context;
import java.util.Calendar;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Night guard, Android side. The web app sends the nightly pattern (bedtime, wake time, how long
 * before and after) and Android works out each night's window by itself, so the guard keeps
 * working even if the app isn't opened for days. In the window, uninstalling or force-stopping
 * SoulWake sends you to the app's guard screen (sums + buddy PIN). Solving it gives a short pass.
 */
final class Guard {
    private Guard() {}

    /** cfg: { armed, uninstall, bed "HH:MM", wake "HH:MM", beforeMin, afterMin } */
    static void configure(Context c, JSONObject cfg) {
        JSONObject g = Prefs.obj(c, Prefs.GUARD);
        try {
            g.put("armed", cfg.optBoolean("armed"))
             .put("uninstall", cfg.optBoolean("uninstall"))
             .put("bed", cfg.optString("bed", "23:00"))
             .put("wake", cfg.optString("wake", "06:30"))
             .put("beforeMin", Math.max(0, Math.min(360, cfg.optInt("beforeMin", 120))))
             .put("afterMin", Math.max(0, Math.min(360, cfg.optInt("afterMin", 120))));
        } catch (JSONException ignored) {}
        Prefs.put(c, Prefs.GUARD, g);
    }

    /** A few minutes in which Settings isn't intercepted (after solving the guard, or when the app opens Settings itself). */
    static void pass(Context c, long until) {
        JSONObject g = Prefs.obj(c, Prefs.GUARD);
        try { g.put("passUntil", until); } catch (JSONException ignored) {}
        Prefs.put(c, Prefs.GUARD, g);
    }

    static int minutes(String hhmm) {
        try {
            String[] p = hhmm.split(":");
            return ((Integer.parseInt(p[0]) * 60 + Integer.parseInt(p[1])) % 1440 + 1440) % 1440;
        } catch (Exception e) {
            return -1;
        }
    }

    /** Pure: is `nowMin` (minutes after midnight) inside the nightly window? */
    static boolean inWindow(int nowMin, int bedMin, int wakeMin, int before, int after) {
        if (bedMin < 0 || wakeMin < 0) return false;
        int from = ((bedMin - before) % 1440 + 1440) % 1440;
        int length = ((wakeMin - bedMin) % 1440 + 1440) % 1440 + before + after;
        if (length >= 1440) return true;
        int since = ((nowMin - from) % 1440 + 1440) % 1440;
        return since < length;
    }

    /** True when uninstalling / force-stopping should be intercepted right now. */
    static boolean uninstallGuarded(Context c) {
        JSONObject g = Prefs.obj(c, Prefs.GUARD);
        if (!g.optBoolean("armed") || !g.optBoolean("uninstall")) return false;
        long now = System.currentTimeMillis();
        if (g.optLong("passUntil", 0) > now) return false;
        Calendar cal = Calendar.getInstance();
        int nowMin = cal.get(Calendar.HOUR_OF_DAY) * 60 + cal.get(Calendar.MINUTE);
        return inWindow(nowMin, minutes(g.optString("bed", "23:00")), minutes(g.optString("wake", "06:30")),
            g.optInt("beforeMin", 120), g.optInt("afterMin", 120));
    }
}
