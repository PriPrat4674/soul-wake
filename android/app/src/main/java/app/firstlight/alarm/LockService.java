package app.firstlight.alarm;

import android.accessibilityservice.AccessibilityService;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.Locale;

/**
 * Two jobs, both opt-in:
 *  1. App lock: watches which app comes to the front. If it's one you chose to lock and your
 *     morning isn't proven yet, it sends you home and opens SoulWake with a reminder.
 *  2. Night guard: in your guarded hours, if a Settings or uninstall screen is about SoulWake
 *     (App info with Force stop / Uninstall, the uninstall dialog, or this service's own page),
 *     it backs out and opens SoulWake's guard screen. Only those screens are read, only at
 *     night, only to look for SoulWake's name. Nothing is stored or sent.
 */
public class LockService extends AccessibilityService {
    private String lastBlocked = null;
    private long lastBlockedAt = 0;
    private long lastGuardAt = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) return;
        CharSequence pkgCs = event.getPackageName();
        if (pkgCs == null) return;
        String pkg = pkgCs.toString();

        if (isSystemSettings(pkg)) {
            if (Guard.uninstallGuarded(this) && aboutUs(pkg)) interceptUninstall();
            return;
        }
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return;
        if (!AppLock.isLocked(this, pkg)) return;
        long now = System.currentTimeMillis();
        if (pkg.equals(lastBlocked) && now - lastBlockedAt < 1500) return; // avoid loops
        lastBlocked = pkg;
        lastBlockedAt = now;
        performGlobalAction(GLOBAL_ACTION_HOME);
        String label = label(pkg);
        Intent open = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_LOCKED, pkg)
            .putExtra(MainActivity.EXTRA_LOCKED_LABEL, label);
        try { startActivity(open); } catch (Exception ignored) {}
        FirstLightPlugin.emit("locked", "pkg", pkg, "label", label);
    }

    static boolean isSystemSettings(String pkg) {
        return pkg.equals("com.android.settings") || pkg.contains("packageinstaller") || pkg.equals("com.google.android.permissioncontroller");
    }

    /** Is the screen about SoulWake, and about stopping or removing it? */
    private boolean aboutUs(String pkg) {
        AccessibilityNodeInfo root;
        try { root = getRootInActiveWindow(); } catch (Exception e) { return false; }
        if (root == null) return false;
        String me = getString(R.string.app_name).toLowerCase(Locale.ROOT);
        boolean[] found = new boolean[2]; // [our name, a stop/remove control]
        scan(root, me, found, 0);
        if (!found[0]) return false;
        // The uninstall dialog is always about removing the app it names.
        return pkg.contains("packageinstaller") || found[1];
    }

    private static final String[] DANGER = { "force stop", "uninstall", "deactivate", "disable", "turn off", "stop" };

    private void scan(AccessibilityNodeInfo n, String me, boolean[] found, int depth) {
        if (n == null || depth > 40 || (found[0] && found[1])) return;
        CharSequence t = n.getText(), d = n.getContentDescription();
        String text = ((t == null ? "" : t.toString()) + " " + (d == null ? "" : d.toString())).toLowerCase(Locale.ROOT);
        if (text.contains(me)) found[0] = true;
        String id = n.getViewIdResourceName();
        if (id != null && (id.contains("force_stop") || id.contains("uninstall"))) found[1] = true;
        if (n.isClickable() || n.isCheckable()) for (String w : DANGER) if (text.contains(w)) { found[1] = true; break; }
        // A switch on this service's own Accessibility page ("Use SoulWake app lock") also counts.
        if (n.isCheckable() && text.contains(me)) found[1] = true;
        for (int i = 0; i < n.getChildCount(); i++) {
            AccessibilityNodeInfo ch;
            try { ch = n.getChild(i); } catch (Exception e) { continue; }
            scan(ch, me, found, depth + 1);
        }
    }

    private void interceptUninstall() {
        long now = System.currentTimeMillis();
        if (now - lastGuardAt < 2000) return; // one interception at a time
        lastGuardAt = now;
        performGlobalAction(GLOBAL_ACTION_BACK);
        performGlobalAction(GLOBAL_ACTION_HOME);
        Intent open = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_GUARD, "uninstall");
        try { startActivity(open); } catch (Exception ignored) {}
        FirstLightPlugin.emit("guard", "kind", "uninstall");
    }

    private String label(String pkg) {
        try {
            PackageManager pm = getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    @Override
    public void onInterrupt() {}
}
