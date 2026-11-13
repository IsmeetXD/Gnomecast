import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

if (!GLib.getenv('GSK_RENDERER') && GLib.getenv('GDK_BACKEND') !== 'broadway') {
  GLib.setenv('GSK_RENDERER', 'gl', false);
}

const { default: Adw } = await import('gi://Adw?version=1');
const { registerIconTheme } = await import('./lib/logo.js');
const { GnomecastSettingsWindow } = await import('./ui/settings_window.js');

const app = new Adw.Application({
  application_id: 'dev.ismeetxd.GnomecastSettings',
  flags: Gio.ApplicationFlags.FLAGS_NONE
});

let settingsWin = null;

app.connect('startup', () => {
  registerIconTheme();
});

app.connect('activate', () => {
  if (!settingsWin) {
    settingsWin = new GnomecastSettingsWindow(app);
  } else {
    settingsWin.syncFromSystem();
  }
  settingsWin.win.present();
});

await app.runAsync([]);
