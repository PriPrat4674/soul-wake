package app.firstlight.alarm;

import android.content.Context;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Which apps are locked, and until when. The lock starts when the wake-up alarm rings and ends
 * when your morning is proven, or automatically after maxHours so you're never stuck.
 * Phone, messages, settings and SoulWake itself can never be locked.
 */
final class AppLock {
    static final Set<String> NEVER = new HashSet<>();
    static {
        NEVER.add("com.android.settings");
        NEVER.add("com.android.dialer");
        NEVER.add("com.google.android.dialer");
        NEVER.add("com.samsung.android.dialer");
        NEVER.add("com.android.phone");
        NEVER.add("com.google.android.apps.messaging");
        NEVER.add("com.samsung.android.messaging");
        NEVER.add("com.android.systemui");
        NEVER.add("com.android.emergency");
    }

    private AppLock() {}

    static JSONObject config(Context c) {
        return Prefs.obj(c, Prefs.LOCK);
    }

    static void configure(Context c, boolean enabled, JSONArray packages, int maxHours) {
        JSONObject cfg = config(c);
        try {
            cfg.put("enabled", enabled).put("packages", packages).put("maxHours", Math.max(1, Math.min(6, maxHours)));
            if (!enabled) cfg.put("until", 0);
        } catch (JSONException ignored) {}
        Prefs.put(c, Prefs.LOCK, cfg);
    }

    static void startMorningLock(Context c) {
        JSONObject cfg = config(c);
        if (!cfg.optBoolean("enabled")) return;
        long until = System.currentTimeMillis() + cfg.optInt("maxHours", 3) * 3600_000L;
        try { cfg.put("until", until); } catch (JSONException ignored) {}
        Prefs.put(c, Prefs.LOCK, cfg);
    }

    static void release(Context c) {
        JSONObject cfg = config(c);
        try { cfg.put("until", 0); } catch (JSONException ignored) {}
        Prefs.put(c, Prefs.LOCK, cfg);
    }

    static long lockedUntil(Context c) {
        JSONObject cfg = config(c);
        long until = cfg.optLong("until", 0);
        return cfg.optBoolean("enabled") && until > System.currentTimeMillis() ? until : 0;
    }

    static boolean isLocked(Context c, String pkg) {
        if (pkg == null || pkg.equals(c.getPackageName()) || NEVER.contains(pkg)) return false;
        if (lockedUntil(c) == 0) return false;
        JSONArray list = config(c).optJSONArray("packages");
        if (list == null) return false;
        for (int i = 0; i < list.length(); i++) if (pkg.equals(list.optString(i))) return true;
        return false;
    }
}
