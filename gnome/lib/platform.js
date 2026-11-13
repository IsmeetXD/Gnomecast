import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gdk from 'gi://Gdk?version=4.0';
import { RootSearch } from './core.js';
import { logoIconArg } from './logo.js';

const SHELL_EXT_BUS = 'dev.ismeetxd.Gnomecast.Shell';
const SHELL_EXT_PATH = '/dev/ismeetxd/Gnomecast/Shell';
const SHELL_EXT_IFACE = 'dev.ismeetxd.Gnomecast.Shell';

const TERMINAL_CLASSES = [
  'alacritty',
  'com.mitchellh.ghostty',
  'ghostty',
  'kitty',
  'org.gnome.terminal',
  'org.gnome.console',
  'org.wezfurlong.wezterm',
  'foot',
  'app.devsuite.ptyxis',
  'ptyxis'
];

const ACCENT_HEX = {
  blue: '#3584e4',
  teal: '#2190a4',
  green: '#3a944a',
  yellow: '#c88800',
  orange: '#ed5b00',
  red: '#e62d42',
  pink: '#d56199',
  purple: '#9141ac',
  slate: '#6f8396'
};

function safeSettings(schemaId) {
  try {
    const source = Gio.SettingsSchemaSource.get_default();
    if (!source || !source.lookup(schemaId, true)) return null;
    return new Gio.Settings({ schema_id: schemaId });
  } catch (_e) {
    return null;
  }
}

export class GnomePlatform {
  constructor({ onAppsChanged = null, onThemeChanged = null, onLog = null } = {}) {
    this.onAppsChanged = onAppsChanged;
    this.onThemeChanged = onThemeChanged;
    this.onLog = onLog;

    this._appByDesktopId = new Map();
    this._allAppInfos = [];
    this._ifaceSettings = safeSettings('org.gnome.desktop.interface');
    this._appMonitor = Gio.AppInfoMonitor.get();
    this._appMonitorId = this._appMonitor.connect('changed', () => {
      this.reloadApps();
      if (this.onAppsChanged) this.onAppsChanged();
    });

    if (this._ifaceSettings) {
      this._ifaceSettings.connect('changed', (_s, key) => {
        if ((key === 'color-scheme' || key === 'accent-color') && this.onThemeChanged) {
          this.onThemeChanged(this.theme());
        }
      });
    }

    this.reloadApps();
  }

  _log(level, category, msg, meta = null) {
    if (this.onLog) this.onLog(level, category, msg, meta);
  }

  reloadApps() {
    const all = Gio.AppInfo.get_all();
    this._allAppInfos = all;
    this._appByDesktopId.clear();
    for (const info of all) {
      const id = info.get_id();
      if (id) this._appByDesktopId.set(id, info);
    }
  }

  allAppInfos() {
    return this._allAppInfos;
  }

  appCandidates() {
    const out = [];
    for (const info of this._allAppInfos) {
      if (!info.should_show()) continue;
      const desktopId = info.get_id();
      if (!desktopId) continue;
      const shortId = desktopId.replace(/\.desktop$/, '');
      const generic = typeof info.get_generic_name === 'function' ? info.get_generic_name() : '';
      const kws = typeof info.get_keywords === 'function' ? info.get_keywords() : [];
      const startupClass = typeof info.get_startup_wm_class === 'function' ? info.get_startup_wm_class() : '';
      const execString = info.get_commandline() || '';
      const iconObj = info.get_icon();
      const rawIcon = iconObj ? iconObj.to_string() : '';
      const iconName = rawIcon && rawIcon !== 'application-x-executable' ? rawIcon : '';

      out.push(RootSearch.appCandidate({
        id: shortId,
        desktopId,
        name: info.get_display_name() || info.get_name() || shortId,
        genericName: generic || '',
        keywords: Array.isArray(kws) ? kws : [],
        startupClass: startupClass || '',
        execString,
        icon: iconName
      }));
    }
    return out;
  }

  hour12() {
    if (!this._ifaceSettings) return false;
    try {
      return this._ifaceSettings.get_string('clock-format') === '12h';
    } catch (_e) {
      return false;
    }
  }

