import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {
  Rpc,
  Paths,
  Log,
  Schema,
  Frecency,
  Ranker,
  FleaSearch,
  RootSearch,
  Calculator
} from './core.js';
import { JsonStore } from './store.js';
import { CalculatorData } from './calculator_data.js';
import { GnomePlatform } from './platform.js';
import { GnomeCommands } from './gnome_commands.js';
import { NativeSearch } from './native_search.js';

export class GnomecastBackend {
  constructor() {
    this.version = '0.1.0';
    this.desktop = 'gnome';
    this.startedAt = Date.now();
    this.paths = Paths.resolve(name => GLib.getenv(name) || '');
    this.config = Schema.withConfigDefaults(null);
    this.directoriesReady = false;
    this.registry = Rpc.createRegistry();
    this.deps = { Ranker, Frecency };

    this.candidates = [];
    this.candidatesById = Object.create(null);
    this.candidatesRevision = 0;
    this.storeRevision = 0;

    this._listeners = {
      candidatesRevision: new Set(),
      calculatorRevision: new Set(),
      storeRevision: new Set(),
      themeChanged: new Set(),
      notification: new Set()
    };

    this._configMonitor = null;
    this._rebuildTimerId = 0;
    this._settingsStore = null;
    this._frecencyStore = null;
    this._calculatorStore = null;
    this._calculatorData = null;
    this._platform = null;
    this._commands = null;
    this._nativeSearch = null;
  }

  get ready() {
    return (
      this.directoriesReady &&
      !!(this._settingsStore && this._settingsStore.loaded) &&
      !!(this._frecencyStore && this._frecencyStore.loaded) &&
      !!(this._calculatorStore && this._calculatorStore.loaded)
    );
  }

