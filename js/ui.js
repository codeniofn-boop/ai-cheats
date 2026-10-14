// HUD controller (Agent 1). Operates on the markup in index.html.
// Every method is safe to call every frame: DOM nodes are cached and
// textContent / classes are only written when the value actually changes.

const KILLFEED_MAX = 5;
const KILLFEED_LIFETIME_MS = 4000;
const KILLFEED_FADE_MS = 650;
const HITMARKER_MS = 120;
const ARMOR_MAX = 50; // VALORANT heavy shield

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' + r : String(r));
}

export class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);

    this.el = {
      hud: $('hud'),
      overlay: $('overlay'),
      overlayTitle: $('overlay-title'),
      overlaySubtitle: $('overlay-subtitle'),
      fps: $('fps'),
      timer: $('round-timer'),
      kills: $('score-kills'),
      deaths: $('score-deaths'),
      killfeed: $('killfeed'),
      vignette: $('damage-vignette'),
      hitmarker: $('hitmarker'),
      reloading: $('reloading'),
      message: $('message'),
      healthBar: $('health-bar'),
      healthValue: $('health-value'),
      healthStat: null,
      armorBar: $('armor-bar'),
      armorValue: $('armor-value'),
      weaponName: $('weapon-name'),
      ammoMag: $('ammo-mag'),
      ammoReserve: $('ammo-reserve'),
    };
    this.el.healthStat = this.el.healthValue ? this.el.healthValue.closest('.hud-stat') : null;

    for (const key of Object.keys(this.el)) {
      if (!this.el[key]) console.warn('[HUD] missing node for', key);
    }

    // Last written values, so per-frame calls do not touch the DOM needlessly.
    this._last = {
      hpText: null, hpPct: null, hpLow: null,
      armorText: null, armorPct: null,
      mag: null, reserve: null, magState: null,
      weapon: null,
      timerText: null, timerLow: null,
      kills: null, deaths: null,
      fps: null,
      reloading: null,
      overlayVisible: null, overlayTitle: null, overlaySubtitle: null,
    };

    this._hitTimer = 0;
    this._msgTimer = 0;
    this._feedEntries = [];
  }

  // -- Player state ---------------------------------------------------------

  setHealth(hp, maxHp = 100) {
    const { healthBar, healthValue, healthStat } = this.el;
    const max = Math.max(1, Number(maxHp) || 100);
    const v = Math.max(0, Math.min(max, Math.round(Number(hp) || 0)));
    const text = String(v);
    if (text !== this._last.hpText) {
      this._last.hpText = text;
      if (healthValue) healthValue.textContent = text;
    }
    const pct = Math.round((v / max) * 1000) / 10;
    if (pct !== this._last.hpPct) {
      this._last.hpPct = pct;
      if (healthBar) healthBar.style.width = pct + '%';
    }
    const low = v > 0 && v <= 30;
    if (low !== this._last.hpLow) {
      this._last.hpLow = low;
      if (healthStat) healthStat.classList.toggle('low', low);
    }
  }

  setArmor(armor) {
    const { armorBar, armorValue } = this.el;
    const v = Math.max(0, Math.round(Number(armor) || 0));
    const text = String(v);
    if (text !== this._last.armorText) {
      this._last.armorText = text;
      if (armorValue) armorValue.textContent = text;
    }
    const pct = Math.round(Math.min(1, v / ARMOR_MAX) * 1000) / 10;
    if (pct !== this._last.armorPct) {
      this._last.armorPct = pct;
      if (armorBar) armorBar.style.width = pct + '%';
    }
  }

  // -- Weapon ---------------------------------------------------------------

  setAmmo(mag, reserve) {
    const { ammoMag, ammoReserve } = this.el;
    const m = Math.max(0, Math.floor(Number(mag) || 0));
    const r = Math.max(0, Math.floor(Number(reserve) || 0));
    if (m !== this._last.mag) {
      this._last.mag = m;
      if (ammoMag) ammoMag.textContent = String(m);
    }
    if (r !== this._last.reserve) {
      this._last.reserve = r;
      if (ammoReserve) ammoReserve.textContent = String(r);
    }
    const state = m === 0 ? 'empty' : (m <= 5 ? 'low' : 'ok');
    if (state !== this._last.magState) {
      this._last.magState = state;
      if (ammoMag) {
        ammoMag.classList.toggle('low', state === 'low');
        ammoMag.classList.toggle('empty', state === 'empty');
      }
    }
  }

  setWeaponName(name) {
    const text = String(name == null ? '' : name).toUpperCase();
    if (text !== this._last.weapon) {
      this._last.weapon = text;
      if (this.el.weaponName) this.el.weaponName.textContent = text;
    }
  }

  // -- Round info -----------------------------------------------------------

  setRoundTimer(seconds) {
    const text = formatTime(seconds);
    if (text !== this._last.timerText) {
      this._last.timerText = text;
      if (this.el.timer) this.el.timer.textContent = text;
    }
    const low = (Number(seconds) || 0) <= 10;
    if (low !== this._last.timerLow) {
      this._last.timerLow = low;
      if (this.el.timer) this.el.timer.classList.toggle('low', low);
    }
  }

  setScore(kills, deaths) {
    const k = Math.max(0, Math.floor(Number(kills) || 0));
    const d = Math.max(0, Math.floor(Number(deaths) || 0));
    if (k !== this._last.kills) {
      this._last.kills = k;
      if (this.el.kills) this.el.kills.textContent = String(k);
    }
    if (d !== this._last.deaths) {
      this._last.deaths = d;
      if (this.el.deaths) this.el.deaths.textContent = String(d);
    }
  }

  // -- Feedback -------------------------------------------------------------

  showHitMarker(isHeadshot = false) {
    const el = this.el.hitmarker;
    if (!el) return;
    el.classList.toggle('hs', !!isHeadshot);
    el.classList.add('show');
    if (this._hitTimer) clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => {
      this._hitTimer = 0;
      el.classList.remove('show');
      el.classList.remove('hs');
    }, HITMARKER_MS);
  }

  addKillFeed(text) {
    const feed = this.el.killfeed;
    if (!feed) return;
    const item = document.createElement('div');
    item.className = 'hud-killfeed-item';
    item.textContent = String(text == null ? '' : text);
    feed.insertBefore(item, feed.firstChild); // newest on top

    const entry = { el: item, fadeTimer: 0, removeTimer: 0 };
    entry.fadeTimer = setTimeout(() => item.classList.add('fade'), KILLFEED_LIFETIME_MS - KILLFEED_FADE_MS);
    entry.removeTimer = setTimeout(() => this._removeFeedEntry(entry), KILLFEED_LIFETIME_MS);
    this._feedEntries.unshift(entry);

    while (this._feedEntries.length > KILLFEED_MAX) {
      this._removeFeedEntry(this._feedEntries[this._feedEntries.length - 1]);
    }
  }

  _removeFeedEntry(entry) {
    const i = this._feedEntries.indexOf(entry);
    if (i !== -1) this._feedEntries.splice(i, 1);
    clearTimeout(entry.fadeTimer);
    clearTimeout(entry.removeTimer);
    if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
  }

  showDamageFlash() {
    const el = this.el.vignette;
    if (!el) return;
    // Restart the CSS animation even if it is already running.
    el.classList.remove('flash');
    void el.offsetWidth; // force reflow
    el.classList.add('flash');
  }

  showReloading(visible) {
    const v = !!visible;
    if (v === this._last.reloading) return;
    this._last.reloading = v;
    if (this.el.reloading) this.el.reloading.classList.toggle('show', v);
  }

  showOverlay(visible, { title, subtitle } = {}) {
    const v = !!visible;
    if (title !== undefined && title !== this._last.overlayTitle) {
      this._last.overlayTitle = title;
      if (this.el.overlayTitle) this.el.overlayTitle.textContent = String(title);
    }
    if (subtitle !== undefined && subtitle !== this._last.overlaySubtitle) {
      this._last.overlaySubtitle = subtitle;
      if (this.el.overlaySubtitle) this.el.overlaySubtitle.textContent = String(subtitle);
    }
    if (v !== this._last.overlayVisible) {
      this._last.overlayVisible = v;
      if (this.el.overlay) this.el.overlay.classList.toggle('hidden', !v);
    }
  }

  setFps(fps) {
    const n = Math.max(0, Math.round(Number(fps) || 0));
    if (n === this._last.fps) return;
    this._last.fps = n;
    if (this.el.fps) this.el.fps.textContent = n + ' FPS';
  }

  setMessage(text, ms = 1500) {
    const el = this.el.message;
    if (!el) return;
    const str = String(text == null ? '' : text);
    if (el.textContent !== str) el.textContent = str;
    if (this._msgTimer) clearTimeout(this._msgTimer);
    if (!str) {
      el.classList.remove('show');
      this._msgTimer = 0;
      return;
    }
    el.classList.add('show');
    this._msgTimer = setTimeout(() => {
      this._msgTimer = 0;
      el.classList.remove('show');
    }, Math.max(0, Number(ms) || 0));
  }
}
