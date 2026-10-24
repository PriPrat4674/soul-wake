#!/usr/bin/env python3
"""
SoulWake — automated test suite (web + Android-app behaviour).

Runs the real app in a headless phone-sized Chromium and checks valid and invalid behaviour.
Spotify, YouTube and the Android bridge are replaced by local stand-ins (tests/mocks/), so no
accounts or phone are needed. Android-only flows run with a fake bridge that records every call.

Usage:
    pip install playwright && playwright install chromium
    python3 tests/run_tests.py            # all tests
    python3 tests/run_tests.py spotify    # only tests whose name or group contains "spotify"
Writes tests/TEST-REPORT.md.
"""
import asyncio, json, os, re, sys, time, threading, http.server, socketserver, functools, traceback
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
FIX = ROOT / 'tests' / 'fixtures'
MOCKS = ROOT / 'tests' / 'mocks'
PORT = 8155
BASE = f'http://localhost:{PORT}'
URL = f'{BASE}/www/index.html'
WEB = ROOT / 'www'
ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']

TESTS = []
def test(group, kind, name, timeout=60):
    def deco(fn):
        TESTS.append({'group': group, 'kind': kind, 'name': name, 'fn': fn, 'timeout': timeout})
        return fn
    return deco

class Fail(AssertionError):
    pass

def check(cond, msg):
    if not cond:
        raise Fail(msg)

# ---------------------------------------------------------------- page helper
class App:
    def __init__(self, browser):
        self.browser = browser
        self.errors = []
        self.calls = []        # Spotify API calls seen
        self.spotify = {}      # Spotify mock behaviour
        self.ctx = None
        self.pg = None

    async def open(self, *, battery=(0.82, False), clock=True, seed=None, deny_camera=False, spotify=None, youtube=None, sw='block', onboarded=True, native=None, greet=False, at=None, net=None, viewport=None):
        self.ctx = await self.browser.new_context(viewport=viewport or {'width': 390, 'height': 844}, service_workers=sw, timezone_id='Asia/Kolkata')
        await self._route_net(net or {})
        seed = dict(seed or {})
        if onboarded and 'fl:profile' not in seed:
            seed['fl:profile'] = {'name': 'Priya', 'onboarded': True}
        if native is not None:
            await self.ctx.add_init_script(f'window.__nativeInit = {json.dumps(native)};')
            await self.ctx.route('**/vendor/capacitor.js', lambda r: r.fulfill(path=str(MOCKS / "capacitor-native.js"), content_type='text/javascript'))
        if battery == 'none':
            await self.ctx.add_init_script("Object.defineProperty(navigator, 'getBattery', { value: undefined, configurable: true });")
        elif battery:
            lvl, chg = battery
            await self.ctx.add_init_script(f"""(() => {{
              const b = new EventTarget(); b.level = {lvl}; b.charging = {str(chg).lower()};
              window.__setBattery = (l, c) => {{ b.level = l; b.charging = c; b.dispatchEvent(new Event('levelchange')); b.dispatchEvent(new Event('chargingchange')); }};
              navigator.getBattery = () => Promise.resolve(b);
            }})();""")
        if seed:
            await self.ctx.add_init_script(f"""(() => {{
              if (sessionStorage.getItem('__seeded')) return;
              const seed = {json.dumps(seed)};
              for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
              sessionStorage.setItem('__seeded', '1');
            }})();""")
        if deny_camera:
            await self.ctx.add_init_script("navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));")
        if spotify is not None:
            self.spotify = {'play': 'ok', 'refresh': 'ok', 'sdk': 'ok', **spotify}
            await self.ctx.add_init_script(f"window.__spotifySdkMode = {json.dumps(self.spotify['sdk'])};")
            await self._route_spotify()
        if youtube is not None:
            await self.ctx.add_init_script(f"window.__ytMode = {json.dumps(youtube)};")
            await self.ctx.route('https://www.youtube.com/iframe_api', lambda r: r.fulfill(path=str(MOCKS / 'youtube-api.js'), content_type='text/javascript'))
        self.pg = await self.ctx.new_page()
        self.pg.on('pageerror', lambda e: self.errors.append(str(e)))
        if clock:
            if at:
                from datetime import datetime as _dt, timezone as _tz
                await self.pg.clock.install(time=_dt.fromtimestamp(at / 1000, _tz.utc))
            else:
                await self.pg.clock.install()
        await self.pg.goto(URL)
        await self.pg.wait_for_timeout(500)
        if not greet:
            await self.pg.evaluate("document.querySelector('.greet')?.remove()")
        return self.pg

    async def close(self):
        if self.ctx:
            await self.ctx.close()

    # -- City data stand-ins (weather, headlines, Wikipedia) ----------------
    # net: {'weather': {...open-meteo json} | 'fail', 'news': [articles] | 'fail', 'wiki': {...} | 'fail'}
    async def _route_net(self, net):
        self.net_calls = []
        weather = net.get('weather', {'utc_offset_seconds': 19800, 'current': {'temperature_2m': 27.4, 'weather_code': 61, 'is_day': 1}, 'daily': {'sunrise': ['2026-10-14T06:12'], 'sunset': ['2026-10-14T18:05']}})
        news = net.get('news', [{'title': 'Man killed in road crash', 'url': 'https://news.example/a', 'domain': 'news.example'},
                                 {'title': 'Kochi students win national robotics award - The Hindu', 'url': 'https://news.example/b', 'domain': 'news.example'}])
        wiki = net.get('wiki', {'extract': 'Kathakali (Malayalam: x) is a major form of classical Indian dance. It is a story play genre.', 'content_urls': {'mobile': {'page': 'https://en.m.wikipedia.org/wiki/Kathakali'}}})
        def handler(kind, data):
            async def h(route):
                self.net_calls.append((kind, route.request.url))
                if data == 'fail': return await route.abort()
                await route.fulfill(json=data if kind != 'news' else {'articles': data})
            return h
        await self.ctx.route('https://api.open-meteo.com/**', handler('weather', weather))
        await self.ctx.route('https://api.gdeltproject.org/**', handler('news', news))
        await self.ctx.route('https://en.wikipedia.org/**', handler('wiki', wiki))
        await self.ctx.route('https://spotify.link/**', lambda r: r.abort())
        await self.ctx.route('https://open.spotify.com/oembed**', lambda r: r.fulfill(json={'title': 'Rise and Grind'}))
        await self.ctx.add_init_script(f"window.__spEmbedMode = {json.dumps(net.get('spembed', 'ok'))};")
        await self.ctx.route('https://open.spotify.com/embed/iframe-api/v1', lambda r: r.fulfill(path=str(MOCKS / 'spotify-embed.js'), content_type='text/javascript'))
        # Embedded players (YouTube Shorts, Instagram reels) load as blank pages in tests.
        await self.ctx.route('https://www.youtube.com/embed/**', lambda r: r.fulfill(body='<html><body>YouTube clip</body></html>', content_type='text/html'))
        await self.ctx.route('https://www.instagram.com/**', lambda r: r.fulfill(body='<html><body>Instagram reel</body></html>', content_type='text/html'))

    # -- Spotify stand-in -------------------------------------------------
    async def _route_spotify(self):
        async def authorize(route):
            q = parse_qs(urlparse(route.request.url).query)
            self.calls.append(('AUTHORIZE', q.get('code_challenge_method', [''])[0]))
            state = q['state'][0] if self.spotify.get('state') != 'wrong' else 'tampered'
            loc = f"{q['redirect_uri'][0]}?error=access_denied&state={state}" if self.spotify.get('deny') else f"{q['redirect_uri'][0]}?code=CODE123&state={state}"
            await route.fulfill(status=302, headers={'Location': loc})
        async def token(route):
            body = parse_qs(route.request.post_data or '')
            grant = body.get('grant_type', [''])[0]
            self.calls.append(('TOKEN', grant))
            if grant == 'authorization_code' and not body.get('code_verifier'):
                return await route.fulfill(status=400, json={'error': 'invalid_request'})
            if grant == 'refresh_token' and self.spotify['refresh'] == 'fail':
                return await route.fulfill(status=400, json={'error': 'invalid_grant'})
            await route.fulfill(json={'access_token': 'ACCESS-' + grant, 'refresh_token': 'REFRESH', 'expires_in': 3600})
        async def api(route):
            req = route.request
            path = urlparse(req.url).path.replace('/v1', '', 1)
            self.calls.append((req.method, path + ('?' + urlparse(req.url).query if urlparse(req.url).query else ''), req.post_data))
            if req.headers.get('authorization', '').endswith('EXPIRED'):
                return await route.fulfill(status=401, json={'error': {'status': 401, 'message': 'The access token expired'}})
            if path == '/me':
                return await route.fulfill(json={'display_name': 'Test User', 'id': 'tester'})
            if path == '/me/playlists':
                return await route.fulfill(json={'items': [
                    {'id': 'pl1', 'name': 'Rise and shine', 'uri': 'spotify:playlist:pl1', 'items': {'total': 7}},
                    {'id': 'pl2', 'name': 'Loud mornings', 'uri': 'spotify:playlist:pl2', 'tracks': {'total': 3}}]})
            if path == '/me/player/devices':
                return await route.fulfill(json={'devices': [{'id': 'phone-1', 'type': 'Smartphone', 'is_active': True}]})
            if path == '/me/player/play':
                if self.spotify['play'] == 'premium':
                    return await route.fulfill(status=403, json={'error': {'status': 403, 'message': 'Player command failed: Premium required', 'reason': 'PREMIUM_REQUIRED'}})
                return await route.fulfill(status=204)
            if path == '/me/player':
                return await route.fulfill(json={'is_playing': True})
            if path.startswith('/me/player/'):
                return await route.fulfill(status=204)
            await route.fulfill(status=404, json={'error': {'status': 404, 'message': 'not mocked'}})
        await self.ctx.route('https://accounts.spotify.com/authorize**', authorize)
        await self.ctx.route('https://accounts.spotify.com/api/token', token)
        await self.ctx.route('https://api.spotify.com/**', api)
        await self.ctx.route('https://sdk.scdn.co/spotify-player.js', lambda r: r.fulfill(path=str(MOCKS / 'spotify-sdk.js'), content_type='text/javascript'))

    # -- actions ------------------------------------------------------------
    async def js(self, module, expr):
        return await self.pg.evaluate(f"async () => {{ const m = await import('./js/{module}'); return ({expr}); }}")

    async def native_calls(self, method=None):
        c = await self.pg.evaluate('window.__nativeCalls || []')
        return [x for x in c if method is None or x['method'] == method]

    async def jump(self, ms):
        # Big leaps in time: due timers fire once instead of every second along the way.
        await self.pg.clock.fast_forward(int(ms))
        await self.pg.clock.run_for(1100)
        await self.pg.wait_for_timeout(150)

    async def tick(self, ms):
        await self.pg.clock.run_for(int(ms))
        await self.pg.wait_for_timeout(150)

    async def tab(self, name, group=None):
        if name == 'settings':
            # Settings now opens from the ☰ menu one group at a time; with no group, show every card.
            if group:
                await self.menu(group)
            else:
                await self.js('ui/tabs.js', "m.show('settings')")
                await self.pg.wait_for_timeout(200)
            return
        if name == 'sounds':   # Wake-up music lives in the ☰ menu now
            await self.menu('music')
            return
        await self.pg.click(f'[data-go={name}]')
        await self.pg.wait_for_timeout(200)

    async def sleep_click(self, sel):
        # The Sleep card lives on the Sleep tab (3.2).
        if not await self.pg.is_visible('[data-tab=sleep]'):
            await self.tab('sleep')
        await self.pg.click(f'.sleep-card {sel}')

    async def menu(self, group):
        await self.pg.click('#appbar [data-ref=menu]')
        await self.pg.wait_for_timeout(150)
        await self.pg.click(f'.drawer [data-group-go={group}]')
        await self.pg.wait_for_timeout(250)

    async def fire_test_alarm(self):
        await self.pg.click('[data-ref=test]')
        await self.tick(11_000)
        await self.pg.wait_for_timeout(300)

    async def fire_direct(self, test=False, full=False):
        await self.js('core/events.js', f"m.emit('alarm:fire', {{ test: {str(test).lower()}, full: {str(full).lower()} }})")
        await self.pg.wait_for_timeout(400)

    async def phrase(self):
        return await self.pg.get_attribute('#morning [data-ref=phrase]', 'aria-label')

    async def type_phrase(self, text=None):
        text = await self.phrase() if text is None else text
        await self.pg.fill('#morning [data-ref=input]', text)
        await self.pg.click('#morning [data-ref=stop]')
        await self.pg.wait_for_timeout(250)

    async def phase(self):
        return await self.js('features/morning.js', 'm.get()?.phase ?? null')

    async def prove_current_task(self, retake=False):
        await self.pg.click('#morning [data-gate] button.gold')
        await self.pg.wait_for_timeout(1200)
        await self.pg.click('#camera [data-act=snap]')
        await self.pg.wait_for_timeout(300)
        if retake:
            await self.pg.click('#camera [data-act=retake]')
            await self.pg.wait_for_timeout(1200)
            await self.pg.click('#camera [data-act=snap]')
            await self.pg.wait_for_timeout(300)
        await self.pg.click('#camera [data-act=next]')
        await self.pg.wait_for_timeout(300)

    async def arm_by_keyboard(self):
        await self.pg.focus('[data-ref=thumb]')
        await self.pg.keyboard.press('Enter')
        await self.pg.wait_for_timeout(300)

    async def toast_text(self):
        els = await self.pg.query_selector_all('.toast')
        return ' | '.join([await e.inner_text() for e in els])

    async def visible(self, sel):
        return await self.pg.is_visible(sel)

ONE_TASK = [{'id': 'only', 'name': 'Drink water', 'proof': 'a glass of water', 'gapMin': 0}]

# ================================================================== tests
# ---------- App shell
@test('App', 'valid', 'Loads with no errors, correct title, four everyday tabs and a ☰ menu')
async def t_shell(a):
    pg = await a.open()
    check(await pg.title() == 'SoulWake', 'title should be SoulWake')
    labels = await pg.eval_on_selector_all('nav.tabs [data-go]', 'els => els.map(e => e.innerText.trim())')
    check(labels == ['Today', 'Routine', 'Sleep', 'Progress'], f'bottom tabs {labels}')
    check(await a.visible('#appbar [data-ref=menu]'), 'menu button in the top bar')

@test('App', 'valid', 'Every tab opens and the top bar names it')
async def t_tabs(a):
    pg = await a.open()
    for tab, head in [('tasks', 'Morning ritual'), ('sleep', 'Sleep'), ('sounds', 'Wake-up music'), ('progress', 'Progress'), ('alarm', 'SoulWake')]:
        await a.tab(tab)
        check(head == await pg.inner_text('#appbar .ab-title'), f'{tab} title')
    check('mornings proven in a row' in await pg.inner_text('[data-tab=progress]'), 'progress caption')

@test('App', 'valid', '☰ menu opens each settings group on its own page; Back returns; Escape closes the menu')
async def t_menu(a):
    pg = await a.open()
    await a.tab('tasks')
    groups = await a.js('ui/drawer.js', 'm.GROUPS.map(g => [g.id, g.title, g.cards || null])')
    check(len(groups) >= 11 and groups[1][:2] == ['music', 'Wake-up music'], f'menu items {groups}')
    for gid, title, cards in groups:
        await a.menu(gid)
        if cards is None:   # Wake-up music is its own page
            check(await pg.is_visible('[data-tab=sounds]') and await pg.inner_text('#appbar .ab-title') == title, f'{gid} page')
            continue
        check(await pg.inner_text('#appbar .ab-title') == title, f'{gid} title')
        shown = await pg.eval_on_selector_all('[data-tab=settings] [data-group]', 'els => els.map(e => e.dataset.group)')
        check(shown == cards, f'{gid} shows only its cards: {shown}')
    await pg.click('[data-tab=settings] [data-ref=back]'); await pg.wait_for_timeout(200)
    check(await pg.is_visible('[data-tab=tasks]'), 'Back returns to the last tab')
    await pg.click('#appbar [data-ref=menu]'); await pg.wait_for_timeout(100)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(100)
    check(not await pg.query_selector('.drawer'), 'Escape closes the menu')

@test('App', 'valid', 'Classic fonts are bundled and load offline (Bodoni Moda, EB Garamond)')
async def t_fonts(a):
    pg = await a.open()
    ok = await pg.evaluate("async () => { await document.fonts.ready; return [document.fonts.check('600 20px \"Bodoni Moda\"'), document.fonts.check('400 18px \"EB Garamond\"')]; }")
    check(all(ok), f'fonts loaded: {ok}')

@test('App', 'valid', 'Every button has an accessible name')
async def t_a11y(a):
    pg = await a.open()
    for tab in ['alarm', 'tasks', 'sleep', 'sounds', 'progress', 'settings']:
        await a.tab(tab)
        bad = await pg.evaluate("() => [...document.querySelectorAll('main button, nav button, #appbar button')].filter(b => b.offsetParent && !(b.innerText.trim() || b.getAttribute('aria-label'))).map(b => b.outerHTML.slice(0, 80))")
        check(not bad, f'unnamed buttons on {tab}: {bad}')

@test('App', 'invalid', 'Corrupted saved data falls back to defaults instead of crashing')
async def t_corrupt(a):
    pg = await a.open(seed={'fl:tasks': '{not json', 'fl:alarm': '[[[', 'fl:streak': 'null'})
    check(not a.errors, f'page errors: {a.errors}')
    names = await a.js('features/tasks.js', 'm.all().map(t => t.name)')
    check(names[:3] == ['Open-eyes selfie', 'Brushing teeth', 'Tea is ready'], f'default tasks, got {names}')

@test('App', 'invalid', 'Storage failure shows a clear message')
async def t_storage_full(a):
    pg = await a.open()
    await pg.evaluate("() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; }")
    await a.tab('tasks')
    await pg.click('[data-switch=chaos]')
    await pg.wait_for_timeout(200)
    check('storage may be full' in await a.toast_text(), 'expected storage toast')

# ---------- Alarm
@test('Alarm', 'valid', 'Changing the wake-up time is saved across a reload')
async def t_time(a):
    pg = await a.open(clock=False)
    await pg.fill('[data-ref=time]', '05:15')
    await pg.dispatch_event('[data-ref=time]', 'change')
    await pg.reload(); await pg.wait_for_timeout(500)
    check(await a.js('features/alarm.js', 'm.status().time') == '05:15', 'time should persist')

@test('Alarm', 'invalid', 'Clearing the time field keeps the previous time')
async def t_time_empty(a):
    pg = await a.open()
    await pg.fill('[data-ref=time]', '')
    await pg.dispatch_event('[data-ref=time]', 'change')
    check(await a.js('features/alarm.js', 'm.status().time') == '06:30', 'time should stay 06:30')
    check(await a.js('features/alarm.js', "(m.setTime('25:99'), m.status().time)") == '06:30', 'malformed time rejected')

@test('Alarm', 'valid', 'Slide-to-arm works with the keyboard (Enter)')
async def t_arm_key(a):
    pg = await a.open()
    await a.arm_by_keyboard()
    check(await a.js('features/alarm.js', 'm.status().armed'), 'should be armed')

@test('Alarm', 'valid', 'Dragging the slider all the way arms the alarm')
async def t_arm_drag(a):
    pg = await a.open()
    box = await pg.locator('[data-ref=thumb]').bounding_box()
    await pg.mouse.move(box['x'] + 20, box['y'] + 20); await pg.mouse.down()
    await pg.mouse.move(box['x'] + 360, box['y'] + 20, steps=10); await pg.mouse.up()
    await pg.wait_for_timeout(500)
    check(await a.js('features/alarm.js', 'm.status().armed'), 'drag should arm')

@test('Alarm', 'invalid', 'A short drag does not arm (prevents accidental taps)')
async def t_arm_short(a):
    pg = await a.open()
    box = await pg.locator('[data-ref=thumb]').bounding_box()
    await pg.mouse.move(box['x'] + 20, box['y'] + 20); await pg.mouse.down()
    await pg.mouse.move(box['x'] + 90, box['y'] + 20, steps=5); await pg.mouse.up()
    await pg.wait_for_timeout(400)
    check(not await a.js('features/alarm.js', 'm.status().armed'), 'short drag must not arm')
    await pg.click('[data-ref=thumb]')
    check(not await a.js('features/alarm.js', 'm.status().armed'), 'a plain tap must not arm')

@test('Alarm', 'valid', 'Disarm turns the alarm off')
async def t_disarm(a):
    pg = await a.open()
    await a.arm_by_keyboard()
    await pg.click('#night [data-ref=back]')
    await pg.click('[data-ref=disarm]')
    check(not await a.js('features/alarm.js', 'm.status().armed'), 'should be disarmed')

@test('Alarm', 'valid', 'Rings at the set time, then re-arms for the next day')
async def t_rings_on_time(a):
    pg = await a.open()
    t = await pg.evaluate("() => { const d = new Date(Date.now() + 120000); return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0'); }")
    await a.js('features/alarm.js', f"(m.setTime('{t}'), m.arm(), true)")
    await a.tick(60_000)
    check(await a.phase() is None, 'should not ring early')
    await a.tick(70_000)
    check(await a.phase() == 'ringing', 'should ring at the set time')
    armed_at = await a.js('features/alarm.js', 'm.status().armedAt - Date.now()')
    check(armed_at > 23 * 3600 * 1000, 'next alarm should be about a day later')

