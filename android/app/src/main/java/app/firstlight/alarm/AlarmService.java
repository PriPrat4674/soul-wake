package app.firstlight.alarm;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import java.io.File;

/**
 * Plays the alarm on the ALARM volume (so silent mode doesn't mute it), vibrates, and shows a
 * full-screen notification that opens SoulWake over the lock screen.
 * Stops when the app says the phrase was typed, or after 30 minutes as a safety limit.
 */
public class AlarmService extends Service {
    static final int NOTIF_ID = 4201;
    static final String ACTION_STOP = "app.firstlight.STOP_RING";
    private static final long MAX_RING_MS = 30 * 60 * 1000;

    private static volatile boolean ringing = false;
    private static volatile String ringingKind = null; // what is ringing: wake, test, snooze, checkin, punish, nap
    private MediaPlayer player;
    private Vibrator vibrator;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private float volume = 0.3f;
    private boolean cliff = false; // loop only the first 40 s of your own song; the rest is the reward
    private static final int CLIFF_MS = 40_000;

    static boolean isRinging() { return ringing; }
    static String ringingKind() { return ringing ? ringingKind : null; }

    static void stop(Context c) {
        c.stopService(new Intent(c, AlarmService.class));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ID);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        String kind = intent != null ? intent.getStringExtra(AlarmScheduler.EXTRA_KIND) : "wake";
        if (kind == null) kind = "wake";
        Notification n = buildNotification(kind);
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        } else {
            startForeground(NOTIF_ID, n);
        }
        ringing = true;
        ringingKind = kind;
        startSound(kind);
        startVibration();
        handler.removeCallbacksAndMessages(null);
        handler.postDelayed(this::stopSelf, MAX_RING_MS);
        rampVolume();
        watchCliff();
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String kind) {
        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(MainActivity.EXTRA_LAUNCH, kind);
        PendingIntent openPi = PendingIntent.getActivity(this, 11, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String title, text;
        switch (kind) {
            case "checkin": title = "Still up? 👀"; text = "Tap to answer your check-in."; break;
            case "punish": title = "Round two ⏰"; text = "You missed your check-in."; break;
            case "snooze": title = "Snooze is over ☀️"; text = "Up you get. Tap to stop the alarm."; break;
            case "nap": title = "Nap's over ☀️"; text = "Tap to get up. I'll log your nap."; break;
            default: title = "Good morning ☀️"; text = "Tap to stop the alarm. No easy way out."; break;
        }
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            Sounds.ensureBase(this, getSystemService(NotificationManager.class));
            b = new Notification.Builder(this, Sounds.CH_RING);
        } else {
            b = new Notification.Builder(this).setPriority(Notification.PRIORITY_MAX);
        }
        return b.setSmallIcon(R.drawable.ic_stat_sun)
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(Notification.CATEGORY_ALARM)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(openPi)
            .setFullScreenIntent(openPi, true)
            .build();
    }

    private void startSound(String kind) {
        releasePlayer();
        player = new MediaPlayer();
        player.setAudioAttributes(new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
        player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
        player.setLooping(true);
        try {
            File custom = soundFileFor(kind);
            cliff = false;
            if (custom != null && custom.exists() && custom.length() > 0) {
                player.setDataSource(custom.getAbsolutePath());
                cliff = !"punish".equals(kind);
            } else {
                String name = "checkin".equals(kind) ? "note_" + Prefs.sound(this, "checkin", "bell") : null;
                int res = name != null ? Sounds.rawId(this, name) : Sounds.alarmRaw(this, Prefs.sound(this, "alarm", "dawn"));
                android.content.res.AssetFileDescriptor afd = getResources().openRawResourceFd(res);
                player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
            }
            player.setVolume(volume, volume);
            player.prepare();
            player.start();
        } catch (Exception e) {
            // Fall back to the built-in alarm sound if the saved song can't be read.
            try {
                releasePlayer();
                player = MediaPlayer.create(this, Sounds.alarmRaw(this, "dawn"), new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM).build(), 0);
                if (player != null) { player.setLooping(true); player.start(); }
            } catch (Exception ignored) {}
        }
    }

    private File soundFileFor(String kind) {
        if ("punish".equals(kind)) return new File(getFilesDir(), "punish_song");
        if ("checkin".equals(kind) || "nap".equals(kind)) return null; // naps use the alarm sound, not today's song
        return new File(getFilesDir(), "alarm_song");
    }

    private void rampVolume() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (player == null) return;
                volume = Math.min(1f, volume + 0.07f);
                try { player.setVolume(volume, volume); } catch (IllegalStateException ignored) {}
                if (volume < 1f) handler.postDelayed(this, 2000);
            }
        }, 2000);
    }

    private void watchCliff() {
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                if (player == null) return;
                try {
                    if (cliff && player.getCurrentPosition() >= CLIFF_MS) player.seekTo(0);
                } catch (IllegalStateException ignored) {}
                handler.postDelayed(this, 1000);
            }
        }, 1000);
    }

    private void startVibration() {
        vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
        if (vibrator == null || !vibrator.hasVibrator()) return;
        long[] pattern = {0, 700, 400, 700, 1200};
        if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        else vibrator.vibrate(pattern, 0);
    }

    private void releasePlayer() {
        if (player != null) {
            try { player.stop(); } catch (IllegalStateException ignored) {}
            player.release();
            player = null;
        }
    }

    @Override
    public void onDestroy() {
        ringing = false;
        ringingKind = null;
        handler.removeCallbacksAndMessages(null);
        releasePlayer();
        if (vibrator != null) vibrator.cancel();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
