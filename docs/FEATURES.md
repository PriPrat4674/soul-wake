# SoulWake: every feature

SoulWake 3.2 (formerly First Light) is an Android alarm, also usable as a website, that makes you prove you're up.
This list covers everything in the app, from the headline features to the small touches.
Numbers in brackets are the defaults; you can change most of them.

**New in 3.2:**
- the SoulWake name
- Pip as the SoulWake smiley
- the new palette
- the Today / Routine / Sleep / Progress layout
- the night guard with a buddy PIN
- the uninstall guard
- the on-device photo check

---

## 1. The alarm

- **Set a wake-up time** by tapping the big time on Today's wake card [06:30]. It shows in your phone's 12- or 24-hour style.
  - The card also shows "Today" or "Tomorrow", with a dot that lights up once the alarm is armed.
- **Slide to arm.** Drag the moon button all the way across. A short or accidental drag doesn't arm it. You can also press Enter on the slider with a keyboard.
- **Disarm** with one tap. During your guarded hours it takes the night guard check first (see 9a).
- **Status line** under the slider: "Not armed yet", "Armed · rings in 7h 12m", or the test-alarm countdown.
- **Re-arms itself** for the next day after it rings.
- **Rings with the app closed and the phone locked** (Android app). It uses Android's own alarm system, the same one the Clock app uses, so it's exact and allowed in battery-saving sleep.
- **Shows over the lock screen** and turns the screen on.
- **Plays on the alarm volume**, so silent mode and Do Not Disturb don't mute it.
- **Volume ramps up gently** from about 30% to full over about 20 seconds.
- **Vibrates** in a repeating pattern while it rings.
- **Rings for at most 30 minutes** as a safety limit.
- **Survives restarts.** Alarms are re-set after the phone reboots, after the app updates, and after the time or time zone changes.
- **Never rings hours late.** If the app was closed through a missed alarm, it skips that alarm instead of going off when you next open it (more than 30 minutes late).
- **Ignores a second alarm** if one goes off while a morning is already in progress.
- **One-off times for a single day** (used for the Sunday sleep-in). They clean themselves up once the day has passed.
- **Dynamic alarm messages** on the wake card that change with your wake-up time, the day and your streak.
  - Before 5:30: "Oho! We have an early riser tomorrow!! 🌅"
  - Very early: "Whoa, 3:00? Even the stars are yawning 🌌"
  - Late mornings, afternoons and weekends each have their own lines.
  - Your streak is added once it's 3 or more ("Streak: 5 🔥"), and sometimes your name.

## 2. Stopping the alarm: type the phrase

- **Type a phrase to stop it.** It's one of 6 motivating phrases, e.g. "The day starts now and so do I".
- **Letters light up as you type.** Correct letters glow, mistakes turn red and underlined, and the next letter is marked.
- **Forgiving about form.** Capitals, extra spaces and punctuation don't matter.
- **Wrong or empty attempts** shake the box, clear it, give a low beep, and keep the alarm ringing.
- **Pasting and dragging text in are blocked.**
- **The greeting changes with the time of day:** "Good morning, Priya ☀️" or "Up late? 🌙".
- **Live clock** on the ringing screen, which gently shakes. The SoulWake wordmark sits at the top.
- **No leaving the ringing screen.** Unlike the task list, it can't be stepped away from.

## 3. Snooze and the Hall of Shame

- **Limited snoozes** [2 per morning, 5 minutes each]. Allowed range: 0–5 snoozes, 1–30 minutes.
- **The snooze button shows how many are left** ("Snooze 5 min · 2 left").
- **Snooze can be switched off** entirely.
- **Countdown screen** while snoozed, with a grumpy Pip. "I'm up. Ring now" ends the snooze early so you can stop it properly.
- **No snooze on the punishment ring** after a missed check-in.
- **Hall of Shame:** every real snooze is listed forever on the Progress tab (date and time).
- **Snoozes make Pip grumpy.**
- **Test-run snoozes don't count** in the Hall of Shame or totals.
- In the app, the snooze end is handed to Android, so it rings again even if the app is closed.

## 4. "Still up?" check-in

- **A surprise check-in after you stop the alarm** [5 minutes later]. Range: 1–60 minutes.
- **Full-screen prompt with a draining ring and countdown** [60 seconds to answer]. Range: 15–300 seconds.
- **Tap "I'm up" to pass.**
- **Miss it and the alarm comes back**, with:
  - your **punishment song**
  - a **harsher phrase** to type ("I promise to stop negotiating with my pillow")
  - **no snooze allowed**

  Your task progress is kept.
