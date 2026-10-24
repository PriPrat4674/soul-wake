package app.firstlight.alarm;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    static final String EXTRA_LAUNCH = "fl_launch";
    static final String EXTRA_LOCKED = "fl_locked";
    static final String EXTRA_LOCKED_LABEL = "fl_locked_label";
    static final String EXTRA_GUARD = "fl_guard";
    private static final int MAX_SHARED = 2000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(FirstLightPlugin.class);
        super.onCreate(savedInstanceState);
        // Let the alarm screen start music (Spotify, YouTube, your songs) without a tap first.
        WebSettings ws = getBridge().getWebView().getSettings();
        ws.setMediaPlaybackRequiresUserGesture(false);
        // Respect the phone's text size, but cap it so big-font settings can't break the layout.
        float scale = getResources().getConfiguration().fontScale;
        ws.setTextZoom(Math.round(Math.min(Math.max(scale, 0.85f), 1.15f) * 100));
        remember(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        remember(intent);
        super.onNewIntent(intent);
    }

    /** Stores why the app was opened, and shows over the lock screen for alarms. */
    private void remember(Intent intent) {
        if (intent == null) return;
        String kind = intent.getStringExtra(EXTRA_LAUNCH);
        String locked = intent.getStringExtra(EXTRA_LOCKED);
        String guard = intent.getStringExtra(EXTRA_GUARD);
        // "Share → SoulWake": a link shared from another app.
        String shared = Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())
            ? intent.getStringExtra(Intent.EXTRA_TEXT) : null;
        if (shared != null && shared.length() > MAX_SHARED) shared = shared.substring(0, MAX_SHARED);
        if (kind == null && locked == null && shared == null && guard == null) return;
        JSONObject launch = new JSONObject();
        try {
            launch.put("at", System.currentTimeMillis());
            if (kind != null) launch.put("kind", kind);
            if (locked != null) launch.put("lockedPkg", locked).put("lockedLabel", intent.getStringExtra(EXTRA_LOCKED_LABEL));
            if (shared != null) launch.put("shared", shared);
            if (guard != null) launch.put("guard", guard);
        } catch (JSONException ignored) {}
        if (shared != null) { intent.setAction(Intent.ACTION_MAIN); intent.removeExtra(Intent.EXTRA_TEXT); }
        Prefs.put(this, Prefs.LAUNCH, launch);
        intent.removeExtra(EXTRA_LAUNCH);
        intent.removeExtra(EXTRA_LOCKED);
        intent.removeExtra(EXTRA_GUARD);
        if (kind != null) showOverLockScreen();
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    public void onResume() {
        super.onResume();
        // Once nothing is ringing, behave like a normal app again (not over the lock screen).
        if (!AlarmService.isRinging()) {
            if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(false);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }
}
