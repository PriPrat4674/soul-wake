package app.firstlight.alarm;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Small persistent store shared by the plugin, receivers and services. */
final class Prefs {
    private static final String FILE = "first_light";
    static final String ALARMS = "alarms";          // JSON object: id -> alarm
    static final String SLEEP_EVENTS = "sleep_events"; // JSON array of {type, at}
    static final String LOCK = "lock";              // JSON {enabled, packages[], maxHours, until}
    static final String SOUNDS = "sounds";          // JSON {alarm, checkin, message, asleep}
    static final String LAUNCH = "launch";          // JSON {kind, pkg, label, at}
    static final String GUARD = "guard";            // JSON {armed, uninstall, bed, wake, beforeMin, afterMin, passUntil}

    private Prefs() {}

    static SharedPreferences sp(Context c) {
        return c.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static JSONObject obj(Context c, String key) {
        try {
            return new JSONObject(sp(c).getString(key, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static JSONArray arr(Context c, String key) {
        try {
            return new JSONArray(sp(c).getString(key, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    static void put(Context c, String key, Object json) {
        sp(c).edit().putString(key, json.toString()).apply();
    }

    static void addSleepEvent(Context c, String type, long at) {
        JSONArray events = arr(c, SLEEP_EVENTS);
        try {
            events.put(new JSONObject().put("type", type).put("at", at));
        } catch (JSONException ignored) {}
        // Keep the list bounded in case the app isn't opened for a long time.
        while (events.length() > 200) events.remove(0);
        put(c, SLEEP_EVENTS, events);
    }

    static String sound(Context c, String purpose, String fallback) {
        return obj(c, SOUNDS).optString(purpose, fallback);
    }
}