@test('Alarm', 'invalid', 'An alarm missed while the app was closed does not ring hours late')
async def t_stale(a):
    pg = await a.open(seed={'fl:alarm': {'time': '06:30', 'armedAt': int(time.time() * 1000) - 3 * 3600 * 1000, 'testAt': None}})
    await a.tick(2000)
    check(await a.phase() is None, 'stale alarm must not ring')
    check(await a.js('features/alarm.js', 'm.status().armedAt > Date.now()'), 'should be rolled to the next occurrence')

@test('Alarm', 'valid', 'Test alarm rings after 10 seconds')
async def t_test_alarm(a):
    pg = await a.open()
    await pg.click('[data-ref=test]')
    await a.tick(8000)
    check(await a.phase() is None, 'not before 10 s')
    await a.tick(3000)
    check(await a.phase() == 'ringing', 'rings after 10 s')
    check(await a.visible('#morning [data-ref=input]'), 'ringing screen visible')

@test('Alarm', 'invalid', 'A second alarm during an active morning is ignored')
async def t_double_fire(a):
    pg = await a.open()
    await a.fire_direct()
    started = await a.js('features/morning.js', 'm.get().startedAt')
    await a.fire_direct()
    check(await a.js('features/morning.js', 'm.get().startedAt') == started, 'morning should not restart')

# ---------- Battery guard
@test('Battery', 'invalid', 'Low battery, not charging: arming asks first; "plug in first" cancels')
async def t_batt_cancel(a):
    pg = await a.open(battery=(0.22, False))
    await a.arm_by_keyboard()
    check('Battery at 22%' in await pg.inner_text('.sheet'), 'warning sheet expected')
    await pg.click('.sheet [data-i="0"]')
    check(not await a.js('features/alarm.js', 'm.status().armed'), 'should stay disarmed')

@test('Battery', 'valid', 'Low battery: "Arm anyway" arms')
async def t_batt_anyway(a):
    pg = await a.open(battery=(0.22, False))
    await a.arm_by_keyboard()
    await pg.click('.sheet [data-i="1"]'); await pg.wait_for_timeout(200)
    check(await a.js('features/alarm.js', 'm.status().armed'), 'should be armed')

@test('Battery', 'valid', 'Low battery but charging arms without a warning')
async def t_batt_charging(a):
    pg = await a.open(battery=(0.12, True))
    await a.arm_by_keyboard()
    check(not await pg.query_selector('.sheet'), 'no sheet while charging')
    check(await a.js('features/alarm.js', 'm.status().armed'), 'armed')

@test('Battery', 'valid', 'Guard switched off: no warning at low battery')
async def t_batt_off(a):
    pg = await a.open(battery=(0.12, False), seed={'fl:battery': {'enabled': False, 'armBelow': 40, 'floor': 15}})
    await a.arm_by_keyboard()
    check(not await pg.query_selector('.sheet'), 'no sheet when guard off')

@test('Battery', 'valid', 'Battery hits the floor unplugged while armed: alarm switches off and it is recorded')
async def t_batt_trip(a):
    pg = await a.open(battery=(0.60, False))
    await a.arm_by_keyboard()
    await pg.evaluate('() => window.__setBattery(0.15, false)'); await pg.wait_for_timeout(300)
    check(not await a.js('features/alarm.js', 'm.status().armed'), 'should disarm at floor')
    check('Alarm switched off' in await pg.inner_text('.sheet'), 'explanation sheet expected')
    check(await a.js('features/stats.js', 'm.get().totals.paused') == 1, 'paused night counted')

@test('Battery', 'valid', 'Battery at the floor while charging keeps the alarm armed')
async def t_batt_floor_charging(a):
    pg = await a.open(battery=(0.60, True))
    await a.arm_by_keyboard()
    await pg.evaluate('() => window.__setBattery(0.10, true)'); await pg.wait_for_timeout(300)
    check(await a.js('features/alarm.js', 'm.status().armed'), 'should stay armed')

@test('Battery', 'invalid', 'Browser without battery info (e.g. iPhone): arms and advises plugging in')
async def t_batt_unsupported(a):
    pg = await a.open(battery='none')
    await a.arm_by_keyboard()
    check(await a.js('features/alarm.js', 'm.status().armed'), 'armed')
    check('can’t read your battery' in await a.toast_text(), 'advice toast expected')

@test('Battery', 'invalid', 'Guard levels stay sensible: switch-off level can’t reach the warning level')
async def t_batt_limits(a):
    pg = await a.open()
    r = await a.js('features/battery-guard.js', "[m.setSetting('floor', 45), m.settings().armBelow, m.setSetting('armBelow', 5), m.setSetting('floor', 'abc'), m.setSetting('floor', -3)]")
    check(r[0] == 35 and r[1] == 40, f'floor capped below warning level: {r}')
    check(r[2] == 40, f'warning level can’t drop below floor+5: {r}')
    check(r[3] == 35 and r[4] == 5, f'bad input handled: {r}')

@test('Battery', 'valid', 'Low battery during an active morning never stops the morning')
async def t_batt_morning(a):
    pg = await a.open(battery=(0.60, False))
    await a.js('features/alarm.js', '(m.arm(), true)')
    await a.fire_direct()
    await pg.evaluate('() => window.__setBattery(0.05, false)'); await pg.wait_for_timeout(300)
    check(await a.phase() == 'ringing', 'morning must continue')

# ---------- Night screen
@test('Night', 'valid', 'Arming opens the black night screen; "Back to the app" keeps it armed')
async def t_night(a):
    pg = await a.open()
    await a.arm_by_keyboard()
    check(await a.visible('#night'), 'night screen shown')
    bg = await pg.evaluate("() => getComputedStyle(document.getElementById('night')).backgroundColor")
    check(bg == 'rgb(0, 0, 0)', f'night must be pure black, got {bg}')
    await pg.click('#night [data-ref=back]')
    check(not await a.visible('#night'), 'hidden after back')
    check(await a.js('features/alarm.js', 'm.status().armed'), 'still armed')
    await pg.click('[data-ref=night]')
    check(await a.visible('#night'), 'reopens from the Night screen button')

@test('Night', 'valid', 'Night screen gives way to the alarm, and closes on disarm')
async def t_night_ring(a):
    pg = await a.open()
    await a.arm_by_keyboard()
    await a.fire_direct()
    check(not await a.visible('#night'), 'hidden while ringing')
    await a.type_phrase(); await a.js('features/morning.js', '(m.close(), true)'); await pg.wait_for_timeout(200)
    check(await a.visible('#night'), 'night screen returns after the morning while still armed')
    await a.js('features/alarm.js', '(m.disarm(), true)'); await pg.wait_for_timeout(200)
    check(not await a.visible('#night'), 'hidden after disarm')

# ---------- Ringing
@test('Ringing', 'invalid', 'A wrong phrase is rejected and the alarm keeps ringing')
async def t_wrong(a):
    pg = await a.open(); await a.fire_direct()
    await a.type_phrase('I am definitely awake')
    check(await a.phase() == 'ringing', 'still ringing')
    check('Not quite' in await pg.get_attribute('#morning [data-ref=input]', 'placeholder'), 'feedback shown')

@test('Ringing', 'invalid', 'An empty phrase is rejected')
async def t_empty(a):
    pg = await a.open(); await a.fire_direct()
    await a.type_phrase('   ')
    check(await a.phase() == 'ringing', 'still ringing')

@test('Ringing', 'valid', 'The phrase ignores capitals, extra spaces and punctuation')
async def t_loose(a):
    pg = await a.open(); await a.fire_direct()
    p = await a.phrase()
    await a.type_phrase('  ' + p.upper().replace(' ', '   ') + '!!  ')
    check(await a.phase() == 'tasks', 'should stop the alarm')

@test('Ringing', 'invalid', 'Pasting and dropping text into the phrase box is blocked')
async def t_paste(a):
    pg = await a.open(); await a.fire_direct()
    prevented = await pg.evaluate("""() => {
      const i = document.querySelector('#morning [data-ref=input]');
      const dt = new DataTransfer(); dt.setData('text/plain', 'x');
      const p = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      const d = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
      return [!i.dispatchEvent(p), !i.dispatchEvent(d)];
    }""")
    check(all(prevented), f'paste/drop should be blocked: {prevented}')

@test('Ringing', 'valid', 'Letters light up as you type, wrong letters are marked')
async def t_letters(a):
    pg = await a.open(); await a.fire_direct()
    p = await a.phrase()
    await pg.type('#morning [data-ref=input]', p[:3] + 'Q')
    ok = await pg.eval_on_selector_all('#morning .phrase .ch.ok', 'e => e.length')
    bad = await pg.eval_on_selector_all('#morning .phrase .ch.bad', 'e => e.length')
    check(ok == 3 and bad == 1, f'expected 3 ok and 1 bad, got {ok}/{bad}')

# ---------- Snooze
@test('Snooze', 'valid', 'Snooze silences, logs to the Hall of Shame, and rings again after 5 minutes')
async def t_snooze(a):
    pg = await a.open(); await a.fire_direct(test=False)
    await pg.click('#morning [data-ref=snooze]'); await pg.wait_for_timeout(200)
    check(await a.phase() == 'snoozed', 'snoozed')
    check(len(await a.js('features/snooze.js', 'm.hallOfShame()')) == 1, 'shame logged')
    await a.tick(4 * 60_000)
    check(await a.phase() == 'snoozed', 'still snoozed at 4 min')
    await a.tick(61_000)
    check(await a.phase() == 'ringing', 'rings again after 5 min')

@test('Snooze', 'valid', '"I’m up" ends the snooze early so you can stop the alarm')
async def t_snooze_up(a):
    pg = await a.open(); await a.fire_direct()
    await pg.click('#morning [data-ref=snooze]'); await pg.wait_for_timeout(200)
    await pg.click('#morning [data-ref=up]'); await pg.wait_for_timeout(200)
    check(await a.phase() == 'ringing', 'rings immediately')

@test('Snooze', 'invalid', 'After the snooze limit (2), the snooze option disappears')
async def t_snooze_limit(a):
    pg = await a.open(); await a.fire_direct()
    for _ in range(2):
        await pg.click('#morning [data-ref=snooze]'); await pg.wait_for_timeout(150)
        await pg.click('#morning [data-ref=up]'); await pg.wait_for_timeout(150)
    check(not await pg.query_selector('#morning [data-ref=snooze]'), 'no snooze after limit')
    check(await a.js('features/morning.js', 'm.snooze()') is None, 'snooze refused by the rules too')

@test('Snooze', 'valid', 'Snooze switched off: no snooze button')
async def t_snooze_off(a):
    pg = await a.open(seed={'fl:snooze': {'enabled': False, 'minutes': 5, 'max': 2}}); await a.fire_direct()
    check(not await pg.query_selector('#morning [data-ref=snooze]'), 'no snooze button')

@test('Snooze', 'invalid', 'No snooze on the punishment ring after a missed check-in')
async def t_snooze_escalated(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(); await a.type_phrase()
    await a.tick(5 * 60_000 + 1000); await a.tick(61_000)
    check(await a.js('features/morning.js', 'm.get().escalated'), 'escalated ring')
    check(not await pg.query_selector('#morning [data-ref=snooze]'), 'no snooze on escalated ring')

@test('Snooze', 'invalid', 'Snooze settings reject out-of-range and junk values')
async def t_snooze_limits(a):
    await a.open()
    r = await a.js('features/snooze.js', "[m.setSetting('minutes', 0), m.setSetting('minutes', 99), m.setSetting('max', -1), m.setSetting('max', 'lots')]")
    check(r == [1, 30, 0, 0], f'clamped values, got {r}')

@test('Snooze', 'valid', 'Test-run snoozes stay out of your Hall of Shame and totals')
async def t_snooze_test(a):
    pg = await a.open(seed={'fl:tasks': []}); await a.fire_direct(test=True)
    await pg.click('#morning [data-ref=snooze]'); await pg.wait_for_timeout(150)
    await pg.click('#morning [data-ref=up]'); await pg.wait_for_timeout(150)
    await a.type_phrase(); await pg.click('#morning [data-ref=close]')
    await a.tab('progress')
    check('Spotless' in await pg.inner_text('[data-tab=progress]'), 'test snooze hidden')
    check(await a.js('features/stats.js', 'm.get().totals.snoozes') == 0, 'not counted')

# ---------- Check-in
@test('Check-in', 'valid', 'Check-in appears after 5 minutes; answering it stops the timer')
async def t_checkin_pass(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(); await a.type_phrase()
    await a.tick(4 * 60_000)
    check(not await a.visible('#checkin'), 'not yet')
    await a.tick(61_000)
    check(await a.visible('#checkin'), 'check-in shown')
    await pg.click('#checkin [data-ref=yes]'); await pg.wait_for_timeout(200)
    check(not await a.visible('#checkin'), 'closed')
    await a.tick(120_000)
    check(await a.phase() == 'tasks', 'no re-ring after passing')

@test('Check-in', 'invalid', 'Missing the check-in rings again with a harsher phrase and keeps task progress')
async def t_checkin_miss(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK + [{'id': 'two', 'name': 'Stretch', 'proof': 'you stretching', 'gapMin': 0}]})
    await a.fire_direct(); await a.type_phrase()
    await a.prove_current_task()
    await a.tick(5 * 60_000 + 1000); await a.tick(61_000)
    check(await a.phase() == 'ringing', 're-ring')
    check((await a.phrase()) in ['I ignored my own check in and now I type this', 'I promise to stop negotiating with my pillow'], 'retry phrase')
    await a.type_phrase()
    check(await a.js('features/morning.js', 'm.get().completed.length') == 1, 'progress kept')

@test('Check-in', 'invalid', 'Check-in steppers stop at their limits')
async def t_checkin_limits(a):
    pg = await a.open()
    await a.tab('settings')
    for _ in range(6):
        await pg.click('[data-stepper=delayMin] [data-d="-1"]', force=True)
    check(await a.js('features/checkin.js', 'm.settings().delayMin') == 1, 'min 1 minute')
    check(await pg.is_disabled('[data-stepper=delayMin] [data-d="-1"]'), 'minus disabled at the limit')
    r = await a.js('features/checkin.js', "[m.setSetting('windowSec', 5), m.setSetting('windowSec', 9999), m.setSetting('delayMin', 'x')]")
    check(r == [15, 300, 1], f'clamped: {r}')

@test('Check-in', 'valid', 'No check-in after the morning is finished')
async def t_checkin_after_done(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(); await a.type_phrase(); await a.prove_current_task()
    check(await a.phase() == 'done', 'done')
    await a.tick(6 * 60_000)
    check(not await a.visible('#checkin'), 'no check-in after done')

# ---------- Tasks
@test('Tasks', 'valid', 'Quick-add a template task and it is saved')
async def t_task_add(a):
    pg = await a.open(clock=False)
    await a.tab('tasks')
    await pg.click('[data-tpl="0"]')
    await pg.reload(); await pg.wait_for_timeout(500)
    check('Make the bed' in await a.js('features/tasks.js', 'm.all().map(t => t.name)'), 'saved')

@test('Tasks', 'invalid', 'An empty task name is refused and the old name kept')
async def t_task_empty(a):
    pg = await a.open()
    await a.tab('tasks')
    await pg.click('.task-card .title')
    await pg.fill('[data-f=name]', '   ')
    await pg.dispatch_event('[data-f=name]', 'change')
    check(await a.visible('[data-err=name]'), 'error shown')
    check((await a.js('features/tasks.js', 'm.all()[0].name')) == 'Open-eyes selfie', 'name kept')

@test('Tasks', 'invalid', 'Wait time stays between 0 and 120 minutes, junk ignored')
async def t_task_gap(a):
    await a.open()
    r = await a.js('features/tasks.js', "[m.update('t1', {gapMin: -5}).gapMin, m.update('t1', {gapMin: 500}).gapMin, m.update('t1', {gapMin: 'abc'}).gapMin, m.update('t1', {gapMin: 7.6}).gapMin]")
    check(r == [0, 120, 120, 8], f'gap values {r}')

@test('Tasks', 'valid', 'Reorder and delete tasks')
async def t_task_reorder(a):
    pg = await a.open()
    await a.tab('tasks')
    await pg.click('.task-card:nth-child(2) .title')
    await pg.click('[data-act=up]')
    check((await a.js('features/tasks.js', 'm.all().map(t=>t.id)'))[:2] == ['t2', 't1'], 'moved up')
    await pg.click('[data-act=del]')
    check(len(await a.js('features/tasks.js', 'm.all()')) == 2, 'deleted')

@test('Tasks', 'invalid', 'No more than 12 tasks')
async def t_task_max(a):
    pg = await a.open()
    await a.js('features/tasks.js', 'Array.from({length: 20}, () => m.add()).filter(Boolean).length')
    check(len(await a.js('features/tasks.js', 'm.all()')) == 12, 'capped at 12')
    await a.tab('tasks')
    check(await pg.is_disabled('[data-tpl="0"]'), 'quick-add disabled when full')

@test('Tasks', 'valid', 'A task with a wait stays locked until the wait is over')
async def t_task_lock(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK + [{'id': 'tea', 'name': 'Tea', 'proof': 'tea', 'gapMin': 10}], 'fl:checkin': {'delayMin': 60, 'windowSec': 60}})
    await a.fire_direct(); await a.type_phrase(); await a.prove_current_task()
    check('Unlocks in' in await pg.inner_text('#morning [data-gate]'), 'locked')
    check(not await a.js('features/morning.js', "m.completeTask('tea')"), 'cannot complete early')
    await a.tick(10 * 60_000 + 1000)
    check(await pg.query_selector('#morning [data-gate] button.gold'), 'unlocked after 10 min')

@test('Tasks', 'valid', 'With no tasks, typing the phrase finishes the morning')
async def t_no_tasks(a):
    await a.open(seed={'fl:tasks': []})
    await a.fire_direct(); await a.type_phrase()
    check(await a.phase() == 'done', 'done immediately')

@test('Tasks', 'valid', 'Chaos task adds one random task at the end')
async def t_chaos(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK, 'fl:tasks-options': {'chaos': True}})
    await a.fire_direct()
    ts = await a.js('features/morning.js', 'm.get().tasks')
    check(len(ts) == 2 and ts[1].get('chaos'), 'chaos task appended')
    await a.type_phrase(); await a.prove_current_task()
    check('chaos' in await pg.inner_text('#morning .chain'), 'chaos tag shown')

@test('Tasks', 'invalid', 'Editing tasks mid-morning doesn’t change this morning’s list')
async def t_task_snapshot(a):
    await a.open()
    await a.fire_direct()
    await a.js('features/tasks.js', "(m.remove('t1'), m.remove('t2'), true)")
    check(len(await a.js('features/morning.js', 'm.get().tasks')) == 3, 'today unchanged')

