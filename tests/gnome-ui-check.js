import Adw from 'gi://Adw?version=1';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const tmpHome = GLib.dir_make_tmp('gnomecast-ui-test-XXXXXX');
GLib.setenv('HOME', tmpHome, true);
GLib.setenv('XDG_CONFIG_HOME', `${tmpHome}/.config`, true);
GLib.setenv('XDG_DATA_HOME', `${tmpHome}/.local/share`, true);
GLib.setenv('XDG_CACHE_HOME', `${tmpHome}/.cache`, true);
GLib.setenv('XDG_STATE_HOME', `${tmpHome}/.local/state`, true);
GLib.setenv('XDG_RUNTIME_DIR', `${tmpHome}/run`, true);
GLib.mkdir_with_parents(`${tmpHome}/run`, 0o700);

const { GnomecastBackend } = await import('../gnome/lib/backend.js');
const { LauncherWindow } = await import('../gnome/ui/launcher.js');
const { registerIconTheme } = await import('../gnome/lib/logo.js');

registerIconTheme();

let passed = 0;
function assert(cond, msg) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  passed++;
}

function flushSearch(launcher, timeoutMs = 2000) {
  const deadline = GLib.get_monotonic_time() + timeoutMs * 1000;
  const ctx = GLib.MainContext.default();
  while (launcher.searchPending && GLib.get_monotonic_time() < deadline) {
    ctx.iteration(true);
  }
  assert(!launcher.searchPending, 'async search completed');
}

const app = new Adw.Application({ application_id: 'dev.ismeetxd.GnomecastTest', flags: Gio.ApplicationFlags.FLAGS_NONE });

app.connect('activate', () => {
  const backend = new GnomecastBackend();
  backend.init();
  const launcher = new LauncherWindow({ app, backend });

  try {
    launcher.show({});
    assert(launcher.shown === true, 'launcher shows');
    assert(launcher.leadIcon.get_gicon() !== null, 'launcher lead icon uses Gnomecast logo');
    assert(launcher.rows.length > 0, 'root rows populated');
    assert(launcher.selectedIndex >= 0, 'first selectable row selected');

    // Calculator query + result row
    launcher.setQuery('2+2');
    flushSearch(launcher);
    assert(launcher.rows[0].title === 'Calculator', 'Calculator section shown');
    assert(launcher.rows[1].rowKind === 'calculator', 'Calculator card row built');
    assert(launcher.rows[1].calcResult === '4', 'Calculator result is 4');

    // Action panel + filtering
    launcher.toggleActionPanel();
    assert(launcher.actionPanelOpen === true, 'Action panel opens');
    assert(launcher._activePopupItems().length >= 3, 'Calculator actions listed');
    launcher.popupFilter = 'paste';
    assert(launcher._activePopupItems().length === 1 && launcher._activePopupItems()[0].id === 'paste-answer', 'Action panel filters');
    launcher.toggleActionPanel();
    assert(launcher.actionPanelOpen === false, 'Action panel closes');

    // About panel
    launcher.toggleAbout();
    assert(launcher.aboutOpen === true, 'About panel opens');
    assert(launcher.aboutRows.length >= 2, 'About panel has rows');
    launcher.toggleAbout();

    // Dropdown filter
    launcher.setQuery('');
    launcher.toggleDropdown();
    assert(launcher.dropdownOpen === true, 'Filter dropdown opens');
    launcher.setRootFilter('applications');
    assert(launcher.rootFilter === 'applications', 'Filter changes to applications');
    assert(launcher.rows.every(r => r.rowKind === 'section' || r.itemId.startsWith('app:')), 'Only applications shown');
    launcher.setRootFilter('all');

    // Confirm alert on destructive command
    launcher.request({ id: 'gnome:system.shutdown', action: 'open', query: '' });
    assert(launcher.alert !== null && launcher.alert.spec.destructive === true, 'Shutdown shows destructive alert');
    launcher.alert = null;
    launcher._renderOverlays();

    // Submenu push + pop
    launcher.request({ id: 'gnome:settings', action: 'open', query: '' });
    assert(launcher.stack.length === 2, 'Submenu pushed onto stack');
    assert(launcher.view.kind === 'menu', 'Current view is menu');
    launcher.pop();
    assert(launcher.atRoot === true, 'Popped back to root');

    // Zoom
    launcher.setZoom(1.2);
    assert(Math.abs(launcher.zoom - 1.2) < 0.01, 'Zoom updated to 1.2');
    launcher.setZoom(1);

    // Compact mode
    backend.callSync('settings.updateGeneralSettings', { windowMode: 'compact' });
    launcher.setQuery('');
    assert(launcher.compact === true, 'Compact mode active at empty root');
    launcher.setQuery('fire');
    flushSearch(launcher);
    assert(launcher.compact === false, 'Compact mode expands while typing');

    launcher.hide();
    assert(launcher.shown === false, 'Launcher hides');
    backend.flush();
    backend.destroy();
    print(`UI CHECKS PASSED (${passed} assertions)`);
  } finally {
    Gio.Subprocess.new(['rm', '-rf', tmpHome], Gio.SubprocessFlags.NONE).wait(null);
    app.quit();
  }
});

app.run([]);
