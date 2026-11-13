import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

function deleteTree(file) {
  const info = file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
  if (info.get_file_type() === Gio.FileType.DIRECTORY) {
    const iter = file.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    let childInfo;
    while ((childInfo = iter.next_file(null)) !== null) {
      deleteTree(file.get_child(childInfo.get_name()));
    }
    iter.close(null);
  }
  file.delete(null);
}

/**
 * Empty GNOME's Trash reliably.
 *
 * Uses `/usr/bin/gio` explicitly when available so third-party wrappers on PATH
 * (such as Homebrew's `gio` without GVfs modules) do not shadow system trash
 * support, then falls back to GVfs `trash:///` and direct XDG Trash cleanup.
 */
export function emptyTrash({ trashDir = null } = {}) {
  const errors = [];
  if (!trashDir) {
    const candidates = ['/usr/bin/gio', GLib.find_program_in_path('gio')];
    for (const gioBin of candidates) {
      if (!gioBin || gioBin.includes('/linuxbrew/')) continue;
      if (!GLib.file_test(gioBin, GLib.FileTest.IS_EXECUTABLE)) continue;
      try {
        const proc = Gio.Subprocess.new(
          [gioBin, 'trash', '--empty'],
          Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
        );
        const [, , stderr] = proc.communicate_utf8(null, null);
        if (proc.get_successful()) {
          return { ok: true, method: 'gio' };
        }
        const msg = String(stderr || '').trim();
        if (msg) errors.push(msg);
      } catch (e) {
        errors.push(e && e.message ? e.message : String(e));
      }
      break;
    }

    try {
      const trashRoot = Gio.File.new_for_uri('trash:///');
      const iter = trashRoot.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
      let childInfo;
      while ((childInfo = iter.next_file(null)) !== null) {
        trashRoot.get_child(childInfo.get_name()).delete(null);
      }
      iter.close(null);
      return { ok: true, method: 'gvfs' };
    } catch (e) {
      errors.push(e && e.message ? e.message : String(e));
    }
  }

  const root = trashDir || `${GLib.get_user_data_dir()}/Trash`;
  if (!GLib.file_test(root, GLib.FileTest.IS_DIR)) {
    return { ok: true, method: 'xdg-empty' };
  }
  try {
    for (const subName of ['files', 'info', 'expunged']) {
      const subPath = `${root}/${subName}`;
      if (!GLib.file_test(subPath, GLib.FileTest.IS_DIR)) continue;
      const sub = Gio.File.new_for_path(subPath);
      const iter = sub.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
      let childInfo;
      while ((childInfo = iter.next_file(null)) !== null) {
        deleteTree(sub.get_child(childInfo.get_name()));
      }
      iter.close(null);
    }
    return { ok: true, method: 'xdg-trash' };
  } catch (e) {
    const detail = e && e.message ? e.message : String(e);
    errors.push(detail);
    throw new Error(errors.filter(Boolean).join('; ') || 'Could not empty Trash');
  }
}

function safeSettings(schemaId) {
  try {
    const source = Gio.SettingsSchemaSource.get_default();
    if (!source || !source.lookup(schemaId, true)) return null;
    return new Gio.Settings({ schema_id: schemaId });
  } catch (_e) {
    return null;
  }
}

function readPowerProfileState() {
  const busNames = ['org.freedesktop.UPower.PowerProfiles', 'net.hadess.PowerProfiles'];
  const paths = ['/org/freedesktop/UPower/PowerProfiles', '/net/hadess/PowerProfiles'];
  for (let i = 0; i < busNames.length; i++) {
    try {
      const res = Gio.DBus.system.call_sync(
        busNames[i],
        paths[i],
        'org.freedesktop.DBus.Properties',
        'GetAll',
        new GLib.Variant('(s)', [busNames[i]]),
        null,
        Gio.DBusCallFlags.NONE,
        300,
        null
      );
      const props = res.deep_unpack()[0];
      const active = props.ActiveProfile ? props.ActiveProfile.deep_unpack() : '';
      const rawProfiles = props.Profiles ? props.Profiles.deep_unpack() : [];
      const profiles = rawProfiles.map(p => (p.Profile ? p.Profile.deep_unpack() : '')).filter(Boolean);
      if (profiles.length > 0 || active) {
        return { busName: busNames[i], path: paths[i], active, profiles };
      }
    } catch (_e) {
      // Try fallback bus name.
    }
  }
  return { busName: '', path: '', active: '', profiles: [] };
}