# ---------- Camera
@test('Camera', 'invalid', 'Camera blocked: clear message, task not completed')
async def t_cam_denied(a):
    pg = await a.open(deny_camera=True, seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(); await a.type_phrase()
    await pg.click('#morning [data-gate] button.gold'); await pg.wait_for_timeout(400)
    check('Camera blocked' in await pg.inner_text('#camera'), 'message shown')
    await pg.click('#camera [data-act=cancel]')
    check(await a.js('features/morning.js', 'm.get().completed.length') == 0, 'not completed')

@test('Camera', 'valid', 'Capture, retake, then Next completes the task')
async def t_cam_retake(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(); await a.type_phrase()
    await a.prove_current_task(retake=True)
    check(await a.phase() == 'done', 'completed')

@test('Camera', 'invalid', 'Cancelling the camera leaves the task open')
async def t_cam_cancel(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(); await a.type_phrase()
    await pg.click('#morning [data-gate] button.gold'); await pg.wait_for_timeout(800)
    await pg.click('#camera [data-act=cancel]')
    check(await a.phase() == 'tasks' and not await a.visible('#camera'), 'still on tasks')

# ---------- Report & progress
@test('Progress', 'valid', 'Finishing shows the report card; a test run doesn’t touch the streak')
async def t_report(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(test=True, full=True); await a.type_phrase(); await a.prove_current_task()
    txt = await pg.inner_text('#morning')
    check('Morning proven' in txt and 'A+' in txt, 'report card A+')
    check(await a.js('features/stats.js', 'm.get().wins') == 0, 'test not counted')

@test('Progress', 'valid', 'A real morning adds to the streak, history and calendar')
async def t_real_morning(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.fire_direct(test=False); await a.type_phrase(); await a.prove_current_task()
    s = await a.js('features/stats.js', 'm.get()')
    check(s['streak'] == 1 and s['wins'] == 1 and s['history'][0]['grade'] == 'A+', f'stats {s}')
    await pg.click('#morning [data-ref=close]'); await a.tab('progress')
    check(await pg.query_selector('.cal .day.proven.today'), 'today marked on the calendar')

@test('Progress', 'valid', 'Grades follow snoozes, missed check-ins and time taken')
async def t_grades(a):
    await a.open()
    r = await a.js('features/report.js', """[
      m.grade({startedAt: 0, doneAt: 10*60000, snoozes: 0, misses: 0}).letter,
      m.grade({startedAt: 0, doneAt: 10*60000, snoozes: 1, misses: 0}).letter,
      m.grade({startedAt: 0, doneAt: 50*60000, snoozes: 2, misses: 1}).letter,
      m.grade({startedAt: 0, doneAt: 90*60000, snoozes: 5, misses: 3}).letter,
      m.grade({startedAt: 0}) ]""")
    check(r == ['A+', 'A', 'D', 'F', None], f'grades {r}')

@test('Progress', 'valid', 'Streak continues from yesterday and resets after a missed day')
async def t_streak_days(a):
    pg = await a.open()
    r = await pg.evaluate("""async () => {
      const k = (d) => d.toISOString ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : d;
      const y = new Date(); y.setDate(y.getDate()-1); const old = new Date(); old.setDate(old.getDate()-3);
      return [k(y), k(old)];
    }""")
    await a.close()
    a2 = App(a.browser); a.ctx = None
    await a2.open(seed={'fl:tasks': [], 'fl:streak': {'streak': 4, 'best': 4, 'wins': 4, 'lastWin': r[0], 'history': []}})
    check(await a2.js('features/stats.js', 'm.currentStreak()') == 4, 'yesterday keeps the streak alive')
    await a2.fire_direct(test=False); await a2.type_phrase()
    check(await a2.js('features/stats.js', 'm.get().streak') == 5, 'continues to 5')
    await a2.close()
    a3 = App(a.browser)
    await a3.open(seed={'fl:tasks': [], 'fl:streak': {'streak': 9, 'best': 9, 'wins': 9, 'lastWin': r[1], 'history': []}})
    check(await a3.js('features/stats.js', 'm.currentStreak()') == 0, 'gap breaks the streak')
    await a3.fire_direct(test=False); await a3.type_phrase()
    s = await a3.js('features/stats.js', 'm.get()')
    check(s['streak'] == 1 and s['best'] == 9, f'restarts at 1, best kept: {s}')
    await a3.close()

@test('Progress', 'invalid', 'An unfinished morning from yesterday is closed, not resumed')
async def t_stale_morning(a):
    y = time.strftime('%Y-%m-%d', time.localtime(time.time() - 86400))
    await a.open(seed={'fl:morning': {'date': y, 'test': False, 'startedAt': 0, 'phase': 'tasks', 'tasks': ONE_TASK, 'completed': [], 'phrase': 'x'}})
    check(await a.phase() == 'closed', 'closed')
    check(not await a.visible('#morning'), 'morning screen hidden')

@test('Progress', 'valid', 'Reloading while the alarm rings keeps it ringing')
async def t_reload_ring(a):
    pg = await a.open(clock=False)
    await a.fire_direct()
    await pg.reload(); await pg.wait_for_timeout(600)
    check(await a.phase() == 'ringing' and await a.visible('#morning [data-ref=input]'), 'still ringing after reload')

# ---------- Sounds
@test('Sounds', 'invalid', 'Adding songs: audio files accepted, other files refused with a reason')
async def t_songs(a):
    pg = await a.open()
    await a.tab('sounds')
    await pg.set_input_files('[data-ref=songInput]', [str(FIX / 'song-a.wav'), str(FIX / 'notes.txt'), str(FIX / 'image.png')])
    await pg.wait_for_timeout(500)
    check(len(await a.js('features/songs.js', 'await m.list()')) == 1, 'only the audio file added')
    check('isn’t an audio file' in await a.toast_text(), 'reason given')

@test('Sounds', 'valid', 'Song rotation: no repeats until every song has played')
async def t_rotation(a):
    pg = await a.open()
    await a.tab('sounds')
    await pg.set_input_files('[data-ref=songInput]', [str(FIX / f'song-{x}.wav') for x in 'abc'])
    await pg.wait_for_timeout(500)
    ids = await a.js('features/songs.js', '[await m.next(), await m.next(), await m.next(), await m.next()]')
    check(len(set(ids[:3])) == 3, f'first three all different: {ids}')
    check(ids[3] != ids[2], 'no back-to-back repeat across cycles')

@test('Sounds', 'valid', 'Your songs play when the alarm rings; the rest plays when you finish')
async def t_local_play(a):
    pg = await a.open(seed={'fl:tasks': []})
    await a.tab('sounds'); await pg.set_input_files('[data-ref=songInput]', [str(FIX / 'song-a.wav')]); await pg.wait_for_timeout(400)
    await a.fire_direct(); await pg.wait_for_timeout(400)
    check(await a.js('features/music.js', 'm.status().playing') == 'local', 'local song playing')
    await a.type_phrase(); await pg.wait_for_timeout(600)
    check(await a.js('features/music.js', 'm.status().playing') == 'finale', 'finale plays after proving')

@test('Sounds', 'valid', 'No songs added: the alarm beeps')
async def t_beeps(a):
    await a.open(); await a.fire_direct()
    check(await a.js('features/music.js', 'm.status().playing') == 'beeps', 'beeps')

@test('Sounds', 'invalid', 'Punishment song: non-audio refused; audio plays after a missed check-in')
async def t_punish(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.tab('sounds')
    await pg.set_input_files('[data-ref=punishInput]', str(FIX / 'notes.txt')); await pg.wait_for_timeout(300)
    check('isn’t audio' in await a.toast_text(), 'refused')
    await pg.set_input_files('[data-ref=punishInput]', str(FIX / 'punish.wav')); await pg.wait_for_timeout(400)
    await a.fire_direct(); await a.type_phrase()
    await a.tick(5 * 60_000 + 1000); await a.tick(61_000); await pg.wait_for_timeout(400)
    check(await a.js('features/music.js', 'm.status().playing') == 'punishment', 'punishment song playing')

# ---------- Boost
@test('Boost', 'invalid', 'Voice note: empty recording refused; saved note plays after the check-in')
async def t_voice(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    r = await a.js('features/boost.js', "(await m.saveVoice(new Blob([]))).ok")
    check(r is False, 'empty refused')
    await pg.evaluate("""async () => { const m = await import('./js/features/boost.js');
      const wav = await (await fetch('/tests/fixtures/song-a.wav')).blob(); return (await m.saveVoice(wav)).ok; }""")
    await a.fire_direct(); await a.type_phrase()
    await a.tick(5 * 60_000 + 1000)
    await pg.click('#checkin [data-ref=yes]'); await pg.wait_for_timeout(500)
    check(await a.visible('#boost') and 'past you' in await pg.inner_text('#boost'), 'boost shows the voice note')

@test('Boost', 'invalid', 'Clips: non-video refused; no boost screen when nothing is saved')
async def t_clips(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.tab('sounds')
    await pg.set_input_files('[data-ref=clipInput]', [str(FIX / 'image.png'), str(FIX / 'clip.webm')]); await pg.wait_for_timeout(400)
    check(len(await a.js('features/boost.js', 'await m.clips()')) == 1, 'only the video added')
    await a.js('features/boost.js', '(await Promise.all((await m.clips()).map(c => m.removeClip(c.id))), true)')
    await a.fire_direct(); await a.type_phrase(); await a.tick(5 * 60_000 + 1000)
    await pg.click('#checkin [data-ref=yes]'); await pg.wait_for_timeout(400)
    check(not await a.visible('#boost'), 'no boost with nothing saved')

# ---------- Spotify (stand-in)
CONNECTED = {'fl:music': {'source': 'spotify'}, 'fl:spotify': {'clientId': 'a' * 32, 'token': {'access': 'ACCESS-ok', 'refresh': 'REFRESH', 'expiresAt': 4102444800000}, 'playlist': {'id': 'pl1', 'name': 'Rise and shine', 'uri': 'spotify:playlist:pl1', 'total': 7}, 'user': {'name': 'Test User'}, 'lastError': None}, 'fl:tasks': []}

@test('Spotify', 'valid', 'No Client ID to type: “Connect Spotify” appears only when the app has its own Spotify ID')
async def t_sp_client(a):
    pg = await a.open(spotify={})
    await a.tab('sounds'); await pg.click('[data-seg=source] [data-value=spotify]')
    text = await pg.inner_text('[data-tab=sounds]')
    check(not await pg.query_selector('[data-ref=cid]'), 'no Client ID field anywhere')
    built_in = await a.js('config.js', 'm.SPOTIFY_CLIENT_ID')
    check(('Connect Spotify' in text) == bool(built_in), 'Connect button follows the built-in ID')
    check('Share → SoulWake' in text, 'share-a-playlist route explained')
    await a.js('features/sources/spotify.js', "m.setClientId('0123456789abcdef0123456789ABCDEF')")
    await pg.wait_for_timeout(200)
    check('Connect Spotify' in await pg.inner_text('[data-tab=sounds]'), 'Connect appears once an ID is configured')

@test('Spotify', 'valid', 'Connect: secure sign-in (PKCE), token saved, playlists listed and chosen')
async def t_sp_connect(a):
    pg = await a.open(clock=False, spotify={}, seed={'fl:spotify': {'clientId': 'b' * 32}})
    await a.tab('sounds'); await pg.click('[data-seg=source] [data-value=spotify]')
    await pg.click('[data-ref=connect]'); await pg.wait_for_timeout(1500)
    check(('AUTHORIZE', 'S256') in a.calls, 'PKCE S256 used')
    check(('TOKEN', 'authorization_code') in a.calls, 'code exchanged')
    check('Test User' in await pg.inner_text('[data-tab=sounds]'), 'signed in')
    check('?code=' not in pg.url, 'code removed from the address bar')
    await pg.click('[data-ref=load]'); await pg.wait_for_timeout(600)
    await pg.click('[data-pick=pl2]'); await pg.wait_for_timeout(200)
    check((await a.js('features/sources/spotify.js', 'm.status().playlist.name')) == 'Loud mornings', 'playlist chosen')

@test('Spotify', 'invalid', 'Tampered sign-in (state mismatch) is rejected')
async def t_sp_state(a):
    pg = await a.open(clock=False, spotify={'state': 'wrong'}, seed={'fl:spotify': {'clientId': 'c' * 32}})
    await a.tab('sounds'); await pg.click('[data-seg=source] [data-value=spotify]')
    await pg.click('[data-ref=connect]'); await pg.wait_for_timeout(1500)
    check('could not be verified' in await a.toast_text(), 'rejection message')
    check(not await a.js('features/sources/spotify.js', 'm.status().connected'), 'not connected')

@test('Spotify', 'invalid', 'Cancelled sign-in shows a message')
async def t_sp_deny(a):
    pg = await a.open(clock=False, spotify={'deny': True}, seed={'fl:spotify': {'clientId': 'd' * 32}})
    await a.tab('sounds'); await pg.click('[data-seg=source] [data-value=spotify]')
    await pg.click('[data-ref=connect]'); await pg.wait_for_timeout(1500)
    check('cancelled' in await a.toast_text(), 'cancel message')

@test('Spotify', 'valid', 'Alarm plays the playlist in the in-app Spotify player, starting at today’s song')
async def t_sp_play(a):
    pg = await a.open(clock=False, spotify={}, seed=CONNECTED)
    await a.fire_direct(); await pg.wait_for_timeout(2500)
    check(await a.js('features/music.js', 'm.status().playing') == 'spotify', 'spotify playing')
    plays = [c for c in a.calls if c[0] == 'PUT' and c[1].startswith('/me/player/play')]
    check(plays and 'device_id=sdk-device' in plays[0][1], f'played on the in-app player: {plays}')
    body = json.loads(plays[0][2])
    check(body['context_uri'] == 'spotify:playlist:pl1' and 0 <= body['offset']['position'] < 7, f'body {body}')
    await a.type_phrase(); await pg.wait_for_timeout(300)
    check(any(c[1].startswith('/me/player/pause') for c in a.calls), 'paused when stopped')

@test('Spotify', 'invalid', 'No Premium: falls back to your songs/beeps and explains why')
async def t_sp_premium(a):
    pg = await a.open(clock=False, spotify={'play': 'premium'}, seed=CONNECTED)
    await a.fire_direct(); await pg.wait_for_timeout(1500)
    check(await a.js('features/music.js', 'm.status().playing') == 'beeps', 'fallback to beeps (no songs added)')
    check('Premium' in (await a.js('features/music.js', 'm.status().lastFallback.reason')), 'reason recorded')
    await a.type_phrase(); await pg.click('#morning [data-ref=close]')
    await a.tab('sounds')
    check('didn’t start' in await pg.inner_text('[data-tab=sounds]'), 'notice in Sounds')

@test('Spotify', 'invalid', 'Expired sign-in that can’t refresh: disconnects and falls back')
async def t_sp_refresh_fail(a):
    seed = json.loads(json.dumps(CONNECTED)); seed['fl:spotify']['token']['expiresAt'] = 1
    pg = await a.open(clock=False, spotify={'refresh': 'fail'}, seed=seed)
    await a.fire_direct(); await pg.wait_for_timeout(1500)
    check(('TOKEN', 'refresh_token') in a.calls, 'refresh attempted')
    check(await a.js('features/music.js', 'm.status().playing') == 'beeps', 'fallback')
    check(not await a.js('features/sources/spotify.js', 'm.status().connected'), 'disconnected')

@test('Spotify', 'valid', 'Expired access token is refreshed automatically')
async def t_sp_refresh_ok(a):
    seed = json.loads(json.dumps(CONNECTED)); seed['fl:spotify']['token']['expiresAt'] = 1
    pg = await a.open(clock=False, spotify={}, seed=seed)
    await a.fire_direct(); await pg.wait_for_timeout(2500)
    check(('TOKEN', 'refresh_token') in a.calls, 'refreshed')
    check(await a.js('features/music.js', 'm.status().playing') == 'spotify', 'playing after refresh')

@test('Spotify', 'valid', 'Disconnect clears the account')
async def t_sp_disconnect(a):
    pg = await a.open(clock=False, spotify={}, seed=CONNECTED)
    await a.tab('sounds')
    await pg.click('[data-ref=out]'); await pg.wait_for_timeout(200)
    check(not await a.js('features/sources/spotify.js', 'm.status().connected'), 'disconnected')

# ---------- YouTube (stand-in)
@test('YouTube', 'invalid', 'Link check: rejects non-links, other sites, private lists and junk')
async def t_yt_parse(a):
    await a.open()
    r = await a.js('features/sources/youtube.js', """[
      m.parse('hello').ok, m.parse('https://vimeo.com/123').ok,
      m.parse('https://music.youtube.com/playlist?list=LM').ok, m.parse('https://www.youtube.com/watch').ok,
      m.parse('https://www.youtube.com/playlist?list=<script>').ok ]""")
    check(r == [False] * 5, f'all invalid: {r}')

@test('YouTube', 'valid', 'Link check: accepts YouTube Music playlists, watch links and youtu.be')
async def t_yt_parse_ok(a):
    await a.open()
    r = await a.js('features/sources/youtube.js', """[
      m.parse('https://music.youtube.com/playlist?list=PLabc123_-XYZ').listId,
      m.parse('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLzz').listId,
      m.parse('https://youtu.be/dQw4w9WgXcQ').videoId,
      m.parse('https://m.youtube.com/watch?v=dQw4w9WgXcQ').videoId ]""")
    check(r == ['PLabc123_-XYZ', 'PLzz', 'dQw4w9WgXcQ', 'dQw4w9WgXcQ'], f'parsed {r}')

@test('YouTube', 'valid', 'Alarm shows the YouTube player on screen and plays; stopping removes it')
async def t_yt_play(a):
    pg = await a.open(clock=False, youtube='ok', seed={'fl:music': {'source': 'youtube'}, 'fl:youtube': {'url': 'x', 'listId': 'PLtest', 'videoId': None}, 'fl:tasks': []})
    await a.fire_direct(); await pg.wait_for_timeout(800)
    check(await a.js('features/music.js', 'm.status().playing') == 'youtube', 'youtube playing')
    check(await a.visible('#media-stage iframe'), 'player visible, as YouTube requires')
    idx = await pg.evaluate('() => window.__yt.index')
    check(idx in (0, 1, 2), 'started at today’s song')
    await a.type_phrase(); await pg.wait_for_timeout(300)
    check(not await a.visible('#media-stage'), 'player removed after stopping')

@test('YouTube', 'invalid', 'Embedding not allowed: falls back to your songs/beeps')
async def t_yt_error(a):
    pg = await a.open(clock=False, youtube='error', seed={'fl:music': {'source': 'youtube'}, 'fl:youtube': {'url': 'x', 'listId': 'PLtest', 'videoId': None}})
    await a.fire_direct(); await pg.wait_for_timeout(800)
    check(await a.js('features/music.js', 'm.status().playing') == 'beeps', 'fallback')
    check('embedding' in await a.js('features/music.js', 'm.status().lastFallback.reason'), 'reason recorded')

@test('YouTube', 'invalid', 'Player never starts (blocked autoplay): falls back within 8 seconds')
async def t_yt_blocked(a):
    pg = await a.open(clock=False, youtube='blocked', seed={'fl:music': {'source': 'youtube'}, 'fl:youtube': {'url': 'x', 'listId': 'PLtest', 'videoId': None}})
    await a.fire_direct(); await pg.wait_for_timeout(9000)
    check(await a.js('features/music.js', 'm.status().playing') == 'beeps', 'fallback after timeout')
    check(not await a.visible('#media-stage'), 'stalled player removed')

# ---------- Settings & data
@test('Data', 'valid', 'Erase all data asks first, then resets everything')
async def t_erase(a):
    pg = await a.open(clock=False)
    await a.js('features/tasks.js', '(m.remove("t1"), true)')
    await a.tab('settings'); await pg.click('[data-ref=reset]')
    await pg.click('.sheet [data-i="0"]'); await pg.wait_for_timeout(1200)
    check(len(await a.js('features/tasks.js', 'm.all()')) == 3, 'defaults restored')

@test('Data', 'invalid', 'Choosing "Keep my data" erases nothing')
async def t_erase_cancel(a):
    pg = await a.open()
    await a.js('features/tasks.js', '(m.remove("t1"), true)')
    await a.tab('settings'); await pg.click('[data-ref=reset]')
    await pg.click('.sheet [data-i="1"]'); await pg.wait_for_timeout(300)
    check(len(await a.js('features/tasks.js', 'm.all()')) == 2, 'data kept')

@test('Data', 'valid', 'Data from the original Proof of Wake build is carried over')
async def t_migrate(a):
    old = {'alarmTime': '05:45', 'armed': None, 'tasks': [{'id': 'x1', 'name': 'Old task', 'proof': 'a sock', 'gapMin': 2}], 'checkinMin': 7, 'checkinWin': 90, 'songQueue': [], 'lastSong': None, 'stats': {'streak': 4, 'best': 9, 'wins': 12, 'lastWin': None, 'history': []}}
    await a.open(seed={'pow:cfg': old})
    r = await a.js('features/tasks.js', 'm.all().map(t => t.name)')
    check(r == ['Old task'], f'tasks {r}')
    check(await a.js('features/alarm.js', 'm.status().time') == '05:45', 'time carried over')
    check(await a.js('features/stats.js', 'm.get().best') == 9, 'best streak carried over')

@test('Data', 'valid', 'Offline: after one visit, the app opens with no connection')
async def t_offline(a):
    pg = await a.open(clock=False, sw='allow')
    await pg.wait_for_timeout(1500)
    await pg.reload(); await pg.wait_for_timeout(1500)
    await a.ctx.set_offline(True)
    await pg.reload(); await pg.wait_for_timeout(1000)
    check(await pg.title() == 'SoulWake' and await a.visible('[data-ref=clock]'), 'loads offline')

@test('Data', 'valid', 'Every app file is in the offline cache list')
async def t_cache_list(a):
    sw = (WEB / 'sw.js').read_text()
    files = [str(p.relative_to(WEB)) for d in ('js', 'fonts', 'css', 'sounds') for p in (WEB / d).rglob('*') if p.suffix in ('.js', '.woff2', '.css', '.mp3')]
    missing = [f for f in files if f"'./{f}'" not in sw]
    check(not missing, f'not cached: {missing}')


# ================================================================== phase 3
from datetime import datetime, timezone, timedelta
IST = timezone(timedelta(hours=5, minutes=30))
def ist(y, mo, d, h, mi=0, s=0):
    return datetime(y, mo, d, h, mi, s, tzinfo=IST)
def ms(dt):
    return int(dt.timestamp() * 1000)
NO_PROMPTS = {'fl:sleep': {'prompts': False}}

# ---------- Onboarding
@test('Onboarding', 'valid', 'First run: setup walks through name, logo, colour, theme, font, style, sleep; choices are saved')
async def t_onboard(a):
    pg = await a.open(onboarded=False, clock=False)
    check(await a.visible('#onboarding'), 'setup shown on first run')
    await pg.fill('#onboarding [data-ref=name]', 'Priya'); await pg.click('[data-ob=next]'); await pg.wait_for_timeout(150)
    await pg.click('[data-ob=next]'); await pg.wait_for_timeout(150)   # step 2: buddy PIN (skipped)
    for kind, value in [('logo', 'soulwake'), ('accent', 'rose'), ('theme', 'midnight'), ('font', 'modern'), ('style', 'soft')]:
        await pg.click(f'[data-pick={kind}][data-value={value}]'); await pg.wait_for_timeout(120)
        check(await pg.evaluate(f"document.documentElement.dataset.{kind if kind != 'logo' else 'theme'} !== undefined"), 'applied live')
        await pg.click('[data-ob=next]'); await pg.wait_for_timeout(150)
    await pg.fill('#onboarding [data-ref=bed]', '23:30'); await pg.dispatch_event('#onboarding [data-ref=bed]', 'change')
    await pg.fill('#onboarding [data-ref=wake]', '05:45'); await pg.dispatch_event('#onboarding [data-ref=wake]', 'change')
    await pg.click('[data-ob=next]'); await pg.wait_for_timeout(200)
    check('All set, Priya' in await pg.inner_text('#onboarding'), 'done step greets by name')
    await pg.click('[data-ob=next]'); await pg.wait_for_timeout(500)
    check(not await a.visible('#onboarding'), 'setup closes')
    p = await a.js('features/profile.js', 'm.get()')
    check(p['name'] == 'Priya' and p['logo'] == 'soulwake' and p['accent'] == 'rose' and p['theme'] == 'midnight' and p['font'] == 'modern' and p['style'] == 'soft' and p['onboarded'], f'profile {p}')
    check(await a.js('features/alarm.js', 'm.status().time') == '05:45', 'alarm set to the wake-up time')
    check(await a.js('features/sleep.js', 'm.get().schedule.bed') == '23:30', 'bedtime saved')
    await pg.reload(); await pg.wait_for_timeout(500)
    check(not await a.visible('#onboarding'), 'setup not shown again')
    check('Priya' in await pg.inner_text('.greet'), 'Pip greets by name on the next open')

@test('Onboarding', 'valid', 'Skipping the name works; Back keeps earlier choices')
async def t_onboard_skip(a):
    pg = await a.open(onboarded=False, clock=False)
    await pg.click('[data-ob=skip]'); await pg.wait_for_timeout(150)
    await pg.click('[data-ob=next]'); await pg.wait_for_timeout(150)   # skip the buddy PIN
    await pg.click('[data-pick=logo][data-value=bell]'); await pg.click('[data-ob=next]'); await pg.wait_for_timeout(150)
    await pg.click('[data-ob=back]'); await pg.wait_for_timeout(150)
    check(await pg.get_attribute('[data-pick=logo][data-value=bell]', 'aria-pressed') == 'true', 'choice kept after Back')
    check(await a.js('features/profile.js', 'm.get().name') == '', 'no name saved')

@test('Onboarding', 'invalid', 'Names are cleaned: no HTML, extra spaces, or over-long text')
async def t_name_clean(a):
    await a.open()
    r = await a.js('features/profile.js', "[m.set('name', '  <b>Bob</b>   the    great builder of everything  '), m.set('petName', '   '), m.set('name', '')]")
    check('<' not in r[0] and '>' not in r[0] and len(r[0]) <= 24 and '  ' not in r[0], f'cleaned name {r[0]!r}')
    check(r[1] == 'Pip', 'blank pet name falls back to Pip')
    check(r[2] == '', 'empty name allowed')

@test('Pip', 'valid', 'Pip is the SoulWake smiley in every pose; old Owl and Tiger logos become SoulWake (same home-screen icon)')
async def t_pebble(a):
    pg = await a.open(seed={'fl:profile': {'name': 'Priya', 'onboarded': True, 'logo': 'tiger'}}, native={})
    check(await a.js('features/profile.js', 'm.get().logo') == 'soulwake', 'tiger logo migrated to SoulWake')
    poses = await a.js('ui/art.js', 'm.POSES')
    for pose in poses:
        svg = await a.js('ui/art.js', f"m.petSVG('{pose}')")
        check(svg.startswith('<svg') and m_pebble(svg), f'{pose} drawn as the pebble')
    check(await pg.query_selector('.sky-card .pet-card svg.pet'), 'Pip sits in the sky on Today')
    body = (await pg.inner_text('body')).lower()
    check('tiger' not in body and 'owl' not in body and '🐯' not in body, 'no tiger or owl left')
    icons = [c['args']['name'] for c in await first_light(a, 'setIcon')]
    check(icons and icons[0] == 'owl', f'icon re-synced once after the update: {icons}')
    await a.tab('settings', 'look')
    await pg.click('[data-pick=logo][data-value=bell]'); await pg.wait_for_timeout(100)
    await pg.click('[data-pick=logo][data-value=soulwake]'); await pg.wait_for_timeout(100)
    icons = [c['args']['name'] for c in await first_light(a, 'setIcon')]
    check(icons[-2:] == ['bell', 'owl'], f'SoulWake uses the existing launcher entry: {icons}')
    a2 = App(a.browser); await a2.open(seed={'fl:profile': {'name': 'P', 'onboarded': True, 'logo': 'owl'}})
    check(await a2.js('features/profile.js', 'm.get().logo') == 'soulwake', 'owl too'); await a2.close()

def m_pebble(svg):
    return 'M50 13C68 13' in svg or 'M50 22C69 22' in svg

@test('Onboarding', 'invalid', 'Unknown look choices are refused; corrupted profile is repaired')
async def t_profile_invalid(a):
    await a.open(seed={'fl:profile': {'name': 'X', 'onboarded': True, 'theme': 'neon', 'font': 'comic-sans'}})
    p = await a.js('features/profile.js', 'm.get()')
    check(p['theme'] == 'midnight' and p['font'] == 'classic', f'repaired {p}')
    r = await a.js('features/profile.js', "[m.set('theme', 'neon'), m.set('accent', ''), m.set('hacker', 1)]")
    check(r == [None, None, None], f'refused {r}')

# ---------- Personalisation
@test('Look & feel', 'valid', 'All 3,456 combinations (4 logos × 4 colours × 9 themes × 8 fonts × 3 styles) apply and stay readable')
async def t_all_combos(a):
    pg = await a.open(clock=False)
    res = await pg.evaluate("""async () => {
      const prof = await import('./js/features/profile.js'); const th = await import('./js/ui/theme.js'); const art = await import('./js/ui/art.js');
      const C = prof.CHOICES; const fails = []; let n = 0; const minC = {};
      const FAM = { classic: 'Bodoni Moda', modern: 'DM Serif Display', friendly: 'Nunito', typewriter: 'Courier Prime', techy: 'JetBrains Mono', kids: 'Fredoka', formal: 'Cinzel', noir: 'Limelight' };
      const RAD = { elegant: '12px', soft: '999px', bold: '6px' };
      const btn = document.querySelector('.btn.line, .btn.gold'); const h1 = document.querySelector('h1') || document.querySelector('.home-hero .clock');
      const note = (k, v) => { if (!(k in minC) || v < minC[k]) minC[k] = Math.round(v * 100) / 100; };
      for (const theme of C.theme) for (const accent of C.accent) for (const font of C.font) for (const style of C.style) for (const logo of C.logo) {
        prof.setMany({ theme, accent, font, style, logo }); n++;
        const root = document.documentElement, cs = getComputedStyle(root), v = (k) => cs.getPropertyValue(k).trim();
        const d = root.dataset;
        if (d.theme !== theme || d.accent !== accent || d.font !== font || d.style !== style) fails.push(`${theme}/${accent}/${font}/${style}: attributes`);
        const pairs = { 'text/bg': [v('--text'), v('--bg')], 'text/surface': [v('--text'), v('--surface')], 'text-2/bg': [v('--text-2'), v('--bg')], 'muted/surface-2': [v('--muted'), v('--surface-2')],
          'accent-text/bg': [v('--accent-text'), v('--bg')], 'accent-text/surface-2': [v('--accent-text'), v('--surface-2')], 'on-accent/accent': [v('--on-accent'), v('--accent')], 'danger/surface': [v('--danger'), v('--surface')] };
        for (const [k, [x, y]] of Object.entries(pairs)) { const c = th.contrast(x, y); note(k, c); if (c < 4.5) fails.push(`${theme}/${accent}: ${k} ${c.toFixed(2)}`); }
        const fam = getComputedStyle(document.querySelector('.home-hero .clock')).fontFamily;
        if (!fam.includes(FAM[font])) fails.push(`${font}: clock font ${fam}`);
        if (btn && getComputedStyle(btn).borderTopLeftRadius !== RAD[style]) fails.push(`${style}: radius ${getComputedStyle(btn).borderTopLeftRadius}`);
        if (!art.logoSVG(logo, th.artColours()).includes('<svg')) fails.push(`${logo}: logo`);
      }
      return { n, fails: [...new Set(fails)].slice(0, 15), minC };
    }""")
    check(res['n'] == 3456, f"ran {res['n']} combinations")
    check(not res['fails'], f"problems: {res['fails']}")

@test('Look & feel', 'valid', 'Every bundled font file loads')
async def t_fonts_all(a):
    pg = await a.open(clock=False)
    r = await pg.evaluate("""async () => {
      const specs = ['500 20px "Bodoni Moda"', '600 20px "Bodoni Moda"', '700 20px "Bodoni Moda"', 'italic 500 20px "Bodoni Moda"', '400 18px "EB Garamond"', 'italic 400 18px "EB Garamond"', '600 18px "EB Garamond"',
        '400 20px "DM Serif Display"', '400 18px "DM Sans"', '700 18px "DM Sans"', '400 18px "Nunito"', '800 18px "Nunito"', '400 18px "Courier Prime"', '700 18px "Courier Prime"',
        '400 18px "Space Grotesk"', '700 18px "Space Grotesk"', '500 18px "JetBrains Mono"', '400 18px "Fredoka"', '600 18px "Fredoka"', '600 18px "Cinzel"',
        '500 18px "Cormorant Garamond"', '600 18px "Cormorant Garamond"', 'italic 500 18px "Cormorant Garamond"', '400 18px "Limelight"', '400 18px "Josefin Sans"', '600 18px "Josefin Sans"'];
      const out = {}; for (const sp of specs) out[sp] = (await document.fonts.load(sp)).length; return out; }""")
    bad = [k for k, v in r.items() if v == 0]
    check(not bad, f'fonts not loading: {bad}')

@test('Look & feel', 'valid', 'Changing theme, font and logo in Settings is saved across a restart')
async def t_settings_look(a):
    pg = await a.open(clock=False)
    await a.tab('settings')
    await pg.click('[data-group=look] [data-pick=theme][data-value=ivory]'); await pg.wait_for_timeout(200)
    await pg.click('[data-group=look] [data-pick=font][data-value=typewriter]'); await pg.wait_for_timeout(100)
    await pg.click('[data-group=look] [data-pick=logo][data-value=crescent]'); await pg.wait_for_timeout(100)
    await pg.reload(); await pg.wait_for_timeout(500)
    d = await pg.evaluate('({...document.documentElement.dataset})')
    check(d['theme'] == 'ivory' and d['font'] == 'typewriter', f'saved {d}')
    bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor")
    check(bg == 'rgb(247, 241, 234)', f'ivory background applied: {bg}')

# ---------- Messages
@test('Messages', 'valid', 'A 4:00 alarm gets “Oho! … early riser” — every day')
async def t_msg_early(a):
    pg = await a.open(clock=False)
    r = await a.js('features/messages.js', "[...Array(14)].map((_, i) => m.alarmMessage('04:00', { date: new Date(2026, 9, 5 + i) }))")
    check(all('Oho' in x for x in r), f'messages {set(r)}')
    await pg.fill('[data-ref=time]', '04:00'); await pg.dispatch_event('[data-ref=time]', 'change'); await pg.wait_for_timeout(150)
    check('oho' in (await pg.inner_text('[data-ref=msg]')).lower(), 'shown on the Alarm tab')  # may start with your name: “Priya, oho! …”

@test('Messages', 'valid', 'Messages change by day and time, mention streaks, and handle weekends')
async def t_msg_vary(a):
    await a.open(clock=False)
    r = await a.js('features/messages.js', """({
      days: new Set([...Array(10)].map((_, i) => m.alarmMessage('07:00', { date: new Date(2026, 9, 5 + i) }))).size,
      owl: m.alarmMessage('03:00', { date: new Date(2026, 9, 7) }),
      late: m.alarmMessage('11:00', { date: new Date(2026, 9, 7) }),
      streak: m.alarmMessage('07:00', { date: new Date(2026, 9, 7), streak: 5 }),
      junk: m.alarmMessage('garbage'),
      hello: [2, 9, 14, 19, 23].map((h) => m.greeting('Priya', h))
    })""")
    check(r['days'] >= 2, 'varies day to day')
    check('🌌' in r['owl'] or 'Legendary' in r['owl'] or 'Bold' in r['owl'], f"very early line {r['owl']}")
    check('Streak: 5 🔥' in r['streak'], 'streak mentioned')
    check(isinstance(r['junk'], str) and len(r['junk']) > 5, 'bad input still gives a message')
    check(r['hello'][1].startswith('Good morning, Priya') and r['hello'][3].startswith('Good evening') and 'late' in r['hello'][0].lower(), f"greetings {r['hello']}")

# ---------- Pip
@test('Pip', 'valid', 'Pip’s mood follows your behaviour (happy, ecstatic, grumpy, sulking, sleepy)')
async def t_pet_moods(a):
    await a.open(clock=False)
    r = await a.js('features/pet.js', """[
      m.moodFor({ hour: 9, streak: 8, wins: 8, provenToday: true, snoozesToday: 0, missesToday: 0, morningActive: false }),
      m.moodFor({ hour: 9, streak: 3, wins: 3, provenToday: true, snoozesToday: 0, missesToday: 0, morningActive: false }),
      m.moodFor({ hour: 7, streak: 3, wins: 3, provenToday: false, snoozesToday: 1, missesToday: 0, morningActive: true }),
      m.moodFor({ hour: 15, streak: 0, wins: 4, provenToday: false, snoozesToday: 0, missesToday: 0, morningActive: false }),
      m.moodFor({ hour: 23, streak: 2, wins: 2, provenToday: false, snoozesToday: 0, missesToday: 0, morningActive: false }),
      m.moodFor({ hour: 12, streak: 0, wins: 0, provenToday: false, snoozesToday: 0, missesToday: 0, morningActive: false })]""")
    check(r == ['ecstatic', 'happy', 'grumpy', 'sulking', 'sleepy', 'neutral'], f'moods {r}')

@test('Pip', 'valid', 'Pip turns grumpy after a real snooze, and answers when poked')
async def t_pet_grumpy(a):
    pg = await a.open(at=ms(ist(2026, 10, 14, 7)))
    await a.fire_direct(test=False)
    await pg.click('#morning [data-ref=snooze]'); await pg.wait_for_timeout(200)
    check(await a.js('features/pet.js', 'm.current()') == 'grumpy', 'grumpy after snooze')
    await pg.click('#morning [data-ref=up]'); await a.type_phrase()
    await a.js('features/morning.js', '(m.close(), true)'); await pg.wait_for_timeout(200)
    await a.tab('alarm')
    check(await pg.query_selector('.pet-card .pet-grumpy'), 'grumpy Pip on the Alarm tab')
    before = await pg.inner_text('.pet-card .bubble p')
    await pg.click('.pet-card .pet-hit'); await pg.wait_for_timeout(100)
    check(await pg.inner_text('.pet-card .bubble p') != before, 'poke gives a new line')

@test('Pip', 'valid', 'Opening the app: Pip leaps in with “Good morning, Priya”, then the app appears; tap skips')
async def t_greet(a):
    pg = await a.open(greet=True, at=ms(ist(2026, 10, 14, 9)))
    check('Good morning, Priya' in await pg.inner_text('.greet'), 'greeting shown')
    await a.tick(2600)
    check(not await pg.query_selector('.greet'), 'greeting goes away by itself')
    await pg.reload(); await pg.wait_for_timeout(300)
    await pg.click('.greet'); await a.tick(500)
    check(not await pg.query_selector('.greet'), 'tap skips it')

# ---------- Sleep
@test('Sleep', 'valid', '“Going to sleep” at 23:00, alarm stopped 7.5 h later: night logged as a little short')
async def t_sleep_track(a):
    pg = await a.open(seed=NO_PROMPTS, at=ms(ist(2026, 10, 13, 23)))
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    check('Sweet dreams' in await a.toast_text(), 'friendly confirmation')
    await pg.clock.fast_forward(int(7.5 * 3600 * 1000)); await pg.wait_for_timeout(200)
    await a.fire_direct(test=False); await a.type_phrase()
    n = await a.js('features/sleep.js', 'm.get().nights[0]')
    check(n and abs(n['hours'] - 7.5) < 0.05, f'night {n}')
    check(await a.js('features/sleep.js', 'm.classify(7.5).key') == 'bit-short', 'classified a little short')
    await a.js('features/morning.js', '(m.close(), true)'); await a.tab('sleep')
    hero = await pg.inner_text('.sleep-hero')
    check('7h 30m' in hero and '94% of your 8 h goal' in hero and 'A little short' in hero, f'Sleep tab shows last night: {hero!r}')

@test('Sleep', 'valid', 'A short night shows the research-backed day plan; tips can be ticked off')
async def t_recovery(a):
    pg = await a.open(seed=NO_PROMPTS, at=ms(ist(2026, 10, 14, 7)))
    await a.js('features/sleep.js', '(m.goingToSleep(Date.now() - 5 * 3600e3), true)')
    await a.fire_direct(test=False); await a.type_phrase()
    await a.js('features/morning.js', '(m.close(), true)'); await pg.wait_for_timeout(200)
    await a.tab('alarm')
    check('Short night? See your plan' in await pg.inner_text('[data-ref=plan]'), 'Today links to the plan')
    await pg.click('[data-tab=alarm] [data-ref=plan]'); await pg.wait_for_timeout(300)
    check(await pg.is_visible('[data-tab=sleep]') and await a.visible('.recovery'), 'plan shown on Sleep after 5 h')
    check(len(await pg.query_selector_all('.recovery .tips li')) == 7, 'seven tips')
    await pg.click('.recovery [data-tip=stairs]'); await pg.wait_for_timeout(100)
    check('1/7' in await pg.inner_text('.recovery'), 'progress updates')
    await pg.click('.recovery [data-open=coffee]'); await pg.wait_for_timeout(100)
    href = await pg.get_attribute('.recovery .why [data-url]', 'data-url')
    check(href and href.startswith('https://'), 'source link shown')
    await pg.reload(); await pg.wait_for_timeout(400); await pg.evaluate("document.querySelector('.greet')?.remove()")
    await a.tab('sleep')
    check('1/7' in await pg.inner_text('.recovery'), 'ticks saved')

@test('Sleep', 'invalid', 'Nonsense nights aren’t logged (under 1 h or over 16 h); a good night hides the plan')
async def t_sleep_invalid(a):
    pg = await a.open(seed=NO_PROMPTS)
    r = await a.js('features/sleep.js', "[(m.goingToSleep(Date.now() - 30*60e3), m.recordWake()), (m.goingToSleep(Date.now() - 20*3600e3), m.recordWake()), m.get().nights.length]")
    check(r == [None, None, 0], f'not logged {r}')
    await a.js('features/sleep.js', '(m.goingToSleep(Date.now() - 8 * 3600e3), m.recordWake(), true)')
    await a.tab('sleep')
    check(not await a.visible('.recovery'), 'no plan after 8 h')
    await a.tab('alarm')
    check(not await a.visible('[data-tab=alarm] [data-ref=plan]'), 'no link on Today either')

@test('Sleep', 'invalid', 'Schedule rejects bad times; the goal can go as low as 1 h (never 0 or negative) and up to 12 h')
async def t_sleep_schedule(a):
    await a.open(seed=NO_PROMPTS)
    r = await a.js('features/sleep.js', "[m.setSchedule({ bed: '25:00' }).bed, m.setSchedule({ wake: 'soon' }).wake, m.setSchedule({ goal: 14 }).goal, m.setSchedule({ goal: 3 }).goal, m.setSchedule({ goal: 7.3 }).goal, m.setSchedule({ goal: 'x' }).goal, m.setSchedule({ goal: -4 }).goal, m.setSchedule({ goal: 0 }).goal, m.setSchedule({ goal: null }).goal, m.setSchedule({ goal: 4.5 }).goal]")
    check(r == ['23:00', '06:30', 12, 3, 7.5, 7.5, 1, 1, 1, 4.5], f'schedule {r}')

@test('Sleep', 'valid', 'Sleep goal stepper goes down to 1 h in Settings, with a kind note under 5 h; a 4 h night on a 4 h goal counts as rested')
async def t_sleep_goal_low(a):
    pg = await a.open(seed=NO_PROMPTS)
    await a.tab('settings', 'sleep')
    for _ in range(20):
        await pg.click('[data-stepper=goal] [data-d="-1"]', force=True)
    check(await a.js('features/sleep.js', 'm.get().schedule.goal') == 1, 'stops at 1 h')
    check(await pg.is_disabled('[data-stepper=goal] [data-d="-1"]'), 'minus disabled at 1 h')
    check('tough schedule' in await pg.inner_text('[data-ref=goalNote]'), 'kind note for a low goal')
    r = await a.js('features/sleep.js', "[m.classify(4, 4).key, m.classify(3.6, 4).key, m.classify(2.5, 4).key]")
    check(r == ['good', 'bit-short', 'short'], f'classified against a low goal: {r}')

@test('Sleep', 'valid', 'Bedtime nudge: “In 30 minutes” reminds you; “Going to sleep” then a gentle “still awake?”')
async def t_bedtime_flow(a):
    pg = await a.open(at=ms(ist(2026, 10, 14, 22, 59, 30)))
    await a.tick(40_000)
    check('Heading to bed, Priya' in await pg.inner_text('.sheet'), 'bedtime nudge')
    await pg.click('.sheet [data-i="1"]'); await pg.wait_for_timeout(150)
    check('remind you in 30' in await a.toast_text(), '“Okie, I’ll remind you in 30”')
    await a.tick(30 * 60_000 + 2000)
    check('30 minutes are up' in await pg.inner_text('.sheet'), 'reminder after 30 min')
    await pg.click('.sheet [data-i="0"]'); await pg.wait_for_timeout(150)
    bed = await a.js('features/sleep.js', 'm.get().pending.bedAt')
    check(bed, 'bedtime noted')
    await a.tick(30 * 60_000 + 2000)
    check('Drifting off' in await pg.inner_text('.sheet'), 'gentle check after 30 min')
    await pg.click('.sheet [data-i="0"]'); await pg.wait_for_timeout(150)
    check(await a.js('features/sleep.js', 'm.get().pending.bedAt') > bed, '“Still awake” moves bedtime later')

@test('Sleep', 'invalid', '“Not tonight” stops nudges for the night; “still awake?” can be turned off')
async def t_bedtime_off(a):
    pg = await a.open(at=ms(ist(2026, 10, 14, 22, 59, 30)), seed={'fl:sleep': {'asleepCheck': 'off'}})
    await a.tick(40_000)
    await pg.click('.sheet [data-i="2"]'); await pg.wait_for_timeout(150)
    await a.tick(60 * 60_000)
    check(not await pg.query_selector('.sheet'), 'no more nudges tonight')
    await a.js('features/sleep.js', '(m.goingToSleep(), true)')
    await a.tick(31 * 60_000)
    check(not await pg.query_selector('.sheet'), 'no “still awake?” when off')

def nights_seed(end, count, hours):
    out = []
    for i in range(count):
        wake = end - timedelta(days=i + 1) + timedelta(hours=7 - end.hour)
        out.append({'date': wake.strftime('%Y-%m-%d'), 'bedAt': ms(wake - timedelta(hours=hours)), 'wakeAt': ms(wake), 'hours': hours})
    return out

@test('Sleep', 'valid', 'Saturday after a short week: suggests a Sunday sleep-in (capped at 2 h) and moves the alarm in one tap')
async def t_sunday(a):
    sat = ist(2026, 10, 17, 15)
    pg = await a.open(at=ms(sat), seed={'fl:sleep': {'prompts': False, 'nights': nights_seed(sat, 5, 6)}})
    adv = await a.js('features/sleep.js', 'm.sundayAdvice()')
    check(adv and adv['minutes'] == 120 and adv['debt'] == 10, f'advice {adv}')
    await a.tab('sleep')
    check('Sunday sleep-in' in await pg.inner_text('.sleep-card'), 'card shown')
    await a.sleep_click('[data-ref=sleepin]'); await pg.wait_for_timeout(150)
    check(await a.js('features/alarm.js', "m.status().overrides['2026-10-18']") == '08:30', 'Sunday alarm 06:30 → 08:30')
    await a.js('features/alarm.js', '(m.arm(), true)'); await pg.wait_for_timeout(200)
    await pg.click('#night [data-ref=back]')  # arming opens the night screen in the browser version
    armed = await a.js('features/alarm.js', 'm.status().armedAt')
    check(armed == ms(ist(2026, 10, 18, 8, 30)), 'armed for Sunday 08:30')
    await a.sleep_click('[data-ref=undo]'); await pg.wait_for_timeout(150)
    check(await a.js('features/alarm.js', 'm.status().armedAt') == ms(ist(2026, 10, 18, 6, 30)), 'back to 06:30')

@test('Sleep', 'invalid', 'No sleep-in advice midweek, with too few nights, or after a good week')
async def t_sunday_none(a):
    wed = ist(2026, 10, 14, 15)
    await a.open(at=ms(wed), seed={'fl:sleep': {'prompts': False, 'nights': nights_seed(wed, 5, 6)}})
    check(await a.js('features/sleep.js', 'm.sundayAdvice()') is None, 'not on Wednesday')
    await a.close()
    sat = ist(2026, 10, 17, 15)
    a2 = App(a.browser); await a2.open(at=ms(sat), seed={'fl:sleep': {'prompts': False, 'nights': nights_seed(sat, 2, 5)}})
    check(await a2.js('features/sleep.js', 'm.sundayAdvice()') is None, 'not with only 2 nights'); await a2.close()
    a3 = App(a.browser); await a3.open(at=ms(sat), seed={'fl:sleep': {'prompts': False, 'nights': nights_seed(sat, 6, 8)}})
    check(await a3.js('features/sleep.js', 'm.sundayAdvice()') is None, 'not after a good week'); await a3.close()

@test('Sleep', 'invalid', 'One-off alarm times reject bad dates and times; old ones are cleaned up')
async def t_override_invalid(a):
    await a.open(at=ms(ist(2026, 10, 14, 12)))
    r = await a.js('features/alarm.js', "[m.setOverride('tomorrow', '08:00'), m.setOverride('2026-10-18', '25:00'), m.setOverride('2026-10-01', '08:00'), Object.keys(m.status().overrides)]")
    check(r[0] is False and r[1] is False, f'bad input refused {r}')
    check('2026-10-01' not in r[3], 'past override removed')

@test('Sleep', 'valid', 'This week’s sleep chart shows each night against the goal')
async def t_sleep_chart(a):
    now = ist(2026, 10, 14, 15)
    pg = await a.open(at=ms(now), seed={'fl:sleep': {'prompts': False, 'nights': nights_seed(now, 4, 6) + [{'date': '2026-10-09', 'bedAt': ms(ist(2026, 10, 8, 23)), 'wakeAt': ms(ist(2026, 10, 9, 8)), 'hours': 9}]}})
    await a.tab('sleep')
    bars = await pg.query_selector_all('[data-tab=sleep] .sleep-chart .bar')
    check(len(bars) == 5, f'{len(bars)} bars')
    check(len(await pg.query_selector_all('[data-tab=sleep] .sleep-chart .bar.short')) == 4, 'short nights marked')
    check('6.6 h average' in await pg.inner_text('[data-tab=sleep]'), 'average shown')
    hero = await pg.inner_text('.sleep-hero')
    check('LAST NIGHT' in hero.upper(), f'last night card: {hero!r}')

# ---------- Sounds
@test('Sounds', 'valid', 'Every alarm and notification sound file is bundled')
async def t_sound_files(a):
    pg = await a.open(clock=False)
    r = await pg.evaluate("""async () => { const s = await import('./js/features/sounds.js');
      const files = [...s.ALARM_SOUNDS.map((x) => 'sounds/alarm_' + x.id + '.mp3'), ...s.SHORT_SOUNDS.map((x) => 'sounds/note_' + x.id + '.mp3'), 'sounds/note_warm.mp3'];
      return Promise.all(files.map(async (f) => [f, (await fetch(f)).status])); }""")
    bad = [f for f, st in r if st != 200]
    check(not bad, f'missing {bad}')

@test('Sounds', 'invalid', 'Choosing sounds: valid picks are saved and previewed, unknown ones refused')
async def t_sound_pick(a):
    pg = await a.open(clock=False)
    r = await a.js('features/sounds.js', "[m.set('checkin', 'marimba'), m.set('checkin', 'airhorn'), m.set('alarm', 'chime'), m.set('volume', 'bell')]")
    check(r == ['marimba', None, None, None], f'picks {r}')
    await a.tab('settings')
    await pg.click('[data-sounds=message] [data-sound=harp]'); await pg.wait_for_timeout(150)
    await pg.reload(); await pg.wait_for_timeout(400)
    check(await a.js('features/sounds.js', 'm.get().message') == 'harp', 'saved')

@test('Sounds', 'valid', 'Check-in plays your chosen sound in a loop (not beeps)')
async def t_checkin_sound(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    ok = await a.js('features/sounds.js', 'await m.startLoop("checkin")')
    await a.js('features/sounds.js', '(m.stopLoop(), true)')
    check(ok is True, 'sound file plays')
    await a.fire_direct(); await a.type_phrase(); await a.tick(5 * 60_000 + 1000); await pg.wait_for_timeout(300)
    check(await a.visible('#checkin'), 'check-in open')
    check(not await a.js('services/audio.js', 'm.isBeeping()'), 'no fallback beeps')

# ---------- Android app (fake bridge)
async def first_light(a, method):
    return [c for c in await a.native_calls(method) if c['plugin'] == 'FirstLight']

@test('Android', 'valid', 'Arming schedules Android’s alarm (repeats daily) and hands over today’s song; disarm cancels')
async def t_native_arm(a):
    pg = await a.open(native={}, battery=(0.12, False))
    await a.tab('sounds'); await pg.set_input_files('[data-ref=songInput]', [str(FIX / 'song-a.wav')]); await pg.wait_for_timeout(400)
    await a.tab('alarm'); await a.arm_by_keyboard(); await pg.wait_for_timeout(500)
    check(not await pg.query_selector('.sheet'), 'no battery warning in the app')
    check(not await a.visible('#night'), 'no night screen in the app')
    sch = [c['args'] for c in await first_light(a, 'schedule') if c['args']['id'] == 'wake']
    check(sch and sch[-1]['repeatDaily'] and sch[-1]['kind'] == 'wake', f'scheduled {sch}')
    files = [c['args'] for c in await first_light(a, 'setSoundFile') if c['args']['which'] == 'alarm']
    check(files and files[-1]['base64'] != '<0 chars>', 'song handed to Android')
    await pg.click('[data-ref=disarm]'); await pg.wait_for_timeout(200)
    check(any(c['args']['id'] == 'wake' for c in await first_light(a, 'cancel')), 'cancelled on disarm')

@test('Android', 'valid', 'Test alarm is scheduled with Android for 10 seconds from now')
async def t_native_test(a):
    pg = await a.open(native={}, clock=False)
    await pg.click('[data-ref=test]'); await pg.wait_for_timeout(300)
    t = [c['args'] for c in await first_light(a, 'schedule') if c['args']['id'] == 'test']
    now = await pg.evaluate('Date.now()')
    check(t and 8000 < t[-1]['at'] - now < 11000, f'test scheduled {t}')

@test('Android', 'valid', 'Android rings → app shows the alarm; stopping it silences Android')
async def t_native_ring(a):
    pg = await a.open(native={}, clock=False)
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await pg.wait_for_timeout(500)
    check(await a.phase() == 'ringing', 'ringing screen')
    check(await first_light(a, 'ring'), 'Android asked to ring')
    await a.type_phrase(); await pg.wait_for_timeout(200)
    check(await first_light(a, 'stopRinging'), 'Android silenced')

@test('Android', 'valid', 'Opened from the lock-screen alarm: the alarm screen is ready immediately')
async def t_native_launch(a):
    await a.open(native={'launch': {'kind': 'wake'}}, clock=False)
    await a.pg.wait_for_timeout(400)
    check(await a.phase() == 'ringing', 'ringing on open')

@test('Android', 'valid', 'Snooze is handed to Android, and its alarm brings the ring back')
async def t_native_snooze(a):
    pg = await a.open(native={}, clock=False)
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await pg.wait_for_timeout(400)
    await pg.click('#morning [data-ref=snooze]'); await pg.wait_for_timeout(200)
    check(any(c['args']['id'] == 'snooze' for c in await first_light(a, 'schedule')), 'snooze scheduled')
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'snooze' })"); await pg.wait_for_timeout(300)
    check(await a.phase() == 'ringing', 'rings again')

@test('Android', 'valid', 'Check-in: scheduled with Android; answering cancels it; missing it plays the punishment ring')
async def t_native_checkin(a):
    pg = await a.open(native={}, seed={'fl:tasks': ONE_TASK})
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await pg.wait_for_timeout(400)
    await a.type_phrase()
    check(any(c['args']['id'] == 'checkin' for c in await first_light(a, 'schedule')), 'check-in scheduled')
    await a.tick(5 * 60_000 + 1000); await a.tick(61_000); await pg.wait_for_timeout(300)
    rings = [c['args']['kind'] for c in await first_light(a, 'ring')]
    check('punish' in rings, f'punishment ring {rings}')
    await a.type_phrase(); await a.tick(5 * 60_000 + 1000)
    await pg.click('#checkin [data-ref=yes]'); await pg.wait_for_timeout(200)
    check(any(c['args']['id'] == 'checkin' for c in await first_light(a, 'cancel')), 'check-in cancelled after answering')

@test('Android', 'valid', 'Bedtime nudges are scheduled daily with Android; turning them off cancels')
async def t_native_bedtime(a):
    pg = await a.open(native={}, clock=False)
    sch = [c['args'] for c in await first_light(a, 'schedule') if c['args']['id'] == 'bedtime']
    check(sch and sch[-1]['repeatDaily'] and sch[-1]['kind'] == 'bedtime', f'bedtime {sch}')
    await a.tab('settings')
    await pg.click('[data-group=sleep] [data-switch=prompts]'); await pg.wait_for_timeout(150)
    check(any(c['args']['id'] == 'bedtime' for c in await first_light(a, 'cancel')), 'cancelled')
    await pg.click('[data-seg=asleep] [data-value=silent]'); await pg.wait_for_timeout(150)
    check(any(c['args'].get('asleep') == 'silent' for c in await first_light(a, 'setSounds')), 'silent check sent to Android')

@test('Android', 'valid', 'Bedtime answers given on the notification (app closed) count toward sleep tracking')
async def t_native_sleep_events(a):
    now = ms(ist(2026, 10, 14, 7))
    pg = await a.open(native={'sleepEvents': [{'type': 'later', 'at': now - int(8.5 * 3600e3)}, {'type': 'sleep', 'at': now - 8 * 3600 * 1000}]}, at=now)
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await pg.wait_for_timeout(400)
    await a.type_phrase()
    n = await a.js('features/sleep.js', 'm.get().nights[0]')
    check(n and abs(n['hours'] - 8) < 0.05, f'night {n}')

@test('Android', 'valid', 'Picking a logo changes the home-screen icon; light theme switches status-bar icons')
async def t_native_icon(a):
    pg = await a.open(native={}, clock=False)
    await a.tab('settings')
    await pg.click('[data-group=look] [data-pick=logo][data-value=bell]'); await pg.wait_for_timeout(150)
    check(any(c['args']['name'] == 'bell' for c in await first_light(a, 'setIcon')), 'icon changed')
    await pg.click('[data-group=look] [data-pick=theme][data-value=ivory]'); await pg.wait_for_timeout(200)
    styles = [c['args']['style'] for c in await a.native_calls('setStyle') if c['plugin'] == 'SystemBars']
    check(styles and styles[-1] == 'LIGHT', f'status bar {styles}')

@test('Android', 'invalid', 'Missing permissions are flagged on the Alarm tab with a one-tap fix')
async def t_native_perms(a):
    pg = await a.open(native={'status': {'exactAlarms': False}}, clock=False)
    await pg.wait_for_timeout(300)
    check(await a.visible('[data-ref=permWarn]'), 'warning shown')
    await pg.click('[data-ref=permWarn] [data-fix]'); await pg.wait_for_timeout(150)
    check(any(c['args'].get('which') == 'exactAlarm' for c in await first_light(a, 'openSettings')), 'opens the right Android setting')

@test('Android', 'valid', 'First-run setup includes a permissions step that can ask for notifications')
async def t_native_onboard(a):
    pg = await a.open(native={'status': {'notifications': False}}, onboarded=False, clock=False)
    for _ in range(8):   # name, buddy PIN, logo, colour, theme, font, style, sleep
        if await pg.query_selector('[data-ob=skip]') and 'name' in (await pg.get_attribute('.ob-step', 'data-step')): await pg.click('[data-ob=skip]')
        else: await pg.click('[data-ob=next]')
        await pg.wait_for_timeout(200)
    check('Let me ring when I’m closed' in await pg.inner_text('#onboarding'), 'permissions step')
    await pg.wait_for_timeout(300)
    await pg.click('[data-perm=notifications]'); await pg.wait_for_timeout(300)
    check(await first_light(a, 'requestNotifications'), 'asked for notifications')

@test('Android', 'valid', 'App lock: choose apps, it locks for real mornings, unlocks when proven (not for tests)')
async def t_native_lock(a):
    pg = await a.open(native={'status': {'accessibility': True}}, seed={'fl:tasks': ONE_TASK})
    await a.tab('settings')
    await pg.click('[data-group=applock] [data-switch=lock]'); await pg.wait_for_timeout(150)
    await pg.click('[data-group=applock] [data-ref=load]'); await pg.wait_for_timeout(300)
    await pg.click('[data-app="com.instagram.android"]'); await pg.wait_for_timeout(200)
    cfg = [c['args'] for c in await first_light(a, 'configureLock')][-1]
    check(cfg['enabled'] and cfg['packages'] == ['com.instagram.android'], f'config {cfg}')
    await a.fire_direct(test=True); await a.type_phrase()
    check(not await first_light(a, 'lockNow'), 'test alarms never lock')
    await a.js('features/morning.js', '(m.close(), true)')
    await a.fire_direct(test=False)
    check(await first_light(a, 'lockNow'), 'locked for a real morning')
    await a.type_phrase(); await a.prove_current_task()
    check(await first_light(a, 'unlock'), 'unlocked when proven')

@test('Android', 'invalid', 'App lock refuses bad app names and keeps the auto-unlock between 1 and 6 h')
async def t_native_lock_invalid(a):
    await a.open(native={}, clock=False)
    r = await a.js('features/applock.js', "[m.toggleApp('bad pkg!'), m.toggleApp(''), m.toggleApp(42), m.setMaxHours(0), m.setMaxHours(24), m.setMaxHours('x')]")
    check(r == [None, None, None, 1, 6, 6], f'values {r}')

@test('Android', 'invalid', 'Opening a locked app shows a reminder; emergency unlock needs the exact phrase and is recorded')
async def t_native_blocked(a):
    pg = await a.open(native={}, clock=False)
    await pg.evaluate("window.__nativeEmit('locked', { pkg: 'com.instagram.android' })"); await pg.wait_for_timeout(300)
    check('is locked' in await pg.inner_text('.sheet'), 'reminder shown')
    await pg.click('.sheet [data-i="1"]'); await pg.wait_for_timeout(150)
    await pg.fill('.sheet input', 'let me in'); await pg.click('.sheet [data-go]'); await pg.wait_for_timeout(150)
    check(not await first_light(a, 'unlock') and await pg.query_selector('.sheet input'), 'wrong phrase refused')
    await pg.fill('.sheet input', 'I need my apps right now'); await pg.click('.sheet [data-go]'); await pg.wait_for_timeout(200)
    check(await first_light(a, 'unlock'), 'unlocked')
    await a.tab('progress')
    check('Emergency unlocks' in await pg.inner_text('[data-tab=progress]'), 'recorded in Progress')

@test('Android', 'valid', 'Spotify in the app: Android rings first, then Spotify takes over')
async def t_native_spotify(a):
    pg = await a.open(native={}, clock=False, spotify={}, seed=CONNECTED)
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await pg.wait_for_timeout(3000)
    names = [c['method'] for c in await a.native_calls() if c['plugin'] == 'FirstLight' and c['method'] in ('ring', 'stopRinging')]
    check(names[:2] == ['ring', 'stopRinging'], f'order {names}')
    check(await a.js('features/music.js', 'm.status().playing') == 'spotify', 'Spotify playing')

@test('Android', 'valid', 'A Sunday sleep-in updates Android’s scheduled alarm')
async def t_native_override(a):
    pg = await a.open(native={}, at=ms(ist(2026, 10, 17, 15)))
    await a.js('features/alarm.js', '(m.arm(), true)'); await pg.wait_for_timeout(200)
    await a.js('features/alarm.js', "(m.setOverride('2026-10-18', '08:30'), true)"); await pg.wait_for_timeout(200)
    last = [c['args'] for c in await first_light(a, 'schedule') if c['args']['id'] == 'wake'][-1]
    check(last['at'] == ms(ist(2026, 10, 18, 8, 30)), f'rescheduled {last}')

@test('Android', 'valid', 'The browser version never touches the Android bridge')
async def t_web_no_native(a):
    pg = await a.open(clock=False)
    check(not await pg.evaluate('window.Capacitor.isNativePlatform()'), 'web mode')
    check(await pg.evaluate('window.__nativeCalls === undefined'), 'no native calls')


@test('Android', 'valid', 'Locked apps are named nicely even without a label (com.instagram.android → Instagram)')
async def t_native_labels(a):
    await a.open(native={}, clock=False)
    r = await a.js('features/applock.js', "[m.labelFor('com.instagram.android'), m.labelFor('com.google.android.youtube'), m.labelFor('x.y', 'Real Name')]")
    check(r == ['Instagram', 'Youtube', 'Real Name'], f'labels {r}')

@test('App', 'valid', 'Only one message (toast) shows at a time')
async def t_one_toast(a):
    pg = await a.open(clock=False)
    await pg.evaluate("async () => { const u = await import('./js/core/util.js'); u.toast('one'); u.toast('two'); u.toast('three'); }")
    check(await pg.eval_on_selector_all('.toast', 'e => e.map(x => x.innerText)') == ['three'], 'latest toast only')

@test('Android', 'valid', 'The permission warning clears once setup granted everything')
async def t_native_warning_clears(a):
    pg = await a.open(native={'status': {'notifications': False}}, onboarded=False, clock=False)
    while await pg.query_selector('#onboarding:not(.leaving) [data-ob=next]'):
        step = await pg.get_attribute('.ob-step', 'data-step')
        if step == 'permissions': await pg.click('[data-perm=notifications]'); await pg.wait_for_timeout(1000)
        await pg.click('#onboarding:not(.leaving) [data-ob=next]'); await pg.wait_for_timeout(250)
    await pg.wait_for_timeout(500)
    check(not await a.visible('[data-ref=permWarn]'), 'no stale warning')

# ================================================================== 3.1
SP_LINK = 'https://open.spotify.com/playlist/37i9dQZF1DX0UrRvztWcAU?si=abc123'
KERALA = {'fl:profile': {'name': 'Priya', 'onboarded': True, 'theme': 'kerala'}, 'fl:sleep': {'prompts': False}}

async def set_visibility(a, state):
    await a.pg.evaluate(f"""() => {{ Object.defineProperty(document, 'visibilityState', {{ configurable: true, get: () => '{state}' }});
      Object.defineProperty(document, 'hidden', {{ configurable: true, get: () => {str(state == 'hidden').lower()} }});
      document.dispatchEvent(new Event('visibilitychange')); }}""")

# ---------- City themes
@test('Cities', 'valid', 'Kerala theme: skyline, live weather, and an upbeat headline (gloomy news is skipped)')
async def t_city_card(a):
    pg = await a.open(seed=KERALA, at=ms(ist(2026, 10, 14, 7)))
    await a.tick(1500)
    line = await pg.inner_text('.city-line')
    check('Kerala' in line and '27°' in line and 'Rain' in line, f'small city line on Today {line!r}')
    await pg.click('.city-line'); await pg.wait_for_timeout(150)
    card = await pg.inner_text('.city-card')
    check('Kerala' in card and '27°' in card and 'Rain' in card, f'city card {card!r}')
    check('killed' not in card.lower(), 'gloomy headline skipped')
    check(await pg.query_selector('.scene.city-kerala .skyline'), 'Kerala skyline drawn')
    check(await pg.query_selector('.scene .fx-rain'), 'rain in the sky when it rains there')
    kinds = {k for k, _ in a.net_calls}
    check({'weather', 'news', 'wiki'} <= kinds, f'all three sources asked: {kinds}')
    first = await pg.inner_text('.city-news')
    await pg.click('.city-card [data-swap]'); await pg.wait_for_timeout(100)
    second = await pg.inner_text('.city-news')
    check(first != second and ('robotics award' in first + second) and ('Kathakali' in first + second), f'headline and fact alternate: {first!r} / {second!r}')
    await pg.click('.city-card [data-swap]'); await pg.wait_for_timeout(100)

@test('Cities', 'invalid', 'Offline or blocked: the city card still shows a built-in fact, with no errors')
async def t_city_offline(a):
    pg = await a.open(seed={**KERALA, 'fl:profile': {**KERALA['fl:profile'], 'theme': 'tokyo'}}, net={'weather': 'fail', 'news': 'fail', 'wiki': 'fail'}, at=ms(ist(2026, 10, 14, 7)))
    await a.tick(1500)
    check(not await pg.query_selector('.city-line .wx'), 'no made-up weather on Today')
    await pg.click('.city-line'); await pg.wait_for_timeout(150)
    card = await pg.inner_text('.city-card')
    facts = await a.js('features/places.js', 'm.PLACES.tokyo.facts')
    check('Tokyo' in card and any(f in card for f in facts), f'offline fact shown: {card!r}')
    check(not await pg.query_selector('.city-card .wx'), 'no made-up weather')

@test('Cities', 'invalid', 'Only upbeat, well-formed headlines are used; titles are cleaned')
async def t_city_headlines(a):
    await a.open()
    r = await a.js('features/places.js', """[m.isUpbeat('Fire breaks out in market'), m.isUpbeat('Local choir wins national prize'), m.cleanHeadline('BIG NEWS FOR KOCHI METRO RIDERS - The Hindu'), m.firstSentence('Kathakali (Malayalam: x) is a major form of classical Indian dance. It is a story play.')]""")
    check(r[0] is False and r[1] is True, f'tone filter {r[:2]}')
    check(r[2] == 'Big news for kochi metro riders', f'cleaned {r[2]!r}')
    check(r[3] == 'Kathakali is a major form of classical Indian dance.', f'first sentence {r[3]!r}')

@test('Cities', 'valid', 'In the app, city data goes through Android’s own HTTP client; tapping the headline opens it outside the app')
async def t_city_native(a):
    pg = await a.open(seed=KERALA, native={}, at=ms(ist(2026, 10, 14, 8)))
    await a.tick(1500)
    http = [c['args']['url'] for c in await a.native_calls('get') if c['plugin'] == 'CapacitorHttp']
    check(any('gdeltproject' in u for u in http) and any('open-meteo' in u for u in http), f'native HTTP used: {http}')
    await pg.click('.city-line'); await pg.wait_for_timeout(150)
    if not await pg.query_selector('.city-card [data-open^="https://news"]'):
        await pg.click('.city-card [data-swap]'); await pg.wait_for_timeout(100)
    await pg.click('.city-card [data-open]'); await pg.wait_for_timeout(100)
    opened = await pg.evaluate('window.__opened || []')
    check(opened and opened[0].startswith('https://'), f'opened outside: {opened}')

@test('Cities', 'valid', 'Every city has its own skyline and palette; the theme picker groups Moods and Cities')
async def t_city_picker(a):
    pg = await a.open()
    await a.tab('settings', 'look')
    groups = await pg.eval_on_selector_all('[data-group=look] .pick-group', 'els => els.map(e => e.innerText)')
    check(len(groups) == 2 and groups[0].startswith('Moods') and groups[1].startswith('Cities'), f'groups {groups}')
    for city in ['newyork', 'sanfrancisco', 'kerala', 'tokyo', 'seoul']:
        check(await pg.query_selector(f'[data-pick=theme][data-value={city}] .mini-city'), f'{city} preview skyline')
        await pg.click(f'[data-pick=theme][data-value={city}]'); await pg.wait_for_timeout(150)
        await a.tab('alarm')
        check(await pg.query_selector(f'.scene.city-{city} .skyline'), f'{city} skyline on the Alarm tab')
        await a.tab('settings', 'look')

# ---------- Sky
@test('Sky', 'valid', 'The home sky follows the clock: stars at night, first rays at dawn, full sun at noon, orange glow at golden hour')
async def t_sky_phases(a):
    pg = await a.open(at=ms(ist(2026, 10, 14, 3)))
    async def state():
        return await pg.evaluate("() => { const s = document.querySelector('.sky-card .scene'); return { phase: s.dataset.phase, stars: s.querySelectorAll('.star').length, moon: !!s.querySelector('.moon'), lit: s.querySelectorAll('.ray.lit').length, warm: s.querySelectorAll('.ray.lit.warm').length }; }")
    st = await state()
    check(st['phase'] == 'night' and st['stars'] > 20 and st['moon'] and st['lit'] == 0, f'night {st}')
    await a.jump(3 * 3600e3 + 20 * 60e3)   # 06:20
    st = await state()
    check(st['phase'] == 'dawn' and 0 < st['lit'] < 12, f'dawn {st}')
    await a.jump(6 * 3600e3)               # 12:20
    st = await state()
    check(st['phase'] == 'noon' and st['lit'] >= 30, f'noon {st}')
    await a.jump(5 * 3600e3 + 40 * 60e3)   # 18:00
    st = await state()
    check(st['phase'] == 'golden' and st['warm'] > 0, f'golden {st}')
    await a.jump(3 * 3600e3)               # 21:00
    check((await state())['phase'] == 'night', 'night again')

@test('Sky', 'valid', 'City weather shows in the sky: fog in San Francisco, snow in Seoul, clouds in Tokyo')
async def t_sky_weather(a):
    for theme, code, fx in [('sanfrancisco', 45, 'fx-fog'), ('seoul', 71, 'fx-snow'), ('tokyo', 3, 'fx-cloud'), ('newyork', 95, 'fx-flash')]:
        b = App(a.browser)
        try:
            pg = await b.open(seed={'fl:profile': {'name': 'P', 'onboarded': True, 'theme': theme}}, net={'weather': {'utc_offset_seconds': 0, 'current': {'temperature_2m': 9, 'weather_code': code, 'is_day': 1}, 'daily': {'sunrise': ['2026-10-14T06:00'], 'sunset': ['2026-10-14T18:00']}}}, at=ms(ist(2026, 10, 14, 9)))
            await b.tick(1500)
            check(await pg.query_selector(f'.sky-card .scene .{fx}'), f'{theme}: {fx}')
            check(not b.errors, f'{theme}: {b.errors}')
        finally:
            await b.close()

# ---------- Pip
@test('Pip', 'valid', 'Pip really leaps in: he bounds along a curved path, lands, waves and says hello')
async def t_pip_flight(a):
    pg = await a.open(greet=True, at=ms(ist(2026, 10, 14, 9)))
    check(await pg.query_selector('.greet .pet.flying'), 'mid-leap')
    p0 = await pg.evaluate("getComputedStyle(document.querySelector('.greet-pet')).transform")
    await a.tick(400)
    p1 = await pg.evaluate("getComputedStyle(document.querySelector('.greet-pet')).transform")
    check(p0 != p1, 'he moves along his path')
    await a.tick(800)
    check(await pg.query_selector('.greet.landed .pet.waving'), 'lands and waves')
    check('Good morning, Priya' in await pg.inner_text('.greet-text'), 'says hello by name')

@test('Pip', 'valid', 'Pip leaps in after setup, when you come back after 30+ minutes, and does a victory lap after a proven morning')
async def t_pip_triggers(a):
    pg = await a.open(onboarded=False, at=ms(ist(2026, 10, 14, 20)))
    for _ in range(12):
        if not await pg.query_selector('#onboarding [data-ob=next]'): break
        if await pg.query_selector('#onboarding [data-ref=name]'): await pg.fill('#onboarding [data-ref=name]', 'Priya')
        await pg.click('[data-ob=next]'); await a.tick(250)
    await a.tick(500)
    check('Welcome home, Priya' in await pg.inner_text('.greet'), 'flies in after setup')
    await a.tick(3000)
    check(not await pg.query_selector('.greet'), 'then flies off')
    await set_visibility(a, 'hidden'); await a.tick(10 * 60e3); await set_visibility(a, 'visible'); await a.tick(200)
    check(not await pg.query_selector('.greet'), 'not after only 10 minutes away')
    await set_visibility(a, 'hidden'); await a.tick(31 * 60e3); await set_visibility(a, 'visible'); await a.tick(200)
    check(await pg.query_selector('.greet'), 'greets again after 30+ minutes away')
    await a.tick(3000)
    await a.js('features/tasks.js', "(m.all().forEach(t => m.remove(t.id)), true)")
    await a.fire_direct(test=False); await a.type_phrase(); await a.tick(800)
    check(not await pg.query_selector('.greet.victory'), 'no lap over the report card')
    await pg.click('#morning [data-ref=close]'); await a.tick(600)
    check(await pg.query_selector('.greet.victory') and 'Morning proven' in await pg.inner_text('.greet.victory'), 'victory lap after closing the report card')
    check(await pg.evaluate("getComputedStyle(document.querySelector('.greet.victory')).pointerEvents") == 'none', 'victory lap never blocks taps')

@test('Pip', 'invalid', 'With reduced motion, Pip appears and waves without leaping')
async def t_pip_reduced(a):
    pg = await a.open(at=ms(ist(2026, 10, 14, 9)))
    await a.tick(3000)  # let the opening greeting finish
    await pg.emulate_media(reduced_motion='reduce')
    await a.js('ui/pet-view.js', '(m.greet(), true)'); await pg.wait_for_timeout(100)
    check(await pg.query_selector('.greet.still .pet.waving'), 'still, waving')
    check(not await pg.query_selector('.greet .pet.flying'), 'no flight')

# ---------- Naps
@test('Naps', 'valid', '“Going to sleep” in the afternoon asks about a nap, sets a timer, wakes you, and logs the nap as sleep')
async def t_nap(a):
    pg = await a.open(seed=NO_PROMPTS, at=ms(ist(2026, 10, 14, 15)))
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    check('Taking a nap?' in await pg.inner_text('.sheet'), 'asks about a nap')
    await pg.click('.sheet [data-nap="20"]'); await pg.wait_for_timeout(150)
    check('15:20' in await a.toast_text() or '3:20' in await a.toast_text(), f'timer confirmed: {await a.toast_text()}')
    await a.tab('sleep')
    check('Napping till' in await pg.inner_text('.sleep-card'), 'card shows the nap')
    check(await a.js('features/sleep.js', 'm.get().pending.bedAt') is None, 'not logged as a night')
    await a.tick(19 * 60e3)
    check(not await a.visible('#nap'), 'not yet')
    await a.tick(61e3)
    check(await a.visible('#nap') and 'Nap’s over' in await pg.inner_text('#nap'), 'wakes you')
    await pg.click('#nap [data-ref=up]'); await pg.wait_for_timeout(200)
    check(not await a.visible('#nap'), 'stops')
    naps = await a.js('features/sleep.js', 'm.get().naps')
    check(len(naps) == 1 and abs(naps[0]['hours'] - 0.33) < 0.02, f'nap logged {naps}')
    w = await a.js('features/sleep.js', 'm.week()')
    check(w['count'] == 1 and abs(w['nights'][0]['total'] - 0.3) < 0.05, f'counted in the week {w}')
    await a.tab('progress')
    check(await pg.query_selector('.sleep-chart .nap-part'), 'nap shown on the chart')
    await a.tab('sleep')
    check('+ 20 min nap today' in await pg.inner_text('.sleep-card'), 'today’s nap on the card')

@test('Naps', 'valid', 'At bedtime it tracks the night (no nap question); “No, I’m going to bed” also starts a night')
async def t_nap_night(a):
    pg = await a.open(seed=NO_PROMPTS, at=ms(ist(2026, 10, 14, 22, 30)))
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    check(not await pg.query_selector('.sheet'), 'no nap question at night')
    check(await a.js('features/sleep.js', 'm.get().pending.bedAt'), 'night started')
    await a.js('features/sleep.js', '(m.notTonight(), true)')
    await a.jump(10 * 3600e3)  # 08:30 next day, outside the sleep window
    await a.tab('alarm')
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    await pg.click('.sheet [data-night]'); await pg.wait_for_timeout(150)
    check(await a.js('features/sleep.js', 'm.get().pending.bedAt'), 'night started from the nap sheet')

@test('Naps', 'invalid', 'Nap length stays between 5 minutes and 4 hours; waking early logs the real time; cancelling sets nothing')
async def t_nap_limits(a):
    pg = await a.open(seed=NO_PROMPTS, at=ms(ist(2026, 10, 14, 14)))
    r = await a.js('features/sleep.js', "[m.startNap(1).endAt - m.napState().startAt, (m.endNap(), m.startNap(999).endAt - m.napState().startAt), (m.endNap(), m.startNap('soon'))]")
    check(r[0] == 5 * 60e3 and r[1] == 240 * 60e3 and r[2] is None, f'limits {r}')
    await a.js('features/sleep.js', "(m.get().naps.length, true)")
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    for _ in range(10): await pg.click('.sheet [data-d="-5"]')
    check(await pg.inner_text('.sheet [data-ref=out]') == '5 min', 'custom stops at 5 min')
    await pg.mouse.click(5, 5); await pg.wait_for_timeout(150)
    check(await a.js('features/sleep.js', 'm.napState()') is None, 'cancelled: no nap')
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    await pg.click('.sheet [data-nap="45"]'); await pg.wait_for_timeout(100)
    await a.tick(12 * 60e3)
    await a.sleep_click('[data-ref=wakeNap]'); await pg.wait_for_timeout(150)
    last = (await a.js('features/sleep.js', 'm.get().naps'))[0]
    check(abs(last['hours'] - 0.2) < 0.02, f'logged the real 12 minutes: {last}')

@test('Naps', 'valid', 'In the app, the nap alarm is Android’s (rings with the app closed) and “I’m up” silences it')
async def t_nap_native(a):
    pg = await a.open(seed=NO_PROMPTS, native={}, at=ms(ist(2026, 10, 14, 16)))
    await a.sleep_click('[data-ref=now]'); await pg.wait_for_timeout(150)
    await pg.click('.sheet [data-nap="30"]'); await pg.wait_for_timeout(150)
    sch = [c['args'] for c in await first_light(a, 'schedule') if c['args'].get('kind') == 'nap']
    check(sch and abs(sch[0]['at'] - ms(ist(2026, 10, 14, 16, 30))) < 5000, f'nap scheduled with Android: {sch}')
    await pg.evaluate("window.__nativeEmit('alarm', { kind: 'nap' })"); await pg.wait_for_timeout(200)
    check(await a.visible('#nap'), 'nap screen when Android rings')
    await pg.click('#nap [data-ref=up]'); await pg.wait_for_timeout(200)
    check(await first_light(a, 'stopRinging') and [c for c in await first_light(a, 'cancel') if c['args']['id'] == 'nap'], 'ringing stopped, alarm cleared')

# ---------- Morning: step away, quick test
@test('Morning', 'valid', 'You can leave the task list: a top-bar pill counts down, says when it’s time, and brings you back')
async def t_leave(a):
    pg = await a.open(seed={'fl:tasks': [{'id': 'tea', 'name': 'Tea is ready', 'proof': 'tea', 'gapMin': 10}]}, at=ms(ist(2026, 10, 14, 7)))
    await a.fire_direct(); 
    check(not await a.visible('#morning [data-ref=leave]'), 'no leaving while it rings')
    await a.type_phrase()
    await pg.click('#morning [data-ref=leave]'); await pg.wait_for_timeout(150)
    check(not await a.visible('#morning'), 'task screen steps aside')
    pill = await pg.inner_text('#appbar .pill')
    check('Tea is ready' in pill and '10:00' in pill or '9:5' in pill, f'countdown pill {pill!r}')
    await a.tab('tasks'); await a.tab('progress')
    check(await pg.is_visible('[data-tab=progress]'), 'the app is usable')
    await a.tick(5 * 60e3 + 1000)
    check(await a.visible('#checkin'), 'the check-in still finds you')
    await pg.click('#checkin [data-ref=yes]'); await pg.wait_for_timeout(150)
    check(not await a.visible('#morning'), 'and you stay where you were')
    await a.tick(5 * 60e3)
    check(await pg.query_selector('#appbar .pill.ready') and '📸' in await pg.inner_text('#appbar .pill'), 'pill says it’s time')
    check('time to prove it' in await a.toast_text(), 'and tells you')
    await pg.click('#appbar .pill'); await pg.wait_for_timeout(150)
    check(await a.visible('#morning') and await a.visible('#morning [data-gate] button.gold'), 'tap the pill to go back')
    check(not await pg.query_selector('#appbar .pill'), 'pill gone while the task screen is open')

@test('Morning', 'valid', 'In the app, a task’s wait is handed to Android as a notification')
async def t_leave_native(a):
    pg = await a.open(native={}, seed={'fl:tasks': [{'id': 'tea', 'name': 'Tea is ready', 'proof': 'tea', 'gapMin': 10}]}, at=ms(ist(2026, 10, 14, 7)))
    await a.fire_direct(); await a.type_phrase()
    sch = [c['args'] for c in await first_light(a, 'schedule') if c['args'].get('kind') == 'task']
    check(sch and sch[0]['title'].startswith('Tea is ready') and abs(sch[0]['at'] - ms(ist(2026, 10, 14, 7, 10))) < 5000, f'task notice {sch}')

@test('Morning', 'valid', 'Test alarm ends right after the phrase (“It works!”); “Try the full morning” runs tasks and check-in at 10× speed')
async def t_quick_test(a):
    pg = await a.open(seed={'fl:tasks': [{'id': 'tea', 'name': 'Tea', 'proof': 'tea', 'gapMin': 10}]}, at=ms(ist(2026, 10, 14, 21)))
    await pg.click('[data-ref=test]'); await a.tick(11_000)
    await a.type_phrase()
    check(await a.phase() == 'done' and 'It works!' in await pg.inner_text('#morning'), 'quick test done')
    await a.tick(6 * 60e3)
    check(not await a.visible('#checkin'), 'no check-in after a quick test')
    await pg.click('#morning [data-ref=full]'); await pg.wait_for_timeout(200)
    m = await a.js('features/morning.js', 'm.get()')
    check(m['phase'] == 'ringing' and m['test'] and m['full'], f'full test started {m}')
    await a.type_phrase()
    check(await a.phase() == 'tasks', 'tasks run in the full test')
    unlock = await a.js('features/morning.js', 'm.currentUnlocksAt() - m.get().dismissedAt')
    check(unlock == 60_000, f'a 10 min wait takes 1 min: {unlock}')
    await a.tick(31_000)
    check(await a.visible('#checkin'), 'check-in after 30 s instead of 5 min')
    await pg.click('#checkin [data-ref=yes]')
    check(await a.js('features/stats.js', 'm.get().wins') == 0, 'tests never count')

# ---------- Sharing
@test('Sharing', 'valid', 'Sharing a Spotify playlist sets it as the alarm (no sign-in), named from Spotify')
async def t_share_spotify(a):
    pg = await a.open()
    await a.js('core/events.js', f"m.emit('share:text', {{ text: 'Listen to this {SP_LINK}' }})"); await pg.wait_for_timeout(400)
    st = await a.js('features/sources/spotify.js', 'm.status()')
    check(st['link'] and st['link']['id'] == '37i9dQZF1DX0UrRvztWcAU' and st['link']['type'] == 'playlist', f'link saved {st}')
    check(await a.js('features/music.js', 'm.status().source') == 'spotify', 'Spotify chosen')
    check(await pg.is_visible('[data-tab=sounds]'), 'shows the Music tab')
    check('Rise and Grind' in await pg.inner_text('[data-tab=sounds]'), 'real playlist name')

@test('Sharing', 'valid', 'YouTube: a playlist becomes the alarm; a Short becomes a clip; a single video asks which')
async def t_share_youtube(a):
    pg = await a.open()
    await a.js('core/events.js', "m.emit('share:text', { text: 'https://music.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' })"); await pg.wait_for_timeout(300)
    check(await a.js('features/music.js', 'm.status().source') == 'youtube', 'playlist → alarm')
    await a.js('core/events.js', "m.emit('share:text', { text: 'https://youtube.com/shorts/aqz-KE-bpKQ?si=x' })"); await pg.wait_for_timeout(300)
    check(len(await a.js('features/boost.js', 'm.linkClips()')) == 1, 'Short → clip')
    await a.js('core/events.js', "m.emit('share:text', { text: 'https://youtu.be/dQw4w9WgXcQ' })"); await pg.wait_for_timeout(300)
    check('Use this video for' in await pg.inner_text('.sheet'), 'asks about a single video')
    await pg.click('.sheet .btn:has-text("Motivation")'); await pg.wait_for_timeout(200)
    check(len(await a.js('features/boost.js', 'm.linkClips()')) == 2, 'saved as a clip')

@test('Sharing', 'invalid', 'Odd shares are handled kindly: other sites refused, repeats ignored, short Spotify links explained')
async def t_share_bad(a):
    pg = await a.open()
    await a.js('core/events.js', "m.emit('share:text', { text: 'https://example.com/hello' })"); await pg.wait_for_timeout(200)
    check('Spotify, YouTube and Instagram' in await a.toast_text(), 'other sites refused')
    await a.js('core/events.js', "m.emit('share:text', { text: 'no link here' })"); await pg.wait_for_timeout(200)
    check('Spotify, YouTube and Instagram' in await a.toast_text(), 'plain text refused')
    for _ in range(2):
        await a.js('core/events.js', "m.emit('share:text', { text: 'https://www.instagram.com/reel/C9abcDEF123/?igsh=x' })"); await pg.wait_for_timeout(200)
    check(len(await a.js('features/boost.js', 'm.linkClips()')) == 1, 'the same share twice is saved once')
    await a.js('core/events.js', "m.emit('share:text', { text: 'https://spotify.link/AbCdEf' })"); await pg.wait_for_timeout(300)
    check('Copy link' in await a.toast_text(), 'short link: asks for Copy link in the browser version')
    r = await a.js('features/boost.js', "[m.addLink('not a link').ok, m.addLink('https://vimeo.com/1').ok, m.addLink('https://www.instagram.com/reel/C9abcDEF123/').ok, m.addLink('https://youtube.com/watch?v=short').ok]")
    check(r == [False, False, False, False], f'clip links validated {r}')

@test('Sharing', 'valid', 'In the app: a link shared while SoulWake was closed is picked up when it opens')
async def t_share_native(a):
    pg = await a.open(native={'launch': {'shared': 'Check this out https://www.instagram.com/reel/C9abcDEF123/'}})
    await pg.wait_for_timeout(400)
    check(len(await a.js('features/boost.js', 'm.linkClips()')) == 1, 'reel saved from the share')
    check('Clip saved' in await a.toast_text(), 'confirmed')

# ---------- Spotify (shared link) & clips
@test('Spotify', 'valid', 'Shared playlist plays in Spotify’s official player on the alarm screen; “Play on Spotify” opens the app')
async def t_sp_embed(a):
    pg = await a.open(native={}, seed={'fl:music': {'source': 'spotify'}, 'fl:tasks': []})
    await a.js('features/sources/spotify.js', f"m.setLink('{SP_LINK}')")
    await a.fire_direct(); await a.tick(1500)
    check(await a.js('features/music.js', 'm.status().playing') == 'spotify', 'Spotify playing')
    created = await pg.evaluate('window.__spEmbed.created')
    check(created == ['spotify:playlist:37i9dQZF1DX0UrRvztWcAU'], f'embed {created}')
    check(await a.visible('#media-stage iframe'), 'player visible on the alarm screen')
    await a.type_phrase(); await pg.wait_for_timeout(200)
    check(not await a.visible('#media-stage'), 'player removed when stopped')
    await a.js('features/morning.js', '(m.close(), true)')
    await a.tab('sounds')
    await pg.click('[data-tab=sounds] [data-ref=open]'); await pg.wait_for_timeout(150)
    check(await pg.evaluate('window.__opened') == ['spotify:playlist:37i9dQZF1DX0UrRvztWcAU'], 'opens in the Spotify app')

@test('Spotify', 'invalid', 'Shared playlist that never starts falls back to your songs within 8 seconds')
async def t_sp_embed_fail(a):
    pg = await a.open(net={'spembed': 'silent'}, seed={'fl:music': {'source': 'spotify'}, 'fl:tasks': []})
    await a.js('features/sources/spotify.js', f"m.setLink('{SP_LINK}')")
    await a.fire_direct(); await a.tick(9000)
    check(await a.js('features/music.js', 'm.status().playing') in ('local', 'beeps'), 'backup playing')
    check(await a.js('features/music.js', 'm.status().lastFallback.source') == 'spotify', 'fallback recorded')

@test('Spotify', 'invalid', 'Spotify links are checked: only open.spotify.com playlists, albums and songs')
async def t_sp_link_check(a):
    await a.open()
    r = await a.js('features/sources/spotify.js', """[m.parseLink('https://open.spotify.com/intl-de/album/4aawyAB9vmqN3uQ7FjRGTy').ok, m.parseLink('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl?si=1').type,
      m.parseLink('https://open.spotify.com/artist/0OdUWJ0sBjDrqHygGUXeCF').ok, m.parseLink('https://evil.com/playlist/37i9dQZF1DX0UrRvztWcAU').ok, m.parseLink('spotify').ok]""")
    check(r == [True, 'track', False, False, False], f'checked {r}')

@test('Boost', 'valid', 'A saved YouTube Short or Instagram reel plays in its own embedded player after the check-in')
async def t_boost_links(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK})
    await a.js('features/boost.js', "m.addLink('https://youtube.com/shorts/aqz-KE-bpKQ')")
    await a.fire_direct(); await a.type_phrase()
    await a.tick(5 * 60_000 + 1000)
    await pg.click('#checkin [data-ref=yes]'); await pg.wait_for_timeout(500)
    src = await pg.get_attribute('#boost iframe', 'src')
    check(src and src.startswith('https://www.youtube.com/embed/aqz-KE-bpKQ'), f'YouTube embed {src}')
    await a.tick(8500)
    check(await pg.is_enabled('#boost [data-ref=close]'), 'can close after a few seconds')

# ---------- Layout
@test('Layout', 'invalid', 'No screen scrolls sideways on a small 320 px phone (widest fonts, city themes)', timeout=180)
async def t_layout_320(a):
    FIND = """() => { const W = document.documentElement.clientWidth; const over = document.documentElement.scrollWidth - W;
      const bad = [...document.querySelectorAll('body *')].filter(el => { const cs = getComputedStyle(el); if (cs.display === 'none' || el.closest('svg,.greet,.m-burst')) return false;
        const r = el.getBoundingClientRect(); if (!r.width) return false; let p = el.parentElement; while (p && p !== document.body) { if (/(hidden|auto|scroll|clip)/.test(getComputedStyle(p).overflowX)) return false; p = p.parentElement; } return r.right > W + 1; })
        .map(el => el.tagName + '.' + el.className).slice(0, 5); return { over, bad }; }"""
    problems = []
    for font, style, theme in [('typewriter', 'bold', 'kerala'), ('formal', 'elegant', 'sanfrancisco')]:
        b = App(a.browser)
        try:
            pg = await b.open(viewport={'width': 320, 'height': 700}, seed={'fl:profile': {'name': 'Priyadarshini', 'onboarded': True, 'font': font, 'style': style, 'theme': theme}}, native={}, at=ms(ist(2026, 10, 14, 15)))
            async def look(where):
                r = await pg.evaluate(FIND)
                if r['over'] > 0 or r['bad']: problems.append(f"{font}/{where}: +{r['over']}px {r['bad']}")
            for t in ['alarm', 'tasks', 'sleep', 'sounds', 'progress']:
                await b.tab(t); await look(t)
            for g in await b.js('ui/drawer.js', 'm.GROUPS.map(g => g.id)'):
                await b.menu(g); await look(g)
            await b.js('ui/guard-view.js', "(m.challenge({ reason: 'uninstall' }), true)"); await pg.wait_for_timeout(200); await look('uninstall guard')
            await pg.click('#guard [data-act=go]'); await pg.wait_for_timeout(150); await look('guard sums')
            await pg.click('#guard [data-act=cancel]'); await pg.wait_for_timeout(150)
            await b.fire_direct(); await look('ringing'); await b.type_phrase(); await look('tasks')
        finally:
            await b.close()
    check(not problems, f'overflow: {problems}')

@test('App', 'valid', 'Long explanations sit behind ⓘ buttons that open a short sheet')
async def t_info(a):
    pg = await a.open()
    await a.tab('sounds')
    n = len(await pg.query_selector_all('[data-tab=sounds] .info-btn'))
    check(n >= 3, f'info buttons {n}')
    await pg.click('[data-tab=sounds] .info-btn >> nth=0'); await pg.wait_for_timeout(150)
    check(await a.visible('.sheet') and len(await pg.inner_text('.sheet p')) > 20, 'explanation in a sheet')

# ================================================================== Streaks (3.2)
H = 3600_000
async def prove_morning(a, *, native=False, answer_checkin=True):
    """Ring (Android or browser), type the phrase, prove every task, pass the check-in, close."""
    pg = a.pg
    if native: await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await a.tick(800)
    check(await a.phase() == 'ringing', f'alarm ringing (phase {await a.phase()})')
    await a.type_phrase()
    for _ in range(12):
        if await a.visible('#checkin') and answer_checkin: await pg.click('#checkin [data-ref=yes]'); await a.tick(300)
        if await pg.query_selector('#morning [data-gate] button.gold'): await a.prove_current_task(); continue
        if await a.phase() == 'tasks': await a.tick(60_000); continue
        break
    if await pg.query_selector('#morning [data-ref=close]'): await pg.click('#morning [data-ref=close]'); await a.tick(300)

async def streak(a):
    return await a.js('features/stats.js', '[m.currentStreak(), m.get().best, m.get().wins]')

@test('Streaks', 'valid', 'Seven real mornings in a row (alarm armed once): 1→7, shown on Progress, Pip ecstatic on day 7', timeout=300)
async def t_streak_week(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK, **NO_PROMPTS}, at=ms(ist(2026, 10, 14, 21)))
    await a.tick(3000); await a.arm_by_keyboard()
    for day in range(1, 8):
        await a.jump(9.5 * H)                       # 06:30, Android-free browser alarm
        await a.tick(1500)
        await prove_morning(a)
        await pg.reload(); await pg.wait_for_timeout(500); await a.tick(3000)
        check((await streak(a))[0] == day, f'day {day}: streak {await streak(a)}')
        await a.jump(ms(ist(2026, 10, 14 + day, 21)) - await pg.evaluate('Date.now()'))  # back to 21:00
    await a.js('ui/tabs.js', "m.show('progress')"); await pg.wait_for_timeout(200)   # (the black night screen is up while armed)
    check(await pg.inner_text('[data-tab=progress] .big') == '7', 'Progress shows 7')
    check(await a.js('features/pet.js', 'm.current()') == 'ecstatic', 'Pip is ecstatic at 7')
    check(len(await pg.query_selector_all('.cal .day.proven')) == 7, '7 proven days on the calendar')

@test('Streaks', 'valid', 'In the app: alarm rings with SoulWake closed, opened from its icon (not the notification) → the alarm screen appears and the morning counts')
async def t_streak_icon(a):
    seed = {'fl:tasks': [], **NO_PROMPTS, 'fl:streak': {'streak': 2, 'best': 2, 'wins': 2, 'lastWin': '2026-10-14', 'history': []},
            'fl:alarm': {'time': '06:30', 'armedAt': ms(ist(2026, 10, 15, 6, 30)), 'testAt': None, 'overrides': {}}}
    pg = await a.open(seed=seed, native={'status': {'ringing': True, 'ringingKind': 'wake'}}, at=ms(ist(2026, 10, 15, 6, 31)))
    await a.tick(1500)
    check(await a.phase() == 'ringing' and await a.visible('#morning'), 'alarm screen up without a launch from the notification')
    await prove_morning(a)
    check((await streak(a))[0] == 3, f'streak continues: {await streak(a)}')

@test('Streaks', 'invalid', 'A missed day resets the streak to 0 (best is kept); the next proven morning starts again at 1')
async def t_streak_gap(a):
    pg = await a.open(seed={'fl:tasks': [], **NO_PROMPTS}, at=ms(ist(2026, 10, 14, 6, 30)))
    for _ in range(3):
        await a.fire_direct(); await prove_morning(a); await a.jump(24 * H)
    check((await streak(a))[0] == 3, f'3 in a row {await streak(a)}')
    await a.jump(24 * H)                     # skipped a whole day
    check((await streak(a)) == [0, 3, 3], f'missed day → 0, best 3: {await streak(a)}')
    await a.tab('progress')
    check(await pg.inner_text('[data-tab=progress] .big') == '0', 'Progress shows 0')
    await a.fire_direct(); await prove_morning(a)
    check((await streak(a)) == [1, 3, 4], f'restarts at 1: {await streak(a)}')

@test('Streaks', 'invalid', 'Proving twice on the same day counts once; test alarms (quick or full) never count')
async def t_streak_once(a):
    pg = await a.open(seed={'fl:tasks': [], **NO_PROMPTS}, at=ms(ist(2026, 10, 14, 6, 30)))
    await a.fire_direct(); await prove_morning(a)
    await a.jump(2 * H); await a.fire_direct(); await prove_morning(a)
    check((await streak(a)) == [1, 1, 1], f'once per day {await streak(a)}')
    await a.jump(24 * H)
    await a.fire_direct(test=True); await prove_morning(a)
    await a.fire_direct(test=True, full=True); await prove_morning(a)
    check((await streak(a)) == [1, 1, 1], f'tests do not count {await streak(a)}')

@test('Streaks', 'valid', 'Snoozes and a missed check-in still count as proven (lower grade); a 23:50 alarm finished after midnight counts for that night')
async def t_streak_messy(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK, **NO_PROMPTS}, at=ms(ist(2026, 10, 14, 6, 30)))
    await a.fire_direct()
    await pg.click('#morning [data-ref=snooze]'); await a.tick(5 * 60_000 + 1000)
    await a.type_phrase(); await a.tick(5 * 60_000 + 1000); await a.tick(61_000)   # check-in missed → rings again
    await prove_morning(a)
    st = await a.js('features/stats.js', 'm.get()')
    check(st['streak'] == 1 and st['history'][0]['grade'] not in ('A+', 'A'), f'counted, lower grade {st["history"][0]}')
    # Night: 23:50 on the 15th, tasks finished at 00:05 on the 16th.
    await a.jump(ms(ist(2026, 10, 15, 23, 50)) - await pg.evaluate('Date.now()'))
    await a.fire_direct(); await a.type_phrase(); await a.tick(5 * 60_000 + 1000)
    await pg.click('#checkin [data-ref=yes]'); await a.tick(10 * 60_000)
    await a.prove_current_task()
    st = await a.js('features/stats.js', 'm.get()')
    check(st['lastWin'] == '2026-10-15' and st['streak'] == 2, f'counted for the 15th, streak 2: {st["lastWin"]} {st["streak"]}')

@test('Streaks', 'valid', 'App closed mid-morning and reopened: the morning resumes and still counts; yesterday’s unfinished morning never counts')
async def t_streak_resume(a):
    pg = await a.open(seed={'fl:tasks': [{'id': 'tea', 'name': 'Tea', 'proof': 'tea', 'gapMin': 10}], **NO_PROMPTS}, at=ms(ist(2026, 10, 14, 6, 30)))
    await a.fire_direct(); await a.type_phrase()
    await pg.reload(); await pg.wait_for_timeout(500)
    check(await a.phase() == 'tasks', 'resumed on the task list')
    await a.tick(10 * 60_000 + 1000)
    if await a.visible('#checkin'): await pg.click('#checkin [data-ref=yes]')
    await prove_morning(a) if await a.phase() == 'ringing' else None
    if await pg.query_selector('#morning [data-gate] button.gold'): await a.prove_current_task()
    check((await streak(a))[0] == 1, f'counted after reopening {await streak(a)}')
    await a.jump(24 * H); await a.fire_direct(); await a.type_phrase()   # start, don't finish (the missed check-in will ring again)
    await a.jump(24 * H); await pg.reload(); await pg.wait_for_timeout(500)
    check(await a.phase() == 'closed' and (await streak(a))[0] == 0, f'unfinished morning closed, not counted: {await a.phase()} {await streak(a)}')

@test('Streaks', 'invalid', 'Broken or odd streak data is repaired; the streak survives an app restart')
async def t_streak_data(a):
    pg = await a.open(seed={'fl:streak': {'streak': 'lots', 'best': None, 'wins': -3, 'lastWin': 'yesterday', 'history': 'x', 'totals': None}}, at=ms(ist(2026, 10, 14, 6, 30)))
    check(not a.errors, f'no crash {a.errors}')
    await a.js('features/tasks.js', "(m.all().forEach(t => m.remove(t.id)), true)")
    await a.fire_direct(); await prove_morning(a)
    st = await a.js('features/stats.js', 'm.get()')
    check(st['streak'] == 1 and st['best'] == 1 and st['wins'] >= 1 and isinstance(st['history'], list), f'repaired {st}')
    await pg.reload(); await pg.wait_for_timeout(500)
    check((await streak(a))[0] == 1, 'kept after restart')

# ================================================================== 3.2: SoulWake
# Night guard: armed alarm, guarded from 21:00 (2 h before 23:00 bedtime) to 08:30 (2 h after 06:30).
GUARD_SEED = {'fl:sleep': {'prompts': False}}

async def arm_now(a):
    await a.js('features/alarm.js', '(m.arm(), true)'); await a.pg.wait_for_timeout(200)
    if await a.pg.query_selector('#night:not(.hidden)'):
        await a.pg.click('#night [data-ref=back]', force=True); await a.pg.wait_for_timeout(150)

async def solve_sums(a, wrong_first=False):
    for i in range(3):
        t = await a.pg.inner_text('#guard [data-ref=sum]')
        m = re.match(r'(\d+) (.) (\d+)', t)
        x, op, y = int(m[1]), m[2], int(m[3])
        ans = {'+': x + y, '−': x - y, '×': x * y}[op]
        if wrong_first and i == 0:
            for ch in str(ans + 1): await a.pg.click(f'#guard [data-key="{ch}"]')
            await a.pg.click('#guard [data-act=check]'); await a.pg.wait_for_timeout(150)
            check((await a.pg.inner_text('#guard [data-ref=count]')).lower() == '1 of 3', 'a wrong answer doesn’t count')
        for ch in str(ans): await a.pg.click(f'#guard [data-key="{ch}"]')
        await a.pg.click('#guard [data-act=check]'); await a.pg.wait_for_timeout(150)

async def type_pin(a, pin, scope='#guard'):
    for ch in pin: await a.pg.click(f'{scope} [data-key="{ch}"]')
    await a.pg.wait_for_timeout(250)

@test('Night guard', 'valid', 'Guarded hours run from 2 h before bedtime to 2 h after the alarm, only while armed')
async def t_guard_window(a):
    await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 24, 20, 59)))
    check(await a.js('features/guard.js', 'm.isGuarded()') is False, 'not guarded while disarmed')
    await arm_now(a)
    check(await a.js('features/guard.js', 'm.isGuarded()') is False, '20:59 not yet')
    r = await a.js('features/guard.js', """[21*60, 23*60+59, 27*60, 32*60+29, 32*60+30, 39*60].map(min => m.isGuarded(new Date(2026, 9, 24, 0, min).getTime()))""")
    check(r == [True, True, True, True, False, False], f'21:00 → 08:29 guarded, 08:30 and 15:00 not: {r}')
    w = await a.js('features/guard.js', 'm.nightly()')
    check(w == {'from': 21 * 60, 'length': 690}, f'window {w}')
    await a.jump(60_000)
    check('Night guard on' in await a.pg.inner_text('[data-ref=chip]'), 'Today shows “Night guard on”')

@test('Night guard', 'valid', 'Outside guarded hours, Disarm works straight away')
async def t_guard_day(a):
    pg = await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 24, 14)))
    await arm_now(a)
    await a.js('features/guard.js', "m.setPin('4321')")
    await pg.click('[data-tab=alarm] [data-ref=disarm]'); await pg.wait_for_timeout(200)
    check(not await pg.query_selector('#guard'), 'no challenge in the daytime')
    check(await a.js('features/alarm.js', 'm.status().armed') is False, 'disarmed')

