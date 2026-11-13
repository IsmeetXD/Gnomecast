import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

// Redirect XDG/HOME and GSettings backend to isolated temp/memory before importing backend.
GLib.setenv('GSETTINGS_BACKEND', 'memory', true);
const tmpHome = GLib.dir_make_tmp('gnomecast-gnome-test-XXXXXX');
GLib.setenv('HOME', tmpHome, true);
GLib.setenv('XDG_CONFIG_HOME', `${tmpHome}/.config`, true);
GLib.setenv('XDG_DATA_HOME', `${tmpHome}/.local/share`, true);
GLib.setenv('XDG_CACHE_HOME', `${tmpHome}/.cache`, true);
GLib.setenv('XDG_STATE_HOME', `${tmpHome}/.local/state`, true);
GLib.setenv('XDG_RUNTIME_DIR', `${tmpHome}/run`, true);
GLib.mkdir_with_parents(`${tmpHome}/run`, 0o700);

const { GnomecastBackend } = await import('../gnome/lib/backend.js');
const { NativeSearch } = await import('../gnome/lib/native_search.js');
const { emptyTrash } = await import('../gnome/lib/gnome_commands.js');
const { RootSearch, Calculator, Ranker, Frecency, REPO_ROOT } = await import('../gnome/lib/core.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error(`FAIL: ${msg}`);
    throw new Error(msg);
  }
  passed++;
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed++;
    console.error(`FAIL: ${msg} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
    throw new Error(msg);
  }
  passed++;
}

function statMode(path) {
  const f = Gio.File.new_for_path(path);
  const info = f.query_info('unix::mode', Gio.FileQueryInfoFlags.NONE, null);
  return info.get_attribute_uint32('unix::mode') & 0o777;
}

try {
  const backend = new GnomecastBackend();
  backend.init();

  assert(backend.ready, 'backend becomes ready');
  assertEq(backend.desktop, 'gnome', 'desktop is gnome');

  const ping = backend.callSync('system.healthPing', {});
  assertEq(ping.ok, true, 'healthPing ok');
  assertEq(ping.data, null, 'healthPing data null');

  const info = backend.callSync('system.info', {});
  assertEq(info.ok, true, 'system.info ok');
  assert(info.data.candidates > 10, `discovered ${info.data.candidates} candidates`);

  const dbHealth = backend.callSync('system.healthDatabase', {});
  assertEq(dbHealth.ok, true, 'healthDatabase ok');
  assertEq(dbHealth.data.loaded, true, 'settings loaded');

  // Privacy check: 0700 dirs and 0600 db files
  assertEq(statMode(backend.paths.config), 0o700, 'config dir mode 0700');
  assertEq(statMode(backend.paths.data), 0o700, 'data dir mode 0700');
  assertEq(statMode(backend.paths.db), 0o700, 'db dir mode 0700');
  assertEq(statMode(`${backend.paths.db}/settings.json`), 0o600, 'settings.json mode 0600');
  assertEq(statMode(`${backend.paths.db}/frecency.json`), 0o600, 'frecency.json mode 0600');
  assertEq(statMode(`${backend.paths.db}/calculator.json`), 0o600, 'calculator.json mode 0600');

  // Root search empty + query + fallbacks
  const emptyRes = backend.callSync('rootSearch.search', { query: '' });
  assertEq(emptyRes.ok, true, 'empty rootSearch ok');
  assert(emptyRes.data.length > 0, 'empty root has sections');

  const noMatch = backend.callSync('rootSearch.search', { query: 'zzzz-no-such-cmd' });
  assertEq(noMatch.ok, true, 'fallback search ok');
  assertEq(noMatch.data[0].id, 'fallback-commands', 'unmatched query shows fallback section');

  // Calculator: arithmetic, unit conversion, time zone
  const calc1 = backend.callSync('calculator.calculate', { query: '2 + 2 * 5' });
  assertEq(calc1.ok, true, 'calc arithmetic ok');
  assertEq(calc1.data.result, '12', '2 + 2 * 5 = 12');

  const calc2 = backend.callSync('calculator.calculate', { query: '5 km to mi' });
  assertEq(calc2.ok, true, 'calc unit conversion ok');
  assert(calc2.data.result.includes('mi'), `5 km to mi -> ${calc2.data.result}`);

  const calc3 = backend.callSync('calculator.calculate', { query: 'time in tokyo' });
  assertEq(calc3.ok, true, 'calc timezone ok');
  assert(calc3.data && calc3.data.result.length > 0, `time in tokyo -> ${calc3.data && calc3.data.result}`);

  // Calculator search section + save to history
  const calcSearch = backend.callSync('rootSearch.search', { query: '100 / 4' });
  assertEq(calcSearch.data[0].id, 'calculator', 'calculator section appears first');
  assertEq(calcSearch.data[0].rows[0].calcResult, '25', 'calculator row result is 25');

  // Confirmation alert for destructive GNOME system commands
  const shutdownConfirm = backend.callSync('rootSearch.performAction', { id: 'gnome:system.shutdown', action: 'open', query: '' });
  assertEq(shutdownConfirm.ok, true, 'shutdown returns confirm object');
  assert(shutdownConfirm.data && shutdownConfirm.data.confirm && shutdownConfirm.data.confirm.destructive, 'shutdown requires confirmation');

  // Submenu push for Power Profile or GNOME Settings
  const settingsSub = backend.callSync('rootSearch.performAction', { id: 'gnome:settings', action: 'open', query: '' });
  assertEq(settingsSub.ok, true, 'gnome:settings opens submenu');
  assertEq(settingsSub.data.push.kind, 'menu', 'gnome:settings pushes menu view');

  const subResults = backend.callSync('rootSearch.search', { query: 'display', view: settingsSub.data.push });
  assertEq(subResults.ok, true, 'submenu search ok');
  assert(subResults.data.length > 0 && subResults.data[0].rows.some(r => r.title.toLowerCase().includes('display')), 'submenu finds Displays panel');

  // Alias + disable + undo
  const setAlias = backend.callSync('settings.updateCommandSettings', { commandId: 'gnome:appearance.toggle', alias: 'dm' });
  assertEq(setAlias.ok, true, 'alias set ok');
  const aliasSearch = backend.callSync('rootSearch.search', { query: 'dm' });
  assertEq(aliasSearch.data[0].rows[0].id, 'gnome:appearance.toggle', 'alias brings command to top');

  const disabled = backend.callSync('rootSearch.performAction', { id: 'gnome:appearance.toggle', action: 'disable', query: '' });
  assertEq(disabled.ok, true, 'disable ok');
  assert(disabled.data.toast && disabled.data.toast.actions.length === 1, 'disable provides Undo toast action');

  // Empty Trash isolated test: never touches real ~/.local/share/Trash, and never follows symlinks out of Trash
  const trashDir = `${tmpHome}/isolated-trash`;
  const externalKeep = `${tmpHome}/external-keep`;
  GLib.mkdir_with_parents(`${trashDir}/files/nested`, 0o700);
  GLib.mkdir_with_parents(`${trashDir}/info`, 0o700);
  GLib.mkdir_with_parents(`${trashDir}/expunged`, 0o700);
  GLib.mkdir_with_parents(externalKeep, 0o700);
  GLib.file_set_contents(`${trashDir}/files/a.txt`, 'bye');
  GLib.file_set_contents(`${trashDir}/files/nested/b.txt`, 'bye2');
  GLib.file_set_contents(`${trashDir}/info/a.txt.trashinfo`, '[Trash Info]\nPath=/tmp/a.txt\n');
  GLib.file_set_contents(`${trashDir}/expunged/old`, 'old');
  GLib.file_set_contents(`${externalKeep}/secret.txt`, 'must-survive');
  Gio.File.new_for_path(`${trashDir}/files/symlink_out`).make_symbolic_link(externalKeep, null);

  const trashRes = emptyTrash({ trashDir });
  assertEq(trashRes && trashRes.ok, true, 'emptyTrash succeeds on isolated trash dir');
  for (const sub of ['files', 'info', 'expunged']) {
    const en = Gio.File.new_for_path(`${trashDir}/${sub}`).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    assertEq(en.next_file(null), null, `trash/${sub} is empty`);
    en.close(null);
  }
  assert(GLib.file_test(`${externalKeep}/secret.txt`, GLib.FileTest.EXISTS), 'emptyTrash does not follow symlinks outside Trash');

  // NativeSearch edge cases (malformed reply fallback + missing binary fallback + live helper if built)
  const nsBad = new NativeSearch();
  nsBad.setEntries(['files'], [{ title: 'Files' }]);
  nsBad.executable = `${tmpHome}/missing-search-bin`;
  let badRes = 'unset';
  nsBad.search('fi', 'medium', r => { badRes = r; });
  assertEq(badRes, null, 'missing search helper falls back to null');

  const nsProto = new NativeSearch();
  nsProto.setEntries(['files'], [{ title: 'Files' }]);
  nsProto.pending = { id: 2, query: 'fi', sensitivity: 'medium', callback: r => { nsProto._last = r; } };
  nsProto._receive('not-json');
  assertEq(nsProto.disabled, true, 'malformed native reply disables helper');
  assertEq(nsProto._last, null, 'malformed native reply falls back cleanly');

  const builtHelper = `${REPO_ROOT}/bin/gnomecast-search`;
  if (GLib.file_test(builtHelper, GLib.FileTest.IS_EXECUTABLE)) {
    const nsLive = new NativeSearch();
    nsLive.setEntries(['firefox', 'files'], [{ title: 'Firefox' }, { title: 'Files' }]);
    let liveHits = null;
    nsLive.search('fir', 'medium', hits => { liveHits = hits; });
    const ctx = GLib.MainContext.default();
    const deadline = GLib.get_monotonic_time() + 2000 * 1000;
    while (liveHits === null && !nsLive.disabled && GLib.get_monotonic_time() < deadline) {
      ctx.iteration(true);
    }
    nsLive.destroy();
    assert(liveHits && liveHits.firefox && liveHits.firefox.title > 0, 'built gnomecast-search matches Firefox cleanly');
  }

  backend.flush();
  backend.destroy();
  console.log(`ALL PASSED (${passed} checks)`);
} finally {
  // Cleanup temp home
  Gio.Subprocess.new(['rm', '-rf', tmpHome], Gio.SubprocessFlags.NONE).wait(null);
}
