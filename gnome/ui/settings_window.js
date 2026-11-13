import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gtk from 'gi://Gtk?version=4.0';
import { HotkeyManager } from '../lib/hotkey.js';
import { registerIconTheme, setImageToLogo } from '../lib/logo.js';

const APP_CSS = `
.gnomecast-hero {
  padding: 16px;
  border-radius: 14px;
  background-color: alpha(@accent_bg_color, 0.10);
  border: 1px solid alpha(@accent_bg_color, 0.22);
}
.gnomecast-hero-off {
  background-color: alpha(@window_fg_color, 0.05);
  border-color: alpha(@window_fg_color, 0.10);
}
.gnomecast-keycap {
  padding: 4px 10px;
  border-radius: 7px;
  font-weight: 600;
  font-size: 12px;
  background-color: alpha(@window_fg_color, 0.08);
  border: 1px solid alpha(@window_fg_color, 0.14);
}
.gnomecast-status-pill {
  padding: 3px 9px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 12px;
}
.gnomecast-pill-on {
  color: @success_color;
  background-color: alpha(@success_color, 0.14);
}
.gnomecast-pill-off {
  color: alpha(@window_fg_color, 0.65);
  background-color: alpha(@window_fg_color, 0.08);
}
.gnomecast-credits {
  font-size: 12px;
}
`;

/**
 * GTK4 + Libadwaita control window for toggling the Gnomecast Windows+Space
 * launcher shortcut and background daemon on or off cleanly.
 */
export class GnomecastSettingsWindow {
  constructor(app, manager = new HotkeyManager()) {
    this.app = app;
    this.manager = manager;
    this._syncing = false;
    this._busy = false;
    this._unwatch = null;

    registerIconTheme();
    this._buildUi();
    this.syncFromSystem();

    this._unwatch = this.manager.onChanged(() => {
      if (!this._busy) this.syncFromSystem();
    });
    this.win.connect('notify::is-active', () => {
      if (this.win.is_active && !this._busy) this.syncFromSystem();
    });
    this.win.connect('close-request', () => {
      if (this._unwatch) {
        this._unwatch();
        this._unwatch = null;
      }
      return false;
    });
  }

