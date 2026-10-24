package app.firstlight.alarm;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The bridge between the web app and Android: alarms that ring with the app closed,
 * bedtime notifications, app locking, sounds and launcher icons.
 * Called from js/services/native.js.
 */
@CapacitorPlugin(
    name = "FirstLight",
    permissions = { @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }) }
)
public class FirstLightPlugin extends Plugin {
    private static FirstLightPlugin instance;
    private MediaPlayer preview;

    // Launcher entries keep their first names so updates keep your icon: "owl" now shows the
    // SoulWake smiley (it was the owl, then the tiger), and is the default.
    static final String[] ICONS = { "sunrise", "crescent", "owl", "bell" };

    @Override
    public void load() {
        instance = this;
    }

    /** Lets receivers and services tell the web app something happened, if it's running. */
    static void emit(String event, String key, String value) {
        emit(event, key, value, null, null);
    }

    static void emit(String event, String key, String value, String key2, String value2) {
        FirstLightPlugin p = instance;
        if (p == null) return;
        JSObject data = new JSObject();
        data.put(key, value);
        if (key2 != null) data.put(key2, value2);
        data.put("at", System.currentTimeMillis());
        p.notifyListeners(event, data, true);
    }

    /* ---------------- status & permissions ---------------- */

    @PluginMethod
    public void status(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("exactAlarms", AlarmScheduler.canExact(c));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        r.put("notifications", nm != null && nm.areNotificationsEnabled());
        r.put("fullScreen", Build.VERSION.SDK_INT < 34 || (nm != null && nm.canUseFullScreenIntent()));
        r.put("accessibility", isLockServiceOn(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("batteryUnrestricted", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("ringing", AlarmService.isRinging());
        r.put("ringingKind", AlarmService.ringingKind());
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("lockedUntil", AppLock.lockedUntil(c));
        r.put("guardActive", Guard.uninstallGuarded(c));
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsResult");
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(r);
    }

    /** Opens the right Android settings page: exactAlarm, fullScreen, accessibility, battery, notifications or app. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "app");
        Context c = getContext();
        Uri pkg = Uri.parse("package:" + c.getPackageName());
        Intent i;
        switch (which) {
            case "exactAlarm":
                i = Build.VERSION.SDK_INT >= 31 ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg) : appDetails(pkg);
                break;
            case "fullScreen":
                i = Build.VERSION.SDK_INT >= 34 ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg) : appDetails(pkg);
                break;
            case "accessibility":
                i = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
                break;
            case "battery":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, pkg);
                break;
            case "notifications":
                i = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, c.getPackageName())
                    : appDetails(pkg);
                break;
            default:
                i = appDetails(pkg);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // SoulWake opening Settings itself (e.g. to allow a permission) is never blocked by the night guard.
        Guard.pass(c, System.currentTimeMillis() + 3 * 60_000L);
        try {
            c.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                c.startActivity(appDetails(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                call.resolve();
            } catch (Exception e2) {
                call.reject("Couldn't open settings");
            }
        }
    }

    private static Intent appDetails(Uri pkg) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg);
    }

    private static boolean isLockServiceOn(Context c) {
        String enabled = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
        if (enabled == null) return false;
        String me = new ComponentName(c, LockService.class).flattenToString();
        for (String s : enabled.split(":")) if (s.equalsIgnoreCase(me)) return true;
        return false;
    }

    /* ---------------- alarms ---------------- */

    /** { id, at (ms), kind: wake|test|snooze|checkin|punish|bedtime|later|asleep, repeatDaily? } */
    @PluginMethod
    public void schedule(PluginCall call) {
        String id = call.getString("id");
        Long at = call.getLong("at");
        if (id == null || at == null) { call.reject("id and at are required"); return; }
        try {
            JSONObject a = new JSONObject()
                .put("id", id).put("at", at)
                .put("kind", call.getString("kind", "wake"))
                .put("repeatDaily", Boolean.TRUE.equals(call.getBoolean("repeatDaily", false)));
            if (call.getString("title") != null) a.put("title", call.getString("title"));
            if (call.getString("text") != null) a.put("text", call.getString("text"));
            AlarmScheduler.schedule(getContext(), a);
            call.resolve();
        } catch (JSONException e) {
            call.reject("Bad alarm", e);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        if (id != null) AlarmScheduler.cancel(getContext(), id);
        call.resolve();
    }

    @PluginMethod
    public void scheduled(PluginCall call) {
        JSObject r = new JSObject();
        r.put("alarms", Prefs.obj(getContext(), Prefs.ALARMS));
        call.resolve(r);
    }

    /** Ring right now (used for the missed check-in round, while the app is open). */
    @PluginMethod
    public void ring(PluginCall call) {
        Context c = getContext();
        Intent svc = new Intent(c, AlarmService.class).putExtra(AlarmScheduler.EXTRA_KIND, call.getString("kind", "wake"));
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(svc); else c.startService(svc);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't start the alarm sound", e);
        }
    }

    @PluginMethod
    public void stopRinging(PluginCall call) {
        AlarmService.stop(getContext());
        call.resolve();
    }

    /** Saves today's song (or the punishment song) so the alarm can play it with the app closed. */
    @PluginMethod
    public void setSoundFile(PluginCall call) {
        String which = call.getString("which", "alarm");
        String data = call.getString("base64");
        File f = new File(getContext().getFilesDir(), "punish".equals(which) ? "punish_song" : "alarm_song");
        if (data == null || data.isEmpty()) {
            if (f.exists() && !f.delete()) { call.reject("Couldn't remove the old sound"); return; }
            call.resolve();
            return;
        }
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(Base64.decode(data, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't save the sound", e);
        }
    }

    /** { alarm, checkin, message, asleep } sound names. */
    @PluginMethod
    public void setSounds(PluginCall call) {
        JSONObject cur = Prefs.obj(getContext(), Prefs.SOUNDS);
        for (String k : new String[] { "alarm", "checkin", "message", "asleep" }) {
            String v = call.getString(k);
            if (v != null) {
                try { cur.put(k, v); } catch (JSONException ignored) {}
            }
        }
        Prefs.put(getContext(), Prefs.SOUNDS, cur);
        String name = call.getString("userName");
        if (name != null) Prefs.sp(getContext()).edit().putString("user_name", name).apply();
        call.resolve();
    }

    @PluginMethod
    public void previewSound(PluginCall call) {
        String name = call.getString("name", "chime");
        String raw = Sounds.ALARM.contains(name) ? "alarm_" + name : "note_" + name;
        stopPreview();
        try {
            preview = MediaPlayer.create(getContext(), Sounds.rawId(getContext(), raw),
                new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build(), 0);
            if (preview != null) {
                preview.setOnCompletionListener(mp -> stopPreview());
                preview.start();
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't play the sound", e);
        }
    }

    private void stopPreview() {
        if (preview != null) {
            try { preview.release(); } catch (Exception ignored) {}
            preview = null;
        }
    }

    /* ---------------- sleep ---------------- */

    /** Returns bedtime-notification answers recorded while the app was closed, then clears them. */
    @PluginMethod
    public void takeSleepEvents(PluginCall call) {
        JSONArray events = Prefs.arr(getContext(), Prefs.SLEEP_EVENTS);
        Prefs.put(getContext(), Prefs.SLEEP_EVENTS, new JSONArray());
        JSObject r = new JSObject();
        r.put("events", events);
        call.resolve(r);
    }

    /* ---------------- app lock ---------------- */

    @PluginMethod
    public void listApps(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        Intent main = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        List<ResolveInfo> found = pm.queryIntentActivities(main, 0);
        List<JSObject> apps = new ArrayList<>();
        for (ResolveInfo ri : found) {
            String pkg = ri.activityInfo.packageName;
            if (pkg.equals(getContext().getPackageName()) || AppLock.NEVER.contains(pkg)) continue;
            JSObject a = new JSObject();
            a.put("pkg", pkg);
            a.put("label", ri.loadLabel(pm).toString());
            apps.add(a);
        }
        Collections.sort(apps, (x, y) -> x.getString("label", "").compareToIgnoreCase(y.getString("label", "")));
        JSArray out = new JSArray();
        for (JSObject a : apps) out.put(a);
        JSObject r = new JSObject();
        r.put("apps", out);
        call.resolve(r);
    }

    /** { enabled, packages[], maxHours } */
    @PluginMethod
    public void configureLock(PluginCall call) {
        JSArray pkgs = call.getArray("packages", new JSArray());
        Integer hours = call.getInt("maxHours", 3);
        AppLock.configure(getContext(), Boolean.TRUE.equals(call.getBoolean("enabled", false)), pkgs, hours == null ? 3 : hours);
        call.resolve();
    }

    @PluginMethod
    public void lockNow(PluginCall call) {
        AppLock.startMorningLock(getContext());
        JSObject r = new JSObject();
        r.put("lockedUntil", AppLock.lockedUntil(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        AppLock.release(getContext());
        call.resolve();
    }

    /* ---------------- launcher icon ---------------- */

    @PluginMethod
    public void setIcon(PluginCall call) {
        String chosen = call.getString("name", "sunrise");
        boolean known = false;
        for (String n : ICONS) if (n.equals(chosen)) known = true;
        if (!known) { call.reject("Unknown icon"); return; }
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        for (String n : ICONS) {
            ComponentName alias = new ComponentName(pkg, pkg + ".Icon" + Character.toUpperCase(n.charAt(0)) + n.substring(1));
            int state = n.equals(chosen) ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
            pm.setComponentEnabledSetting(alias, state, PackageManager.DONT_KILL_APP);
        }
        call.resolve();
    }

    /* ---------------- links ---------------- */

    /** Opens a link outside the app: spotify:… in the Spotify app, https:// in the app that owns it or the browser. */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("spotify:"))) { call.reject("Unsupported link"); return; }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        JSObject r = new JSObject();
        try {
            getContext().startActivity(i);
            r.put("ok", true);
        } catch (Exception e) {
            if (url.startsWith("spotify:")) {
                // No Spotify app: open the same thing on the web.
                String[] parts = url.split(":");
                String web = parts.length >= 3 ? "https://open.spotify.com/" + parts[1] + "/" + parts[2] : "https://open.spotify.com";
                try {
                    getContext().startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(web)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    r.put("ok", true);
                } catch (Exception e2) {
                    r.put("ok", false);
                }
            } else {
                r.put("ok", false);
            }
        }
        call.resolve(r);
    }

    /* ---------------- night guard ---------------- */

    /** { armed, uninstall, bed, wake, beforeMin, afterMin }: Android works out each night's window itself. */
    @PluginMethod
    public void setGuard(PluginCall call) {
        Guard.configure(getContext(), call.getData());
        call.resolve();
    }

    /** { until }: Settings isn't intercepted until then (after the guard was solved). */
    @PluginMethod
    public void guardPass(PluginCall call) {
        Long until = call.getLong("until");
        Guard.pass(getContext(), until == null ? 0 : until);
        call.resolve();
    }

    /* ---------------- launch info ---------------- */

    /** What opened the app: an alarm ({kind}) or a locked app ({lockedPkg, lockedLabel}). Cleared once read. */
    @PluginMethod
    public void takeLaunch(PluginCall call) {
        JSONObject launch = Prefs.obj(getContext(), Prefs.LAUNCH);
        Prefs.put(getContext(), Prefs.LAUNCH, new JSONObject());
        try {
            call.resolve(JSObject.fromJSONObject(launch));
        } catch (JSONException e) {
            call.resolve(new JSObject());
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        JSONObject launch = Prefs.obj(getContext(), Prefs.LAUNCH);
        if (launch.length() == 0) return;
        try {
            notifyListeners("launch", JSObject.fromJSONObject(launch), true);
            Prefs.put(getContext(), Prefs.LAUNCH, new JSONObject()); // handled; don't deliver it twice
        } catch (JSONException ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        stopPreview();
        if (instance == this) instance = null;
        super.handleOnDestroy();
    }
}
