# SoulWake — test report

Run on 2026-10-24 09:25 in headless Chromium at phone size (390×844).

**187 of 187 passed.** 123 valid-use cases, 64 invalid-input or failure cases.

Spotify, YouTube, the Android bridge, and the city weather/news/Wikipedia services were replaced with local stand-ins (`tests/mocks/` and routes in `App._route_net`), so these tests prove the app’s handling of each response, not those servers themselves. Run a test alarm on your phone to confirm those end to end.

| Result | Group | Type | Test | Time |
|---|---|---|---|---|
| ✅ | App | valid | Loads with no errors, correct title, four everyday tabs and a ☰ menu | 1.1s |
| ✅ | App | valid | Every tab opens and the top bar names it | 2.8s |
| ✅ | App | valid | ☰ menu opens each settings group on its own page; Back returns; Escape closes the menu | 8.8s |
| ✅ | App | valid | Classic fonts are bundled and load offline (Bodoni Moda, EB Garamond) | 1.1s |
| ✅ | App | valid | Every button has an accessible name | 3.0s |
| ✅ | App | invalid | Corrupted saved data falls back to defaults instead of crashing | 1.0s |
| ✅ | App | invalid | Storage failure shows a clear message | 1.6s |
| ✅ | Alarm | valid | Changing the wake-up time is saved across a reload | 1.9s |
| ✅ | Alarm | invalid | Clearing the time field keeps the previous time | 1.2s |
| ✅ | Alarm | valid | Slide-to-arm works with the keyboard (Enter) | 1.4s |
| ✅ | Alarm | valid | Dragging the slider all the way arms the alarm | 1.8s |
| ✅ | Alarm | invalid | A short drag does not arm (prevents accidental taps) | 1.6s |
| ✅ | Alarm | valid | Disarm turns the alarm off | 1.5s |
| ✅ | Alarm | valid | Rings at the set time, then re-arms for the next day | 2.5s |
| ✅ | Alarm | invalid | An alarm missed while the app was closed does not ring hours late | 1.2s |
| ✅ | Alarm | valid | Test alarm rings after 10 seconds | 1.6s |
| ✅ | Alarm | invalid | A second alarm during an active morning is ignored | 1.8s |
| ✅ | Battery | invalid | Low battery, not charging: arming asks first; "plug in first" cancels | 1.3s |
| ✅ | Battery | valid | Low battery: "Arm anyway" arms | 1.6s |
| ✅ | Battery | valid | Low battery but charging arms without a warning | 1.4s |
| ✅ | Battery | valid | Guard switched off: no warning at low battery | 1.4s |
| ✅ | Battery | valid | Battery hits the floor unplugged while armed: alarm switches off and it is recorded | 1.7s |
| ✅ | Battery | valid | Battery at the floor while charging keeps the alarm armed | 1.7s |
| ✅ | Battery | invalid | Browser without battery info (e.g. iPhone): arms and advises plugging in | 1.5s |
| ✅ | Battery | invalid | Guard levels stay sensible: switch-off level can’t reach the warning level | 1.1s |
| ✅ | Battery | valid | Low battery during an active morning never stops the morning | 1.8s |
| ✅ | Night | valid | Arming opens the black night screen; "Back to the app" keeps it armed | 1.6s |
| ✅ | Night | valid | Night screen gives way to the alarm, and closes on disarm | 2.6s |
| ✅ | Ringing | invalid | A wrong phrase is rejected and the alarm keeps ringing | 1.9s |
| ✅ | Ringing | invalid | An empty phrase is rejected | 1.9s |
| ✅ | Ringing | valid | The phrase ignores capitals, extra spaces and punctuation | 1.8s |
| ✅ | Ringing | invalid | Pasting and dropping text into the phrase box is blocked | 1.4s |
| ✅ | Ringing | valid | Letters light up as you type, wrong letters are marked | 1.6s |
| ✅ | Snooze | valid | Snooze silences, logs to the Hall of Shame, and rings again after 5 minutes | 3.6s |
| ✅ | Snooze | valid | "I’m up" ends the snooze early so you can stop the alarm | 1.9s |
| ✅ | Snooze | invalid | After the snooze limit (2), the snooze option disappears | 2.3s |
| ✅ | Snooze | valid | Snooze switched off: no snooze button | 1.5s |
| ✅ | Snooze | invalid | No snooze on the punishment ring after a missed check-in | 4.1s |
| ✅ | Snooze | invalid | Snooze settings reject out-of-range and junk values | 1.0s |
| ✅ | Snooze | valid | Test-run snoozes stay out of your Hall of Shame and totals | 2.5s |
| ✅ | Check-in | valid | Check-in appears after 5 minutes; answering it stops the timer | 4.7s |
| ✅ | Check-in | invalid | Missing the check-in rings again with a harsher phrase and keeps task progress | 6.6s |
| ✅ | Check-in | invalid | Check-in steppers stop at their limits | 1.4s |
| ✅ | Check-in | valid | No check-in after the morning is finished | 5.9s |
| ✅ | Tasks | valid | Quick-add a template task and it is saved | 2.2s |
| ✅ | Tasks | invalid | An empty task name is refused and the old name kept | 1.4s |
| ✅ | Tasks | invalid | Wait time stays between 0 and 120 minutes, junk ignored | 0.9s |
| ✅ | Tasks | valid | Reorder and delete tasks | 1.5s |
| ✅ | Tasks | invalid | No more than 12 tasks | 1.4s |
| ✅ | Tasks | valid | A task with a wait stays locked until the wait is over | 7.3s |
| ✅ | Tasks | valid | With no tasks, typing the phrase finishes the morning | 1.8s |
| ✅ | Tasks | valid | Chaos task adds one random task at the end | 3.8s |
| ✅ | Tasks | invalid | Editing tasks mid-morning doesn’t change this morning’s list | 1.4s |
| ✅ | Camera | invalid | Camera blocked: clear message, task not completed | 2.3s |
| ✅ | Camera | valid | Capture, retake, then Next completes the task | 5.5s |
| ✅ | Camera | invalid | Cancelling the camera leaves the task open | 2.8s |
| ✅ | Progress | valid | Finishing shows the report card; a test run doesn’t touch the streak | 3.8s |
| ✅ | Progress | valid | A real morning adds to the streak, history and calendar | 4.1s |
| ✅ | Progress | valid | Grades follow snoozes, missed check-ins and time taken | 0.9s |
| ✅ | Progress | valid | Streak continues from yesterday and resets after a missed day | 4.7s |
| ✅ | Progress | invalid | An unfinished morning from yesterday is closed, not resumed | 1.1s |
| ✅ | Progress | valid | Reloading while the alarm rings keeps it ringing | 2.4s |
| ✅ | Sounds | invalid | Adding songs: audio files accepted, other files refused with a reason | 2.1s |
| ✅ | Sounds | valid | Song rotation: no repeats until every song has played | 2.2s |
| ✅ | Sounds | valid | Your songs play when the alarm rings; the rest plays when you finish | 3.9s |
| ✅ | Sounds | valid | No songs added: the alarm beeps | 1.4s |
| ✅ | Sounds | invalid | Punishment song: non-audio refused; audio plays after a missed check-in | 6.0s |
| ✅ | Boost | invalid | Voice note: empty recording refused; saved note plays after the check-in | 4.1s |
| ✅ | Boost | invalid | Clips: non-video refused; no boost screen when nothing is saved | 5.1s |
| ✅ | Spotify | valid | No Client ID to type: “Connect Spotify” appears only when the app has its own Spotify ID | 1.9s |
| ✅ | Spotify | valid | Connect: secure sign-in (PKCE), token saved, playlists listed and chosen | 5.5s |
| ✅ | Spotify | invalid | Tampered sign-in (state mismatch) is rejected | 3.2s |
| ✅ | Spotify | invalid | Cancelled sign-in shows a message | 3.2s |
| ✅ | Spotify | valid | Alarm plays the playlist in the in-app Spotify player, starting at today’s song | 4.6s |
| ✅ | Spotify | invalid | No Premium: falls back to your songs/beeps and explains why | 4.0s |
| ✅ | Spotify | invalid | Expired sign-in that can’t refresh: disconnects and falls back | 2.9s |
| ✅ | Spotify | valid | Expired access token is refreshed automatically | 3.9s |
| ✅ | Spotify | valid | Disconnect clears the account | 1.8s |
| ✅ | YouTube | invalid | Link check: rejects non-links, other sites, private lists and junk | 1.0s |
| ✅ | YouTube | valid | Link check: accepts YouTube Music playlists, watch links and youtu.be | 0.9s |
| ✅ | YouTube | valid | Alarm shows the YouTube player on screen and plays; stopping removes it | 2.9s |
| ✅ | YouTube | invalid | Embedding not allowed: falls back to your songs/beeps | 2.2s |
| ✅ | YouTube | invalid | Player never starts (blocked autoplay): falls back within 8 seconds | 10.3s |
| ✅ | Data | valid | Erase all data asks first, then resets everything | 2.7s |
| ✅ | Data | invalid | Choosing "Keep my data" erases nothing | 2.0s |
| ✅ | Data | valid | Data from the original Proof of Wake build is carried over | 1.0s |
| ✅ | Data | valid | Offline: after one visit, the app opens with no connection | 5.8s |
| ✅ | Data | valid | Every app file is in the offline cache list | 0.0s |
| ✅ | Onboarding | valid | First run: setup walks through name, logo, colour, theme, font, style, sleep; choices are saved | 7.3s |
| ✅ | Onboarding | valid | Skipping the name works; Back keeps earlier choices | 2.6s |
| ✅ | Onboarding | invalid | Names are cleaned: no HTML, extra spaces, or over-long text | 1.0s |
| ✅ | Pip | valid | Pip is the SoulWake smiley in every pose; old Owl and Tiger logos become SoulWake (same home-screen icon) | 3.0s |
| ✅ | Onboarding | invalid | Unknown look choices are refused; corrupted profile is repaired | 0.9s |
| ✅ | Look & feel | valid | All 3,456 combinations (4 logos × 4 colours × 9 themes × 8 fonts × 3 styles) apply and stay readable | 39.5s |
| ✅ | Look & feel | valid | Every bundled font file loads | 1.3s |
| ✅ | Look & feel | valid | Changing theme, font and logo in Settings is saved across a restart | 2.7s |
| ✅ | Messages | valid | A 4:00 alarm gets “Oho! … early riser” — every day | 1.2s |
| ✅ | Messages | valid | Messages change by day and time, mention streaks, and handle weekends | 1.0s |
| ✅ | Pip | valid | Pip’s mood follows your behaviour (happy, ecstatic, grumpy, sulking, sleepy) | 1.0s |
| ✅ | Pip | valid | Pip turns grumpy after a real snooze, and answers when poked | 2.7s |
| ✅ | Pip | valid | Opening the app: Pip leaps in with “Good morning, Priya”, then the app appears; tap skips | 2.1s |
| ✅ | Sleep | valid | “Going to sleep” at 23:00, alarm stopped 7.5 h later: night logged as a little short | 2.8s |
| ✅ | Sleep | valid | A short night shows the research-backed day plan; tips can be ticked off | 4.1s |
| ✅ | Sleep | invalid | Nonsense nights aren’t logged (under 1 h or over 16 h); a good night hides the plan | 1.5s |
| ✅ | Sleep | invalid | Schedule rejects bad times; the goal can go as low as 1 h (never 0 or negative) and up to 12 h | 1.0s |
| ✅ | Sleep | valid | Sleep goal stepper goes down to 1 h in Settings, with a kind note under 5 h; a 4 h night on a 4 h goal counts as rested | 1.9s |
| ✅ | Sleep | valid | Bedtime nudge: “In 30 minutes” reminds you; “Going to sleep” then a gentle “still awake?” | 21.2s |
| ✅ | Sleep | invalid | “Not tonight” stops nudges for the night; “still awake?” can be turned off | 30.7s |
| ✅ | Sleep | valid | Saturday after a short week: suggests a Sunday sleep-in (capped at 2 h) and moves the alarm in one tap | 2.1s |
| ✅ | Sleep | invalid | No sleep-in advice midweek, with too few nights, or after a good week | 3.3s |
| ✅ | Sleep | invalid | One-off alarm times reject bad dates and times; old ones are cleaned up | 1.0s |
| ✅ | Sleep | valid | This week’s sleep chart shows each night against the goal | 1.4s |
| ✅ | Sounds | valid | Every alarm and notification sound file is bundled | 1.0s |
| ✅ | Sounds | invalid | Choosing sounds: valid picks are saved and previewed, unknown ones refused | 2.3s |
| ✅ | Sounds | valid | Check-in plays your chosen sound in a loop (not beeps) | 4.0s |
| ✅ | Android | valid | Arming schedules Android’s alarm (repeats daily) and hands over today’s song; disarm cancels | 3.5s |
| ✅ | Android | valid | Test alarm is scheduled with Android for 10 seconds from now | 1.6s |
| ✅ | Android | valid | Android rings → app shows the alarm; stopping it silences Android | 2.3s |
| ✅ | Android | valid | Opened from the lock-screen alarm: the alarm screen is ready immediately | 1.5s |
| ✅ | Android | valid | Snooze is handed to Android, and its alarm brings the ring back | 2.0s |
| ✅ | Android | valid | Check-in: scheduled with Android; answering cancels it; missing it plays the punishment ring | 6.9s |
| ✅ | Android | valid | Bedtime nudges are scheduled daily with Android; turning them off cancels | 1.8s |
| ✅ | Android | valid | Bedtime answers given on the notification (app closed) count toward sleep tracking | 1.8s |
| ✅ | Android | valid | Picking a logo changes the home-screen icon; light theme switches status-bar icons | 1.9s |
| ✅ | Android | invalid | Missing permissions are flagged on the Alarm tab with a one-tap fix | 1.6s |
| ✅ | Android | valid | First-run setup includes a permissions step that can ask for notifications | 5.3s |
| ✅ | Android | valid | App lock: choose apps, it locks for real mornings, unlocks when proven (not for tests) | 5.8s |
| ✅ | Android | invalid | App lock refuses bad app names and keeps the auto-unlock between 1 and 6 h | 1.1s |
| ✅ | Android | invalid | Opening a locked app shows a reminder; emergency unlock needs the exact phrase and is recorded | 2.4s |
| ✅ | Android | valid | Spotify in the app: Android rings first, then Spotify takes over | 4.0s |
| ✅ | Android | valid | A Sunday sleep-in updates Android’s scheduled alarm | 1.4s |
| ✅ | Android | valid | The browser version never touches the Android bridge | 1.0s |
| ✅ | Android | valid | Locked apps are named nicely even without a label (com.instagram.android → Instagram) | 1.0s |
| ✅ | App | valid | Only one message (toast) shows at a time | 1.1s |
| ✅ | Android | valid | The permission warning clears once setup granted everything | 6.5s |
| ✅ | Cities | valid | Kerala theme: skyline, live weather, and an upbeat headline (gloomy news is skipped) | 2.0s |
| ✅ | Cities | invalid | Offline or blocked: the city card still shows a built-in fact, with no errors | 1.7s |
| ✅ | Cities | invalid | Only upbeat, well-formed headlines are used; titles are cleaned | 1.0s |
| ✅ | Cities | valid | In the app, city data goes through Android’s own HTTP client; tapping the headline opens it outside the app | 1.7s |
| ✅ | Cities | valid | Every city has its own skyline and palette; the theme picker groups Moods and Cities | 7.1s |
| ✅ | Sky | valid | The home sky follows the clock: stars at night, first rays at dawn, full sun at noon, orange glow at golden hour | 1.8s |
| ✅ | Sky | valid | City weather shows in the sky: fog in San Francisco, snow in Seoul, clouds in Tokyo | 5.0s |
| ✅ | Pip | valid | Pip really leaps in: he bounds along a curved path, lands, waves and says hello | 1.4s |
| ✅ | Pip | valid | Pip leaps in after setup, when you come back after 30+ minutes, and does a victory lap after a proven morning | 19.9s |
| ✅ | Pip | invalid | With reduced motion, Pip appears and waves without leaping | 1.4s |
| ✅ | Naps | valid | “Going to sleep” in the afternoon asks about a nap, sets a timer, wakes you, and logs the nap as sleep | 9.1s |
| ✅ | Naps | valid | At bedtime it tracks the night (no nap question); “No, I’m going to bed” also starts a night | 2.6s |
| ✅ | Naps | invalid | Nap length stays between 5 minutes and 4 hours; waking early logs the real time; cancelling sets nothing | 6.5s |
| ✅ | Naps | valid | In the app, the nap alarm is Android’s (rings with the app closed) and “I’m up” silences it | 2.2s |
| ✅ | Morning | valid | You can leave the task list: a top-bar pill counts down, says when it’s time, and brings you back | 6.4s |
| ✅ | Morning | valid | In the app, a task’s wait is handed to Android as a notification | 1.9s |
| ✅ | Morning | valid | Test alarm ends right after the phrase (“It works!”); “Try the full morning” runs tasks and check-in at 10× speed | 4.9s |
| ✅ | Sharing | valid | Sharing a Spotify playlist sets it as the alarm (no sign-in), named from Spotify | 1.5s |
| ✅ | Sharing | valid | YouTube: a playlist becomes the alarm; a Short becomes a clip; a single video asks which | 2.3s |
| ✅ | Sharing | invalid | Odd shares are handled kindly: other sites refused, repeats ignored, short Spotify links explained | 2.3s |
| ✅ | Sharing | valid | In the app: a link shared while SoulWake was closed is picked up when it opens | 1.5s |
| ✅ | Spotify | valid | Shared playlist plays in Spotify’s official player on the alarm screen; “Play on Spotify” opens the app | 3.1s |
| ✅ | Spotify | invalid | Shared playlist that never starts falls back to your songs within 8 seconds | 1.7s |
| ✅ | Spotify | invalid | Spotify links are checked: only open.spotify.com playlists, albums and songs | 1.0s |
| ✅ | Boost | valid | A saved YouTube Short or Instagram reel plays in its own embedded player after the check-in | 4.3s |
| ✅ | Layout | invalid | No screen scrolls sideways on a small 320 px phone (widest fonts, city themes) | 21.1s |
| ✅ | App | valid | Long explanations sit behind ⓘ buttons that open a short sheet | 1.9s |
| ✅ | Streaks | valid | Seven real mornings in a row (alarm armed once): 1→7, shown on Progress, Pip ecstatic on day 7 | 31.6s |
| ✅ | Streaks | valid | In the app: alarm rings with SoulWake closed, opened from its icon (not the notification) → the alarm screen appears and the morning counts | 1.8s |
| ✅ | Streaks | invalid | A missed day resets the streak to 0 (best is kept); the next proven morning starts again at 1 | 6.1s |
| ✅ | Streaks | invalid | Proving twice on the same day counts once; test alarms (quick or full) never count | 5.4s |
| ✅ | Streaks | valid | Snoozes and a missed check-in still count as proven (lower grade); a 23:50 alarm finished after midnight counts for that night | 16.5s |
| ✅ | Streaks | valid | App closed mid-morning and reopened: the morning resumes and still counts; yesterday’s unfinished morning never counts | 15.1s |
| ✅ | Streaks | invalid | Broken or odd streak data is repaired; the streak survives an app restart | 3.1s |
| ✅ | Night guard | valid | Guarded hours run from 2 h before bedtime to 2 h after the alarm, only while armed | 1.7s |
| ✅ | Night guard | valid | Outside guarded hours, Disarm works straight away | 1.7s |
| ✅ | Night guard | valid | At night, Disarm takes 3 sums then the buddy PIN; a wrong answer doesn’t count | 3.5s |
| ✅ | Night guard | invalid | Backing out keeps the alarm; wrong PINs are refused and 5 in a row pause the pad | 5.5s |
| ✅ | Night guard | valid | Forgot the PIN: a 24-hour wait, then you can disarm without it (and the PIN is cleared) | 6.6s |
| ✅ | Night guard | valid | No buddy PIN yet: the sums alone unlock; moving the alarm at night also needs the check | 3.2s |
| ✅ | Night guard | invalid | The PIN must be 4 digits and is never stored as typed | 1.7s |
| ✅ | Night guard | valid | Setup step 2: a friend types the PIN twice; a mismatch starts again; it can be skipped | 6.6s |
| ✅ | Night guard | valid | ☰ Night guard: shows the hours, sets a PIN later, and removing it needs the PIN | 5.8s |
| ✅ | Night guard | invalid | At night, turning the guard off or erasing everything also needs the check | 3.9s |
| ✅ | Night guard | valid | Android: the nightly pattern is handed over; an uninstall attempt opens the guard, and solving it gives 5 minutes | 3.3s |
| ✅ | Night guard | invalid | Android: “Never mind” keeps guarding; an uninstall launch while the app was closed still shows the guard | 1.6s |
| ✅ | Photo check | valid | Off by default (photos count on trust); with the checker on, a matching photo passes and shows its score | 3.9s |
| ✅ | Photo check | invalid | A photo of the wrong thing is refused; after 3 tries it can be counted anyway (marked unverified) | 7.4s |
| ✅ | Photo check | valid | Same-place reference: a photo somewhere else is refused; the decision maths is sound | 1.1s |
| ✅ | Photo check | invalid | Switching it on offline explains why and stays off | 2.2s |
| ✅ | SoulWake | valid | Today follows the design: greeting, clock, sky with Pip, wake card with the first task, slide to arm | 1.7s |
| ✅ | SoulWake | valid | Palette: new themes and accents are applied; Midnight + Antique Gold for new users | 1.1s |

Re-run with `python3 tests/run_tests.py` (needs `pip install playwright` and `playwright install chromium`).