  _buildUi() {
    const provider = new Gtk.CssProvider();
    provider.load_from_string(APP_CSS);
    const display = Gdk.Display.get_default();
    if (display) {
      Gtk.StyleContext.add_provider_for_display(
        display,
        provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
      );
    }

    this.win = new Adw.ApplicationWindow({
      application: this.app,
      title: 'Gnomecast',
      default_width: 470,
      default_height: 500,
      resizable: false
    });

    this.toastOverlay = new Adw.ToastOverlay();
    this.win.set_content(this.toastOverlay);

    const toolbarView = new Adw.ToolbarView();
    this.toastOverlay.set_child(toolbarView);

    const header = new Adw.HeaderBar();
    toolbarView.add_top_bar(header);

    const page = new Adw.PreferencesPage();
    toolbarView.set_content(page);

    // Status hero card
    const heroGroup = new Adw.PreferencesGroup();
    this.heroBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 14,
      valign: Gtk.Align.CENTER
    });
    this.heroBox.add_css_class('gnomecast-hero');

    this.heroIcon = new Gtk.Image({ valign: Gtk.Align.CENTER });
    setImageToLogo(this.heroIcon, 42);
    this.heroBox.append(this.heroIcon);

    const heroText = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 3,
      hexpand: true,
      valign: Gtk.Align.CENTER
    });
    this.heroTitle = new Gtk.Label({ xalign: 0 });
    this.heroTitle.add_css_class('title-3');
    this.heroSubtitle = new Gtk.Label({
      xalign: 0,
      wrap: true,
      max_width_chars: 36
    });
    this.heroSubtitle.add_css_class('dim-label');
    heroText.append(this.heroTitle);
    heroText.append(this.heroSubtitle);
    this.heroBox.append(heroText);

    this.heroBadge = new Gtk.Label({ valign: Gtk.Align.CENTER });
    this.heroBadge.add_css_class('gnomecast-status-pill');
    this.heroBox.append(this.heroBadge);

    heroGroup.add(this.heroBox);
    page.add(heroGroup);

    // Main toggle + immediate launch
    const controlGroup = new Adw.PreferencesGroup();
    this.toggleRow = new Adw.SwitchRow({
      title: 'Windows + Space Launcher',
      subtitle: 'Turn on to open Gnomecast anytime with Super + Space'
    });
    this.toggleRow.connect('notify::active', () => {
      if (this._syncing) return;
      this._onToggleRequested(this.toggleRow.get_active());
    });
    controlGroup.add(this.toggleRow);

    this.launchRow = new Adw.ActionRow({
      title: 'Open Launcher Now',
      subtitle: 'Show the search bar immediately'
    });
    this.launchBtn = new Gtk.Button({
      label: 'Launch',
      valign: Gtk.Align.CENTER
    });
    this.launchBtn.add_css_class('suggested-action');
    this.launchBtn.add_css_class('pill');
    this.launchBtn.connect('clicked', () => this._onLaunchClicked());
    this.launchRow.add_suffix(this.launchBtn);
    controlGroup.add(this.launchRow);
    page.add(controlGroup);

    // Details group
    const detailsGroup = new Adw.PreferencesGroup({ title: 'Status' });

    this.shortcutRow = new Adw.ActionRow({
      title: 'Hotkey',
      subtitle: 'Temporarily overrides GNOME input-source switch while on'
    });
    this.shortcutBadge = new Gtk.Label({ valign: Gtk.Align.CENTER });
    this.shortcutBadge.add_css_class('gnomecast-keycap');
    this.shortcutRow.add_suffix(this.shortcutBadge);
    detailsGroup.add(this.shortcutRow);

    this.daemonRow = new Adw.ActionRow({
      title: 'Background Daemon',
      subtitle: 'Keeps launcher windows and search results warm in memory'
    });
    this.daemonValue = new Gtk.Label({ valign: Gtk.Align.CENTER });
    this.daemonValue.add_css_class('dim-label');
    this.daemonRow.add_suffix(this.daemonValue);
    detailsGroup.add(this.daemonRow);

    this.modeRow = new Adw.ActionRow({
      title: 'Shortcut Handler'
    });
    this.modeValue = new Gtk.Label({ valign: Gtk.Align.CENTER });
    this.modeValue.add_css_class('dim-label');
    this.modeRow.add_suffix(this.modeValue);
    detailsGroup.add(this.modeRow);

    page.add(detailsGroup);

    // Credits footer
    const creditsGroup = new Adw.PreferencesGroup();
    this.creditsLabel = new Gtk.Label({
      use_markup: true,
      wrap: true,
      justify: Gtk.Justification.CENTER,
      halign: Gtk.Align.CENTER,
      label: 'Gnomecast by <a href="https://github.com/ismeetxd">ismeetxd</a>'
    });
    this.creditsLabel.add_css_class('dim-label');
    this.creditsLabel.add_css_class('gnomecast-credits');
    creditsGroup.add(this.creditsLabel);
    page.add(creditsGroup);

    const keyCtrl = new Gtk.EventControllerKey();
    keyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => {
      const ctrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
      if (keyval === Gdk.KEY_Escape || (ctrl && (keyval === Gdk.KEY_w || keyval === Gdk.KEY_q))) {
        this.win.close();
        return true;
      }
      return false;
    });
    this.win.add_controller(keyCtrl);
  }

  _showToast(message) {
    this.toastOverlay.add_toast(new Adw.Toast({ title: message, timeout: 3 }));
  }

  syncFromSystem() {
    const state = this.manager.getState();
    this._applyState(state);
    return state;
  }

  _applyState(state) {
    this._syncing = true;
    try {
      this.toggleRow.set_active(!!state.enabled);
    } finally {
      this._syncing = false;
    }

    if (state.enabled) {
      this.heroBox.remove_css_class('gnomecast-hero-off');
      this.heroTitle.set_label('Gnomecast is On');
      this.heroSubtitle.set_label('Press Windows + Space anywhere on your desktop to open the launcher.');
      this.heroBadge.set_label('ON');
      this.heroBadge.remove_css_class('gnomecast-pill-off');
      this.heroBadge.add_css_class('gnomecast-pill-on');
      this.shortcutBadge.set_label('Super + Space');
    } else {
      this.heroBox.add_css_class('gnomecast-hero-off');
      this.heroTitle.set_label('Gnomecast is Off');
      this.heroSubtitle.set_label('Windows + Space will not launch Gnomecast. Flip the switch on to enable it.');
      this.heroBadge.set_label('OFF');
      this.heroBadge.remove_css_class('gnomecast-pill-on');
      this.heroBadge.add_css_class('gnomecast-pill-off');
      this.shortcutBadge.set_label('Off');
    }

    this.daemonValue.set_label(state.daemonRunning ? 'Running' : 'Stopped');

    if (!state.enabled) {
      this.modeRow.set_subtitle('System Super+Space restored when turned off');
      this.modeValue.set_label('Disabled');
    } else if (state.extensionLive) {
      this.modeRow.set_subtitle('Zero-spawn GNOME Shell hotkey active');
      this.modeValue.set_label('Shell Extension');
    } else if (state.extensionInstalled) {
      this.modeRow.set_subtitle('Log out and back in once to upgrade to zero-spawn shell hotkey');
      this.modeValue.set_label('Custom Shortcut');
    } else {
      this.modeRow.set_subtitle('Fast D-Bus custom keybinding active');
      this.modeValue.set_label('Custom Shortcut');
    }
  }

  async _onToggleRequested(enabled) {
    if (this._busy) return;
    this._busy = true;
    this.toggleRow.set_sensitive(false);
    this.launchBtn.set_sensitive(false);
    try {
      const next = enabled
        ? await this.manager.enableAsync()
        : await this.manager.disableAsync();
      this._applyState(next);
      this._showToast(
        next.enabled
          ? 'Windows + Space launcher turned on'
          : 'Windows + Space launcher turned off'
      );
    } catch (e) {
      this._showToast(`Failed: ${e && e.message ? e.message : e}`);
      this.syncFromSystem();
    } finally {
      this._busy = false;
      this.toggleRow.set_sensitive(true);
      this.launchBtn.set_sensitive(true);
    }
  }

  async _onLaunchClicked() {
    if (this._busy) return;
    this._busy = true;
    this.launchBtn.set_sensitive(false);
    try {
      const ok = await this.manager.launchNowAsync();
      this.syncFromSystem();
      if (!ok) this._showToast('Could not reach Gnomecast daemon');
    } finally {
      this._busy = false;
      this.launchBtn.set_sensitive(true);
    }
  }
}