@test('Night guard', 'valid', 'At night, Disarm takes 3 sums then the buddy PIN; a wrong answer doesn’t count')
async def t_guard_disarm(a):
    pg = await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 24, 22, 30)))
    await arm_now(a)
    await a.js('features/guard.js', "m.setPin('4321')")
    await pg.click('[data-tab=alarm] [data-ref=disarm]'); await pg.wait_for_timeout(200)
    check(await a.visible('#guard') and 'step 1 of 2' in (await pg.inner_text('#guard')).lower(), 'sums first')
    await solve_sums(a, wrong_first=True)
    check('Buddy PIN' in await pg.inner_text('#guard'), 'then the buddy PIN')
    check(await a.js('features/alarm.js', 'm.status().armed'), 'still armed before the PIN')
    await type_pin(a, '4321')
    check(not await pg.query_selector('#guard'), 'challenge closes')
    check(await a.js('features/alarm.js', 'm.status().armed') is False, 'disarmed')

@test('Night guard', 'invalid', 'Backing out keeps the alarm; wrong PINs are refused and 5 in a row pause the pad')
async def t_guard_wrong(a):
    pg = await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 24, 23, 30)))
    await arm_now(a)
    await a.js('features/guard.js', "m.setPin('4321')")
    await pg.click('[data-tab=alarm] [data-ref=disarm]'); await pg.wait_for_timeout(200)
    await pg.click('#guard [data-act=cancel]'); await pg.wait_for_timeout(150)
    check(not await pg.query_selector('#guard') and await a.js('features/alarm.js', 'm.status().armed'), 'cancel keeps the alarm')
    await pg.click('[data-tab=alarm] [data-ref=disarm]'); await pg.wait_for_timeout(200)
    await solve_sums(a)
    for _ in range(4):
        await type_pin(a, '1111')
    check('not the PIN' in await pg.inner_text('#guard [data-ref=msg]'), 'wrong PIN message')
    await type_pin(a, '1111')
    check('Too many tries' in await pg.inner_text('#guard [data-ref=msg]'), 'paused after 5 wrong')
    r = await a.js('features/guard.js', "m.checkPin('4321')")
    check(r == 'paused', f'even the right PIN waits during the pause: {r}')
    check(await a.js('features/alarm.js', 'm.status().armed'), 'still armed')
    await a.jump(61_000)
    check(await a.js('features/guard.js', "m.checkPin('4321')") == 'ok', 'works again after a minute')

