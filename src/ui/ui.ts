import { t, fmt, type I18nKey } from '../core/i18n';
import { CHARACTERS, getCharacter } from '../game/characters';
import { META, metaCost } from '../game/meta';
import { ACHIEVEMENTS } from '../game/achievements';
import { getUpgrade, UPGRADE_VALUES } from '../game/upgrades';
import { TUNING } from '../game/config';
import type { CharacterId, EnemyType, MetaId, UpgradeId } from '../game/types';
import type { App, RunResult } from '../app';
import { icon } from './icons';
import { Hud } from './hud';

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function orb(id: CharacterId, big = false): string {
  const c = getCharacter(id);
  return `<div class="orb ${big ? 'big' : ''} ${c.rainbow ? 'rainbow' : ''}" style="--c:${c.color}"></div>`;
}

function pips(level: number, max: number, next = false): string {
  let s = '<div class="pips">';
  for (let i = 0; i < max; i++) s += `<i class="${i < level ? 'on' : next && i === level ? 'next' : ''}"></i>`;
  return s + '</div>';
}

function fmtTime(sec: number): string {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(r).padStart(2, '0')}`;
}

/** Fills placeholders of an upgrade description for the given (next) level. */
export function upgradeDesc(id: UpgradeId, level: number): string {
  const key = `upgrade.${id}.desc` as I18nKey;
  switch (id) {
    case 'shockwave':
      return t(key, { v: UPGRADE_VALUES.shockRadius(level) });
    case 'frost':
      return t(key, { v: fmt(UPGRADE_VALUES.frostTime(level), 1), p: Math.round((1 - UPGRADE_VALUES.frostSlow(level)) * 100) });
    case 'chain':
      return t(key, { v: level });
    case 'ember':
      return t(key, { v: fmt(UPGRADE_VALUES.emberTick(level), 2) });
    case 'shield':
      return t(key, { v: TUNING.shield.regen[Math.min(3, level)] });
    case 'echo':
      return t(key, { v: level });
    case 'slowmo':
      return t(key, { v: fmt(UPGRADE_VALUES.slowmoTime(level), 1) });
    default:
      return t(key);
  }
}

export class UI {
  readonly hud: Hud;
  private root: HTMLElement;
  private current: HTMLElement | null = null;
  private banner: HTMLElement;
  private toasts: HTMLElement;
  private tut: HTMLElement | null = null;
  private bannerTimer = 0;
  screenName = '';

  constructor(private app: App) {
    this.root = document.getElementById('ui')!;
    this.banner = document.getElementById('banner')!;
    this.toasts = document.getElementById('toasts')!;
    this.hud = new Hud(document.getElementById('hud')!, () => app.pause(), () => app.pulse());
  }

  // ───────────────────────── Infrastructure ─────────────────────────

  private open(name: string, html: string, opts: { dim?: boolean; onAction?: (act: string, el: HTMLElement) => void } = {}): HTMLElement {
    this.close();
    const el = document.createElement('div');
    el.className = `screen ${opts.dim ? 'dim' : ''}`;
    el.dataset.screen = name;
    el.innerHTML = html;
    el.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!target || target.hasAttribute('disabled')) return;
      opts.onAction?.(target.dataset.act!, target);
    });
    this.root.appendChild(el);
    this.current = el;
    this.screenName = name;
    return el;
  }

  close(): void {
    const old = this.current;
    if (!old) return;
    this.current = null;
    this.screenName = '';
    old.classList.add('leaving');
    setTimeout(() => old.remove(), 200);
  }

  dialog(message: string, confirmLabel: string, onConfirm: () => void, danger = true): void {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<div class="dialog"><p>${esc(message)}</p><div class="grid2">
      <button class="btn ghost" data-act="no">${t('common.cancel')}</button>
      <button class="btn ${danger ? 'danger' : ''}" data-act="yes">${esc(confirmLabel)}</button></div></div>`;
    wrap.addEventListener('click', (e) => {
      const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (e.target === wrap || act === 'no') {
        this.app.audio.uiBack();
        wrap.remove();
      } else if (act === 'yes') {
        wrap.remove();
        onConfirm();
      }
    });
    document.body.appendChild(wrap);
  }

  showBanner(title: string, sub = '', boss = false, duration = 2100): void {
    this.banner.className = '';
    this.banner.innerHTML = `<div class="b-title">${esc(title)}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    void this.banner.offsetWidth;
    this.banner.className = `show ${boss ? 'boss' : ''}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.banner.className = ''), duration);
  }

  clearBanner(): void {
    this.banner.className = '';
  }

  toast(kicker: string, title: string, ico = 'trophy'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="ico-wrap">${icon(ico, 22)}</div><div><div class="t1">${esc(kicker)}</div><div class="t2">${esc(title)}</div></div>`;
    this.toasts.appendChild(el);
    setTimeout(() => el.remove(), 3700);
  }

  newEnemyText(type: EnemyType): string {
    return `<b>${esc(t('banner.newEnemy', { name: t(`enemy.${type}` as I18nKey) }))}</b> – ${esc(t(`hint.${type}` as I18nKey))}`;
  }

  // ───────────────────────── Menu ─────────────────────────

  showMenu(): void {
    const s = this.app.save.data;
    const daily = this.app.dailyInfo();
    const dailyPlayed = s.daily.date === daily.date;
    const canAffordAny = META.some((m) => (s.meta[m.id] ?? 0) < m.max && s.bank >= metaCost(m, s.meta[m.id] ?? 0));
    const html = `
      <div class="topbar">
        <button class="icon-btn" data-act="settings" aria-label="${t('menu.settings')}">${icon('gear')}</button>
        <div class="pill">${icon('shard', 16)}<span>${fmt(s.bank)}</span></div>
      </div>
      <div class="screen-inner">
        <div class="logo"><h1><span>LUMEN</span><span>LOOP</span></h1><p>${t('app.tagline')}</p></div>
        <button class="char-chip" data-act="sparks">${orb(s.selected)}<span>${t(`char.${s.selected}.name` as I18nKey)}</span></button>
        <button class="btn primary" data-act="play">${icon('play', 22)}${t('menu.play')}</button>
        <div class="grid2">
          <button class="btn" data-act="daily">${icon('calendar', 26)}${t('menu.daily')}${dailyPlayed ? '' : '<span class="badge"></span>'}</button>
          <button class="btn" data-act="workshop">${icon('wrench', 26)}${t('menu.workshop')}${canAffordAny ? '<span class="badge"></span>' : ''}</button>
          <button class="btn" data-act="sparks">${icon('spark', 26)}${t('menu.sparks')}</button>
          <button class="btn" data-act="achievements">${icon('trophy', 26)}${t('menu.achievements')}</button>
        </div>
        <div class="records">
          <span>${t('menu.best')}: <b>${fmt(s.best)}</b></span>
          <span>${t('menu.bestWave')}: <b>${s.bestWave}</b></span>
        </div>
        ${this.app.canInstall ? `<button class="btn ghost small" data-act="install">${icon('download', 18)}${t('menu.install')}</button>` : ''}
        ${this.app.showIosHint ? `<div class="hint">${t('menu.installHint')}</div>` : ''}
      </div>`;
    this.open('menu', html, {
      onAction: (act) => {
        this.app.audio.uiClick();
        if (act === 'play') this.app.startRun(false);
        else if (act === 'daily') this.showDaily();
        else if (act === 'workshop') this.showWorkshop();
        else if (act === 'sparks') this.showSparks();
        else if (act === 'achievements') this.showAchievements();
        else if (act === 'settings') this.showSettings('menu');
        else if (act === 'install') this.app.install();
      },
    });
  }

  private backBar(title: string, right = ''): string {
    return `<div class="topbar"><button class="icon-btn" data-act="back" aria-label="${t('common.back')}">${icon('back')}</button><h2>${esc(title)}</h2>${right}</div>`;
  }

  private bankPill(): string {
    return `<div class="pill">${icon('shard', 16)}<span>${fmt(this.app.save.data.bank)}</span></div>`;
  }

  // ───────────────────────── Daily ─────────────────────────

  showDaily(): void {
    const s = this.app.save.data;
    const d = this.app.dailyInfo();
    const c = getCharacter(d.character);
    const locked = !s.chars.includes(c.id);
    const best = s.daily.date === d.date ? fmt(s.daily.best) : t('daily.none');
    const mods = d.modifiers
      .map(
        (m) => `<div class="item"><div class="ico-wrap">${icon('star', 22)}</div><div class="body">
        <div class="name">${t(`mod.${m}.name` as I18nKey)}</div><div class="desc">${t(`mod.${m}.desc` as I18nKey)}</div></div></div>`,
      )
      .join('');
    const html = `${this.backBar(t('daily.title'))}
      <div class="screen-inner">
        <div class="panel" style="text-align:center">
          <div class="daily-date">${esc(new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
          <p class="hint" style="margin:8px 0 0">${t('daily.desc')}</p>
        </div>
        <div class="panel">
          <h3>${t('daily.spark')}</h3>
          <div class="item">${orb(c.id)}<div class="body"><div class="name">${t(`char.${c.id}.name` as I18nKey)}</div>
            <div class="desc">${t(`char.${c.id}.desc` as I18nKey)}</div></div></div>
          ${locked ? `<p class="hint" style="margin:10px 0 0">${t('daily.lockedSpark')}</p>` : ''}
        </div>
        <div class="panel"><h3>${t('daily.mods')}</h3><div class="list">${mods}</div></div>
        <div class="records"><span>${t('daily.best')}: <b>${best}</b></span></div>
        <button class="btn primary" data-act="start">${icon('play', 22)}${t('daily.start')}</button>
      </div>`;
    this.open('daily', html, {
      onAction: (act) => {
        if (act === 'back') {
          this.app.audio.uiBack();
          this.showMenu();
        } else if (act === 'start') {
          this.app.audio.uiSelect();
          this.app.startRun(true);
        }
      },
    });
  }

  // ───────────────────────── Workshop ─────────────────────────

  showWorkshop(): void {
    const s = this.app.save.data;
    const items = META.map((m) => {
      const lv = s.meta[m.id] ?? 0;
      const maxed = lv >= m.max;
      const cost = metaCost(m, lv);
      const afford = s.bank >= cost;
      return `<div class="item">
        <div class="ico-wrap">${icon(`meta.${m.id}`, 24)}</div>
        <div class="body"><div class="name">${t(`meta.${m.id}.name` as I18nKey)}</div>
          <div class="desc">${t(`meta.${m.id}.desc` as I18nKey)}</div>${pips(lv, m.max)}</div>
        <button class="btn small" data-act="buy" data-id="${m.id}" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed ? t('common.max') : `<span class="price">${icon('shard', 14)}${fmt(cost)}</span>`}</button>
      </div>`;
    }).join('');
    const html = `${this.backBar(t('workshop.title'), this.bankPill())}
      <div class="screen-inner top"><p class="hint" style="margin:0">${t('workshop.desc')}</p><div class="list">${items}</div></div>`;
    this.open('workshop', html, {
      onAction: (act, el) => {
        if (act === 'back') {
          this.app.audio.uiBack();
          this.showMenu();
        } else if (act === 'buy') {
          if (this.app.buyMeta(el.dataset.id as MetaId)) this.showWorkshop();
        }
      },
    });
  }

  // ───────────────────────── Sparks ─────────────────────────

  showSparks(): void {
    const s = this.app.save.data;
    const bar = (label: string, v: number, color: string) =>
      `<span>${label}</span><div class="bar"><i style="width:${Math.round(Math.min(1, v) * 100)}%;--c:${color}"></i></div>`;
    const cards = CHARACTERS.map((c) => {
      const owned = s.chars.includes(c.id);
      const sel = s.selected === c.id;
      const hearts = (TUNING.player.hearts + c.heartsDelta) / 4;
      const btn = sel
        ? `<button class="btn small" disabled>${icon('check', 18)}${t('common.selected')}</button>`
        : owned
          ? `<button class="btn small" data-act="select" data-id="${c.id}">${t('common.select')}</button>`
          : `<button class="btn small" data-act="buy" data-id="${c.id}" ${s.bank >= c.price ? '' : 'disabled'}>
              ${icon('lock', 16)}<span class="price">${icon('shard', 14)}${fmt(c.price)}</span></button>`;
      return `<div class="spark-card ${sel ? 'selected' : ''}">${orb(c.id, true)}
        <div class="body"><div class="name" style="font-weight:750;font-size:18px">${t(`char.${c.id}.name` as I18nKey)}</div>
          <div class="desc" style="color:var(--muted);font-size:13.5px;margin-top:2px">${t(`char.${c.id}.desc` as I18nKey)}</div>
          <div class="bars">${bar(t('sparks.agility'), 1 / c.hitMul / 1.45, c.color)}${bar(t('sparks.trail'), c.trailMul / 1.35, c.color)}${bar(t('sparks.hearts'), hearts, '#ff5577')}</div>
          ${btn}</div></div>`;
    }).join('');
    const html = `${this.backBar(t('sparks.title'), this.bankPill())}
      <div class="screen-inner top"><p class="hint" style="margin:0">${t('sparks.desc')}</p><div class="list">${cards}</div></div>`;
    this.open('sparks', html, {
      onAction: (act, el) => {
        const id = el.dataset.id as CharacterId;
        if (act === 'back') {
          this.app.audio.uiBack();
          this.showMenu();
        } else if (act === 'select') {
          this.app.selectChar(id);
          this.showSparks();
        } else if (act === 'buy') {
          if (this.app.buyChar(id)) this.showSparks();
        }
      },
    });
  }

  // ───────────────────────── Achievements ─────────────────────────

  showAchievements(): void {
    const s = this.app.save.data;
    const done = ACHIEVEMENTS.filter((a) => s.ach[a]).length;
    const items = ACHIEVEMENTS.map((a) => {
      const ok = !!s.ach[a];
      return `<div class="item ${ok ? 'done' : 'locked'}"><div class="ico-wrap">${icon(ok ? 'trophy' : 'lock', 22)}</div>
        <div class="body"><div class="name">${t(`ach.${a}.name` as I18nKey)}</div><div class="desc">${t(`ach.${a}.desc` as I18nKey)}</div></div></div>`;
    }).join('');
    const st = s.stats;
    const stat = (k: I18nKey, v: string) => `<div class="stat"><div class="v">${v}</div><div class="l">${t(k)}</div></div>`;
    const html = `${this.backBar(t('ach.title'), `<div class="pill">${icon('trophy', 16)}<span>${t('ach.progress', { n: done, max: ACHIEVEMENTS.length })}</span></div>`)}
      <div class="screen-inner top">
        <div class="panel"><h3>${t('stats.title')}</h3><div class="stats">
          ${stat('stats.runs', fmt(st.runs))}${stat('stats.kills', fmt(st.kills))}${stat('stats.loops', fmt(st.loops))}
          ${stat('stats.bestWave', fmt(st.bestWave))}${stat('stats.bestLoop', fmt(st.bestLoop))}${stat('stats.bestCombo', '×' + fmt(st.bestCombo))}
          ${stat('stats.bossKills', fmt(st.bossKills))}${stat('stats.shardsTotal', fmt(st.shardsTotal))}${stat('stats.playTime', fmtTime(st.playTime))}
        </div></div>
        <div class="list">${items}</div>
      </div>`;
    this.open('achievements', html, {
      onAction: (act) => {
        if (act === 'back') {
          this.app.audio.uiBack();
          this.showMenu();
        }
      },
    });
  }

  // ───────────────────────── Settings ─────────────────────────

  showSettings(from: 'menu' | 'pause'): void {
    const st = this.app.save.data.settings;
    const slider = (key: string, label: I18nKey, v: number, min: number, max: number, step: number) =>
      `<div class="row"><label for="s-${key}">${t(label)}</label>
       <input id="s-${key}" type="range" min="${min}" max="${max}" step="${step}" value="${v}" data-key="${key}" style="--v:${((v - min) / (max - min)) * 100}%"></div>`;
    const toggle = (key: string, label: I18nKey, on: boolean) =>
      `<div class="row"><label>${t(label)}</label><button class="toggle ${on ? 'on' : ''}" data-act="toggle" data-key="${key}" aria-pressed="${on}" aria-label="${t(label)}"></button></div>`;
    const seg = (key: string, label: I18nKey, value: string, options: [string, string][]) =>
      `<div class="row"><label>${t(label)}</label><div class="seg">${options
        .map(([v, l]) => `<button class="${v === value ? 'on' : ''}" data-act="seg" data-key="${key}" data-value="${v}">${esc(l)}</button>`)
        .join('')}</div></div>`;
    const html = `${this.backBar(t('settings.title'))}
      <div class="screen-inner top">
        <div class="panel"><h3>${t('settings.audio')}</h3>
          ${slider('music', 'settings.music', st.music, 0, 1, 0.05)}
          ${slider('sfx', 'settings.sfx', st.sfx, 0, 1, 0.05)}
        </div>
        <div class="panel"><h3>${t('settings.controls')}</h3>
          ${slider('sensitivity', 'settings.sensitivity', st.sensitivity, 0.6, 1.8, 0.05)}
          ${toggle('haptics', 'settings.haptics', st.haptics)}
        </div>
        <div class="panel"><h3>${t('settings.display')}</h3>
          ${toggle('shake', 'settings.shake', st.shake)}
          ${toggle('reducedMotion', 'settings.reducedMotion', st.reducedMotion)}
          ${seg('quality', 'settings.quality', st.quality, [['auto', t('settings.quality.auto')], ['high', t('settings.quality.high')], ['low', t('settings.quality.low')]])}
          ${seg('lang', 'settings.lang', st.lang, [['auto', t('settings.lang.auto')], ['de', 'DE'], ['en', 'EN']])}
        </div>
        ${
          from === 'menu'
            ? `<div class="panel"><h3>${t('settings.data')}</h3><div class="list">
          <button class="btn" data-act="tutorial">${t('settings.tutorial')}</button>
          <button class="btn danger" data-act="reset">${t('settings.reset')}</button></div>
          ${this.app.save.persistent ? '' : `<p class="hint">${t('settings.noStorage')}</p>`}</div>`
            : ''
        }
        <p class="hint">LUMEN LOOP v${__APP_VERSION__} · ${t('settings.credits')}</p>
      </div>`;
    const el = this.open('settings', html, {
      dim: from === 'pause',
      onAction: (act, btn) => {
        const key = btn.dataset.key as keyof typeof st;
        if (act === 'back') {
          this.app.audio.uiBack();
          if (from === 'pause') this.showPause();
          else this.showMenu();
        } else if (act === 'toggle') {
          (st[key] as boolean) = !st[key];
          btn.classList.toggle('on', !!st[key]);
          btn.setAttribute('aria-pressed', String(!!st[key]));
          this.app.applySettings();
          this.app.audio.uiClick();
          if (key === 'haptics' && st.haptics) this.app.haptics.buzz(30);
        } else if (act === 'seg') {
          (st[key] as string) = btn.dataset.value!;
          btn.parentElement!.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
          this.app.applySettings();
          this.app.audio.uiClick();
          if (key === 'lang') this.showSettings(from);
        } else if (act === 'tutorial') {
          this.app.audio.uiSelect();
          this.app.startTutorial();
        } else if (act === 'reset') {
          this.dialog(t('settings.resetConfirm'), t('settings.reset'), () => {
            this.app.resetSave();
            this.showMenu();
          });
        }
      },
    });
    el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((input) => {
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        (st[input.dataset.key as 'music'] as number) = v;
        input.style.setProperty('--v', `${((v - parseFloat(input.min)) / (parseFloat(input.max) - parseFloat(input.min))) * 100}%`);
        this.app.applySettings();
      });
      input.addEventListener('change', () => this.app.audio.uiClick());
    });
  }

  // ───────────────────────── Pause ─────────────────────────

  showPause(): void {
    const w = this.app.world;
    const ups = w ? (Object.entries(w.upgrades) as [UpgradeId, number][]).filter(([, l]) => l > 0) : [];
    const chips = ups.length
      ? `<div class="chips">${ups
          .map(([id, l]) => `<span class="chip">${icon(id, 18)}${t(`upgrade.${id}.name` as I18nKey)} <small>${l}/${getUpgrade(id).max}</small></span>`)
          .join('')}</div>`
      : `<p class="hint" style="margin:0;text-align:left">${t('pause.none')}</p>`;
    const html = `<div class="screen-inner">
        <div class="upgrade-head"><h2 style="font-size:34px">${t('pause.title')}</h2></div>
        <button class="btn primary" data-act="resume">${icon('play', 22)}${t('pause.resume')}</button>
        <div class="panel"><h3>${t('pause.upgrades')}</h3>${chips}</div>
        <div class="grid2">
          <button class="btn" data-act="settings">${icon('gear', 24)}${t('menu.settings')}</button>
          <button class="btn" data-act="restart">${icon('refresh', 24)}${t('pause.restart')}</button>
        </div>
        <button class="btn ghost" data-act="menu">${t('pause.menu')}</button>
      </div>`;
    this.open('pause', html, {
      dim: true,
      onAction: (act) => {
        if (act === 'resume') {
          this.app.audio.uiSelect();
          this.app.resume();
        } else if (act === 'settings') {
          this.app.audio.uiClick();
          this.showSettings('pause');
        } else if (act === 'restart') {
          this.dialog(t('pause.confirmQuit'), t('pause.restart'), () => this.app.restart());
        } else if (act === 'menu') {
          this.dialog(t('pause.confirmQuit'), t('pause.menu'), () => this.app.quitToMenu());
        }
      },
    });
  }

  // ───────────────────────── Upgrade choice ─────────────────────────

  showUpgrade(offer: UpgradeId[], wave: number, rerolls: number): void {
    const w = this.app.world!;
    const cards = offer
      .map((id) => {
        const def = getUpgrade(id);
        const lv = w.upgrades[id] ?? 0;
        return `<button class="card ${def.rarity}" data-act="pick" data-id="${id}">
          <div class="ico-wrap">${icon(id, 28)}</div>
          <div class="body"><div class="top"><span class="name">${t(`upgrade.${id}.name` as I18nKey)}</span>
            <span class="rarity">${t(`rarity.${def.rarity}` as I18nKey)}</span></div>
            <div class="desc">${upgradeDesc(id, lv + 1)}</div>${def.max > 1 ? pips(lv, def.max, true) : ''}</div>
        </button>`;
      })
      .join('');
    const html = `<div class="screen-inner">
        <div class="upgrade-head"><div class="kicker">${t('upgrade.subtitle', { n: wave })}</div><h2>${t('upgrade.title')}</h2></div>
        <div class="cards">${cards}</div>
        ${rerolls > 0 ? `<button class="btn ghost small" data-act="reroll">${icon('refresh', 18)}${t('upgrade.reroll', { n: rerolls })}</button>` : ''}
      </div>`;
    let picked = false;
    const el = this.open('upgrade', html, {
      dim: true,
      onAction: (act, btn) => {
        if (picked) return;
        if (act === 'pick') {
          picked = true;
          btn.classList.add('picked');
          this.app.audio.uiSelect();
          this.app.haptics.buzz(20);
          setTimeout(() => this.app.pickUpgrade(btn.dataset.id as UpgradeId), 220);
        } else if (act === 'reroll') {
          this.app.audio.uiClick();
          this.app.rerollUpgrade();
        }
      },
    });
    // Ignore taps for a moment – the steering finger may still be on the screen.
    const cardsEl = el.querySelector('.cards')!;
    setTimeout(() => cardsEl.classList.add('armed'), 650);
  }

  // ───────────────────────── Game over ─────────────────────────

  showGameOver(r: RunResult): void {
    const stat = (k: I18nKey, v: string) => `<div class="stat"><div class="v">${v}</div><div class="l">${t(k)}</div></div>`;
    const ach = r.newAchievements.length
      ? `<div class="panel"><h3>${t('over.newAch')}</h3><div class="chips">${r.newAchievements
          .map((a) => `<span class="chip">${icon('trophy', 16)}${t(`ach.${a}.name` as I18nKey)}</span>`)
          .join('')}</div></div>`
      : '';
    const html = `<div class="screen-inner">
        <div class="over-title"><h2>${t('over.title')}</h2><p>${t('over.subtitle')}</p></div>
        <div class="big-score"><div class="l">${t('over.score')}</div><div class="v" id="final-score">0</div>
          ${r.newBest ? `<div class="new-best">${t(r.daily ? 'over.newDaily' : 'over.newBest')}</div>` : ''}</div>
        <div class="stats">
          ${stat('over.wave', fmt(r.wave))}${stat('over.kills', fmt(r.kills))}${stat('over.loops', fmt(r.loops))}
          ${stat('over.bestLoop', fmt(r.bestLoop))}${stat('over.combo', '×' + fmt(r.maxCombo))}${stat('over.time', fmtTime(r.time))}
        </div>
        <div class="panel earned">${icon('shard', 22)}+${fmt(r.shards)} <span style="color:var(--muted);font-weight:550;font-size:15px">${t('over.shards')}</span></div>
        ${ach}
        ${r.canAfford ? `<p class="hint" style="margin:0">${t('over.workshopHint')}</p>` : ''}
        <button class="btn primary" data-act="again">${icon('refresh', 22)}${t('over.again')}</button>
        <div class="grid2">
          <button class="btn" data-act="workshop">${icon('wrench', 24)}${t('menu.workshop')}</button>
          <button class="btn" data-act="menu">${icon('back', 24)}${t('over.menu')}</button>
        </div>
      </div>`;
    const el = this.open('gameover', html, {
      dim: true,
      onAction: (act) => {
        this.app.audio.uiClick();
        if (act === 'again') this.app.startRun(r.daily);
        else if (act === 'workshop') {
          this.app.toMenuState();
          this.showWorkshop();
        } else if (act === 'menu') this.app.quitToMenu();
      },
    });
    // Count-up animation for the final score.
    const target = el.querySelector('#final-score')!;
    const start = performance.now();
    const dur = Math.min(1400, 300 + r.score / 20);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      target.textContent = fmt(Math.round(r.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1 && target.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ───────────────────────── Tutorial ─────────────────────────

  tutorial(text: string, step: number, total: number, finish?: () => void): void {
    this.tut?.remove();
    const el = document.createElement('div');
    el.className = 'tut';
    let dots = '';
    for (let i = 0; i < total; i++) dots += `<i class="${i <= step ? 'on' : ''}"></i>`;
    el.innerHTML = `<div class="k"><span>${t('tut.title')} <span class="dots">${dots}</span></span>
        ${finish ? '' : `<button class="tut-skip" data-act="skip">${t('tut.skip')}</button>`}</div><p>${esc(text)}</p>
      ${finish ? `<div class="actions"><button class="btn primary" data-act="go">${t('tut.start')}</button></div>` : ''}`;
    el.querySelector('[data-act=go]')?.addEventListener('click', () => finish?.());
    el.querySelector('[data-act=skip]')?.addEventListener('click', () => this.app.finishTutorial());
    document.body.appendChild(el);
    this.tut = el;
  }

  clearTutorial(): void {
    this.tut?.remove();
    this.tut = null;
  }
}