function setPowerProfile(profile) {
  const state = readPowerProfileState();
  if (!state.busName) throw new Error('Power profiles service is not available');
  Gio.DBus.system.call_sync(
    state.busName,
    state.path,
    'org.freedesktop.DBus.Properties',
    'Set',
    new GLib.Variant('(ssv)', [state.busName, 'ActiveProfile', new GLib.Variant('s', profile)]),
    null,
    Gio.DBusCallFlags.NONE,
    1000,
    null
  );
}

const PROFILE_LABELS = {
  'power-saver': 'Power Saver',
  balanced: 'Balanced',
  performance: 'Performance'
};

export class GnomeCommands {
  constructor({ paths, onReloadRequested = null, onOpenExtensionPrefs = null }) {
    this.paths = paths;
    this.onReloadRequested = onReloadRequested;
    this.onOpenExtensionPrefs = onOpenExtensionPrefs;
    this._ifaceSettings = safeSettings('org.gnome.desktop.interface');
    this._colorSettings = safeSettings('org.gnome.settings-daemon.plugins.color');
    this._powerState = { busName: '', path: '', active: '', profiles: [] };
    this._handlers = new Map();
  }

  refreshLiveState() {
    const prevKey = this._stateKey || '';
    this._powerState = readPowerProfileState();
    const isDark = this._ifaceSettings ? this._ifaceSettings.get_string('color-scheme') === 'prefer-dark' : true;
    const nightOn = this._colorSettings ? this._colorSettings.get_boolean('night-light-enabled') : false;
    const nextKey = `${isDark}|${nightOn}|${this._powerState.active}`;
    this._stateKey = nextKey;
    return prevKey !== '' && prevKey !== nextKey;
  }