@test('Night guard', 'valid', 'Forgot the PIN: a 24-hour wait, then you can disarm without it (and the PIN is cleared)')
async def t_guard_forgot(a):
    pg = await a.open(seed={**GUARD_SEED, 'fl:tasks': []}, at=ms(ist(2026, 10, 24, 22, 30)))
    await arm_now(a)
    await a.js('features/guard.js', "m.setPin('4321')")
    await pg.click('[data-tab=alarm] [data-ref=disarm]'); await pg.wait_for_timeout(200)
    await solve_sums(a)
    await pg.click('#guard [data-act=forgot]'); await pg.wait_for_timeout(150)
    await pg.click('#guard [data-act=startWait]'); await pg.wait_for_timeout(1100)
    check('24-hour wait running' in await pg.inner_text('#guard'), 'countdown shown')
    check(re.search(r'23:59:\d\d', await pg.inner_text('#guard [data-ref=left]')), 'counts down from 24 h')
    await pg.click('#guard [data-act=keep]'); await pg.wait_for_timeout(150)
    check(await a.js('features/alarm.js', 'm.status().armed'), 'alarm kept')
    await a.jump(24 * 3600e3)   # the next night, 22:30 (still guarded); the 06:30 alarm rang on the way
    if await a.phase() == 'ringing': await a.type_phrase()
    await a.js('features/morning.js', '(m.close(), true)'); await pg.wait_for_timeout(200)
    await pg.evaluate("document.querySelectorAll('.sheet-backdrop').forEach(e => e.remove())")
    await a.tab('alarm')
    check(await a.js('features/alarm.js', 'm.status().armed'), 'still armed the next night')
    await pg.click('[data-tab=alarm] [data-ref=disarm]'); await pg.wait_for_timeout(200)
    await solve_sums(a)
    check('wait is over' in await pg.inner_text('#guard'), 'wait over')
    await pg.click('#guard [data-act=release]'); await pg.wait_for_timeout(200)
    check(await a.js('features/alarm.js', 'm.status().armed') is False, 'disarmed without the PIN')
    check(await a.js('features/guard.js', 'm.hasPin()') is False, 'PIN cleared for a new one')

