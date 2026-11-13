import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE_XML = `
<node>
  <interface name="dev.ismeetxd.Gnomecast.Shell">
    <method name="Ping">
      <arg type="s" direction="out" name="pong"/>
    </method>
    <method name="FocusLauncher">
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="ListWindows">
      <arg type="s" direction="out" name="json"/>
    </method>
    <method name="FocusWindow">
      <arg type="s" direction="in" name="windowId"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
    <method name="ActiveWindowClass">
      <arg type="s" direction="out" name="wmClass"/>
    </method>
    <method name="Paste">
      <arg type="b" direction="in" name="isTerminal"/>
      <arg type="b" direction="out" name="ok"/>
    </method>
  </interface>
</node>`;

const CUSTOM_PATH = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/gnomecast/';

export default class GnomecastExtension extends Extension {
  _clearConflictingCustomKeybindings(hotkeys) {
    if (!Array.isArray(hotkeys) || hotkeys.length === 0) return;
    try {
      const mediaKeys = new Gio.Settings({ schema_id: 'org.gnome.settings-daemon.plugins.media-keys' });
      let list = mediaKeys.get_strv('custom-keybindings');
      if (!list.includes(CUSTOM_PATH)) return;
      const custom = new Gio.Settings({
        schema_id: 'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding',
        path: CUSTOM_PATH
      });
      const binding = custom.get_string('binding') || '';
      if (!hotkeys.includes(binding)) return;
      list = list.filter(p => p !== CUSTOM_PATH);
      custom.reset('binding');
      custom.reset('command');
      custom.reset('name');
      mediaKeys.set_strv('custom-keybindings', list);
      Gio.Settings.sync();
    } catch (_e) {}
  }