  get loading() {
    return !!(this._nativeSearch && this._nativeSearch.pending !== null);
  }

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = new Set();
    this._listeners[event].add(fn);
    return () => this._listeners[event].delete(fn);
  }

  _notifyLocal(event, payload) {
    const set = this._listeners[event];
    if (!set) return;
    for (const fn of set) {
      try {
        fn(payload);
      } catch (e) {
        this.log('error', 'backend', `listener for ${event} threw: ${e.message || e}`);
      }
    }
  }

  log(level, category, message, metadata = null) {
    if (!Log.shouldLog(level, this.config.logLevel)) return;
    const line = Log.format(level, category, message, metadata);
    const idx = Log.levelIndex(level);
    if (idx >= Log.levelIndex('error')) console.error(line);
    else if (idx >= Log.levelIndex('warning')) console.warn(line);
    else console.log(line);
  }

  init() {
    this._ensureDirectories();
    this._loadConfig();
    this._watchConfig();

    const makeStore = (docSpec) => new JsonStore({
      path: `${this.paths.db}/${docSpec.file}`,
      migrations: docSpec.migrations,
      onChanged: () => {
        this.storeRevision++;
        this._notifyLocal('storeRevision', this.storeRevision);
      },
      onMessage: (level, text, meta) => this.log(level, 'store', text, meta)
    });

    this._settingsStore = makeStore(Schema.documents.settings);
    this._frecencyStore = makeStore(Schema.documents.frecency);
    this._calculatorStore = makeStore(Schema.documents.calculator);

    this._settingsStore.init();
    this._frecencyStore.init();
    this._calculatorStore.init();

    this._calculatorData = new CalculatorData({
      cacheDir: this.directoriesReady ? this.paths.cache : '',
      ratesEnabled: this.config.currencyRates,
      onUpdated: () => this._notifyLocal('calculatorRevision', Date.now()),
      onMessage: (level, text, meta) => this.log(level, 'calculator', text, meta)
    });
    this._calculatorData.init();

    this._platform = new GnomePlatform({
      onAppsChanged: () => this.scheduleRebuild(),
      onThemeChanged: (theme) => this._notifyLocal('themeChanged', theme),
      onLog: (level, cat, msg, meta) => this.log(level, cat, msg, meta)
    });

    this._commands = new GnomeCommands({
      paths: this.paths,
      onReloadRequested: () => {
        this._platform.reloadApps();
        this._commands.refreshLiveState();
        this.rebuildCandidates();
      }
    });
    this._commands.refreshLiveState();

    this._nativeSearch = new NativeSearch({
      onFailed: (message) => this.log('warning', 'search', message)
    });

    this._registerServices();
    this.rebuildCandidates();
  }

  _ensureDirectories() {
    const files = [
      Schema.documents.settings.file,
      Schema.documents.frecency.file,
      Schema.documents.calculator.file
    ].map(file => `${this.paths.db}/${file}`);

    try {
      const argv = Paths.setupArgv(this.paths, files);
      const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDERR_PIPE);
      const [, , stderr] = proc.communicate_utf8(null, null);
      if (proc.get_exit_status() !== 0) {
        this.log('error', 'paths', 'could not create data directories', { stderr });
      }
    } catch (e) {
      this.log('error', 'paths', `setup directories failed: ${e.message || e}`);
    }
    this.directoriesReady = true;
  }

  _loadConfig() {
    try {
      const file = Gio.File.new_for_path(this.paths.configFile);
      if (!file.query_exists(null)) {
        this.config = Schema.withConfigDefaults(null);
        return;
      }
      const [ok, bytes] = GLib.file_get_contents(this.paths.configFile);
      if (!ok) throw new Error('unreadable');
      this.config = Schema.withConfigDefaults(JSON.parse(new TextDecoder().decode(bytes)));
      if (this._calculatorData) this._calculatorData.ratesEnabled = this.config.currencyRates;
    } catch (e) {
      this.config = Schema.withConfigDefaults(null);
      this.log('warning', 'config', `ignoring unreadable ${this.paths.configFile}: ${e.message || e}`);
    }
  }

  _watchConfig() {
    try {
      const file = Gio.File.new_for_path(this.paths.configFile);
      this._configMonitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
      this._configMonitor.connect('changed', (_m, _f, _o, eventType) => {
        if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
            eventType === Gio.FileMonitorEvent.CREATED ||
            eventType === Gio.FileMonitorEvent.DELETED) {
          this._loadConfig();
        }
      });
    } catch (_e) {}
  }

  theme() {
    return this._platform.theme();
  }

  hasShellExtension() {
    return this._platform.hasShellExtension();
  }

  focusLauncherWindow() {
    return this._platform.focusLauncherWindow();
  }

  notifyHud(text) {
    this._platform.notifyHud(text);
  }

  copyText(text) {
    this._platform.copyText(text);
  }

  call(method, data) {
    return Rpc.call(this.registry, method, data);
  }

  callSync(method, data) {
    return Rpc.callSync(this.registry, method, data);
  }

  subscribe(method, cb) {
    return Rpc.subscribe(this.registry, method, cb);
  }

  emit(method, data) {
    Rpc.emit(this.registry, method, data, (m, err) => {
      this.log('error', 'rpc', `subscriber of ${m} threw: ${err}`);
    });
    this._notifyLocal('notification', { method, data });
    if (method === 'window.visibilityChanged' && data && data.visible) {
      const stateChanged = this._commands.refreshLiveState();
      this._calculatorData.refresh();
      if (stateChanged) this.rebuildCandidates();
    }
  }

  scheduleRebuild() {
    if (this._rebuildTimerId) {
      GLib.source_remove(this._rebuildTimerId);
      this._rebuildTimerId = 0;
    }
    this._rebuildTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
      this._rebuildTimerId = 0;
      this.rebuildCandidates();
      return GLib.SOURCE_REMOVE;
    });
  }

  rebuildCandidates() {
    const next = [];
    const apps = this._platform.appCandidates();
    for (let i = 0; i < apps.length; i++) next.push(apps[i]);

    const gnomeCmds = this._commands.candidates(
      this._platform.allAppInfos(),
      id => this._platform.launchDesktopId(id),
      uri => this._platform.openUrl(uri)
    );
    for (let j = 0; j < gnomeCmds.length; j++) next.push(gnomeCmds[j]);

    for (let b = 0; b < RootSearch.BUILTINS.length; b++) {
      next.push(RootSearch.builtinCandidate(RootSearch.BUILTINS[b]));
    }

    const byId = Object.create(null);
    for (let k = 0; k < next.length; k++) byId[next[k].id] = next[k];

    const entries = FleaSearch.entries(next, Ranker.transliterate);
    this._nativeSearch.cancel();
    this.candidates = next;
    this.candidatesById = byId;
    this._nativeSearch.setEntries(next.map(c => c.id), entries);
    this.candidatesRevision++;
    this._notifyLocal('candidatesRevision', this.candidatesRevision);
  }

  cancelSearch() {
    if (this._nativeSearch) this._nativeSearch.cancel();
  }

  searchAsync(data, callback) {
    this.cancelSearch();
    const query = String((data && data.query) || '').trim();
    const view = data && data.view;
    if (!query || (view && view.kind !== 'root')) {
      callback(this.callSync('rootSearch.search', data));
      return;
    }
    this._nativeSearch.search(
      Ranker.transliterate(query.toLowerCase()),
      this.searchContext().sensitivity,
      (matches) => {
        callback(this.callSync('rootSearch.search', Object.assign({}, data, { fleaHits: matches })));
      }
    );
  }

  searchContext() {
    return {
      commands: this._settingsStore.loaded ? this._settingsStore.doc.commands : {},
      frecency: this._frecencyStore.loaded ? this._frecencyStore.doc.items : {},
      nowMs: Date.now(),
      sensitivity: this._settingsStore.loaded ? this._settingsStore.doc.general.rootSearchSensitivity : 'medium'
    };
  }

  decorated(id) {
    const c = this.candidatesById[id];
    return c ? RootSearch.decorate(c, this.searchContext(), this.deps) : null;
  }

  get hour12() {
    if (this.config.clockFormat === 'auto') return this._platform.hour12();
    return this.config.clockFormat === '12h';
  }

  calculatorEnv() {
    return {
      nowMs: Date.now(),
      localOffset: -new Date().getTimezoneOffset(),
      hour12: this.hour12,
      rates: this.config.currencyRates ? this._calculatorData.rates : null,
      zones: this._calculatorData.zones,
      remToPxRate: this.config.remToPxRate,
      workHoursPerDay: this.config.workHoursPerDay
    };
  }

  calculate(query) {
    try {
      return Calculator.evaluate(query, this.calculatorEnv());
    } catch (e) {
      this.log('error', 'calculator', `evaluating failed: ${e.message || e}`, { query });
      return null;
    }
  }

  saveCalculation(entry) {
    this._calculatorStore.update(doc => {
      doc.history = Calculator.pushHistory(doc.history, {
        id: String(Date.now()),
        query: entry.query,
        result: entry.result,
        copy: entry.copy,
        kind: entry.kind
      }, Date.now());
    });
    this.emit('calculator.historyStateChanged', null);
  }

  calculatorAction(action, entry, historyId) {
    switch (action) {
      case 'open':
      case 'copy-answer':
        if (!historyId) this.saveCalculation(entry);
        this.copyText(entry.copy);
        return { close: true, hud: 'Copied to Clipboard' };
      case 'paste-answer':
        if (!historyId) this.saveCalculation(entry);
        this._platform.pasteText(entry.copy);
        return { close: true, hud: this._platform.hasShellExtension() ? '' : 'Copied to Clipboard (paste with Ctrl+V)' };
      case 'copy-question-answer':
        if (!historyId) this.saveCalculation(entry);
        this.copyText(`${entry.query} = ${entry.result}`);
        return { close: true, hud: 'Copied to Clipboard' };
      case 'open-history':
        return { push: { kind: 'calculator-history', title: 'Calculator History' } };
      case 'delete-entry':
        this._calculatorStore.update(doc => {
          doc.history = doc.history.filter(h => h.id !== historyId);
        });
        this.emit('calculator.historyStateChanged', null);
        return { toast: { style: 'success', title: 'Entry deleted' } };
      case 'delete-all-entries':
        this._calculatorStore.update(doc => { doc.history = []; });
        this.emit('calculator.historyStateChanged', null);
        return { toast: { style: 'success', title: 'History cleared' } };
    }
    throw new Error(`Unknown action ${action}`);
  }

  historyEntry(id) {
    const key = String(id).slice('calculator-history:'.length);
    const list = this._calculatorStore.loaded ? this._calculatorStore.doc.history : [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === key) return list[i];
    }
    return null;
  }

  recordVisit(id, query) {
    if (!this._frecencyStore.loaded) return;
    this._frecencyStore.update(doc => {
      doc.items[id] = Frecency.recordVisit(doc.items[id] || null, Date.now(), query || '');
      if (query) doc.searchHistory = Schema.pushSearchHistory(doc.searchHistory, query);
    });
  }

  updateCommand(id, mutator) {
    this._settingsStore.update(doc => {
      const current = doc.commands[id] || {};
      const next = mutator(JSON.parse(JSON.stringify(current)));
      let empty = true;
      for (const k in next) {
        if (next[k] !== null && next[k] !== undefined && next[k] !== '') empty = false;
      }
      if (empty) delete doc.commands[id];
      else doc.commands[id] = next;
    });
    this.emit('settings.commandSettingsChanged', { commandId: id });
  }

  performAction(data) {
    const id = String((data && data.id) || '');
    const action = String((data && data.action) || 'open');
    const query = String((data && data.query) || '').trim();
    const candidate = this.decorated(id);
    if (!candidate) throw new Error(`Unknown command ${id}`);

    if (action === 'open') {
      switch (candidate.kind) {
        case 'app':
          this.recordVisit(id, query);
          this._platform.openApp(candidate);
          return { close: true };
        case 'gnome-action':
        case 'gnome-menu':
          this.recordVisit(id, query);
          return this._commands.run(id);
        case 'builtin':
          if (candidate.run.url) {
            const values = (data && data.arguments) || {};
            const missing = RootSearch.missingArgument(candidate.arguments, values);
            if (missing >= 0) throw new Error(`Type a ${candidate.arguments[missing].placeholder.toLowerCase()} first`);
            this.recordVisit(id, query);
            this._platform.openUrl(RootSearch.fillArguments(candidate.run.url, values));
            return { close: true };
          }
          this.recordVisit(id, query);
          if (candidate.run.push) return { push: candidate.run.push };
          return { close: true };
        case 'fallback':
          this._platform.openUrl(RootSearch.fallbackUrl(candidate, query));
          return { close: true };
      }
      throw new Error(`Cannot open ${id}`);
    }

    switch (action) {
      case 'open-new':
        this.recordVisit(id, query);
        this._platform.launchDesktopId(candidate.appId);
        return { close: true };
      case 'copy-command':
      case 'copy-id':
        this.copyText(action === 'copy-id' ? `${candidate.appId}.desktop` : candidate.action);
        return { close: true, hud: 'Copied to Clipboard' };
      case 'favorite-add':
      case 'favorite-remove':
      case 'favorite-up':
      case 'favorite-down': {
        const orders = RootSearch.reorderFavorites(this._settingsStore.doc.commands, id, action);
        this._settingsStore.update(doc => {
          for (const key in orders) {
            const entry = doc.commands[key] || {};
            if (orders[key] === null) delete entry.favoriteOrder;
            else entry.favoriteOrder = orders[key];
            if (Object.keys(entry).length === 0) delete doc.commands[key];
            else doc.commands[key] = entry;
          }
        });
        const titles = {
          'favorite-add': 'Added to Favorites',
          'favorite-remove': 'Removed from Favorites',
          'favorite-up': 'Moved Up',
          'favorite-down': 'Moved Down'
        };
        return { toast: { style: 'success', title: titles[action] } };
      }
      case 'set-alias':
        return { push: { kind: 'alias', commandId: id, title: `Alias for ${candidate.title}`, value: candidate.alias } };
      case 'remove-alias':
        this.updateCommand(id, s => { delete s.alias; return s; });
        return { toast: { style: 'success', title: 'Alias removed' } };
      case 'reset-ranking':
        this._frecencyStore.update(doc => { delete doc.items[id]; });
        return { toast: { style: 'success', title: 'Ranking reset' } };
      case 'disable':
        this.updateCommand(id, s => { s.enabled = false; return s; });
        return {
          toast: {
            style: 'success',
            title: `${candidate.title} disabled`,
            actions: [{
              id: 'undo',
              title: 'Undo',
              done: `${candidate.title} enabled`,
              call: { method: 'settings.updateCommandSettings', data: { commandId: id, enabled: true } }
            }]
          }
        };
    }
    throw new Error(`Unknown action ${action}`);
  }

  _registerServices() {
    Rpc.register(this.registry, 'system', {
      healthPing: () => null,
      healthDatabase: () => {
        const t0 = Date.now();
        JSON.stringify(this._settingsStore.doc);
        JSON.stringify(this._frecencyStore.doc);
        return {
          workMs: Date.now() - t0,
          settings: { loaded: this._settingsStore.loaded, readOnly: this._settingsStore.readOnly, error: this._settingsStore.lastError },
          frecency: { loaded: this._frecencyStore.loaded, readOnly: this._frecencyStore.readOnly, error: this._frecencyStore.lastError },
          loaded: this._settingsStore.loaded,
          readOnly: this._settingsStore.readOnly,
          error: this._settingsStore.lastError
        };
      },
      info: () => ({
        version: this.version,
        desktop: this.desktop,
        ready: this.ready,
        uptimeMs: Date.now() - this.startedAt,
        candidates: this.candidates.length,
        shellExtension: this.hasShellExtension(),
        methods: Rpc.methods(this.registry)
      }),
      getPaths: () => this.paths
    });

    Rpc.register(this.registry, 'settings', {
      getGeneralSettings: () => {
        if (!this._settingsStore.loaded) throw new Error('settings not loaded');
        return this._settingsStore.doc.general;
      },
      updateGeneralSettings: (data) => {
        if (!this._settingsStore.loaded) throw new Error('settings not loaded');
        if (this._settingsStore.readOnly) {
          throw new Error(`settings are read-only: ${this._settingsStore.lastError || 'written by a newer build'}`);
        }
        const patch = data && typeof data === 'object' ? data : {};
        const current = this._settingsStore.doc.general;
        for (const key in patch) {
          if (current[key] === undefined) throw new Error(`Unknown general setting ${key}`);
          if (typeof patch[key] !== typeof current[key]) throw new Error(`Setting ${key} must be a ${typeof current[key]}`);
          const choices = Schema.generalChoices[key];
          if (choices && choices.indexOf(patch[key]) < 0) {
            throw new Error(`Setting ${key} must be one of ${choices.join(', ')}`);
          }
        }
        this._settingsStore.update(doc => {
          for (const k in patch) doc.general[k] = patch[k];
        });
        this.emit('settings.generalSettingsChanged', this._settingsStore.doc.general);
        return this._settingsStore.doc.general;
      },
      getAllCommandSettings: () => this._settingsStore.doc.commands,
      getCommandSettings: (data) => this._settingsStore.doc.commands[String((data && data.commandId) || '')] || {},
      updateCommandSettings: (data) => {
        const id = String((data && data.commandId) || '');
        if (!this.candidatesById[id]) throw new Error(`Unknown command ${id}`);
        if (data.alias !== undefined && data.alias !== null) {
          const alias = String(data.alias).trim().toLowerCase();
          if (/\s/.test(alias)) throw new Error('An alias cannot contain spaces');
          const commands = this._settingsStore.doc.commands;
          for (const other in commands) {
            if (other !== id && commands[other].alias === alias && alias) {
              throw new Error(`Alias “${alias}” is already used by ${(this.candidatesById[other] || {}).title || other}`);
            }
          }
        }
        this.updateCommand(id, s => {
          if (data.alias !== undefined) {
            if (data.alias) s.alias = String(data.alias).trim().toLowerCase();
            else delete s.alias;
          }
          if (data.enabled !== undefined) {
            if (data.enabled === false) s.enabled = false;
            else delete s.enabled;
          }
          return s;
        });
        return this._settingsStore.doc.commands[id] || {};
      }
    });

    Rpc.register(this.registry, 'rootSearch', {
      search: (data) => {
        const query = String((data && data.query) || '');
        const view = data && data.view;
        const ctx = this.searchContext();
        if (data && data.fleaHits) ctx.fleaHits = data.fleaHits;
        let sections;
        if (view && view.kind === 'menu') {
          sections = RootSearch.submenuSections(this.candidates, view.menuId, query, ctx, this.deps);
        } else if (view && view.kind === 'calculator-history') {
          sections = RootSearch.historySections(this._calculatorStore.doc.history, query, ctx.nowMs, Calculator.filterHistory);
        } else {
          ctx.filter = String((data && data.filter) || 'all');
          if (query.trim() && ctx.filter === 'all') ctx.calculation = this.calculate(query);
          sections = RootSearch.rootSections(this.candidates, query, ctx, this.deps);
        }
        return sections.map(s => ({
          id: s.id,
          title: s.title,
          rows: s.rows.map(r => r.candidate)
        }));
      },
      getActions: (data) => {
        const rowId = String((data && data.id) || '');
        if (rowId === RootSearch.CALCULATOR_ID) return RootSearch.actionsFor({ kind: 'calculator' });
        if (rowId.indexOf('calculator-history:') === 0) return RootSearch.actionsFor({ kind: 'calculator-history' });
        const candidate = this.decorated(rowId);
        if (!candidate) {
          const fallback = RootSearch.FALLBACKS.filter(f => f.id === (data && data.id))[0];
          if (!fallback) throw new Error(`Unknown command ${data && data.id}`);
          return RootSearch.actionsFor({ kind: 'fallback', title: fallback.title });
        }
        return RootSearch.actionsFor(candidate);
      },
      getItemInfo: (data) => {
        const rowId = String((data && data.id) || '');
        const nowMs = Date.now();
        if (rowId === RootSearch.CALCULATOR_ID) {
          const calc = this.calculate(String((data && data.query) || ''));
          return calc ? RootSearch.aboutFor(RootSearch.calculatorCandidate(calc), nowMs) : [];
        }
        if (rowId.indexOf('calculator-history:') === 0) {
          const entry = this.historyEntry(rowId);
          return entry ? RootSearch.aboutFor(RootSearch.historyCandidate(entry, nowMs), nowMs) : [];
        }
        const candidate = this.decorated(rowId);
        if (!candidate) {
          const f = RootSearch.FALLBACKS.filter(x => x.id === rowId)[0];
          if (!f) throw new Error(`Unknown command ${rowId}`);
          return RootSearch.aboutFor({ id: f.id, kind: 'fallback', title: f.title, typeLabel: 'Fallback', url: f.url }, nowMs);
        }
        return RootSearch.aboutFor(candidate, nowMs);
      },
      performAction: (data) => {
        if (!(data && data.confirmed)) {
          const confirm = RootSearch.confirmationFor(String((data && data.id) || ''), String((data && data.action) || 'open'));
          if (confirm) return { confirm };
        }
        const fallback = RootSearch.FALLBACKS.filter(f => f.id === (data && data.id))[0];
        if (fallback) {
          this._platform.openUrl(RootSearch.fallbackUrl(fallback, data.query));
          return { close: true };
        }
        if (data && data.id === RootSearch.CALCULATOR_ID) {
          const calc = this.calculate(String(data.query || ''));
          if (!calc) throw new Error('Nothing to calculate');
          return this.calculatorAction(String(data.action || 'open'), {
            query: calc.input,
            result: calc.result,
            copy: calc.copy,
            kind: calc.kind
          }, '');
        }
        if (data && String(data.id).indexOf('calculator-history:') === 0) {
          const entry = this.historyEntry(data.id);
          if (!entry) throw new Error('No such history entry');
          return this.calculatorAction(String(data.action || 'open'), entry, entry.id);
        }
        return this.performAction(data);
      },
      getSearchHistory: () => (this._frecencyStore.loaded ? this._frecencyStore.doc.searchHistory : [])
    });

    Rpc.register(this.registry, 'calculator', {
      calculate: (data) => this.calculate(String((data && data.query) || '')),
      historyGetAll: () => (this._calculatorStore.loaded ? this._calculatorStore.doc.history : []),
      historyDelete: (data) => this.calculatorAction('delete-entry', null, String((data && data.id) || '')),
      historyDeleteAll: () => this.calculatorAction('delete-all-entries', null, ''),
      refreshCurrencies: () => {
        if (!this.config.currencyRates) throw new Error('currencyRates is off in config.json');
        this._calculatorData.fetchRates();
        return null;
      },
      getCurrencies: () => {
        const r = this._calculatorData.rates;
        return {
          enabled: this.config.currencyRates,
          date: r ? r.date : null,
          base: r ? r.base : null,
          currencies: r ? Object.keys(r.rates).concat([r.base]).sort() : [],
          fetchedAt: this._calculatorData.ratesFetchedAt || null,
          zones: Object.keys(this._calculatorData.zones).length
        };
      }
    });

    Rpc.register(this.registry, 'frecency', {
      visit: (data) => {
        this.recordVisit(String(data.id), String(data.query || ''));
        return null;
      },
      get: (data) => {
        const entry = this._frecencyStore.doc.items[String((data && data.id) || '')];
        return entry
          ? { anchor: entry.anchor, openedAt: entry.openedAt, score: Frecency.score(entry.anchor, Date.now() / 1000), searchTerms: entry.searchTerms }
          : null;
      }
    });
  }

  flush() {
    if (this._settingsStore) this._settingsStore.flush();
    if (this._frecencyStore) this._frecencyStore.flush();
    if (this._calculatorStore) this._calculatorStore.flush();
  }

  destroy() {
    if (this._rebuildTimerId) {
      GLib.source_remove(this._rebuildTimerId);
      this._rebuildTimerId = 0;
    }
    if (this._configMonitor) {
      this._configMonitor.cancel();
      this._configMonitor = null;
    }
    if (this._nativeSearch) this._nativeSearch.destroy();
    if (this._platform) this._platform.destroy();
    if (this._settingsStore) this._settingsStore.destroy();
    if (this._frecencyStore) this._frecencyStore.destroy();
    if (this._calculatorStore) this._calculatorStore.destroy();
  }
}