  candidates(appInfos, launchDesktopId, launchUri) {
    this._handlers.clear();
    const out = [];

    const register = (candidate, handler) => {
      this._handlers.set(candidate.id, handler);
      out.push(candidate);
    };

    const isDark = this._ifaceSettings
      ? this._ifaceSettings.get_string('color-scheme') === 'prefer-dark'
      : true;

    register({
      id: 'gnome:appearance.toggle',
      type: 'command',
      kind: 'gnome-action',
      title: 'Toggle Dark Mode',
      subtitle: 'System › Appearance',
      keywords: ['theme', 'dark', 'light', 'appearance', 'color scheme'],
      typeLabel: 'Command',
      iconName: 'weather-clear-night-symbolic',
      action: 'gsettings set org.gnome.desktop.interface color-scheme',
      checked: isDark,
      rootSearch: { when: 'always' }
    }, () => {
      if (!this._ifaceSettings) throw new Error('GNOME interface schema unavailable');
      const next = this._ifaceSettings.get_string('color-scheme') === 'prefer-dark' ? 'default' : 'prefer-dark';
      this._ifaceSettings.set_string('color-scheme', next);
      return { close: true, hud: next === 'prefer-dark' ? 'Dark Mode Enabled' : 'Light Mode Enabled' };
    });

    if (this._colorSettings) {
      const nightOn = this._colorSettings.get_boolean('night-light-enabled');
      register({
        id: 'gnome:appearance.night-light',
        type: 'command',
        kind: 'gnome-action',
        title: 'Toggle Night Light',
        subtitle: 'System › Display',
        keywords: ['nightlight', 'night light', 'blue light', 'redshift', 'warm'],
        typeLabel: 'Command',
        iconName: 'night-light-symbolic',
        action: 'gsettings set org.gnome.settings-daemon.plugins.color night-light-enabled',
        checked: nightOn,
        rootSearch: { when: 'always' }
      }, () => {
        const next = !this._colorSettings.get_boolean('night-light-enabled');
        this._colorSettings.set_boolean('night-light-enabled', next);
        return { close: true, hud: next ? 'Night Light On' : 'Night Light Off' };
      });
    }

    if (this._powerState.profiles.length > 0) {
      register({
        id: 'gnome:power',
        type: 'command',
        kind: 'gnome-menu',
        title: 'Power Profile',
        subtitle: 'System › Power',
        keywords: ['power', 'battery', 'performance', 'balanced', 'saver'],
        typeLabel: 'Menu',
        iconName: 'power-profile-balanced-symbolic',
        menuId: 'gnome:power',
        rootSearch: { when: 'always' }
      }, () => ({ push: { kind: 'menu', menuId: 'gnome:power', title: 'Power Profile' } }));

      for (const profile of this._powerState.profiles) {
        const label = PROFILE_LABELS[profile] || profile;
        register({
          id: `gnome:power.${profile}`,
          type: 'command',
          kind: 'gnome-action',
          title: `Power Profile: ${label}`,
          subtitle: 'System › Power Profile',
          keywords: ['power', 'profile', profile, label.toLowerCase()],
          typeLabel: 'Command',
          iconName: `power-profile-${profile}-symbolic`,
          action: `powerprofilesctl set ${profile}`,
          checked: this._powerState.active === profile,
          rootSearch: { when: 'searching' }
        }, () => {
          setPowerProfile(profile);
          this._powerState.active = profile;
          return { close: true, hud: `Power Profile: ${label}` };
        });
      }
    }

    // Standard GNOME / systemd system actions
    const systemActions = [
      {
        id: 'gnome:system.lock',
        title: 'Lock Screen',
        keywords: ['lock', 'screen', 'sleep'],
        iconName: 'system-lock-screen-symbolic',
        action: 'loginctl lock-session',
        argv: ['loginctl', 'lock-session']
      },
      {
        id: 'gnome:system.suspend',
        title: 'Suspend',
        keywords: ['sleep', 'suspend', 'hibernate'],
        iconName: 'media-playback-pause-symbolic',
        action: 'systemctl suspend',
        argv: ['systemctl', 'suspend']
      },
      {
        id: 'gnome:system.logout',
        title: 'Log Out',
        keywords: ['logout', 'sign out', 'exit'],
        iconName: 'system-log-out-symbolic',
        action: 'gnome-session-quit --logout --no-prompt',
        argv: ['gnome-session-quit', '--logout', '--no-prompt']
      },
      {
        id: 'gnome:system.reboot',
        title: 'Restart',
        keywords: ['reboot', 'restart'],
        iconName: 'system-reboot-symbolic',
        action: 'systemctl reboot',
        argv: ['systemctl', 'reboot']
      },
      {
        id: 'gnome:system.shutdown',
        title: 'Shut Down',
        keywords: ['poweroff', 'shutdown', 'turn off'],
        iconName: 'system-shutdown-symbolic',
        action: 'systemctl poweroff',
        argv: ['systemctl', 'poweroff']
      }
    ];

    for (const sys of systemActions) {
      register({
        id: sys.id,
        type: 'command',
        kind: 'gnome-action',
        title: sys.title,
        subtitle: 'System',
        keywords: sys.keywords,
        typeLabel: 'Command',
        iconName: sys.iconName,
        action: sys.action,
        rootSearch: { when: 'always' }
      }, () => {
        Gio.Subprocess.new(sys.argv, Gio.SubprocessFlags.NONE);
        return sys.hud ? { close: true, hud: sys.hud } : { close: true };
      });
    }

    register({
      id: 'gnome:system.empty-trash',
      type: 'command',
      kind: 'gnome-action',
      title: 'Empty Trash',
      subtitle: 'System',
      keywords: ['trash', 'bin', 'empty', 'clean'],
      typeLabel: 'Command',
      iconName: 'user-trash-symbolic',
      action: '/usr/bin/gio trash --empty',
      rootSearch: { when: 'always' }
    }, () => {
      try {
        emptyTrash();
        return { close: true, hud: 'Trash Emptied' };
      } catch (e) {
        return {
          toast: {
            style: 'failure',
            title: `Could not empty Trash: ${e && e.message ? e.message : e}`
          }
        };
      }
    });

    // GNOME Settings submenu + individual panels (discovered from X-GNOME-Settings-Panel)
    const panels = (appInfos || []).filter(info => {
      const id = info.get_id() || '';
      const cats = typeof info.get_categories === 'function' ? (info.get_categories() || '') : '';
      return id.endsWith('.desktop') && cats.indexOf('X-GNOME-Settings-Panel') >= 0;
    });

    if (panels.length > 0) {
      register({
        id: 'gnome:settings',
        type: 'command',
        kind: 'gnome-menu',
        title: 'GNOME Settings Panels',
        subtitle: 'System',
        keywords: ['settings', 'preferences', 'control center', 'system'],
        typeLabel: 'Menu',
        iconName: 'preferences-system-symbolic',
        menuId: 'gnome:settings',
        rootSearch: { when: 'always' }
      }, () => ({ push: { kind: 'menu', menuId: 'gnome:settings', title: 'GNOME Settings' } }));

      for (const info of panels) {
        const desktopId = info.get_id();
        const slug = desktopId.replace(/\.desktop$/, '');
        const title = info.get_name() || slug;
        const desc = info.get_description() || '';
        const kws = typeof info.get_keywords === 'function' ? (info.get_keywords() || []) : [];
        const iconObj = info.get_icon();
        const iconStr = iconObj ? iconObj.to_string() : 'preferences-system-symbolic';
        register({
          id: `gnome:settings.${slug}`,
          type: 'command',
          kind: 'gnome-action',
          title,
          subtitle: 'Settings',
          keywords: [desc].concat(kws || []).filter(Boolean),
          typeLabel: 'Settings',
          iconName: iconStr || 'preferences-system-symbolic',
          action: info.get_commandline() || `gtk4-launch ${desktopId}`,
          rootSearch: { when: 'searching' }
        }, () => {
          launchDesktopId(desktopId);
          return { close: true };
        });
      }
    }

    register({
      id: 'gnome:gnomecast.open-config',
      type: 'command',
      kind: 'gnome-action',
      title: 'Open Config Folder',
      subtitle: 'Gnomecast',
      keywords: ['config', 'preferences', 'json', 'folder', 'settings'],
      typeLabel: 'Command',
      iconName: 'folder-open-symbolic',
      action: `xdg-open ${this.paths.config}`,
      rootSearch: { when: 'searching' }
    }, () => {
      launchUri(`file://${this.paths.config}`);
      return { close: true };
    });

    register({
      id: 'gnome:gnomecast.reload',
      type: 'command',
      kind: 'gnome-action',
      title: 'Reload Applications & Commands',
      subtitle: 'Gnomecast',
      keywords: ['refresh', 'reload', 'reindex', 'apps'],
      typeLabel: 'Command',
      iconName: 'view-refresh-symbolic',
      action: 'gnomecast reload',
      rootSearch: { when: 'searching' }
    }, () => {
      if (this.onReloadRequested) this.onReloadRequested();
      return { toast: { style: 'success', title: 'Applications reloaded' } };
    });

    return out;
  }

  run(id) {
    const fn = this._handlers.get(id);
    if (!fn) throw new Error(`Unknown command ${id}`);
    return fn();
  }
}
