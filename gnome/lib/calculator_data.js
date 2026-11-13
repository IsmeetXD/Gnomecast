import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { Calculator } from './core.js';

const RATES_URL = 'https://api.frankfurter.dev/v1/latest';
const RATES_MAX_AGE_MS = 12 * 3600 * 1000;
const RETRY_AFTER_MS = 30 * 60 * 1000;
const ZONES_MAX_AGE_MS = 10 * 60 * 1000;

export class CalculatorData {
  constructor({ cacheDir, ratesEnabled = true, onUpdated = null, onMessage = null }) {
    this.cacheDir = cacheDir;
    this.ratesEnabled = ratesEnabled;
    this.onUpdated = onUpdated;
    this.onMessage = onMessage;

    this.rates = null;
    this.zones = {};
    this.ratesFetchedAt = 0;
    this.ratesTriedAt = 0;
    this.zonesAt = 0;
    this._fetching = false;
  }

  init() {
    this.refreshZones();
    this._readCache();
    this.refresh();
  }

  _emitMessage(level, text, metadata = null) {
    if (this.onMessage) this.onMessage(level, text, metadata);
  }

  _emitUpdated() {
    if (this.onUpdated) this.onUpdated();
  }

  refreshZones() {
    const nowSec = Math.floor(Date.now() / 1000);
    const list = Calculator.zoneList();
    const next = {};
    for (let i = 0; i < list.length; i++) {
      const name = list[i];
      try {
        const tz = GLib.TimeZone.new_identifier(name);
        if (!tz) continue;
        const interval = tz.find_interval(GLib.TimeType.UNIVERSAL, nowSec);
        next[name] = Math.round(tz.get_offset(interval) / 60);
      } catch (_e) {
        // Ignore unknown zone identifiers.
      }
    }
    this.zones = next;
    this.zonesAt = Date.now();
  }

  refresh() {
    const now = Date.now();
    if (now - this.zonesAt > ZONES_MAX_AGE_MS) {
      this.refreshZones();
    }
    if (
      this.ratesEnabled &&
      !this._fetching &&
      now - this.ratesFetchedAt > RATES_MAX_AGE_MS &&
      now - this.ratesTriedAt > RETRY_AFTER_MS
    ) {
      this.fetchRates();
    }
  }

  validRates(doc) {
    if (!doc || typeof doc.base !== 'string' || !doc.rates || typeof doc.rates !== 'object') return null;
    const out = {};
    for (const code in doc.rates) {
      if (/^[A-Z]{3}$/.test(code) && typeof doc.rates[code] === 'number' && doc.rates[code] > 0) {
        out[code] = doc.rates[code];
      }
    }
    return { base: doc.base, date: String(doc.date || ''), rates: out };
  }

  _cachePath() {
    return this.cacheDir ? `${this.cacheDir}/currencies.json` : '';
  }

  _readCache() {
    const path = this._cachePath();
    if (!path) return;
    try {
      const file = Gio.File.new_for_path(path);
      if (!file.query_exists(null)) return;
      const [ok, bytes] = GLib.file_get_contents(path);
      if (!ok) return;
      const doc = JSON.parse(new TextDecoder().decode(bytes));
      const parsed = this.validRates(doc);
      if (parsed) {
        this.rates = parsed;
        this.ratesFetchedAt = Number(doc.fetchedAt) || 0;
      }
    } catch (_e) {
      this._emitMessage('warning', 'ignoring unreadable exchange-rate cache');
    }
  }

  _writeCache(payload) {
    const path = this._cachePath();
    if (!path) return;
    try {
      const file = Gio.File.new_for_path(path);
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      file.replace_contents(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
    } catch (e) {
      this._emitMessage('warning', `could not cache exchange rates: ${e.message || e}`);
    }
  }

  fetchRates() {
    if (this._fetching) return;
    this._fetching = true;
    this.ratesTriedAt = Date.now();
    try {
      const proc = Gio.Subprocess.new(
        ['curl', '-fsSL', '--max-time', '15', RATES_URL],
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
      );
      proc.communicate_utf8_async(null, null, (_proc, res) => {
        this._fetching = false;
        try {
          const [ok, stdout] = proc.communicate_utf8_finish(res);
          if (!ok || proc.get_exit_status() !== 0 || !stdout) {
            this._emitMessage('warning', 'could not fetch exchange rates');
            return;
          }
          const parsed = this.validRates(JSON.parse(stdout));
          if (!parsed) {
            this._emitMessage('warning', 'invalid exchange rates response');
            return;
          }
          this.rates = parsed;
          this.ratesFetchedAt = Date.now();
          this._writeCache({ fetchedAt: this.ratesFetchedAt, base: parsed.base, date: parsed.date, rates: parsed.rates });
          this._emitMessage('info', 'exchange rates updated', { date: parsed.date, currencies: Object.keys(parsed.rates).length });
          this._emitUpdated();
        } catch (e) {
          this._emitMessage('warning', `could not fetch exchange rates: ${e.message || e}`);
        }
      });
    } catch (e) {
      this._fetching = false;
      this._emitMessage('warning', `could not start curl for exchange rates: ${e.message || e}`);
    }
  }
}
