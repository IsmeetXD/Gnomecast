import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { Paths, REPO_ROOT } from './core.js';

export const DEFAULT_HOTKEY = '<Super>space';
export const CUSTOM_PATH = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/gnomecast/';
export const CUSTOM_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';
export const MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
export const WM_KEYS_SCHEMA = 'org.gnome.desktop.wm.keybindings';
export const EXT_UUID = 'gnomecast@ismeetxd.dev';
export const EXT_SCHEMA_ID = 'org.gnome.shell.extensions.gnomecast';
export const GNOMECAST_BUS = 'dev.ismeetxd.Gnomecast';
export const GNOMECAST_PATH = '/dev/ismeetxd/Gnomecast';
export const GNOMECAST_IFACE = 'dev.ismeetxd.Gnomecast';
export const SHELL_EXT_BUS = 'dev.ismeetxd.Gnomecast.Shell';
export const SHELL_EXT_PATH = '/dev/ismeetxd/Gnomecast/Shell';
export const SHELL_EXT_IFACE = 'dev.ismeetxd.Gnomecast.Shell';

function envLookup(name) {
  return GLib.getenv(name) || '';
}

function safeSettings(schemaId, path = null) {
  try {
    const source = Gio.SettingsSchemaSource.get_default();
    if (!source) return null;
    const schema = source.lookup(schemaId, true);
    if (!schema) return null;
    const props = { settings_schema: schema };
    if (path) props.path = path;
    return new Gio.Settings(props);
  } catch (_e) {
    return null;
  }
}

function extensionSettings(paths) {
  const dataBase = paths.data.replace(/\/gnomecast$/, '');
  const dirs = [
    `${dataBase}/gnome-shell/extensions/${EXT_UUID}/schemas`,
    `/usr/share/gnome-shell/extensions/${EXT_UUID}/schemas`,
    `${REPO_ROOT}/gnome-extension/${EXT_UUID}/schemas`
  ];
  for (const dir of dirs) {
    if (!GLib.file_test(`${dir}/gschemas.compiled`, GLib.FileTest.IS_REGULAR)) continue;
    try {
      const source = Gio.SettingsSchemaSource.new_from_directory(
        dir,
        Gio.SettingsSchemaSource.get_default(),
        false
      );
      const schema = source.lookup(EXT_SCHEMA_ID, false);
      if (schema) return new Gio.Settings({ settings_schema: schema });
    } catch (_e) {}
  }
  return safeSettings(EXT_SCHEMA_ID);
}

function extensionInstalled(paths) {
  const dataBase = paths.data.replace(/\/gnomecast$/, '');
  return GLib.file_test(`${dataBase}/gnome-shell/extensions/${EXT_UUID}/extension.js`, GLib.FileTest.IS_REGULAR) ||
         GLib.file_test(`/usr/share/gnome-shell/extensions/${EXT_UUID}/extension.js`, GLib.FileTest.IS_REGULAR);
}

function pingBus(busName, objPath, ifaceName) {
  try {
    const res = Gio.DBus.session.call_sync(
      busName,
      objPath,
      ifaceName,
      'Ping',
      null,
      null,
      Gio.DBusCallFlags.NO_AUTO_START,
      120,
      null
    );
    return !!(res && res.deep_unpack()[0] === 'ok');
  } catch (_e) {
    return false;
  }
}

function runAsync(argv) {
  return new Promise(resolve => {
    try {
      const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
      );
      proc.communicate_utf8_async(null, null, (_p, res) => {
        try {
          const [, stdout, stderr] = proc.communicate_utf8_finish(res);
          resolve({
            ok: proc.get_successful(),
            status: proc.get_exit_status(),
            stdout: String(stdout || '').trim(),
            stderr: String(stderr || '').trim()
          });
        } catch (e) {
          resolve({ ok: false, status: 1, stdout: '', stderr: String(e.message || e) });
        }
      });
    } catch (e) {
      resolve({ ok: false, status: 1, stdout: '', stderr: String(e.message || e) });
    }
  });
}

function callDaemonAsync(method) {
  return new Promise(resolve => {
    try {
      Gio.DBus.session.call(
        GNOMECAST_BUS,
        GNOMECAST_PATH,
        GNOMECAST_IFACE,
        method,
        null,
        null,
        Gio.DBusCallFlags.NO_AUTO_START,
        500,
        null,
        (_conn, res) => {
          try {
            Gio.DBus.session.call_finish(res);
            resolve(true);
          } catch (_e) {
            resolve(false);
          }
        }
      );
    } catch (_e) {
      resolve(false);
    }
  });
}

function sleepAsync(ms) {
  return new Promise(resolve => {
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      resolve();
      return GLib.SOURCE_REMOVE;
    });
  });
}