@test('Night guard', 'valid', 'No buddy PIN yet: the sums alone unlock; moving the alarm at night also needs the check')
async def t_guard_nopin(a):
    pg = await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 25, 1)))
    await arm_now(a)
    await pg.fill('[data-tab=alarm] [data-ref=time]', '09:00'); await pg.dispatch_event('[data-tab=alarm] [data-ref=time]', 'change'); await pg.wait_for_timeout(200)
    check(await a.visible('#guard') and 'step 1 of 1' in (await pg.inner_text('#guard')).lower(), 'sums only, no PIN step')
    await pg.click('#guard [data-act=cancel]'); await pg.wait_for_timeout(200)
    check(await a.js('features/alarm.js', 'm.status().time') == '06:30', 'time kept when you back out')
    await pg.fill('[data-tab=alarm] [data-ref=time]', '09:00'); await pg.dispatch_event('[data-tab=alarm] [data-ref=time]', 'change'); await pg.wait_for_timeout(200)
    late = await a.js('features/guard.js', 'm.makeSums(7, 2)')
    check(all(x['answer'] > 50 for x in late), f'after midnight the sums are harder: {late}')
    await solve_sums(a)
    check(await a.js('features/alarm.js', 'm.status().time') == '09:00', 'moved after the sums')

@test('Night guard', 'invalid', 'The PIN must be 4 digits and is never stored as typed')
async def t_guard_pin_store(a):
    await a.open(seed=GUARD_SEED)
    r = await a.js('features/guard.js', "Promise.all([m.setPin('123'), m.setPin('12a4'), m.setPin(''), m.setPin(null), m.setPin('98765'), m.setPin('2468')])")
    check(r == [False, False, False, False, False, True], f'only 4 digits accepted: {r}')
    raw = await a.pg.evaluate("localStorage.getItem('fl:guard')")
    check('2468' not in raw and len(json.loads(raw)['pin']) == 64, 'stored as a salted SHA-256 hash')
    r2 = await a.js('features/guard.js', "Promise.all([m.checkPin('2468'), m.checkPin('2469')])")
    check(r2 == ['ok', 'wrong'], f'checks {r2}')
    bad = await a.pg.evaluate("localStorage.setItem('fl:guard', JSON.stringify({ pin: '<script>', salt: 1 })), 1")
    await a.pg.reload(); await a.pg.wait_for_timeout(400)
    check(await a.js('features/guard.js', 'm.hasPin()') is False and not a.errors, 'damaged PIN data is dropped safely')

