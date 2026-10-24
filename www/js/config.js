// App-wide constants and defaults. Change copy and defaults here, not inside features.

export const APP_NAME = 'SoulWake';
export const VERSION = '3.2.0';

export const TEST_DELAY_MS = 10_000;

// If the app was closed through a scheduled alarm, skip it rather than ringing hours late.
export const STALE_ALARM_MS = 30 * 60 * 1000;
export const DEFAULT_ALARM_TIME = '06:30';

// How long a streaming source gets to start playing before falling back to your own songs.
export const SOURCE_START_TIMEOUT_MS = 8000;

export const DEFAULT_TASKS = [
  { id: 't1', name: 'Open-eyes selfie', proof: 'a selfie with both eyes clearly open', gapMin: 0 },
  { id: 't2', name: 'Brushing teeth', proof: 'you brushing your teeth, toothbrush in mouth', gapMin: 0 },
  { id: 't3', name: 'Tea is ready', proof: 'a freshly made cup of tea', gapMin: 10 }
];
export const NEW_TASK = { name: 'New task', proof: 'what the photo should show', gapMin: 0 };
export const TASK_TEMPLATES = [
  { name: 'Make the bed', proof: 'a neatly made bed', gapMin: 0 },
  { name: 'Drink water', proof: 'a glass of water, half finished', gapMin: 0 },
  { name: 'Open the curtains', proof: 'open curtains with daylight', gapMin: 0 },
  { name: 'Stretch', proof: 'you mid-stretch', gapMin: 0 },
  { name: 'Wash your face', proof: 'a wet face or a towel in hand', gapMin: 0 },
  { name: 'Shoes on', proof: 'your shoes on your feet', gapMin: 0 }
];
export const MAX_TASKS = 12;
export const MAX_GAP_MIN = 120;

export const CHAOS_POOL = [
  { name: 'Something yellow', proof: 'any clearly yellow object' },
  { name: 'A spoon', proof: 'a spoon' },
  { name: 'Your left sock', proof: 'a sock, worn or held up' },
  { name: 'The sky', proof: 'the sky, through a window or outside' },
  { name: 'Something green and alive', proof: 'a living plant' },
  { name: 'Your shoes', proof: 'a pair of shoes' },
  { name: 'A book cover', proof: 'the cover of a physical book' },
  { name: 'Your reflection', proof: 'you in a mirror' }
];

export const CHECKIN_DEFAULTS = { delayMin: 5, windowSec: 60 };
export const CHECKIN_LIMITS = { delayMin: [1, 60], windowSec: [15, 300] };

export const SNOOZE_DEFAULTS = { enabled: true, minutes: 5, max: 2 };
export const SNOOZE_LIMITS = { minutes: [1, 30], max: [0, 5] };

// Battery guard: protects your phone from dying overnight.
export const BATTERY_DEFAULTS = { enabled: true, armBelow: 40, floor: 15 };
export const BATTERY_LIMITS = { armBelow: [10, 90], floor: [5, 50] };

export const DISMISS_PHRASES = [
  'My feet are on the floor and staying there',
  'My bed is lava and I am leaving it',
  'Future me will thank present me',
  'I am awake and I have things to do',
  'Pillows are for people who already won today',
  'The day starts now and so do I'
];
export const RETRY_PHRASES = [
  'I ignored my own check in and now I type this',
  'I promise to stop negotiating with my pillow'
];

// Sleep goal range in hours (students on tight schedules can set low goals; never zero or negative).
export const SLEEP_GOAL_LIMITS = [1, 12];
// Nap timer choices (minutes) and limits.
export const NAP_PRESETS = [20, 30, 45, 60, 90];
export const NAP_LIMITS = [5, 240];

// Spotify "Connect" for full songs. This is the Client ID of the app (registered as First Light) on
// developer.spotify.com (owned by a Premium account). It isn't a secret: sign-in uses PKCE.
// Leave it empty to offer only "share a playlist" (30-second previews, no sign-in).
// Spotify allows up to 5 named accounts per app in Development Mode (add them under User Management).
export const SPOTIFY_CLIENT_ID = '41df59fe21cf4799a5be137b7080b140';
export const SPOTIFY_SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'playlist-read-private'
];

// Night guard: from GUARD.beforeBedMin before bedtime until GUARD.afterAlarmMin after the alarm,
// disarming the alarm (or uninstalling / force-stopping the app) takes sums and a buddy PIN.
export const GUARD = {
  beforeBedMin: 120,
  afterAlarmMin: 120,
  sums: 3,
  pinLength: 4,
  pinTries: 5,                 // wrong PINs in a row before a short pause
  pinPauseMs: 60_000,
  forgotWaitMs: 24 * 3600_000, // "Forgot the PIN?" — disarm without it after this long
  passMs: 5 * 60_000           // after solving the uninstall guard, Settings is free for this long
};

// Photo check: an on-device CLIP-style model compares each proof photo with the task's words
// (and, if you took one, a reference photo of the same spot). Downloaded once, then offline.
export const PHOTO_CHECK = {
  models: ['Xenova/mobileclip_s0', 'Xenova/clip-vit-base-patch32'],
  approxMb: 75,
  matchMin: 0.6,        // the task's words must win at least this share against the decoys
  placeMin: 0.72,       // cosine similarity to your reference photo
  triesBeforeTrust: 3   // after this many failed checks, the photo counts (marked unverified)
};
