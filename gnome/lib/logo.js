import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import { REPO_ROOT } from './core.js';

export const APP_ICON_NAME = 'dev.ismeetxd.Gnomecast';
export const LOGO_PATH = `${REPO_ROOT}/assets/logo.png`;
export const ICON_THEME_DIR = `${REPO_ROOT}/assets/icons/hicolor`;

export function registerIconTheme() {
  try {
    const display = Gdk.Display.get_default();
    if (display && GLib.file_test(ICON_THEME_DIR, GLib.FileTest.IS_DIR)) {
      const theme = Gtk.IconTheme.get_for_display(display);
      if (theme && !theme.get_search_path().includes(ICON_THEME_DIR)) {
        theme.add_search_path(ICON_THEME_DIR);
      }
    }
  } catch (_e) {}
  try {
    Gtk.Window.set_default_icon_name(APP_ICON_NAME);
  } catch (_e) {}
}

export function logoGIcon() {
  if (GLib.file_test(LOGO_PATH, GLib.FileTest.IS_REGULAR)) {
    return Gio.FileIcon.new(Gio.File.new_for_path(LOGO_PATH));
  }
  return Gio.ThemedIcon.new(APP_ICON_NAME);
}

export function logoIconArg() {
  return GLib.file_test(LOGO_PATH, GLib.FileTest.IS_REGULAR) ? LOGO_PATH : APP_ICON_NAME;
}

export function setImageToLogo(image, pixelSize = 20) {
  image.set_from_gicon(logoGIcon());
  image.set_pixel_size(pixelSize);
}