@test('Night guard', 'valid', 'Setup step 2: a friend types the PIN twice; a mismatch starts again; it can be skipped')
async def t_guard_setup(a):
    pg = await a.open(onboarded=False, clock=False)
    await pg.fill('#onboarding [data-ref=name]', 'Priya'); await pg.click('[data-ob=next]'); await pg.wait_for_timeout(200)
    check('Hand your phone to a friend' in await pg.inner_text('#onboarding'), 'step 2 is the buddy PIN')
    await type_pin(a, '1357', '#onboarding'); await pg.wait_for_timeout(200)
    check('Once more' in await pg.inner_text('#onboarding'), 'asks again to confirm')
    await type_pin(a, '1358', '#onboarding')
    check('didn’t match' in await pg.inner_text('#onboarding'), 'mismatch explained')
    await type_pin(a, '2468', '#onboarding'); await pg.wait_for_timeout(200)
    await type_pin(a, '2468', '#onboarding'); await pg.wait_for_timeout(1200)
    check(await a.js('features/guard.js', 'm.hasPin()'), 'PIN saved')
    check(await pg.get_attribute('.ob-step', 'data-step') == 'logo', f'moves on to the logo step')
    a2 = App(a.browser); pg2 = await a2.open(onboarded=False, clock=False)
    await pg2.click('[data-ob=next]'); await pg2.wait_for_timeout(200)
    await pg2.click('[data-ob=next]'); await pg2.wait_for_timeout(200)
    check(await pg2.get_attribute('.ob-step', 'data-step') == 'logo' and await a2.js('features/guard.js', 'm.hasPin()') is False, 'skipped')
    await a2.close()