- **It rings with its own sound** [Bell], chosen in Notification sounds.
- **It finds you even if you've stepped away** from the task list, or closed the app (it's scheduled with Android).
- **No check-in once your morning is finished.**

## 5. Morning tasks (the Routine tab)

- **Your morning ritual**: a list of tasks you prove one by one, in order.
  - Default tasks: Open-eyes selfie, Brushing teeth, Tea is ready.
- **Tomorrow's ritual** at the top of Routine:
  - the number of tasks
  - the total wait time
  - each task with its wait
  - Pip
- **On Today**, the wake card shows the first task and how many tasks there are. Tap it to go to Routine.
- **Quick-add templates:** Make the bed, Drink water, Open the curtains, Stretch, Wash your face, Shoes on. "Something else…" adds your own.
- **Edit each task**: its name (up to 60 characters) and what the photo must show (up to 120 characters).
- **Empty names are refused**, with a message, and the old name is kept.
- **Waits between tasks** [0–120 minutes, in 5-minute steps].
  - Example: tea becomes available 10 minutes after brushing your teeth.
  - The first task's wait counts from when you stop the alarm.
- **Reorder** tasks (up / down) and **delete** them.
- **Up to 12 tasks.** The quick-add chips switch off when you're full.
- **Chaos task 🎲 (optional):** one random surprise added at the end of each morning. There are 8, e.g. "Something yellow", "A spoon", "Your left sock", "The sky".
- **Editing tasks mid-morning doesn't change today's list.**
- **Live-camera proof photos.**
  - The camera opens in the app. There's no gallery upload, so no cheating with old photos.
  - It picks the front camera for selfie and face tasks and the back camera for the rest.
  - Flip camera, Capture, Retake and Cancel.
  - Selfies are mirrored, like a mirror.
  - Photos stay on your phone and are never uploaded.
- **Camera blocked?** A clear message explains how to allow it. The task stays open.
- **The task chain** shows done ✓, current, and later tasks, plus each wait. The current task shows "Unlocks in 7:42", then "Take proof photo". Pip sits by the heading.
- **The sunrise grows with every proof** on the task screen.

## 5a. Photo check 🔍 (new)

- **An on-device AI checks each proof photo.** It's a CLIP-style model (MobileCLIP).
- **Does it match the task's own words?** It compares the photo with what the task says it must show, e.g. "a freshly made cup of tea".
  - It also compares it with decoys: a blank wall, a ceiling, an unmade bed, a dark or blurry photo, the floor, a phone or computer screen, a closed door, a hand over the lens, and (for non-selfie tasks) a face.
  - The task's words must win clearly.
- **Same-place photo (optional, per task).** Take a reference photo where you do the task, e.g. your kitchen counter. Later proof photos must be taken in the same spot.
  - Set it under each task on Routine with "Take one", "Retake" or "Remove".
- **Clear results:**
  - "Looks like a freshly made cup of tea, in the same spot as your reference ✓", with the match and same-spot percentages
  - or "Hmm, that doesn't look like a freshly made cup of tea."
- **Never traps you.** After 3 failed tries, "Count it anyway" accepts the photo. Routine keeps a count of these as unverified.
- **Switch it on in Routine → Photo check.**
  - It downloads the model once (about 75 MB, Wi-Fi is best). After that it works offline.
  - If you're offline or the download fails, you're told why and it stays off.
- **Private.** Photos are checked on your phone and never uploaded.
- **Off by default.** While it's off, or if it can't run, photos are accepted on trust, as before.

## 6. Step away while you wait

- **Leave the task list any time** ("← Use the app") and use the rest of the app.
- **A pill in the top bar counts down**: "⏳ Tea is ready · 7:42", or "😴 Rings in 3:12" during a snooze.
- **When the wait is over**, the pill glows ("📸 Tea is ready") and you get a message: "Tea is ready: time to prove it 📸".
  - Browser version: a chime and a browser notification.
  - Android app: a notification, even with the app closed.
- **Tap the pill to go straight back** to your tasks.
- **A new ring always brings the alarm back to the front**, whatever you were doing.

## 7. Report card, streaks and Progress