  enable() {
    this._settings = this.getSettings();
    this._dbusExport = null;
    this._busOwnerId = 0;
    this._winCreatedId = 0;
    this._virtualKbd = null;

    this._clearConflictingCustomKeybindings(this._settings.get_strv('toggle-hotkey'));

    Main.wm.addKeybinding(
      'toggle-hotkey',
      this._settings,
      Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => this._toggleDaemon()
    );

    this._winCreatedId = global.display.connect('window-created', (_d, win) => {
      if (!this._isGnomecastWindow(win)) return;
      const actor = win.get_compositor_private();
      if (actor) {
        const sig = actor.connect('first-frame', () => {
          actor.disconnect(sig);
          this._placeAndFocus(win);
        });
      }
      GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._placeAndFocus(win);
        return GLib.SOURCE_REMOVE;
      });
    });

    this._dbusExport = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, this);
    this._dbusExport.export(Gio.DBus.session, '/dev/ismeetxd/Gnomecast/Shell');
    this._busOwnerId = Gio.DBus.session.own_name(
      'dev.ismeetxd.Gnomecast.Shell',
      Gio.BusNameOwnerFlags.REPLACE,
      null,
      null
    );
  }

  disable() {
    Main.wm.removeKeybinding('toggle-hotkey');

    if (this._winCreatedId) {
      global.display.disconnect(this._winCreatedId);
      this._winCreatedId = 0;
    }
    if (this._busOwnerId) {
      Gio.DBus.session.unown_name(this._busOwnerId);
      this._busOwnerId = 0;
    }
    if (this._dbusExport) {
      this._dbusExport.unexport();
      this._dbusExport = null;
    }
    this._virtualKbd = null;
    this._settings = null;
  }

  _toggleDaemon() {
    Gio.DBus.session.call(
      'dev.ismeetxd.Gnomecast',
      '/dev/ismeetxd/Gnomecast',
      'dev.ismeetxd.Gnomecast',
      'Toggle',
      null,
      null,
      Gio.DBusCallFlags.NONE,
      2000,
      null,
      null
    );
  }

  _isGnomecastWindow(win) {
    if (!win) return false;
    const appId = win.get_gtk_application_id ? win.get_gtk_application_id() : '';
    const cls = win.get_wm_class ? win.get_wm_class() : '';
    const title = win.get_title ? win.get_title() : '';
    return appId === 'dev.ismeetxd.Gnomecast' ||
      cls === 'dev.ismeetxd.Gnomecast' ||
      title === 'Gnomecast' ||
      title === 'gnomecast';
  }

  _findGnomecastWindow() {
    const actors = global.get_window_actors();
    for (let i = actors.length - 1; i >= 0; i--) {
      const win = actors[i].meta_window;
      if (this._isGnomecastWindow(win)) return win;
    }
    return null;
  }

  _pointerMonitor() {
    const [px, py] = global.get_pointer();
    const monitors = Main.layoutManager.monitors || [];
    for (const m of monitors) {
      if (px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height) {
        return m;
      }
    }
    return Main.layoutManager.primaryMonitor;
  }

  _placeAndFocus(win) {
    if (!win) return false;
    try {
      const monitor = this._pointerMonitor();
      if (monitor) {
        const rect = win.get_frame_rect();
        if (rect.width > 0 && rect.height > 0) {
          const x = Math.round(monitor.x + (monitor.width - rect.width) / 2);
          const y = Math.round(monitor.y + Math.min(monitor.height / 4, Math.max(24, monitor.height - rect.height - 24)));
          win.move_frame(true, x, y);
        }
      }
      win.make_above();
      win.stick();
      Main.activateWindow(win, global.get_current_time());
      return true;
    } catch (_e) {
      return false;
    }
  }

  Ping() {
    return 'ok';
  }

  FocusLauncher() {
    const win = this._findGnomecastWindow();
    if (!win) return false;
    return this._placeAndFocus(win);
  }

  ListWindows() {
    const raw = global.get_window_actors()
      .map(a => a.meta_window)
      .filter(w => w && w.get_window_type() === Meta.WindowType.NORMAL && !this._isGnomecastWindow(w));

    raw.sort((a, b) => b.get_user_time() - a.get_user_time());

    const out = [];
    raw.forEach((win, idx) => {
      const id = String(win.get_id());
      const names = [];
      const addName = (s) => {
        if (s && !names.includes(s)) names.push(s);
      };
      addName(win.get_wm_class ? win.get_wm_class() : '');
      addName(win.get_gtk_application_id ? win.get_gtk_application_id() : '');
      addName(win.get_sandboxed_app_id ? win.get_sandboxed_app_id() : '');
      for (const cls of names) {
        out.push({
          address: id,
          class: cls,
          title: win.get_title() || '',
          mapped: !win.minimized,
          minimized: !!win.minimized,
          focusHistoryID: idx
        });
      }
    });
    return JSON.stringify(out);
  }

  FocusWindow(windowId) {
    const actors = global.get_window_actors();
    for (const actor of actors) {
      const win = actor.meta_window;
      if (!win || String(win.get_id()) !== windowId) continue;
      const now = global.get_current_time();
      if (win.minimized) win.unminimize();
      const ws = win.get_workspace();
      if (ws && ws !== global.workspace_manager.get_active_workspace()) {
        ws.activate(now);
      }
      Main.activateWindow(win, now);
      return true;
    }
    return false;
  }

  ActiveWindowClass() {
    const win = global.display.focus_window;
    if (!win) return '';
    return (win.get_wm_class && win.get_wm_class()) ||
      (win.get_gtk_application_id && win.get_gtk_application_id()) ||
      '';
  }

  Paste(isTerminal) {
    try {
      if (!this._virtualKbd) {
        this._virtualKbd = Clutter.get_default_backend()
          .get_default_seat()
          .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
      }
      const dev = this._virtualKbd;
      const now = GLib.get_monotonic_time();
      if (isTerminal) {
        dev.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.PRESSED);
        dev.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        dev.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.PRESSED);
        dev.notify_keyval(now, Clutter.KEY_v, Clutter.KeyState.RELEASED);
        dev.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
        dev.notify_keyval(now, Clutter.KEY_Control_L, Clutter.KeyState.RELEASED);
      } else {
        dev.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.PRESSED);
        dev.notify_keyval(now, Clutter.KEY_Insert, Clutter.KeyState.PRESSED);
        dev.notify_keyval(now, Clutter.KEY_Insert, Clutter.KeyState.RELEASED);
        dev.notify_keyval(now, Clutter.KEY_Shift_L, Clutter.KeyState.RELEASED);
      }
      return true;
    } catch (_e) {
      return false;
    }
  }
}