@test('Night guard', 'valid', '☰ Night guard: shows the hours, sets a PIN later, and removing it needs the PIN')
async def t_guard_menu(a):
    pg = await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 24, 14)))
    await a.menu('guard')
    txt = await pg.inner_text('[data-group=guard]')
    check('21:00 – 08:30' in txt and 'Not set yet' in txt, f'hours and PIN status: {txt!r}')
    await pg.click('[data-g=set]'); await pg.wait_for_timeout(200)
    await type_pin(a, '5555', '.guard-screen'); await pg.wait_for_timeout(200)
    await type_pin(a, '5555', '.guard-screen'); await pg.wait_for_timeout(1600)
    check(await a.js('features/guard.js', 'm.hasPin()'), 'PIN set from the menu')
    await pg.click('[data-g=remove]'); await pg.wait_for_timeout(200)
    await type_pin(a, '1234', '.pin-sheet')
    check(await a.js('features/guard.js', 'm.hasPin()'), 'wrong PIN doesn’t remove it')
    await type_pin(a, '5555', '.pin-sheet'); await pg.wait_for_timeout(200)
    check(await a.js('features/guard.js', 'm.hasPin()') is False, 'right PIN removes it')

@test('Night guard', 'invalid', 'At night, turning the guard off or erasing everything also needs the check')
async def t_guard_bypass(a):
    pg = await a.open(seed=GUARD_SEED, at=ms(ist(2026, 10, 24, 22)))
    await arm_now(a)
    await a.menu('guard')
    await pg.click('[data-group=guard] [data-switch=guardOn]', force=True); await pg.wait_for_timeout(200)
    check(await a.visible('#guard'), 'challenge to switch off')
    await pg.click('#guard [data-act=cancel]'); await pg.wait_for_timeout(200)
    check(await a.js('features/guard.js', 'm.state().enabled'), 'still on')
    await a.menu('reset')
    await pg.click('[data-ref=reset]'); await pg.wait_for_timeout(150)
    await pg.click('.sheet [data-i="0"]'); await pg.wait_for_timeout(200)
    check(await a.visible('#guard'), 'challenge before erasing')
    await pg.click('#guard [data-act=cancel]'); await pg.wait_for_timeout(200)
    check(await a.js('features/alarm.js', 'm.status().armed'), 'nothing erased')

@test('Night guard', 'valid', 'Android: the nightly pattern is handed over; an uninstall attempt opens the guard, and solving it gives 5 minutes')
async def t_guard_native(a):
    pg = await a.open(seed=GUARD_SEED, native={}, at=ms(ist(2026, 10, 24, 22)))
    await arm_now(a)
    cfg = (await first_light(a, 'setGuard'))[-1]['args']
    check(cfg['armed'] and cfg['uninstall'] and cfg['bed'] == '23:00' and cfg['wake'] == '06:30' and cfg['beforeMin'] == 120 and cfg['afterMin'] == 120, f'pattern {cfg}')
    await a.js('features/guard.js', "m.setPin('4321')")
    await pg.evaluate("window.__nativeEmit('guard', { kind: 'uninstall' })"); await pg.wait_for_timeout(250)
    check('guarding your sleep' in await pg.inner_text('#guard'), 'uninstall guard shown')
    await pg.click('#guard [data-act=go]'); await pg.wait_for_timeout(150)
    await solve_sums(a); await type_pin(a, '4321')
    check('You have 5 minutes' in await pg.inner_text('#guard'), '5-minute window')
    until = (await first_light(a, 'guardPass'))[-1]['args']['until']
    now = await pg.evaluate('Date.now()')
    check(abs(until - now - 5 * 60_000) < 5000, f'pass for 5 minutes ({until - now} ms)')
    await pg.click('#guard [data-act=settings]'); await pg.wait_for_timeout(150)
    check((await first_light(a, 'openSettings'))[-1]['args']['which'] == 'app', 'opens App info')
    await a.js('features/alarm.js', '(m.disarm(), true)')
    check((await first_light(a, 'setGuard'))[-1]['args']['armed'] is False, 'disarmed → Android stops guarding')

@test('Night guard', 'invalid', 'Android: “Never mind” keeps guarding; an uninstall launch while the app was closed still shows the guard')
async def t_guard_native_cancel(a):
    pg = await a.open(seed=GUARD_SEED, native={'launch': {'guard': 'uninstall'}}, at=ms(ist(2026, 10, 24, 22)))
    await pg.wait_for_timeout(300)
    check(await a.visible('#guard'), 'guard shown on launch')
    await pg.click('#guard [data-act=keep]'); await pg.wait_for_timeout(150)
    check(not await pg.query_selector('#guard'), 'closed')
    check(not await first_light(a, 'guardPass'), 'no pass given')

# ---------- Photo check
FAKE_ENGINE = """window.__photoEngine = {
  // Texts map to fixed directions; the "photo" is whatever window.__photoSays describes.
  vec(s) { const v = new Array(16).fill(0); let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 16] = 1; return v; },
  async embedTexts(ts) { return ts.map(t => this.vec(t)); },
  async embedImage() { return this.vec(window.__photoSays || 'a photo of a blank wall'); }
};"""

@test('Photo check', 'valid', 'Off by default (photos count on trust); with the checker on, a matching photo passes and shows its score')
async def t_photo_pass(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK, **NO_PROMPTS})
    r = await a.js('features/photo-check.js', "m.verify('data:image/png;base64,iVBORw0KGgo=', { id: 'x', name: 'Water', proof: 'a glass of water' })")
    check(r['checked'] is False and r['pass'], f'off: trusted {r}')
    await pg.evaluate(FAKE_ENGINE + "window.__photoSays = 'a photo of a glass of water';")
    await a.fire_direct(); await a.type_phrase()
    await a.prove_current_task()
    check(await a.phase() in ('done', 'closed'), f'proven with a matching photo: {await a.phase()}')

@test('Photo check', 'invalid', 'A photo of the wrong thing is refused; after 3 tries it can be counted anyway (marked unverified)')
async def t_photo_fail(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK, **NO_PROMPTS})
    await pg.evaluate(FAKE_ENGINE + "window.__photoSays = 'a photo of a ceiling';")
    await a.fire_direct(); await a.type_phrase()
    await pg.click('#morning [data-gate] button.gold'); await pg.wait_for_timeout(1200)
    for i in range(3):
        await pg.click('#camera [data-act=snap]'); await pg.wait_for_timeout(400)
        check('doesn’t look like a glass of water' in await pg.inner_text('#camera'), 'explains what was expected')
        if i < 2:
            check(not await pg.query_selector('#camera [data-act=trust]'), 'no shortcut before 3 tries')
            await pg.click('#camera [data-act=retake]'); await pg.wait_for_timeout(1200)
    await pg.click('#camera [data-act=trust]'); await pg.wait_for_timeout(300)
    check(await a.phase() in ('done', 'closed'), 'counted after 3 tries')
    check(await a.js('features/photo-check.js', 'm.state().unverified') == 1, 'marked unverified')

@test('Photo check', 'valid', 'Same-place reference: a photo somewhere else is refused; the decision maths is sound')
async def t_photo_place(a):
    pg = await a.open(seed={'fl:tasks': ONE_TASK, **NO_PROMPTS})
    await pg.evaluate(FAKE_ENGINE + "window.__photoSays = 'my kitchen counter';")
    await a.js('features/photo-check.js', "m.setReference('only', 'data:image/png;base64,iVBORw0KGgo=')")
    check(await a.js('features/photo-check.js', "m.hasReference('only')"), 'reference saved')
    await pg.evaluate("window.__photoSays = 'a photo of a glass of water'")
    r = await a.js('features/photo-check.js', "m.verify('data:image/png;base64,iVBORw0KGgo=', { id: 'only', name: 'Water', proof: 'a glass of water' })")
    check(r['checked'] and not r['pass'] and 'same spot' in r['reason'], f'right thing, wrong place: {r}')
    d = await a.js('features/photo-check.js', "[m.decide([0.31, 0.2, 0.19]), m.decide([0.2, 0.31, 0.19]), m.decide([0.25, 0.249, 0.1])]")
    check(d[0]['ok'] and not d[1]['ok'] and not d[2]['ok'], f'clear win passes; a decoy win or a near tie fails: {d}')

@test('Photo check', 'invalid', 'Switching it on offline explains why and stays off')
async def t_photo_offline(a):
    pg = await a.open()
    await pg.route('**/vendor/transformers/**', lambda r: r.abort())
    await a.tab('tasks')
    await pg.click('[data-switch=photocheck]', force=True); await pg.wait_for_timeout(800)
    check('Couldn’t download' in await a.toast_text() or 'offline' in await a.toast_text(), f'explained: {await a.toast_text()}')
    check(await a.js('features/photo-check.js', 'm.state().enabled') is False, 'stays off')
    check(not await pg.is_checked('[data-switch=photocheck]'), 'switch back off')

# ---------- SoulWake look
@test('SoulWake', 'valid', 'Today follows the design: greeting, clock, sky with Pip, wake card with the first task, slide to arm')
async def t_today_layout(a):
    pg = await a.open(at=ms(ist(2026, 10, 24, 21, 30)))
    hero = await pg.inner_text('.home-hero')
    check('Getting late, Priya' in hero and 'Bedtime in 1h 30m' in hero, f'greeting and bedtime: {hero!r}')
    check('Wind-down' in await pg.inner_text('[data-ref=chip]'), 'wind-down chip before bed')
    check(await pg.query_selector('.sky-card .scene') and await pg.query_selector('.sky-card .pet-card .pet'), 'Pip in the sky')
    first = await pg.inner_text('.first-task')
    check('Open-eyes selfie' in first and '3 tasks' in first, f'first task: {first!r}')
    await pg.click('.first-task'); await pg.wait_for_timeout(200)
    check(await pg.is_visible('[data-tab=tasks]'), 'tap → Routine')
    check(not await a.visible('.city-line'), 'no city line without a city theme')
    await pg.click('#appbar [data-ref=menu]'); await pg.wait_for_timeout(200)
    check('SoulWake' in await pg.inner_text('.drawer-foot') and 'Hi, Priya' in await pg.inner_text('.drawer-head'), 'menu head and wordmark')

@test('SoulWake', 'valid', 'Palette: new themes and accents are applied; Midnight + Antique Gold for new users')
async def t_palette(a):
    pg = await a.open(seed={'fl:profile': {'name': 'P', 'onboarded': True}})
    p = await a.js('features/profile.js', 'm.get()')
    check(p['theme'] == 'midnight' and p['accent'] == 'gold' and p['logo'] == 'soulwake', f'defaults {p}')
    labels = await a.js('ui/theme.js', 'Object.values(m.ACCENTS).map(x => x.label)')
    check(labels == ['Antique Gold', 'Burgundy', 'Olive', 'Navy'], f'accents {labels}')
    bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor")
    check(bg == 'rgb(19, 25, 54)', f'Neon Navy background {bg}')
    btn = await a.js('ui/theme.js', "[m.palette('midnight', 'rose')['--on-accent'], m.palette('ivory', 'gold')['--on-accent']]")
    check(btn == ['#F7F1EA', '#1A0F0A'], f'burgundy buttons get light text, gold gets dark: {btn}')

# ================================================================== runner
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def serve():
    handler = functools.partial(Quiet, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.ThreadingTCPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd

async def main(filter_text):
    httpd = serve()
    chosen = [t for t in TESTS if not filter_text or filter_text.lower() in (t['group'] + ' ' + t['name']).lower()]
    results = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=ARGS)
        for t in chosen:
            a = App(browser)
            start = time.time()
            status, err = 'PASS', ''
            try:
                await asyncio.wait_for(t['fn'](a), timeout=t.get('timeout', 60))
                if a.errors:
                    status, err = 'FAIL', 'Page error: ' + '; '.join(a.errors)[:300]
            except Fail as e:
                status, err = 'FAIL', str(e)
            except Exception as e:
                status, err = 'FAIL', f'{type(e).__name__}: {(str(e).splitlines() or ["(no message)"])[0][:300]}'
            finally:
                try: await a.close()
                except Exception: pass
            ms = int((time.time() - start) * 1000)
            results.append({**t, 'status': status, 'error': err, 'ms': ms})
            print(f"{'✔' if status == 'PASS' else '✘'} [{t['group']}] {t['name']} ({ms} ms){'  — ' + err if err else ''}", flush=True)
        await browser.close()
    httpd.shutdown()
    write_report(results)
    return results

def write_report(results):
    passed = sum(r['status'] == 'PASS' for r in results)
    valid = [r for r in results if r['kind'] == 'valid']
    invalid = [r for r in results if r['kind'] == 'invalid']
    lines = [
        '# SoulWake — test report', '',
        f"Run on {time.strftime('%Y-%m-%d %H:%M')} in headless Chromium at phone size (390×844).", '',
        f"**{passed} of {len(results)} passed.** {len(valid)} valid-use cases, {len(invalid)} invalid-input or failure cases.", '',
        'Spotify, YouTube, the Android bridge, and the city weather/news/Wikipedia services were replaced with local stand-ins (`tests/mocks/` and routes in `App._route_net`), so these tests prove the app’s handling of each response, not those servers themselves. Run a test alarm on your phone to confirm those end to end.', '',
        '| Result | Group | Type | Test | Time |', '|---|---|---|---|---|'
    ]
    for r in results:
        note = f"<br>_{r['error']}_" if r['error'] else ''
        lines.append(f"| {'✅' if r['status'] == 'PASS' else '❌'} | {r['group']} | {r['kind']} | {r['name']}{note} | {r['ms'] / 1000:.1f}s |")
    lines += ['', 'Re-run with `python3 tests/run_tests.py` (needs `pip install playwright` and `playwright install chromium`).', '']
    (ROOT / 'tests' / 'TEST-REPORT.md').write_text('\n'.join(lines))

if __name__ == '__main__':
    res = asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else ''))
    sys.exit(0 if all(r['status'] == 'PASS' for r in res) else 1)