function readJsonPrivate(path, fallback) {
  try {
    const file = Gio.File.new_for_path(path);
    if (!file.query_exists(null)) return fallback;
    const [ok, bytes] = file.load_contents(null);
    if (!ok) return fallback;
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (_e) {
    return fallback;
  }
}

function writeJsonPrivate(dirPath, filePath, value) {
  GLib.mkdir_with_parents(dirPath, 0o700);
  const file = Gio.File.new_for_path(filePath);
  const bytes = new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
  file.replace_contents(
    bytes,
    null,
    false,
    Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
    null
  );
}

/**
 * Shared GNOME hotkey + daemon state controller used by both `gnomecast app` (GUI)
 * and `gnomecast setup gnome` / `gnomecast hotkey` (CLI).
 */
export class HotkeyManager {
  constructor({ env = envLookup } = {}) {
    this.paths = Paths.resolve(env);
    this.stateFile = `${this.paths.state}/gnome-hotkey.json`;
    this.mediaKeys = safeSettings(MEDIA_KEYS_SCHEMA);
    this.customKey = safeSettings(CUSTOM_SCHEMA, CUSTOM_PATH);
    this.wmKeys = safeSettings(WM_KEYS_SCHEMA);
    this.extKeys = extensionSettings(this.paths);
  }

  refreshSchemas() {
    this.mediaKeys = safeSettings(MEDIA_KEYS_SCHEMA);
    this.customKey = safeSettings(CUSTOM_SCHEMA, CUSTOM_PATH);
    this.wmKeys = safeSettings(WM_KEYS_SCHEMA);
    this.extKeys = extensionSettings(this.paths);
  }

  cliPath() {
    const installed = `${this.paths.home}/.local/bin/gnomecast`;
    if (GLib.file_test(installed, GLib.FileTest.IS_EXECUTABLE)) return installed;
    const sysCli = GLib.find_program_in_path('gnomecast');
    if (sysCli) return sysCli;
    return `${REPO_ROOT}/bin/gnomecast`;
  }

  isDaemonRunning() {
    return pingBus(GNOMECAST_BUS, GNOMECAST_PATH, GNOMECAST_IFACE);
  }

  isExtensionLive() {
    return pingBus(SHELL_EXT_BUS, SHELL_EXT_PATH, SHELL_EXT_IFACE);
  }

  isExtensionInstalled() {
    return extensionInstalled(this.paths);
  }

  loadSavedState() {
    return readJsonPrivate(this.stateFile, {
      enabled: false,
      shortcut: DEFAULT_HOTKEY,
      backupSwitchInputSource: []
    });
  }

  saveState(next) {
    writeJsonPrivate(this.paths.state, this.stateFile, next);
  }

  getState() {
    this.extKeys = extensionSettings(this.paths);
    const saved = this.loadSavedState();
    const customList = this.mediaKeys ? this.mediaKeys.get_strv('custom-keybindings') : [];
    const customPresent = customList.includes(CUSTOM_PATH);
    const customBinding = customPresent && this.customKey ? (this.customKey.get_string('binding') || '') : '';
    const extHotkeys = this.extKeys ? this.extKeys.get_strv('toggle-hotkey') : [];
    const wmSwitch = this.wmKeys ? this.wmKeys.get_strv('switch-input-source') : [];
    const extensionLive = this.isExtensionLive();
    const daemonRunning = this.isDaemonRunning();
    const extInstalled = this.isExtensionInstalled();

    const enabled = extensionLive
      ? extHotkeys.length > 0
      : (customPresent && customBinding.length > 0);
    const shortcut = extensionLive
      ? (extHotkeys[0] || saved.shortcut || DEFAULT_HOTKEY)
      : (customBinding || extHotkeys[0] || saved.shortcut || DEFAULT_HOTKEY);

    return {
      enabled,
      shortcut,
      customBinding,
      customPresent,
      extHotkeys,
      wmSwitch,
      wmConflict: wmSwitch.includes(shortcut),
      daemonRunning,
      extensionLive,
      extensionInstalled: extInstalled,
      saved
    };
  }

  onChanged(callback) {
    const conns = [];
    const attach = (settings, signal) => {
      if (!settings) return;
      const id = settings.connect(signal, () => callback());
      conns.push([settings, id]);
    };
    attach(this.mediaKeys, 'changed::custom-keybindings');
    attach(this.customKey, 'changed::binding');
    attach(this.extKeys, 'changed::toggle-hotkey');
    attach(this.wmKeys, 'changed::switch-input-source');
    return () => {
      for (const [settings, id] of conns) {
        try { settings.disconnect(id); } catch (_e) {}
      }
    };
  }

  _clearCustomKeybinding() {
    if (this.mediaKeys) {
      const list = this.mediaKeys.get_strv('custom-keybindings')
        .filter(p => p !== CUSTOM_PATH);
      this.mediaKeys.set_strv('custom-keybindings', list);
    }
    if (this.customKey) {
      this.customKey.reset('binding');
      this.customKey.reset('command');
      this.customKey.reset('name');
    }
  }

  _setCustomKeybinding(shortcut) {
    if (!this.mediaKeys || !this.customKey) return;
    const list = this.mediaKeys.get_strv('custom-keybindings');
    if (!list.includes(CUSTOM_PATH)) {
      this.mediaKeys.set_strv('custom-keybindings', list.concat([CUSTOM_PATH]));
    }
    this.customKey.set_string('name', 'Gnomecast Launcher');
    this.customKey.set_string('command', `${this.cliPath()} toggle`);
    this.customKey.set_string('binding', shortcut);
  }

  enableKeybindingOnly({ shortcut = DEFAULT_HOTKEY } = {}) {
    this.refreshSchemas();
    const saved = this.loadSavedState();
    const prevCustomBinding = this.customKey ? (this.customKey.get_string('binding') || '') : '';

    if (this.wmKeys) {
      const switchKeys = this.wmKeys.get_strv('switch-input-source');
      if (switchKeys.includes(shortcut)) {
        if (!Array.isArray(saved.backupSwitchInputSource) || !saved.backupSwitchInputSource.includes(shortcut)) {
          saved.backupSwitchInputSource = switchKeys.slice();
        }
        this.wmKeys.set_strv('switch-input-source', switchKeys.filter(k => k !== shortcut));
      }

      // Restore Alt+Space window menu if migrating off an earlier Alt+Space custom binding.
      if (prevCustomBinding === '<Alt>space' && shortcut !== '<Alt>space') {
        if (this.wmKeys.get_strv('activate-window-menu').length === 0) {
          this.wmKeys.reset('activate-window-menu');
        }
      }
    }

    if (this.extKeys) {
      this.extKeys.set_strv('toggle-hotkey', [shortcut]);
    }

    if (this.isExtensionLive()) {
      this._clearCustomKeybinding();
    } else {
      this._setCustomKeybinding(shortcut);
    }

    Gio.Settings.sync();
    this.saveState({
      enabled: true,
      shortcut,
      backupSwitchInputSource: Array.isArray(saved.backupSwitchInputSource) ? saved.backupSwitchInputSource : []
    });
  }

  disableKeybindingOnly() {
    this.refreshSchemas();
    const saved = this.loadSavedState();

    this._clearCustomKeybinding();
    if (this.extKeys) {
      this.extKeys.set_strv('toggle-hotkey', []);
    }

    if (this.wmKeys && Array.isArray(saved.backupSwitchInputSource) && saved.backupSwitchInputSource.length > 0) {
      const current = this.wmKeys.get_strv('switch-input-source');
      const restored = current.slice();
      for (const k of saved.backupSwitchInputSource) {
        if (!restored.includes(k)) restored.unshift(k);
      }
      this.wmKeys.set_strv('switch-input-source', restored);
    }

    Gio.Settings.sync();
    this.saveState({
      enabled: false,
      shortcut: saved.shortcut || DEFAULT_HOTKEY,
      backupSwitchInputSource: []
    });
  }

  async ensureDaemonStartedAsync() {
    if (this.isDaemonRunning()) return true;
    const hasUnit = GLib.file_test(`${this.paths.home}/.config/systemd/user/gnomecast.service`, GLib.FileTest.IS_REGULAR);
    if (hasUnit && GLib.find_program_in_path('systemctl')) {
      await runAsync(['systemctl', '--user', 'enable', '--now', 'gnomecast.service']);
    } else {
      try {
        Gio.Subprocess.new(
          ['/usr/bin/gjs', '-m', `${REPO_ROOT}/gnome/daemon.js`, '--hidden'],
          Gio.SubprocessFlags.NONE
        );
      } catch (_e) {}
    }
    for (let i = 0; i < 40; i++) {
      if (this.isDaemonRunning()) return true;
      await sleepAsync(40);
    }
    return false;
  }

  async stopDaemonAsync() {
    if (this.isDaemonRunning()) {
      await callDaemonAsync('Quit');
    }
    const hasUnit = GLib.file_test(`${this.paths.home}/.config/systemd/user/gnomecast.service`, GLib.FileTest.IS_REGULAR);
    if (hasUnit && GLib.find_program_in_path('systemctl')) {
      await runAsync(['systemctl', '--user', 'disable', '--now', 'gnomecast.service']);
    }
  }

  async enableAsync({ shortcut = DEFAULT_HOTKEY, manageDaemon = true } = {}) {
    this.enableKeybindingOnly({ shortcut });
    if (manageDaemon) {
      await this.ensureDaemonStartedAsync();
    }
    return this.getState();
  }

  async disableAsync({ manageDaemon = true } = {}) {
    this.disableKeybindingOnly();
    if (manageDaemon) {
      await this.stopDaemonAsync();
    }
    return this.getState();
  }

  async launchNowAsync() {
    await this.ensureDaemonStartedAsync();
    return callDaemonAsync('Show');
  }
}