  theme() {
    let dark = true;
    let accent = '#3584e4';
    if (this._ifaceSettings) {
      try {
        dark = this._ifaceSettings.get_string('color-scheme') !== 'prefer-light';
      } catch (_e) {}
      try {
        const key = this._ifaceSettings.get_string('accent-color');
        if (ACCENT_HEX[key]) accent = ACCENT_HEX[key];
      } catch (_e) {}
    }

    if (dark) {
      return {
        dark: true,
        background: '#1c1c1f',
        backgroundBorder: 'rgba(255, 255, 255, 0.14)',
        foreground: '#f2f2f5',
        muted: 'rgba(242, 242, 245, 0.56)',
        surfaceSubtle: 'rgba(255, 255, 255, 0.06)',
        surfaceDivider: 'rgba(255, 255, 255, 0.11)',
        selectedBackground: 'rgba(255, 255, 255, 0.12)',
        accent,
        danger: '#e06c75'
      };
    }
    return {
      dark: false,
      background: '#fafafa',
      backgroundBorder: 'rgba(0, 0, 0, 0.13)',
      foreground: '#1e1e22',
      muted: 'rgba(30, 30, 34, 0.56)',
      surfaceSubtle: 'rgba(0, 0, 0, 0.05)',
      surfaceDivider: 'rgba(0, 0, 0, 0.10)',
      selectedBackground: 'rgba(0, 0, 0, 0.08)',
      accent,
      danger: '#c01c28'
    };
  }

  _launchContext() {
    const display = Gdk.Display.get_default();
    return display ? display.get_app_launch_context() : new Gio.AppLaunchContext();
  }

  launchDesktopId(desktopOrShortId) {
    const desktopId = desktopOrShortId.endsWith('.desktop') ? desktopOrShortId : `${desktopOrShortId}.desktop`;
    const info = this._appByDesktopId.get(desktopId) || Gio.DesktopAppInfo.new(desktopId);
    if (!info) {
      Gio.Subprocess.new(['gtk4-launch', desktopId], Gio.SubprocessFlags.NONE);
      return;
    }
    info.launch([], this._launchContext());
  }

  openApp(candidate) {
    const ext = this._callShellExt('ListWindows', null, 150);
    if (ext) {
      try {
        const list = JSON.parse(ext.deep_unpack()[0]);
        const winId = RootSearch.findAppWindow(list, candidate.windowKeys);
        if (winId) {
          const focused = this._callShellExt('FocusWindow', new GLib.Variant('(s)', [winId]), 300);
          if (focused && focused.deep_unpack()[0]) return;
        }
      } catch (e) {
        this._log('warning', 'focus', `extension window focus failed: ${e.message || e}`);
      }
    }
    this.launchDesktopId(candidate.appId);
  }

  openUrl(url) {
    const target = String(url || '');
    if (!target) return;
    try {
      Gio.AppInfo.launch_default_for_uri(target, this._launchContext());
    } catch (_e) {
      Gio.Subprocess.new(['xdg-open', target], Gio.SubprocessFlags.NONE);
    }
  }

  // Writes text to wl-copy via stdin only — never argv (SPEC §2.0 Privacy).
  copyText(text) {
    const str = String(text ?? '');
    try {
      const display = Gdk.Display.get_default();
      if (display) display.get_clipboard().set_text(str);
    } catch (_e) {}

    try {
      const proc = Gio.Subprocess.new(
        ['wl-copy'],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDERR_PIPE
      );
      proc.communicate_utf8_async(str, null, (_p, res) => {
        try {
          proc.communicate_utf8_finish(res);
        } catch (e) {
          this._log('warning', 'clipboard', `wl-copy failed: ${e.message || e}`);
        }
      });
    } catch (e) {
      this._log('warning', 'clipboard', `could not start wl-copy: ${e.message || e}`);
    }
  }

  pasteText(text) {
    this.copyText(text);
    const active = this._callShellExt('ActiveWindowClass', null, 120);
    const cls = active ? String(active.deep_unpack()[0] || '').toLowerCase() : '';
    const isTerminal = TERMINAL_CLASSES.some(t => cls.includes(t));
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 140, () => {
      this._callShellExt('Paste', new GLib.Variant('(b)', [isTerminal]), 300);
      return GLib.SOURCE_REMOVE;
    });
  }

  notifyHud(text) {
    const msg = String(text || '');
    if (!msg) return;
    try {
      Gio.Subprocess.new(
        ['notify-send', '-a', 'Gnomecast', '-t', '1500', '-i', logoIconArg(), msg],
        Gio.SubprocessFlags.NONE
      );
    } catch (_e) {}
  }

  focusLauncherWindow() {
    return !!this._callShellExt('FocusLauncher', null, 150);
  }

  hasShellExtension() {
    return !!this._callShellExt('Ping', null, 120);
  }

  _callShellExt(method, params = null, timeoutMs = 200) {
    try {
      return Gio.DBus.session.call_sync(
        SHELL_EXT_BUS,
        SHELL_EXT_PATH,
        SHELL_EXT_IFACE,
        method,
        params,
        null,
        Gio.DBusCallFlags.NO_AUTO_START,
        timeoutMs,
        null
      );
    } catch (_e) {
      return null;
    }
  }

  destroy() {
    if (this._appMonitor && this._appMonitorId) {
      this._appMonitor.disconnect(this._appMonitorId);
      this._appMonitorId = 0;
    }
  }
}
