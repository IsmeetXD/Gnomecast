import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

// Run completely isolated in RAM without touching real user dconf/HOME.
GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
const tmpHome = GLib.dir_make_tmp('gnomecast-hotkey-test-XXXXXX');
GLib.setenv('HOME', tmpHome, true);
GLib.setenv('XDG_CONFIG_HOME', `${tmpHome}/.config`, true);
GLib.setenv('XDG_DATA_HOME', `${tmpHome}/.local/share`, true);
GLib.setenv('XDG_CACHE_HOME', `${tmpHome}/.cache`, true);
GLib.setenv('XDG_STATE_HOME', `${tmpHome}/.local/state`, true);
GLib.setenv('XDG_RUNTIME_DIR', `${tmpHome}/run`, true);
GLib.mkdir_with_parents(`${tmpHome}/run`, 0o700);

const { default: Adw } = await import('gi://Adw?version=1');
const { HotkeyManager, DEFAULT_HOTKEY } = await import('../gnome/lib/hotkey.js');
const { GnomecastSettingsWindow } = await import('../gnome/ui/settings_window.js');

let passed = 0;
let exitCode = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
}

function compileRepoExtensionSchema() {
  const destDir = `${tmpHome}/.local/share/gnome-shell/extensions/gnomecast@ismeetxd.dev/schemas`;
  GLib.mkdir_with_parents(destDir, 0o700);
  const cp = Gio.Subprocess.new(
    ['cp', 'gnome-extension/gnomecast@ismeetxd.dev/schemas/org.gnome.shell.extensions.gnomecast.gschema.xml', destDir],
    Gio.SubprocessFlags.STDERR_PIPE
  );
  cp.wait(null);
  assert(cp.get_successful(), 'copied extension gschema to tmp XDG_DATA_HOME');
  const proc = Gio.Subprocess.new(
    ['glib-compile-schemas', destDir],
    Gio.SubprocessFlags.STDERR_PIPE
  );
  proc.wait(null);
  assert(proc.get_successful(), 'compiled extension gschema');
}

compileRepoExtensionSchema();

const app = new Adw.Application({
  application_id: 'dev.ismeetxd.GnomecastSettingsTest',
  flags: Gio.ApplicationFlags.FLAGS_NONE
});

const waitMs = (ms) => new Promise(resolve => {
  GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
  });
});

app.connect('activate', () => {
  app.hold();
  const mgr = new HotkeyManager();
  let finished = false;
  const watchdog = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
    if (!finished) {
      exitCode = 1;
      printerr('FAIL: hotkey test watchdog timed out');
      Gio.Subprocess.new(['rm', '-rf', tmpHome], Gio.SubprocessFlags.NONE).wait(null);
      app.release();
      app.quit();
    }
    return GLib.SOURCE_REMOVE;
  });

  (async () => {
    // Seed initial WM conflict + legacy Alt+Space custom binding
    mgr.wmKeys.set_strv('switch-input-source', ['<Super>space', 'XF86Keyboard']);
    mgr.wmKeys.set_strv('activate-window-menu', []);
    mgr._setCustomKeybinding('<Alt>space');
    assert(mgr.getState().customBinding === '<Alt>space', 'legacy Alt+Space setup seeded');

    // Enable Super+Space cleanly
    mgr.enableKeybindingOnly({ shortcut: DEFAULT_HOTKEY });
    let s = mgr.getState();
    assert(s.enabled === true, 'hotkey enabled');
    assert(s.shortcut === '<Super>space', 'shortcut is <Super>space');
    assert(s.customBinding === '<Super>space', 'custom keybinding set to <Super>space');
    assert(s.extHotkeys.length === 1 && s.extHotkeys[0] === '<Super>space', 'extension schema updated to <Super>space');
    assert(!s.wmSwitch.includes('<Super>space') && s.wmSwitch.includes('XF86Keyboard'), 'switch-input-source unbound <Super>space while preserving XF86Keyboard');
    assert(mgr.wmKeys.get_strv('activate-window-menu').includes('<Alt>space'), 'Alt+Space window menu restored when migrating to Super+Space');
    assert(s.saved.backupSwitchInputSource.includes('<Super>space'), 'backup of switch-input-source saved');

    // Verify private permissions on state file
    const info = Gio.File.new_for_path(mgr.stateFile).query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
    const mode = info.get_attribute_uint32('unix::mode') & 0o777;
    assert(mode === 0o600, `state file is mode 0600 (got ${mode.toString(8)})`);

    // Disable and verify restore
    mgr.disableKeybindingOnly();
    s = mgr.getState();
    assert(s.enabled === false, 'hotkey disabled');
    assert(s.customPresent === false && s.customBinding === '', 'custom keybinding cleared');
    assert(s.extHotkeys.length === 0, 'extension toggle-hotkey cleared');
    assert(mgr.wmKeys.get_strv('switch-input-source').includes('<Super>space'), 'original <Super>space switch-input-source restored');

    // Verify Settings GUI window initializes and toggles state cleanly
    mgr.enableAsync = async () => {
      mgr.enableKeybindingOnly({ shortcut: DEFAULT_HOTKEY });
      return mgr.getState();
    };
    mgr.disableAsync = async () => {
      mgr.disableKeybindingOnly();
      return mgr.getState();
    };

    const ui = new GnomecastSettingsWindow(app, mgr);
    assert(ui.heroIcon.get_gicon() !== null, 'GUI hero icon uses Gnomecast logo');
    assert(ui.toggleRow.get_active() === false, 'GUI switch starts OFF');
    assert(ui.heroBadge.get_label() === 'OFF', 'GUI hero badge shows OFF');

    ui.toggleRow.set_active(true);
    await waitMs(50);
    assert(!ui._busy, 'GUI toggle ON completed');
    assert(mgr.getState().enabled === true, 'flipping GUI switch ON enables Super+Space');
    assert(ui.heroBadge.get_label() === 'ON', 'GUI hero badge updates to ON');
    assert(ui.shortcutBadge.get_label() === 'Super + Space', 'GUI shortcut badge shows Super + Space');

    ui.toggleRow.set_active(false);
    await waitMs(50);
    assert(!ui._busy, 'GUI toggle OFF completed');
    assert(mgr.getState().enabled === false, 'flipping GUI switch OFF disables Super+Space');
    assert(ui.heroBadge.get_label() === 'OFF', 'GUI hero badge returns to OFF');
    assert(mgr.wmKeys.get_strv('switch-input-source').includes('<Super>space'), 'flipping GUI switch OFF restores system Super+Space');

    ui.win.close();
    print(`HOTKEY & APP CHECKS PASSED (${passed} assertions)`);
  })()
    .catch(err => {
      exitCode = 1;
      printerr(String(err && err.stack ? err.stack : err));
    })
    .finally(() => {
      finished = true;
      GLib.source_remove(watchdog);
      Gio.Subprocess.new(['rm', '-rf', tmpHome], Gio.SubprocessFlags.NONE).wait(null);
      app.release();
      app.quit();
    });
});

await app.runAsync([]);
if (exitCode !== 0) System.exit(exitCode);