- **Report card** when your morning is proven. It shows a grade (A+, A, B+, B, C, D, F) and a funny line for each grade ("Flawless. The sun is honestly a little intimidated.").
  - **How it's graded:** each snooze costs 1 step and each missed check-in costs 2. Taking more than 40 minutes costs 1 more step, and more than 60 minutes costs 2.
  - It also shows minutes taken, snoozes and missed check-ins.
  - Pip appears with a stamp: ⭐ for an A, 👏 for a B, 💪 otherwise.
  - A personal line: "Flawless, Priya! Have a gold star ⭐".
  - The report card keeps its Close button.
- **Streak** of proven mornings in a row. It continues from yesterday and resets after a missed day.
- **Progress tab:**
  - **Streak card:** a big streak number, "Active streak", your personal best, Pip, and a sunburst that fills over 7 days.
  - **Proof calendar** for the last five weeks: proven days filled in, today ringed. In the browser version, nights paused by the battery guard are also marked.
  - **Stat tiles:**
    - best streak
    - mornings proven
    - average minutes to proven
    - snoozes
    - missed check-ins
    - emergency unlocks (app) or nights paused for battery (browser)
  - **Recent mornings**: the last 14, with a grade chip, minutes, snoozes and missed check-ins.
  - **Hall of Shame** list, with a grumpy Pip.
  - (This week's sleep chart is on the Sleep tab.)
- **Stores up to 60 mornings of history.**
- **After a proven morning, your apps unlock** (if App lock is on), and today's song plays on from where it left off as your reward.

## 8. Test alarms

- **"Try a test alarm"** rings in 10 seconds.
- **The quick test stops right after the phrase:** "It works! ✓ See you in the morning ☀️".
- **"Try the full morning (10× speed)"** runs your tasks and the check-in for real, with every wait 10× shorter. A 10-minute wait takes 1 minute; the check-in comes after 30 seconds instead of 5 minutes.
- **Tests never count** toward streaks, totals, the Hall of Shame, or App lock.
- **Tests aren't guarded:** the night guard only protects a real armed alarm.

## 9. App lock (Android app)

- **Keep Instagram (or any apps you choose) closed until your morning is proven.**
- **Choose apps** from a searchable list of installed apps (up to 30).
- **The lock starts when the real alarm rings** and ends when you finish your tasks.
- **Unlocks by itself after a set time** [3 hours, choose 1–6], so you're never stuck.
- **Never locks** Phone, Messages, Settings, emergency apps, or SoulWake itself.
- **Opening a locked app** sends you to your home screen and shows: "Instagram is locked 🔒 Tasks first, then scrolling 😌". It also shows when the app unlocks by itself.
- **Emergency unlock:** type "I need my apps right now" exactly (no pasting). Each use is recorded on Progress.
- **Friendly app names**, even when Android doesn't give one (com.instagram.android → Instagram).
- **Privacy:** for App lock it only notices which app opens, never what's on screen.
- **Setup help** for the Accessibility permission, including the "Allow restricted settings" step for apps installed outside the Play Store.
- **No lock for test alarms.**

## 9a. Night guard 🛡️ (new)

- **Guarded hours:** from 2 hours before bedtime until 2 hours after your alarm, while a real alarm is armed. With bed at 23:00 and the alarm at 06:30, that's 21:00 – 08:30.
- **Today shows "Night guard on"** in those hours, "Wind-down time" in the 2 hours before bed, and "Sleep hours" at night.
- **What it guards:**
  - disarming the alarm (on Today and on the browser's night screen)
  - moving the alarm time
  - erasing all data
  - switching the guard off
  - (in the app) uninstalling or force-stopping SoulWake
- **The check:**
  1. **Three sums**, typed on a number pad. They're harder after midnight, e.g. 37 × 8 and 312 + 179. A wrong answer shakes and doesn't count.
  2. **Your buddy's 4-digit PIN.** Pip watches with a grumpy face.
- **Back out any time** and everything stays as it was ("Alarm time kept. Night guard is on 🛡️").
- **Buddy PIN:**
  - **A friend sets it** at setup step 2 ("Hand your phone to a friend"), typing it twice to confirm. A mismatch starts again.
  - **Skippable.** Add it later in ☰ → Night guard. Without a PIN, the sums alone unlock.
  - **Never shown**, and only a salted SHA-256 hash is saved.
  - **Exactly 4 digits.** Anything else is refused.
  - **5 wrong tries in a row** pause the pad for a minute.
  - **Change or remove it** only with the current PIN.
- **Forgot the PIN? A 24-hour wait.**
  - Start the wait from the PIN screen. A countdown ring shows the time left, your next alarm, when the wait started and when it unlocks.
  - Your alarm still rings as normal. "Keep my alarm set" closes the screen; "Cancel the wait" stops it.
  - After 24 hours you can go ahead without the PIN. The PIN is then cleared so your buddy can set a new one.
- **☰ → Night guard page:**
  - your guarded hours
  - the on/off switch
  - PIN status (set date, never shown), with Set, Change and Remove
  - the 24-hour wait status
  - (app) the uninstall guard switch, plus the Accessibility status with a "Turn on" button
- **Uninstall and force-stop guard (Android app):**
  - **In the guarded hours**, opening SoulWake's App info (Force stop / Uninstall), the uninstall dialog, or this service's own Accessibility page sends you back to SoulWake.
  - **There you see:** "Not tonight 🌙 SoulWake is guarding your sleep".
  - **After the full check**, "You have 5 minutes" opens App info. The guard switches itself back on afterwards.
  - **"Never mind, keep guarding my sleep"** leaves it on.
  - **Works with the app closed.** Android works out each night's window by itself from your bedtime and alarm time.
  - **Your own permission screens aren't blocked:** when SoulWake opens Settings itself, it gets a 3-minute pass.
  - **Privacy:** in the guarded hours only, it reads Settings and uninstall screens just to spot SoulWake's own page. Nothing is stored or sent.
  - **Honest limits:** Safe Mode, a computer (ADB) or a factory reset still get round it. It's there to stop half-asleep you, not a hacker. It needs the Accessibility permission (the same one as App lock).

## 10. Wake-up music (☰ menu)

- **Choose what wakes you**: three tiles, My songs, Spotify or YouTube.
- **Your own songs.**
  - Add audio files (up to 50 MB each). Non-audio files are refused, with the reason.
  - **A different song every morning**, with no repeats until every song has played. It never repeats yesterday's song when the list restarts.
  - **Only the first 40 seconds loop while it rings.** The rest of the song plays as your reward once your morning is proven.
  - In the app, today's song is handed to Android so it plays even with the app closed.
- **Spotify.**
  - **Connect Spotify** (full songs, needs Premium). It's one tap, with no Client ID to type, and uses a secure sign-in (PKCE) with no passwords stored.
    - Pick an alarm playlist from your account; a different song is chosen each day.
    - It plays in the app's own Spotify player, or on your phone's Spotify app if that's open.
    - Sign-in refreshes itself. If it can't, you're signed out with an explanation.
    - Disconnect any time.
  - **Share a playlist, no sign-in.** In Spotify, tap Share → SoulWake on any playlist, album or song, or paste the link.
    - It plays through Spotify's official player on the alarm screen (30-second previews), shown by its real name.
    - Remove it any time.
  - **"PLAY ON SPOTIFY"** opens the playlist in the Spotify app, which works on free accounts too.
- **YouTube / YouTube Music.**
  - Share or paste a public or unlisted **playlist**: a different song each morning, looping. A **single video** loops on its own.
  - It plays in YouTube's official player, which stays visible on the alarm screen as YouTube requires.
  - Links are checked: other sites, non-links, and private lists (Liked Music, Watch Later) are refused, with an explanation.
- **Automatic backup.** If Spotify or YouTube doesn't start within 8 seconds, your own songs play instead, or the built-in alarm sound. This page shows what happened ("Spotify didn't start at 6:30…").
- **Punishment song 😈:** a song you can't stand, played if you miss the check-in. Without one, a missed check-in beeps.
- **Built-in alarm sounds** for when you haven't added songs: Dawn 🌅, Bells 🔔, Classic ⏰.

## 11. Wake-up boost 🚀 (on the Wake-up music page)

- **Note from past you:** record a voice note (up to 30 seconds) the night before. It plays after you pass the check-in. You can play it back, record again, or delete it.
- **Motivation clips** play after the check-in, after your voice note.
  - **Your own videos** (up to 100 MB each).
  - **YouTube Shorts and Instagram reels** shared to SoulWake or pasted (up to 50 links). They play in each site's official embedded player, so they're never downloaded and the creator is credited. Instagram reels need a tap to play.
  - Duplicates and non-YouTube/Instagram links are refused.
  - A random clip is picked each time.
- **"Back to my tasks"** unlocks after a few seconds, so you actually watch it.

## 12. Share → SoulWake (Android app)

- **SoulWake appears in Android's share menu.**
- **It works out what you shared:**
  - Spotify playlist, album or song → becomes your alarm music.
  - YouTube or YouTube Music playlist → becomes your alarm music.
  - YouTube Short or Instagram reel → becomes a motivation clip.
  - Single YouTube video → asks "Waking me up 🎵" or "Motivation after I'm up 🚀".
  - Short Spotify links (spotify.link) → followed to the full link.
- **It works even if SoulWake was closed** when you shared.
- **Repeated shares are ignored. Other links get a kind message.**
- **It takes you to Wake-up music** with a confirmation.

## 13. Sleep tracking: the Sleep tab (no smartwatch needed)

- **Last night's rest** at the top:
  - hours and minutes (e.g. "7h 48m")
  - a "% of your goal" chip
  - the verdict with times
  - Pip, whose look matches the night
- **Your schedule:** bedtime [23:00] and wake-up [06:30], set in setup and in ☰ → Sleep schedule. A card at the bottom of Sleep shows them, plus the goal and nudge setting, with Edit.
- **Sleep goal from 1 to 12 hours** [8], in half-hours. It can never go to zero or negative. A kind note appears under it, e.g. "That's a tough schedule. I'll help you through it 💛".
- **Bedtime nudge** (can be switched off): "Heading to bed, Priya? 🌙", with three answers:
  - "Going to sleep 😴"
  - "In 30 minutes" (reminds you again 30 minutes later)
  - "Not tonight" (no more nudges tonight)
  - In the app these are notification buttons that work without opening the app; answers are recorded even while the app is closed.
- **"Drifting off?" check 30 minutes after** you go to sleep: Warm chime, Silent, or Off. "Still awake" moves your bedtime to now and checks once more.
- **A big "Going to sleep 😴" button.**
  - While you sleep it shows a sleeping Pip, "Asleep since 11:12 PM 💤" with how long so far, and a "Not asleep after all" option.
- **Each night is logged automatically** as time in bed: from "Going to sleep" to stopping the alarm.
  - Nonsense nights (under 1 hour or over 16 hours) are ignored. The last 90 nights are kept.
- **Last night's verdict:** 😊 Well rested, 😐 A little short, 🥱 Short night, or 🛌 Long night, with times. It's judged against your own goal.
- **This week** chart: each day's sleep against a dashed goal line, colour-coded, with naps stacked in a lighter shade. The weekly average shows too.
- **Sunday sleep-in.**
  - **When:** Saturday afternoon to Sunday morning, after a short week (at least 3 logged nights and 2+ hours short).
  - **The offer:** sleep in 30 minutes to 2 hours on Sunday, and move Sunday's alarm in one tap. "Keep my usual time" undoes it.
  - **Why the cap:** sleeping till noon shifts your body clock (Depner et al., 2019).
- **Short-night day plan 🧃** after a short night, on the Sleep tab. Today shows a "Short night? See your plan" card that jumps straight to it.
  - 7 cheap, student-friendly tips, each with the research behind it. Tap a tip for the why and the source. Tick tips off as you go; ticks are saved.
  - The tips:
    - daylight early
    - 10 minutes of stairs
    - one coffee early
    - a 10-minute nap before 3 pm
    - upbeat music
    - keep Instagram to about 10 minutes (with a link to set up App lock)
    - protect tonight

## 14. Naps 😴

- **Tapping "Going to sleep" outside sleep hours asks "Taking a nap?"** Sleep hours run from 2 hours before bedtime until your wake-up time.
- **Pick a length:** 20 min, 30 min, 45 min, 1 h, 1.5 h, or an exact time with − / + (5 minutes to 4 hours).
- **"No, I'm going to bed"** tracks a night instead.
- **The nap alarm rings like a real alarm.** In the app it rings with the app closed, shows "Nap's over ☀️" in the notification, and uses the alarm sound rather than today's song.
- **The "Nap's over ☀️" screen** shows a sleepy Pip and an "I'm up" button.
- **While napping, the Sleep tab shows** "Napping till 3:20 PM 💤", the minutes left, and **"I'm up"** to wake early. The real time is logged.
- **Naps count as sleep** for that day: "+ 20 min nap today 😴", plus the weekly chart and your average.
- **Cancel** by tapping outside the nap sheet; nothing is set.

## 15. Pip, the SoulWake smiley

- **Pip is the SoulWake logo come to life:** a soft pebble with an olive outline, a cream face and big navy eyes. He's drawn in code, so he looks crisp at every size and in every theme.
- **Poses:** ecstatic (star eyes and a party hat in your accent colour), happy, neutral, grumpy, sleepy, sulking (a little tear), sleeping, yawning, waving, and flying (little hands out).
- **He bobs gently** when happy and breathes slowly when sleepy.
- **Six moods that follow what you do:**
  - **Ecstatic:** a 7+ day streak.
  - **Happy:** proven today, or a 2+ day streak.
  - **Grumpy:** you snoozed or missed a check-in.
  - **Sulking:** your streak broke.
  - **Sleepy:** late at night, or after a short night.
  - **Neutral:** otherwise.
- **Pip lives in the sky on Today**, with a speech bubble that changes daily. **Poke Pip** for a squish and a new line ("Boop! 🫧", "That tickles 🤭"). Grumpy and sleepy Pip answer differently.
- **Pip leaps in and says hello.** He bounds in on a curved path, stretching and squishing, lands, waves and greets you by name: "Good morning, Priya ☀️". He then jumps back to his spot in the sky. Tap to skip.
  - **When you open the app.**
  - **Right after setup:** "Welcome home, Priya! 👋"
  - **When you come back after 30+ minutes away.** Not every time, so it doesn't get old.
  - **As a victory lap** after you close a proven morning's report card: "Morning proven, Priya! 🎉". It never blocks your taps.
- **Rename Pip** in You & Pip.
- **With reduced motion on**, Pip just appears and waves.
- **Pip also shows on:**
  - the setup screens
  - the menu
  - Routine and Progress
  - the Hall of Shame
  - the report card
  - the snoozed and task screens
  - the night guard
  - the nap screen and the Sleep tab

## 16. Look and feel

- **The SoulWake wordmark** ("Soul" in your text colour, "Wake" in blue) heads Today, the menu and the setup screen, in a hand-drawn font like the logo.
- **4 logos:** Sunrise, Crescent, SoulWake (the smiley) and Bell. In the app, your **home-screen icon changes** to match. SoulWake is the default.
- **4 accent colours:** Antique Gold, Burgundy, Olive and Navy.
  - Burgundy and Navy make deep buttons with light text.
  - Gold and Olive make light buttons with dark text.
  - If a button would melt into the page (e.g. burgundy on a dark green theme), it flips automatically.
- **9 themes** from the SoulWake palette:
  - **Moods:**
    - Noir: true black with espresso cards, kindest to your battery
    - Ivory: warm ivory and espresso ink
    - Midnight (default): neon navy and champagne
    - Dusk: tamarind and merlot
  - **Cities:**
    - New York: steel night, gold windows
    - San Francisco: pearl fog, tobacco bridge
    - Kerala: pine backwaters
    - Tokyo: indigo night, cherry blossom
    - Seoul: bone hanji, walnut roofs
- **8 fonts:**
  - **Classic:** Bodoni and Garamond
  - **Modern:** DM Serif and DM Sans
  - **Friendly:** rounded Nunito
  - **Typewriter:** Courier Prime
  - **Techy:** Space Grotesk, with a JetBrains Mono clock
  - **Kids' favourite:** bubbly Fredoka
  - **Formal:** engraved Cinzel, with Cormorant Garamond
  - **Classic noir:** 1930s film-poster Limelight, with Josefin Sans
- **3 styles:** Elegant (fine lines), Soft (round and cushioned), Bold (strong edges).
- **3,456 combinations, all readable.** Every combination is checked to meet the WCAG AA contrast standard (4.5:1).
- **Live previews:** each picker shows the choice in your current colours. Theme tiles show mini skylines for cities.
- **Changes apply instantly** everywhere, including the status-bar icons (light or dark to suit the theme).
- **All fonts are bundled**, so they work offline.

## 17. The live sky (Today)

- **The sky follows the time of day:**

  | Time | What you see |
  |---|---|
  | Night | Moon and twinkling stars |
  | Dawn | First thin rays |
  | Morning | Sun climbing |
  | Noon | Full blaze |
  | Afternoon | Warm and high |
  | Golden hour | Low orange glow |
  | Dusk | Purple fading, first stars |

- **It updates once a minute** without reloading.
- **With a city theme** it follows that city's real sunrise and sunset, shows the city's skyline, and adds its weather:
  - rain falling
  - fog drifting
  - clouds
  - snow
  - storm flashes
- **City windows light up at night.**

## 18. City themes 🏙️

- **New York, San Francisco, Kerala, Tokyo and Seoul.** Each has an original skyline drawing and its own colours from the SoulWake palette:
  - **New York:** Midtown towers, an Art Deco spire and Lady Liberty
  - **San Francisco:** the Golden Gate in tobacco orange, with hills
  - **Kerala:** coconut palms, a houseboat and backwaters
  - **Tokyo:** Tokyo Tower and Mount Fuji
  - **Seoul:** N Seoul Tower on Namsan, and hanok rooftops
- **A small city line under the clock on Today**: 📍 city, local time and weather ("🌧️ 27° Rain").
- **Tap it for the city card:**
  - the city's local time
  - the weather now, with an emoji, temperature and condition
  - **an upbeat local headline** (tap to read it outside the app), or **"did you know" facts** from Wikipedia
  - Headline and fact alternate by day; tap ↻ to switch.
- **Bad news is filtered out.** Only positive-toned headlines are used, and words like crash, killed or flood are skipped.
- **Works offline:** each city has built-in facts. No made-up weather is shown when offline.
- **No accounts or keys.** It uses Open-Meteo (weather), GDELT (headlines) and Wikipedia (facts). Data refreshes at most hourly for weather, every 6 hours for news and daily for facts, and only while the app is open.

## 19. Getting around

- **Four everyday tabs at the bottom:** Today, Routine, Sleep, Progress.
- **☰ menu** for everything else, one page each:
  - Look & feel
  - Wake-up music
  - Sleep schedule
  - App lock
  - Night guard
  - Snooze & check-in
  - Notification sounds
  - Permissions (app) or Battery & alerts (browser)
  - You & Pip
  - Start over
  - About
  - It opens with Pip, "Hi, Priya" and your wake streak, and ends with the SoulWake wordmark and version.
  - Badges show App lock "Active", Night guard "On now" / "PIN set", and Permissions "4/4 allowed".
  - It closes with ✕, a tap outside, or Escape. Each page has "← Back" to where you were.
- **Top bar** shows the SoulWake wordmark on Today, the page's name elsewhere, and the live countdown pills.
- **Short text in Pip's voice.** Longer explanations hide behind small **ⓘ buttons** that open a short sheet.
- **Bottom sheets** for choices: arming on low battery, nap length, erase data, the city card, the buddy PIN.
- **One message (toast) at a time**, shown below the top bar.
- **Haptic taps** on buttons, sliders, pickers and the number pad (where the phone supports it).

## 20. First-run setup

- **Pip waves**, the SoulWake wordmark appears, and he asks your name (you can skip it). Names are cleaned: no HTML, extra spaces or over-long text.
- **Step 2: the buddy PIN** ("Hand your phone to a friend"). Skippable; add it later.
- **Pick your logo, colour, theme, font and style.** The setup screen restyles itself as you choose.
- **Your sleep:** bedtime, wake-up and sleep goal. Your wake-up time becomes your alarm.
- **"Let me ring when I'm closed 🔔"** (Android app): tap to allow each permission, each with a ✓ once it's done:
  - Nudge you
  - Ring on time
  - Wake your screen
  - Stay awake overnight
- **"All set, Priya! 🎉"** shows your new icon and a summary: wake-up, bedtime, and whether the buddy PIN is set. Then Pip leaps in.
- **Step dots, Back and Skip** throughout. Back keeps your earlier choices.

## 21. Settings (☰ menu)

- **Look & feel:** logo, colour, theme (moods and cities), font, style.
- **Wake-up music:** see sections 10–11.
- **Sleep schedule:** bedtime, wake-up, sleep goal (with note), bedtime nudge on/off, "Drifting off?" sound (Warm chime, Silent, Off).
- **App lock:** on/off, auto-unlock time, Accessibility permission with a "Turn on" button, an "Open App info" shortcut, and choosing apps.
- **Night guard:** see 9a.
- **Snooze & check-in:** allow snooze, length, per morning; check-in delay and time to answer. Every value stays within safe limits, and − / + buttons switch off at the edges.
- **Notification sounds** (tap to hear each one):
  - **Alarm:** Dawn, Bells, Classic
  - **Check-in:** Chime, Bell, Marimba, Pluck, Harp
  - **Nudges:** Chime, Bell, Marimba, Pluck, Harp
- **Permissions** (app): each with ✓ or an "Allow" button that opens the right Android settings page. It re-checks when you come back.
- **Battery & alerts** (browser): battery guard and browser notifications.
- **You & Pip:** your name and your pebble's name.
- **Start over:** erase everything, after a confirmation (and the night guard check during guarded hours).
- **About:** version, data credits, trademark notice and font licences.

## 22. Android app extras

- **The permission warning** on Today ("Let me ring when I'm closed 🔔") offers a one-tap fix if something is missing, and clears once everything is allowed.
- **Notification channels** for each sound, so Android plays the sound you picked.
- **Bedtime and "Drifting off?" notifications** with action buttons. The drifting-off notification disappears after 20 minutes.
- **Task-ready notifications** ("Tea is ready ⏰").
- **Opening from the lock-screen alarm** puts the alarm screen up immediately.
- **Opens links outside the app:** Spotify links in the Spotify app (or the web if it isn't installed), headlines and sources in your browser.
- **Text-size safety:** respects your phone's font size, but caps it at 115% so the layout never breaks.
- **Updates keep your data.** Every build is signed with the same key. The app ID and storage are unchanged by the rename, so updating from First Light keeps everything.
- **SoulWake launcher icons and splash screen** (the smiley on ivory; the smiley and wordmark on navy).

## 23. Browser version extras

- **Works as a website and installs to your home screen.** An "Install on your phone" card has Android and iPhone instructions.
- **Night screen** while armed:
  - pure black (saves power on OLED screens)
  - a dim clock that moves slightly each minute (no burn-in) and redraws only once a minute
  - tap to show "Back to the app" or "Disarm alarm" (guarded at night)
- **Keeps the screen awake** while armed or during a morning.
- **Battery guard:**
  - Warns before arming on low battery when unplugged [below 40%].
  - Switches the alarm off before your phone dies [at 15%], tells you, and logs the paused night. The switch-off level always stays below the warning level.
  - If the browser can't read the battery (e.g. iPhone), it tells you to plug in.
- **Browser notifications** for the check-in if you've switched tabs.
- **Works offline** after the first visit. Every app file is cached, and new versions download automatically. The photo checker is fetched only if you switch it on.
- **"Tap to start the alarm sound"** if the browser blocked sound.

## 24. Your data and privacy

- **Everything stays on your phone:** settings, tasks, songs, clips, voice note, photos, reference photos, the PIN hash, sleep log and streaks. There are no accounts and no servers of our own.
- **Photos are never uploaded.** The photo check runs on your phone.
- **Erase all data** from Start over, after a confirmation. "Keep my data" changes nothing.
- **Survives bad data:** corrupted saved settings fall back to defaults instead of crashing (including damaged night-guard data).
- **Storage full?** A clear message: "Couldn't save. Your phone's storage may be full."
- **Carries over data** from the original "Proof of Wake" builds (tasks, songs and streak).
- **Updating from older versions:**
  - an old Owl or Tiger logo choice becomes SoulWake automatically
  - the home-screen icon is put in step with your logo the first time 3.2 opens
  - your theme, accent and other choices are kept

## 25. Accessibility and polish

- **Reduced motion respected:** animations stop, and Pip appears without leaping.
- **Every button has a name** for screen readers, including number-pad keys. The check-in countdown, alarm status, PIN messages and other messages are announced.
- **Readable contrast** in every theme combination (WCAG AA).
- **Fits small phones:** checked down to 320 px wide in every font and theme. Nothing scrolls sideways.
- **Large tap targets** (44 px+), keyboard support (Enter to arm, digits and Backspace on the number pad, Escape to close sheets, the menu and the guard), and visible focus outlines.

## 26. For developers (in the GitHub repo)

- **Plain HTML, CSS and JavaScript modules** with no build step, wrapped as an Android app with Capacitor.
- **Loosely coupled:** features talk only through events, and each owns its own saved data.
- **Native Android plugin** (Java) for:
  - alarms and the ringing service
  - notifications
  - app lock and the night guard (`Guard.java`, `LockService.java`)
  - launcher icons, sharing and links
- **Bundled photo-check runtime:** Transformers.js 3.8 with the ONNX Runtime WebAssembly, in `www/vendor/transformers`. The model downloads from Hugging Face on first use.
- **One-click cloud builds:** GitHub Actions builds the APK on every push. Tagging a version (e.g. `v3.2.0`) publishes it as a Release with `soulwake.apk`.
- **Automated tests** covering valid use and invalid input or failures, including:
  - all 3,456 look combinations
  - a 320 px layout check
  - the night guard
  - the photo check (with a stand-in model)
  - stand-ins for Spotify, YouTube, the Android bridge and the city data services
- **A first-time-user walkthrough script** that screenshots each step.
- **README** with screenshots, install steps, permissions explained, the research behind the tips, known limits and credits.
