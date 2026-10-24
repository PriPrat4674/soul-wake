#!/usr/bin/env python3
"""
SoulWake first-time user walkthrough: installs (fresh data), goes through setup and a full first morning
in the Android-app mode, screenshotting every step into tests/walkthrough/.
Usage: python3 tests/walkthrough.py
"""
import asyncio, json, sys
from pathlib import Path
sys.argv = sys.argv[:1]
sys.path.insert(0, str(Path(__file__).parent))
import run_tests as T

OUT = Path(__file__).parent / 'walkthrough'
OUT.mkdir(exist_ok=True)
LOG = []

async def main():
    httpd = T.serve()
    async with T.async_playwright() as p:
        b = await p.chromium.launch(args=T.ARGS)
        a = T.App(b)
        n = [0]
        async def shot(title, full=False):
            n[0] += 1
            name = f'{n[0]:02d}-{title.lower().replace(" ", "-").replace("/", "")[:40]}.png'
            await a.pg.screenshot(path=str(OUT / name), full_page=full)
            LOG.append(f'{n[0]:02d}. {title} — {name}')
        pg = await a.open(onboarded=False, at=T.ms(T.ist(2026, 10, 14, 21, 0)), native={'status': {'notifications': False, 'batteryUnrestricted': False}})
        await a.tick(600)
        await shot('Setup - meet Pip')
        await pg.fill('#onboarding [data-ref=name]', 'Priya'); await shot('Setup - name typed')
        await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - buddy PIN')
        for ch in '2468': await pg.click(f'#onboarding [data-key="{ch}"]')
        await a.tick(400); await shot('Setup - PIN once more')
        for ch in '2468': await pg.click(f'#onboarding [data-key="{ch}"]')
        await a.tick(300); await shot('Setup - PIN set')
        await a.tick(1200); await shot('Setup - logo')
        await pg.click('[data-pick=logo][data-value=soulwake]'); await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - colour')
        await pg.click('[data-pick=accent][data-value=gold]'); await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - theme')
        await pg.click('[data-pick=theme][data-value=midnight]'); await a.tick(200); await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - font')
        await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - style')
        await pg.click('[data-pick=style][data-value=soft]'); await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - sleep schedule')
        await pg.fill('#onboarding [data-ref=bed]', '23:30'); await pg.dispatch_event('#onboarding [data-ref=bed]', 'change')
        await pg.click('[data-ob=next]'); await a.tick(700); await shot('Setup - Android permissions')
        await pg.click('[data-perm=notifications]'); await a.tick(1200); await shot('Setup - notifications allowed')
        await pg.click('[data-ob=next]'); await a.tick(400); await shot('Setup - all set')
        await pg.click('[data-ob=next]'); await a.tick(700); await shot('Pip flies in after setup')
        await a.tick(3000); await shot('Today - first look', full=True)
        await pg.click('#appbar [data-ref=menu]'); await a.tick(300); await shot('Menu')
        await pg.keyboard.press('Escape'); await a.menu('look'); await shot('Menu - Look and feel', full=True)
        await a.tab('tasks'); await pg.click('[data-tpl="0"]'); await a.tick(300); await shot('Routine - added Make the bed', full=True)
        await a.tab('sleep'); await a.tick(300); await shot('Sleep tab', full=True)
        await a.tab('sounds'); await pg.set_input_files('[data-ref=songInput]', [str(T.FIX / 'song-a.wav')]); await pg.wait_for_timeout(500); await shot('Wake-up music', full=True)
        await a.js('core/events.js', "m.emit('share:text', { text: 'https://open.spotify.com/playlist/37i9dQZF1DX0UrRvztWcAU?si=1' })"); await a.tick(600); await shot('Shared a Spotify playlist')
        await pg.click('[data-seg=source] [data-value=local]'); await a.tick(200)
        await a.menu('sleep'); await a.tick(300); await shot('Menu - Sleep schedule')
        await a.menu('guard'); await a.tick(300); await shot('Menu - Night guard', full=True)
        await pg.clock.fast_forward(45 * 60 * 1000)   # 21:45, inside the guarded hours (bed 23:30)
        await a.tab('alarm'); await a.arm_by_keyboard(); await a.tick(400); await shot('Armed, night guard on')
        await pg.click('[data-tab=alarm] [data-ref=disarm]'); await a.tick(300); await shot('Night disarm - sums')
        await T.solve_sums(a); await shot('Night disarm - buddy PIN')
        await pg.click('#guard [data-act=forgot]'); await a.tick(300); await shot('Night disarm - forgot the PIN')
        await pg.click('#guard [data-act=toPin]'); await a.tick(200); await pg.click('#guard [data-act=cancel]'); await a.tick(200)
        await pg.evaluate("window.__nativeEmit('guard', { kind: 'uninstall' })"); await a.tick(300); await shot('Uninstall guard')
        await pg.click('#guard [data-act=keep]'); await a.tick(200)
        # The next morning
        await pg.clock.fast_forward(int(8.6 * 3600 * 1000)); await pg.wait_for_timeout(300)
        await pg.evaluate("window.__nativeEmit('alarm', { kind: 'wake' })"); await a.tick(600); await shot('Morning - ringing')
        p = await a.phrase(); await pg.type('#morning [data-ref=input]', p[:9] + 'x'); await shot('Morning - typing with a mistake')
        await pg.fill('#morning [data-ref=input]', p); await pg.click('#morning [data-ref=stop]'); await a.tick(400); await shot('Morning - tasks')
        await pg.click('#morning [data-ref=leave]'); await a.tick(300); await shot('Morning - stepped away, pill counts down')
        await pg.click('#appbar .pill'); await a.tick(300)
        await a.prove_current_task(); await a.tick(300); await shot('Morning - first task proven')
        await a.prove_current_task(); await a.tick(300)
        await pg.click('#morning [data-gate] button.gold') if await pg.query_selector('#morning [data-gate] button.gold') else None
        await a.tick(1500); await shot('Morning - camera') if await a.visible('#camera') else None
        if await a.visible('#camera'):
            await pg.click('#camera [data-act=snap]'); await a.tick(300); await pg.click('#camera [data-act=next]'); await a.tick(300)
        await a.tick(5 * 60_000 + 1000); await shot('Morning - check-in')
        if await a.visible('#checkin'): await pg.click('#checkin [data-ref=yes]'); await a.tick(400)
        await a.tick(10 * 60_000 + 1000)
        while await pg.query_selector('#morning [data-gate] button.gold'):
            await a.prove_current_task(); await a.tick(400)
        await a.tick(1500); await shot('Morning - report card')
        await pg.click('#morning [data-ref=close]'); await a.tick(400)
        await a.tab('progress'); await a.tick(300); await shot('Progress', full=True)
        await a.tab('alarm'); await a.tick(300); await shot('Today - after first morning', full=True)
        await pg.evaluate("window.__nativeEmit('locked', { pkg: 'com.instagram.android' })"); await a.tick(400); await shot('App lock reminder')
        await pg.click('.sheet [data-i="0"]'); await a.tick(200)
        # Look at another theme
        await a.js('features/profile.js', "(m.setMany({ theme: 'ivory', accent: 'rose', font: 'friendly', style: 'bold', logo: 'soulwake' }), true)"); await a.tick(300)
        await shot('Ivory, rose, friendly, bold', full=True)
        await a.js('features/profile.js', "(m.setMany({ theme: 'dusk', accent: 'gold', font: 'typewriter', style: 'elegant' }), true)"); await a.tick(300)
        await shot('Dusk, gold, typewriter, elegant', full=True)
        await a.js('features/profile.js', "(m.setMany({ theme: 'kerala', accent: 'gold', font: 'classic', style: 'elegant' }), true)"); await a.tick(1500)
        await shot('Kerala city theme')
        # An afternoon nap
        await pg.clock.fast_forward(6 * 3600 * 1000); await a.tick(1500)
        await a.sleep_click('[data-ref=now]'); await a.tick(300); await shot('Nap - how long?')
        await pg.click('.sheet [data-nap="20"]'); await a.tick(300)
        await pg.evaluate("window.__nativeEmit('alarm', { kind: 'nap' })"); await a.tick(400); await shot('Nap - over')
        await pg.click('#nap [data-ref=up]'); await a.tick(400)
        print('errors:', a.errors)
        await b.close()
    httpd.shutdown()
    (OUT / 'steps.txt').write_text('\n'.join(LOG) + '\n')
    print('\n'.join(LOG))

asyncio.run(main())
