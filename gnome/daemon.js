import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

// GTK 4.24's default Vulkan renderer takes ~1s to initialize on the very first map;
// use hardware GL unless the caller overrides GSK_RENDERER (or Broadway is active).
if (!GLib.getenv('GSK_RENDERER') && GLib.getenv('GDK_BACKEND') !== 'broadway') {
  GLib.setenv('GSK_RENDERER', 'gl', false);
}

const { default: Adw } = await import('gi://Adw?version=1');
const { GnomecastBackend } = await import('./lib/backend.js');
const { registerIconTheme } = await import('./lib/logo.js');
const { LauncherWindow } = await import('./ui/launcher.js');

const IFACE_XML = `
<node>
  <interface name="dev.ismeetxd.Gnomecast">
    <method name="Toggle">
      <arg type="s" direction="out" name="state"/>
    </method>
    <method name="Show">
      <arg type="s" direction="out" name="state"/>
    </method>
    <method name="Hide">
      <arg type="s" direction="out" name="state"/>
    </method>
    <method name="IsOpen">
      <arg type="b" direction="out" name="open"/>
    </method>
    <method name="Ping">
      <arg type="s" direction="out" name="pong"/>
    </method>
    <method name="Run">
      <arg type="s" direction="in" name="commandId"/>
      <arg type="s" direction="out" name="resultJson"/>
    </method>
    <method name="Call">
      <arg type="s" direction="in" name="method"/>
      <arg type="s" direction="in" name="dataJson"/>
      <arg type="s" direction="out" name="resultJson"/>
    </method>
    <method name="Quit">
      <arg type="s" direction="out" name="status"/>
    </method>
  </interface>
</node>`;

const startHidden = ARGV.includes('--hidden');
const startShow = ARGV.includes('--show');

const app = new Adw.Application({
  application_id: 'dev.ismeetxd.Gnomecast',
  flags: Gio.ApplicationFlags.FLAGS_NONE
});

let backend = null;
let launcher = null;
let dbusExport = null;
let firstActivate = true;

function runCommand(commandId) {
  const r = backend.callSync('rootSearch.performAction', {
    id: commandId,
    action: 'open',
    query: '',
    confirmed: true
  });
  if (!r.ok) return r;
  const outcome = r.data || {};
  if (outcome.push) {
    launcher.show({});
    launcher.popToRoot();
    launcher.push(outcome.push);
  } else if (outcome.close) {
    launcher.hide();
    if (outcome.hud) backend.notifyHud(outcome.hud);
  }
  return r;
}

const dbusService = {
  Toggle() {
    launcher.toggle();
    return launcher.shown ? 'shown' : 'hidden';
  },
  Show() {
    launcher.show({});
    return 'shown';
  },
  Hide() {
    launcher.hide();
    return 'hidden';
  },
  IsOpen() {
    return !!launcher.shown;
  },
  Ping() {
    return 'ok';
  },
  Run(commandId) {
    return JSON.stringify(runCommand(commandId));
  },
  Call(method, dataJson) {
    let data = null;
    if (dataJson && dataJson.length > 0) {
      try {
        data = JSON.parse(dataJson);
      } catch (e) {
        return JSON.stringify({ ok: false, error: `data is not JSON: ${e}` });
      }
    }
    return JSON.stringify(backend.callSync(method, data));
  },
  Quit() {
    if (backend) backend.flush();
    GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
      app.quit();
      return GLib.SOURCE_REMOVE;
    });
    return 'quitting';
  }
};

app.connect('startup', () => {
  app.hold();
  registerIconTheme();
  backend = new GnomecastBackend();
  backend.init();
  launcher = new LauncherWindow({ app, backend });

  // Prevent focus from jumping away from search entry to header buttons/scroller.
  launcher.leadBtn.set_focusable(false);
  launcher.filterBtn.set_focusable(false);
  launcher.scrolled.set_focusable(false);

  try {
    dbusExport = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, dbusService);
    dbusExport.export(Gio.DBus.session, '/dev/ismeetxd/Gnomecast');
  } catch (e) {
    backend.log('error', 'dbus', `failed to export D-Bus interface: ${e.message || e}`);
  }

  if (startHidden && !startShow) {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      if (!launcher.shown && launcher.rows.length === 0) {
        launcher.rebuild(true);
        launcher._updateLayoutState();
      }
      return GLib.SOURCE_REMOVE;
    });
  }
});

app.connect('activate', () => {
  if (firstActivate) {
    firstActivate = false;
    if (startHidden && !startShow) return;
    launcher.show({});
    return;
  }
  launcher.toggle();
});

app.connect('shutdown', () => {
  if (dbusExport) {
    try { dbusExport.unexport(); } catch (_e) {}
    dbusExport = null;
  }
  if (backend) {
    backend.destroy();
    backend = null;
  }
});

await app.runAsync([]);
