import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw?version=1';
import Gdk from 'gi://Gdk?version=4.0';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import { RootSearch } from '../lib/core.js';
import { logoGIcon, registerIconTheme, setImageToLogo } from '../lib/logo.js';

function buildCss(theme, zoom) {
  const px = (n) => Math.max(1, Math.round(n * zoom));
  const bg = theme.background;
  const fg = theme.foreground;
  const muted = theme.muted;
  const subtle = theme.surfaceSubtle;
  const divider = theme.surfaceDivider;
  const selected = theme.selectedBackground;
  const accent = theme.accent;
  const border = theme.backgroundBorder;
  const danger = theme.danger;

  return `
    window.gnomecast-window {
      background-color: transparent;
    }
    .gnomecast-card {
      background-color: ${bg};
      color: ${fg};
      border-radius: ${px(12)}px;
      border: 1px solid ${border};
    }
    .gnomecast-header {
      min-height: ${px(66)}px;
      padding: 0 ${px(16)}px;
    }
    .gnomecast-divider {
      background-color: ${divider};
      min-height: 1px;
    }
    .gnomecast-vsep {
      background-color: ${divider};
      min-width: 1px;
      min-height: ${px(14)}px;
    }
    .gnomecast-lead-btn {
      background: transparent;
      border: none;
      box-shadow: none;
      padding: ${px(4)}px;
      min-width: ${px(28)}px;
      min-height: ${px(28)}px;
      border-radius: ${px(6)}px;
      color: ${fg};
    }
    .gnomecast-lead-btn:hover {
      background-color: ${subtle};
    }
    .gnomecast-lead-accent {
      color: ${accent};
    }
    entry.gnomecast-search {
      background: transparent;
      border: none;
      box-shadow: none;
      outline: none;
      color: ${fg};
      caret-color: ${accent};
      font-size: ${px(18)}px;
      min-height: ${px(36)}px;
      padding: 0;
    }
    entry.gnomecast-search text {
      background: transparent;
      color: ${fg};
    }
    entry.gnomecast-search placeholder {
      color: ${muted};
    }
    .gnomecast-pill {
      background-color: ${subtle};
      border: 1px solid ${divider};
      border-radius: ${px(6)}px;
      padding: ${px(4)}px ${px(10)}px;
      min-height: ${px(26)}px;
      font-size: ${px(13)}px;
      color: ${fg};
    }
    .gnomecast-pill-focused {
      background-color: ${selected};
      border-color: ${accent};
    }
    .gnomecast-pill-placeholder {
      color: ${muted};
    }
    .gnomecast-filter-btn {
      background-color: ${subtle};
      border: 1px solid ${divider};
      border-radius: ${px(6)}px;
      padding: ${px(4)}px ${px(10)}px;
      min-height: ${px(28)}px;
      font-size: ${px(12)}px;
      color: ${fg};
      box-shadow: none;
    }
    .gnomecast-filter-btn-open {
      background-color: ${selected};
    }
    .gnomecast-list {
      padding: ${px(4)}px ${px(8)}px;
    }
    .gnomecast-section {
      padding: ${px(10)}px ${px(12)}px ${px(4)}px ${px(12)}px;
      font-size: ${px(11)}px;
      font-weight: 600;
      color: ${muted};
    }
    .gnomecast-section-spacer {
      min-height: ${px(6)}px;
    }
    .gnomecast-row {
      min-height: ${px(42)}px;
      padding: ${px(4)}px ${px(12)}px;
      border-radius: ${px(7)}px;
      color: ${fg};
    }
    .gnomecast-row-selected {
      background-color: ${selected};
    }
    .gnomecast-row-disabled {
      opacity: 0.45;
    }
    .gnomecast-row-title {
      font-size: ${px(14)}px;
      color: ${fg};
    }
    .gnomecast-row-subtitle {
      font-size: ${px(13)}px;
      color: ${muted};
    }
    .gnomecast-row-type {
      font-size: ${px(12)}px;
      color: ${muted};
    }
    .gnomecast-alias-badge {
      border: 1px solid ${divider};
      border-radius: ${px(4)}px;
      padding: ${px(1)}px ${px(6)}px;
      font-size: ${px(11)}px;
      color: ${muted};
    }
    .gnomecast-accent-icon {
      color: ${accent};
    }
    .gnomecast-calc-card {
      background-color: ${subtle};
      border: 1px solid ${divider};
      border-radius: ${px(8)}px;
      min-height: ${px(116)}px;
      margin: ${px(2)}px 0;
      padding: ${px(10)}px ${px(14)}px;
    }
    .gnomecast-calc-card-selected {
      background-color: ${selected};
      border-color: transparent;
    }
    .gnomecast-calc-value {
      font-size: ${px(20)}px;
      color: ${fg};
    }
    .gnomecast-calc-answer {
      font-size: ${px(20)}px;
      font-weight: 600;
      color: ${fg};
    }
    .gnomecast-calc-answer-selected {
      color: ${accent};
    }
    .gnomecast-calc-caption {
      background-color: ${subtle};
      border-radius: 999px;
      padding: ${px(2)}px ${px(10)}px;
      font-size: ${px(11)}px;
      color: ${muted};
    }
    .gnomecast-calc-arrow {
      background-color: ${subtle};
      border-radius: 999px;
      min-width: ${px(28)}px;
      min-height: ${px(28)}px;
      color: ${muted};
      font-size: ${px(13)}px;
    }
    .gnomecast-footer {
      background-color: ${subtle};
      min-height: ${px(42)}px;
      padding: 0 ${px(14)}px;
    }
    .gnomecast-footer-status {
      font-size: ${px(12)}px;
      color: ${muted};
    }
    .gnomecast-footer-toast {
      font-size: ${px(12)}px;
      color: ${fg};
    }
    .gnomecast-footer-action {
      font-size: ${px(12)}px;
      color: ${fg};
    }
    .gnomecast-footer-muted {
      font-size: ${px(12)}px;
      color: ${muted};
    }
    .gnomecast-keycap {
      background-color: ${subtle};
      border: 1px solid ${divider};
      border-radius: ${px(4)}px;
      padding: ${px(1)}px ${px(6)}px;
      min-height: ${px(18)}px;
      min-width: ${px(18)}px;
      font-size: ${px(11)}px;
      color: ${fg};
    }
    .gnomecast-popover {
      background-color: ${bg};
      border: 1px solid ${border};
      border-radius: ${px(10)}px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    }
    .gnomecast-popover-row {
      min-height: ${px(32)}px;
      padding: ${px(4)}px ${px(10)}px;
      border-radius: ${px(6)}px;
      font-size: ${px(13)}px;
      color: ${fg};
    }
    .gnomecast-popover-row-selected {
      background-color: ${selected};
    }
    .gnomecast-popover-filter {
      padding: ${px(8)}px ${px(12)}px;
      font-size: ${px(12)}px;
      color: ${fg};
    }
    .gnomecast-popover-filter-empty {
      color: ${muted};
    }
    .gnomecast-info-title {
      font-size: ${px(13)}px;
      font-weight: 700;
      color: ${fg};
    }
    .gnomecast-info-label {
      font-size: ${px(12)}px;
      color: ${muted};
    }
    .gnomecast-info-val {
      font-size: ${px(12)}px;
      color: ${fg};
    }
    .gnomecast-scrim {
      background-color: rgba(0, 0, 0, 0.42);
    }
    .gnomecast-alert-box {
      background-color: ${bg};
      border: 1px solid ${border};
      border-radius: ${px(12)}px;
      padding: ${px(18)}px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
    }
    .gnomecast-alert-title {
      font-size: ${px(15)}px;
      font-weight: 700;
      color: ${fg};
    }
    .gnomecast-alert-msg {
      font-size: ${px(12)}px;
      color: ${muted};
    }
    .gnomecast-btn {
      background-color: ${subtle};
      border: none;
      border-radius: ${px(6)}px;
      padding: ${px(6)}px ${px(12)}px;
      color: ${fg};
      font-size: ${px(13)}px;
      box-shadow: none;
    }
    .gnomecast-btn-primary {
      background-color: ${selected};
    }
    .gnomecast-btn-danger {
      background-color: ${danger};
      color: #ffffff;
    }
    .gnomecast-danger-icon {
      color: ${danger};
    }
    .gnomecast-empty-title {
      font-size: ${px(15)}px;
      font-weight: 600;
      color: ${fg};
    }
    .gnomecast-empty-desc {
      font-size: ${px(12)}px;
      color: ${muted};
    }
  `;
}

function makeKeyHints(keysStr) {
  const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 3, valign: Gtk.Align.CENTER });
  if (!keysStr) return box;
  const parts = String(keysStr).split(' ').filter(Boolean);
  for (const part of parts) {
    const lbl = new Gtk.Label({ label: part, halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    lbl.add_css_class('gnomecast-keycap');
    box.append(lbl);
  }
  return box;
}

function iconForCandidate(row) {
  if (row.iconName) {
    try {
      const gicon = Gio.Icon.new_for_string(row.iconName);
      if (gicon) {
        const img = new Gtk.Image({ gicon, pixel_size: 20 });
        return img;
      }
    } catch (_e) {}
  }
  const map = {
    'fallback:google': 'system-search-symbolic',
    'fallback:duckduckgo': 'system-search-symbolic',
    'builtin:google-search': 'system-search-symbolic',
    'builtin:duckduckgo-search': 'system-search-symbolic',
    'builtin:calculator-history': 'accessories-calculator-symbolic',
    'calculator-history': 'accessories-calculator-symbolic'
  };
  const fallbackName = map[row.itemId] || map[row.kind] || '';
  if (fallbackName) return new Gtk.Image({ icon_name: fallbackName, pixel_size: 20 });
  return new Gtk.Image({ gicon: logoGIcon(), pixel_size: 20 });
}

export class LauncherWindow {
  constructor({ app, backend }) {
    this.app = app;
    this.backend = backend;

    registerIconTheme();

    this.shown = false;
    this.stack = [{ kind: 'root', title: 'Gnomecast', query: '' }];
    this.query = '';
    this.rootFilter = 'all';
    this.rows = [];
    this.rowWidgets = [];
    this.selectedIndex = -1;
    this.selectedRow = null;
    this.searchSerial = 0;
    this.searchPending = false;
    this.historyIndex = -1;

    this.argDefs = [];
    this.argValues = {};
    this.argFocus = -1;
    this.argsForId = '';

    this.actionPanelOpen = false;
    this.actions = [];
    this.popupFilter = '';
    this.popupIndex = 0;
    this.dropdownOpen = false;
    this.toastPanelOpen = false;
    this.aboutOpen = false;
    this.aboutRows = [];
    this.alert = null;
    this.toast = null;

    this._toastTimerId = 0;
    this._popTimerId = 0;
    this._suppressEntryChange = false;
    this._hasActivatedSinceShow = false;
    this._lastMouse = null;
    this._renderedKey = '';
    this._cssProvider = new Gtk.CssProvider();

    this._buildWindow();
    this._applyThemeAndZoom();

    this.backend.on('candidatesRevision', () => {
      this._renderedKey = '';
      if (this.shown && !this.actionPanelOpen && !this.alert) this.rebuild(false);
    });
    this.backend.on('calculatorRevision', () => {
      this._renderedKey = '';
      if (this.shown && !this.actionPanelOpen && this.query) this.rebuild(false);
    });
    this.backend.on('storeRevision', () => {
      this._applyThemeAndZoom();
      this._updateLayoutState();
    });
    this.backend.on('themeChanged', () => this._applyThemeAndZoom());
  }

  get view() {
    return this.stack[this.stack.length - 1];
  }

  get atRoot() {
    return this.stack.length === 1;
  }

  get general() {
    const r = this.backend.ready ? this.backend.callSync('settings.getGeneralSettings', null) : null;
    return r && r.ok
      ? r.data
      : {
          uiZoom: 1,
          windowMode: 'expanded',
          escapeKeyBehavior: 'pop-back-or-close',
          popToRootTimeout: 90,
          navigationBindings: 'emacs'
        };
  }

  get zoom() {
    const z = Number(this.general.uiZoom);
    return z > 0 ? z : 1;
  }

  get vim() {
    return this.general.navigationBindings === 'vim-motions';
  }

  get compact() {
    return this.general.windowMode === 'compact' && this.atRoot && !this.query;
  }

  px(n) {
    return Math.max(1, Math.round(n * this.zoom));
  }

  _applyThemeAndZoom() {
    const display = Gdk.Display.get_default();
    if (!display) return;
    if (!this._cssAdded) {
      Gtk.StyleContext.add_provider_for_display(
        display,
        this._cssProvider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
      );
      this._cssAdded = true;
    }
    const theme = this.backend.theme();
    this._cssProvider.load_from_string(buildCss(theme, this.zoom));
    this._updateWindowSize();
  }

  _updateWindowSize() {
    if (!this.win) return;
    const w = this.px(750);
    const h = this.compact ? this.px(66) : this.px(475);
    this.win.set_default_size(w, h);
    this.win.set_size_request(w, h);
  }

  _buildWindow() {
    this.win = new Adw.Window({
      application: this.app,
      title: 'Gnomecast',
      decorated: false,
      resizable: false,
      hide_on_close: true
    });
    this.win.add_css_class('gnomecast-window');

    this.overlay = new Gtk.Overlay();
    this.win.set_content(this.overlay);

    this.card = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      hexpand: true,
      vexpand: true
    });
    this.card.add_css_class('gnomecast-card');
    this.overlay.set_child(this.card);

    // Header
    this.header = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 10,
      valign: Gtk.Align.CENTER
    });
    this.header.add_css_class('gnomecast-header');
    this.card.append(this.header);

    this.leadBtn = new Gtk.Button({ valign: Gtk.Align.CENTER });
    this.leadBtn.add_css_class('gnomecast-lead-btn');
    this.leadIcon = new Gtk.Image();
    setImageToLogo(this.leadIcon, 22);
    this.leadBtn.set_child(this.leadIcon);
    this.leadBtn.connect('clicked', () => {
      if (!this.atRoot) this.pop();
      this._focusEntry();
    });
    this.header.append(this.leadBtn);

    this.entry = new Gtk.Entry({
      hexpand: true,
      valign: Gtk.Align.CENTER,
      placeholder_text: 'Search for apps and commands…'
    });
    this.entry.add_css_class('gnomecast-search');
    this.entry.connect('changed', () => {
      if (this._suppressEntryChange) return;
      this.setQuery(this.entry.get_text());
    });
    this.header.append(this.entry);

    this.pillsBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 6,
      valign: Gtk.Align.CENTER,
      visible: false
    });
    this.header.append(this.pillsBox);

    this.filterBtn = new Gtk.Button({ valign: Gtk.Align.CENTER });
    this.filterBtn.add_css_class('gnomecast-filter-btn');
    const filterBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
    this.filterLabel = new Gtk.Label({ label: 'All' });
    const filterArrow = new Gtk.Label({ label: '▾' });
    filterBox.append(this.filterLabel);
    filterBox.append(filterArrow);
    this.filterBtn.set_child(filterBox);
    this.filterBtn.connect('clicked', () => {
      this.toggleDropdown();
      this._focusEntry();
    });
    this.header.append(this.filterBtn);

    this.headerDivider = new Gtk.Box();
    this.headerDivider.add_css_class('gnomecast-divider');
    this.card.append(this.headerDivider);

    // Body
    this.bodyStack = new Gtk.Stack({ hexpand: true, vexpand: true });
    this.card.append(this.bodyStack);

    this.scrolled = new Gtk.ScrolledWindow({
      hexpand: true,
      vexpand: true,
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC
    });
    this.listBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 1,
      hexpand: true
    });
    this.listBox.add_css_class('gnomecast-list');

    const motion = new Gtk.EventControllerMotion();
    motion.connect('motion', (_ctrl, x, y) => {
      if (this._lastMouse) {
        const dx = Math.abs(x - this._lastMouse.x);
        const dy = Math.abs(y - this._lastMouse.y);
        if (dx > 2 || dy > 2) this._pointerMoved = true;
      }
      this._lastMouse = { x, y };
    });
    this.listBox.add_controller(motion);

    this.scrolled.set_child(this.listBox);
    this.bodyStack.add_named(this.scrolled, 'list');

    this.emptyBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 8,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER
    });
    this.emptyIcon = new Gtk.Image();
    setImageToLogo(this.emptyIcon, 36);
    this.emptyTitle = new Gtk.Label({ label: 'No results' });
    this.emptyTitle.add_css_class('gnomecast-empty-title');
    this.emptyDesc = new Gtk.Label({ label: '', wrap: true, justify: Gtk.Justification.CENTER });
    this.emptyDesc.add_css_class('gnomecast-empty-desc');
    this.emptyBox.append(this.emptyIcon);
    this.emptyBox.append(this.emptyTitle);
    this.emptyBox.append(this.emptyDesc);
    this.bodyStack.add_named(this.emptyBox, 'empty');

    // Footer
    this.footerDivider = new Gtk.Box();
    this.footerDivider.add_css_class('gnomecast-divider');
    this.card.append(this.footerDivider);

    this.footer = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
    this.footer.add_css_class('gnomecast-footer');
    this.card.append(this.footer);

    this.footerLeft = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, hexpand: true, valign: Gtk.Align.CENTER });
    this.footerIcon = new Gtk.Image();
    setImageToLogo(this.footerIcon, 16);
    this.footerStatus = new Gtk.Label({ label: 'Gnomecast', ellipsize: Pango.EllipsizeMode.END, xalign: 0 });
    this.footerStatus.add_css_class('gnomecast-footer-status');
    this.footerToastHint = makeKeyHints('Ctrl T');
    this.footerToastHint.set_visible(false);
    this.footerLeft.append(this.footerIcon);
    this.footerLeft.append(this.footerStatus);
    this.footerLeft.append(this.footerToastHint);
    this.footer.append(this.footerLeft);

    this.footerRight = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, valign: Gtk.Align.CENTER });
    this.footerPrimaryLabel = new Gtk.Label({ label: 'Open' });
    this.footerPrimaryLabel.add_css_class('gnomecast-footer-action');
    this.footerPrimaryHint = makeKeyHints('↵');
    this.footerSep = new Gtk.Box({ valign: Gtk.Align.CENTER });
    this.footerSep.add_css_class('gnomecast-vsep');
    this.footerActionsLabel = new Gtk.Label({ label: 'Actions' });
    this.footerActionsLabel.add_css_class('gnomecast-footer-muted');
    this.footerActionsHintBox = new Gtk.Box({ valign: Gtk.Align.CENTER });
    this.footerRight.append(this.footerPrimaryLabel);
    this.footerRight.append(this.footerPrimaryHint);
    this.footerRight.append(this.footerSep);
    this.footerRight.append(this.footerActionsLabel);
    this.footerRight.append(this.footerActionsHintBox);
    this.footer.append(this.footerRight);

    // Overlay Popups
    this.popupBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      visible: false
    });
    this.popupBox.add_css_class('gnomecast-popover');
    this.popupList = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 2 });
    this.popupList.set_margin_top(6);
    this.popupList.set_margin_bottom(6);
    this.popupList.set_margin_start(6);
    this.popupList.set_margin_end(6);
    this.popupScrolled = new Gtk.ScrolledWindow({
      hscrollbar_policy: Gtk.PolicyType.NEVER,
      vscrollbar_policy: Gtk.PolicyType.AUTOMATIC,
      propagate_natural_height: true,
      max_content_height: 300
    });
    this.popupScrolled.set_child(this.popupList);
    this.popupSep = new Gtk.Box();
    this.popupSep.add_css_class('gnomecast-divider');
    this.popupFilterLabel = new Gtk.Label({ xalign: 0, ellipsize: Pango.EllipsizeMode.START });
    this.popupFilterLabel.add_css_class('gnomecast-popover-filter');
    this.popupBox.append(this.popupScrolled);
    this.popupBox.append(this.popupSep);
    this.popupBox.append(this.popupFilterLabel);
    this.overlay.add_overlay(this.popupBox);

    // About / Info Overlay
    this.aboutBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 6,
      visible: false,
      halign: Gtk.Align.END,
      valign: Gtk.Align.END
    });
    this.aboutBox.add_css_class('gnomecast-popover');
    this.aboutBox.set_size_request(400, -1);
    this.aboutBox.set_margin_end(12);
    this.aboutBox.set_margin_bottom(50);
    this.overlay.add_overlay(this.aboutBox);

    // Alert Scrim Overlay
    this.alertScrim = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      hexpand: true,
      vexpand: true,
      halign: Gtk.Align.FILL,
      valign: Gtk.Align.FILL,
      visible: false
    });
    this.alertScrim.add_css_class('gnomecast-scrim');
    const alertClick = new Gtk.GestureClick();
    alertClick.connect('pressed', () => {
      this.alert = null;
      this._renderOverlays();
    });
    this.alertScrim.add_controller(alertClick);

    this.alertBox = new Gtk.Box({
      orientation: Gtk.Orientation.VERTICAL,
      spacing: 10,
      halign: Gtk.Align.CENTER,
      valign: Gtk.Align.CENTER
    });
    this.alertBox.add_css_class('gnomecast-alert-box');
    this.alertBox.set_size_request(330, -1);
    const stopClick = new Gtk.GestureClick();
    stopClick.connect('pressed', (g) => g.set_state(Gtk.EventSequenceState.CLAIMED));
    this.alertBox.add_controller(stopClick);
    this.alertScrim.append(this.alertBox);
    this.overlay.add_overlay(this.alertScrim);

    // Key handling (CAPTURE phase)
    const keyCtrl = new Gtk.EventControllerKey({ propagation_phase: Gtk.PropagationPhase.CAPTURE });
    keyCtrl.connect('key-pressed', (_ctrl, keyval, _keycode, state) => this._onKeyPressed(keyval, state));
    this.win.add_controller(keyCtrl);

    // Focus-loss auto-hide
    this.win.connect('notify::is-active', () => {
      if (this.win.is_active) {
        this._hasActivatedSinceShow = true;
        return;
      }
      if (this.shown && this._hasActivatedSinceShow && !this.backend.config.keepVisibleOnFocusLoss) {
        this.hide();
      }
    });

    this.win.connect('close-request', () => {
      this.hide();
      return true;
    });
  }

  _focusEntry() {
    this.entry.grab_focus();
    this.entry.set_position(-1);
  }

  show(payload = {}) {
    if (this._popTimerId) {
      GLib.source_remove(this._popTimerId);
      this._popTimerId = 0;
    }
    const wasOpen = this.shown;
    this.shown = true;
    this._hasActivatedSinceShow = false;
    this._lastMouse = null;
    this._pointerMoved = false;

    if (typeof payload.query === 'string') {
      this._setEntryText(payload.query);
      this.query = payload.query;
    }
    this.closePopups();
    this.historyIndex = -1;
    const renderKey = this._renderSignature();
    if (this._renderedKey === renderKey && this.rows.length > 0 && this.argDefs.length === 0 && !this.searchPending) {
      this.select(this.nextSelectable(-1, 1));
    } else {
      this.rebuild(true);
    }
    this._updateLayoutState();

    this.win.set_visible(true);
    this.win.present();
    this.backend.focusLauncherWindow();
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
      this._focusEntry();
      return GLib.SOURCE_REMOVE;
    });

    if (!wasOpen) {
      this.backend.emit('window.visibilityChanged', { visible: true });
    }
  }

  hide() {
    if (!this.shown) return;
    this.shown = false;
    this.searchSerial++;
    this.backend.cancelSearch();
    this.searchPending = false;
    this.closePopups();
    this.win.set_visible(false);
    this.backend.emit('window.visibilityChanged', { visible: false });

    const seconds = Number(this.general.popToRootTimeout);
    if (!(seconds > 0)) {
      this.popToRoot();
    } else {
      this._popTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, seconds * 1000, () => {
        this._popTimerId = 0;
        this.popToRoot();
        return GLib.SOURCE_REMOVE;
      });
    }
  }

  toggle() {
    if (this.shown) this.hide();
    else this.show({});
  }

  _setEntryText(text) {
    this._suppressEntryChange = true;
    this.entry.set_text(String(text || ''));
    this.entry.set_position(-1);
    this._suppressEntryChange = false;
  }

  closePopups() {
    this.actionPanelOpen = false;
    this.dropdownOpen = false;
    this.toastPanelOpen = false;
    this.aboutOpen = false;
    this.alert = null;
    this._renderOverlays();
  }

  popToRoot() {
    this.stack = [{ kind: 'root', title: 'Gnomecast', query: '' }];
    this.query = '';
    this._setEntryText('');
    this.rootFilter = 'all';
    this.argValues = {};
    this.argFocus = -1;
    this.rebuild(true);
    this._updateLayoutState();
  }

  push(next) {
    const saved = this.stack.slice();
    saved[saved.length - 1] = Object.assign({}, this.view, { query: this.query, selectedIndex: this.selectedIndex });
    this.stack = saved.concat([next]);
    const nextQuery = next.kind === 'alias' ? (next.value || '') : '';
    this.query = nextQuery;
    this._setEntryText(nextQuery);
    this.closePopups();
    this.rebuild(true);
    this._updateLayoutState();
  }

  pop() {
    if (this.atRoot) return;
    const next = this.stack.slice(0, -1);
    const top = next[next.length - 1];
    this.stack = next;
    this.query = top.query || '';
    this._setEntryText(this.query);
    this.closePopups();
    this.rebuild(false, top.selectedIndex);
    this._updateLayoutState();
  }

  setQuery(next) {
    if (this.query === next) return;
    this.query = next;
    this.historyIndex = -1;
    this._updateLayoutState();
    this.rebuild(true);
  }

  rebuild(resetSelection, restoreIndex = -1) {
    const serial = ++this.searchSerial;
    this.backend.cancelSearch();
    this._pointerMoved = false;
    const keepId = !resetSelection && this.selectedRow ? this.selectedRow.itemId : '';
    this.searchPending = false;

    if (this.view.kind === 'alias') {
      this.rows = [];
      this.selectedIndex = -1;
      this.selectedRow = null;
      this._renderRows();
      this._updateLayoutState();
      return;
    }

    this.searchPending = true;
    const revision = this.backend.candidatesRevision;
    this.backend.searchAsync(
      { query: this.query, view: this.view, filter: this.atRoot ? this.rootFilter : 'all' },
      (result) => {
        if (serial !== this.searchSerial || revision !== this.backend.candidatesRevision) return;
        this.searchPending = false;
        this._applySearch(result, keepId, restoreIndex);
      }
    );
  }

  _renderSignature() {
    const viewId = this.view.kind === 'menu' ? (this.view.menuId || '') : '';
    const filter = this.atRoot ? this.rootFilter : 'all';
    return `${this.view.kind}:${viewId}:${this.query}:${filter}:${this.backend.candidatesRevision}:${this.backend.storeRevision}`;
  }

  _applySearch(result, keepId, restoreIndex) {
    if (!result.ok) {
      this._renderedKey = '';
      this.rows = [];
      this.showToast('failure', result.error);
      this._renderRows();
      this.select(-1);
      return;
    }
    let keepIndex = -1;
    const next = [];
    for (let s = 0; s < result.data.length; s++) {
      const section = result.data[s];
      if (section.title || s > 0) {
        next.push({ rowKind: 'section', itemId: `section:${section.id}`, title: section.title });
      }
      for (let r = 0; r < section.rows.length; r++) {
        const c = section.rows[r];
        if (c.id === keepId) keepIndex = next.length;
        next.push({
          rowKind: c.kind === 'calculator' ? 'calculator' : 'item',
          itemId: String(c.id || ''),
          kind: String(c.kind || ''),
          title: String(c.title || ''),
          subtitle: String(c.subtitle || ''),
          iconName: String(c.iconName || ''),
          glyph: String(c.glyph || ''),
          typeLabel: String(c.typeLabel || ''),
          alias: String(c.alias || ''),
          checked: !!c.checked,
          disabled: !!c.disabled,
          favorite: typeof c.favoriteOrder === 'number',
          calcInput: String(c.calcInput || ''),
          calcResult: String(c.calcResult || ''),
          calcInputCaption: String(c.calcInputCaption || ''),
          calcResultCaption: String(c.calcResultCaption || ''),
          arguments: Array.isArray(c.arguments) ? c.arguments : []
        });
      }
    }
    this.rows = next.slice(0, 120);
    this._renderedKey = this._renderSignature();
    this._renderRows();
    if (restoreIndex >= 0 && restoreIndex < this.rows.length && this.isSelectable(restoreIndex)) {
      this.select(restoreIndex);
    } else {
      this.select(keepIndex >= 0 ? keepIndex : this.nextSelectable(-1, 1));
    }
  }

  _clearContainer(box) {
    let child = box.get_first_child();
    while (child) {
      const next = child.get_next_sibling();
      box.remove(child);
      child = next;
    }
  }

  _renderRows() {
    this._clearContainer(this.listBox);
    this.rowWidgets = new Array(this.rows.length).fill(null);

    if (this.view.kind === 'alias' || this.rows.length === 0) {
      this.bodyStack.set_visible_child_name('empty');
      if (this.view.kind === 'alias') {
        this.emptyIcon.set_from_icon_name('tag-symbolic');
        this.emptyIcon.set_pixel_size(30);
        this.emptyTitle.set_label(this.view.title);
        this.emptyDesc.set_label('Typing the alias exactly in the root search puts this command on top. Leave it empty to remove it.');
        this.emptyDesc.set_visible(true);
      } else if (this.view.kind === 'calculator-history' && !this.query) {
        this.emptyIcon.set_from_icon_name('accessories-calculator-symbolic');
        this.emptyIcon.set_pixel_size(30);
        this.emptyTitle.set_label('No Calculations Yet');
        this.emptyDesc.set_label('Type a calculation in the root search, then copy or paste the answer.');
        this.emptyDesc.set_visible(true);
      } else {
        setImageToLogo(this.emptyIcon, 36);
        this.emptyTitle.set_label(this.backend.ready ? 'No results' : 'Loading…');
        this.emptyDesc.set_visible(false);
      }
      return;
    }

    this.bodyStack.set_visible_child_name('list');
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (row.rowKind === 'section') {
        if (row.title) {
          const lbl = new Gtk.Label({ label: row.title, xalign: 0 });
          lbl.add_css_class('gnomecast-section');
          this.listBox.append(lbl);
        } else {
          const spacer = new Gtk.Box();
          spacer.add_css_class('gnomecast-section-spacer');
          this.listBox.append(spacer);
        }
        continue;
      }

      const widget = row.rowKind === 'calculator' ? this._buildCalcRow(row, i) : this._buildItemRow(row, i);
      this.rowWidgets[i] = widget;
      this.listBox.append(widget);
    }
  }

  _attachRowControllers(widget, index) {
    const hover = new Gtk.EventControllerMotion();
    hover.connect('motion', () => {
      if (!this.actionPanelOpen && this._pointerMoved && this.selectedIndex !== index) {
        this.select(index, false);
      }
    });
    widget.add_controller(hover);

    const click = new Gtk.GestureClick();
    click.connect('released', () => {
      this.perform('open', index);
      this._focusEntry();
    });
    widget.add_controller(click);
  }

  _buildCalcRow(row, index) {
    const card = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      homogeneous: false,
      spacing: 8
    });
    card.add_css_class('gnomecast-calc-card');

    const makePane = (text, caption, isAnswer) => {
      const pane = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        hexpand: true,
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.FILL
      });
      const val = new Gtk.Label({
        label: text,
        ellipsize: Pango.EllipsizeMode.END,
        halign: Gtk.Align.CENTER
      });
      val.add_css_class(isAnswer ? 'gnomecast-calc-answer' : 'gnomecast-calc-value');
      if (isAnswer) card._answerLabel = val;
      pane.append(val);
      if (caption) {
        const cap = new Gtk.Label({
          label: caption,
          ellipsize: Pango.EllipsizeMode.END,
          halign: Gtk.Align.CENTER
        });
        cap.add_css_class('gnomecast-calc-caption');
        pane.append(cap);
      }
      return pane;
    };

    const arrow = new Gtk.Label({ label: '→', halign: Gtk.Align.CENTER, valign: Gtk.Align.CENTER });
    arrow.add_css_class('gnomecast-calc-arrow');

    card.append(makePane(row.calcInput, row.calcInputCaption, false));
    card.append(arrow);
    card.append(makePane(row.calcResult, row.calcResultCaption, true));

    this._attachRowControllers(card, index);
    return card;
  }

  _buildItemRow(row, index) {
    const box = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 10,
      valign: Gtk.Align.CENTER
    });
    box.add_css_class('gnomecast-row');
    if (row.disabled) box.add_css_class('gnomecast-row-disabled');

    const icon = iconForCandidate(row);
    icon.set_valign(Gtk.Align.CENTER);
    box.append(icon);

    const textBox = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      hexpand: true,
      valign: Gtk.Align.CENTER
    });
    const title = new Gtk.Label({
      label: row.title,
      ellipsize: Pango.EllipsizeMode.END,
      xalign: 0
    });
    title.add_css_class('gnomecast-row-title');
    textBox.append(title);

    if (row.subtitle) {
      const sub = new Gtk.Label({
        label: row.subtitle,
        ellipsize: Pango.EllipsizeMode.END,
        xalign: 0,
        hexpand: true
      });
      sub.add_css_class('gnomecast-row-subtitle');
      textBox.append(sub);
    }
    box.append(textBox);

    const acc = new Gtk.Box({
      orientation: Gtk.Orientation.HORIZONTAL,
      spacing: 8,
      valign: Gtk.Align.CENTER
    });
    if (row.alias) {
      const alias = new Gtk.Label({ label: row.alias });
      alias.add_css_class('gnomecast-alias-badge');
      acc.append(alias);
    }
    if (row.favorite) {
      const star = new Gtk.Image({ icon_name: 'starred-symbolic', pixel_size: 13 });
      star.add_css_class('gnomecast-accent-icon');
      acc.append(star);
    }
    if (row.checked) {
      const chk = new Gtk.Label({ label: '✓' });
      chk.add_css_class('gnomecast-accent-icon');
      acc.append(chk);
    }
    if (row.typeLabel) {
      const tl = new Gtk.Label({ label: row.typeLabel });
      tl.add_css_class('gnomecast-row-type');
      acc.append(tl);
    }
    box.append(acc);

    this._attachRowControllers(box, index);
    return box;
  }

  isSelectable(index) {
    if (index < 0 || index >= this.rows.length) return false;
    const k = this.rows[index].rowKind;
    return k === 'item' || k === 'calculator';
  }

  nextSelectable(from, direction) {
    for (let i = from + direction; i >= 0 && i < this.rows.length; i += direction) {
      if (this.isSelectable(i)) return i;
    }
    return -1;
  }

  select(index, scroll = true) {
    const prevWidget = this.rowWidgets[this.selectedIndex];
    if (prevWidget) {
      const prevRow = this.rows[this.selectedIndex];
      if (prevRow && prevRow.rowKind === 'calculator') {
        prevWidget.remove_css_class('gnomecast-calc-card-selected');
        if (prevWidget._answerLabel) prevWidget._answerLabel.remove_css_class('gnomecast-calc-answer-selected');
      } else {
        prevWidget.remove_css_class('gnomecast-row-selected');
      }
    }

    this.selectedIndex = index;
    this.selectedRow = index >= 0 && index < this.rows.length ? this.rows[index] : null;
    const curWidget = this.rowWidgets[index];
    if (curWidget && this.selectedRow) {
      if (this.selectedRow.rowKind === 'calculator') {
        curWidget.add_css_class('gnomecast-calc-card-selected');
        if (curWidget._answerLabel) curWidget._answerLabel.add_css_class('gnomecast-calc-answer-selected');
      } else {
        curWidget.add_css_class('gnomecast-row-selected');
      }
      if (scroll) this._scrollToWidget(curWidget, index === this.nextSelectable(-1, 1));
    }

    const id = this.selectedRow ? this.selectedRow.itemId : '';
    if (id !== this.argsForId) {
      this.argsForId = id;
      this.argValues = {};
      this.argFocus = -1;
    }
    this.argDefs = this.selectedRow ? this.selectedRow.arguments || [] : [];
    this._renderPills();
    this._updateFooter();
  }

  _scrollToWidget(widget, isFirst) {
    const vadj = this.scrolled.get_vadjustment();
    if (!vadj) return;
    if (isFirst) {
      vadj.set_value(0);
      return;
    }
    const [ok, bounds] = widget.compute_bounds(this.listBox);
    if (!ok) return;
    const top = bounds.get_y();
    const bottom = top + bounds.get_height();
    const cur = vadj.get_value();
    const page = vadj.get_page_size();
    if (top < cur) vadj.set_value(Math.max(0, top - 4));
    else if (bottom > cur + page) vadj.set_value(bottom - page + 4);
  }

  move(delta) {
    this._pointerMoved = false;
    if (this.selectedIndex < 0) {
      this.select(this.nextSelectable(-1, 1));
      return;
    }
    const step = delta > 0 ? 1 : -1;
    let target = this.selectedIndex;
    for (let n = 0; n < Math.abs(delta); n++) {
      const next = this.nextSelectable(target, step);
      if (next < 0) break;
      target = next;
    }
    this.select(target);
  }

  jumpSection(direction) {
    let i = this.selectedIndex;
    for (i += direction; i >= 0 && i < this.rows.length; i += direction) {
      if (this.rows[i].rowKind === 'section') break;
    }
    if (direction < 0) {
      for (i -= 1; i >= 0; i--) {
        if (this.rows[i].rowKind === 'section') break;
      }
    }
    const first = this.nextSelectable(Math.max(-1, i), 1);
    if (first >= 0) this.select(first);
  }

  nthItem(n) {
    let seen = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (!this.isSelectable(i)) continue;
      if (++seen === n) return i;
    }
    return -1;
  }

  _renderPills() {
    this._clearContainer(this.pillsBox);
    const show = this.argDefs.length > 0 && this.view.kind !== 'alias';
    this.pillsBox.set_visible(show);
    if (!show) return;

    this.argDefs.forEach((def, idx) => {
      const value = this.argValues[def.name] || '';
      const focused = this.argFocus === idx;
      const lbl = new Gtk.Label({
        label: value || `${def.placeholder}${def.required ? '' : ' (optional)'}`,
        ellipsize: Pango.EllipsizeMode.START
      });
      lbl.add_css_class('gnomecast-pill');
      if (focused) lbl.add_css_class('gnomecast-pill-focused');
      if (!value) lbl.add_css_class('gnomecast-pill-placeholder');

      const click = new Gtk.GestureClick();
      click.connect('released', () => {
        this.argFocus = idx;
        this._renderPills();
        this._focusEntry();
      });
      lbl.add_controller(click);
      this.pillsBox.append(lbl);
    });
  }

  _updateLayoutState() {
    this._updateWindowSize();
    const compact = this.compact;
    this.headerDivider.set_visible(!compact);
    this.bodyStack.set_visible(!compact);
    this.footerDivider.set_visible(!compact);
    this.footer.set_visible(!compact);
    this.filterBtn.set_visible(this.atRoot && !compact);

    if (this.atRoot) {
      setImageToLogo(this.leadIcon, 22);
      this.leadIcon.remove_css_class('gnomecast-lead-accent');
    } else {
      this.leadIcon.set_from_icon_name('go-previous-symbolic');
      this.leadIcon.set_pixel_size(18);
      this.leadIcon.remove_css_class('gnomecast-lead-accent');
    }

    const ph = this.view.kind === 'alias'
      ? 'Type an alias, then press ↵'
      : this.view.kind === 'menu'
        ? `Search ${this.view.title}…`
        : this.view.kind === 'calculator-history'
          ? 'Search calculations…'
          : 'Search for apps and commands…';
    this.entry.set_placeholder_text(ph);

    const activeFilter = RootSearch.FILTERS.find(f => f.id === this.rootFilter) || RootSearch.FILTERS[0];
    this.filterLabel.set_label(activeFilter.title);
    if (this.dropdownOpen) this.filterBtn.add_css_class('gnomecast-filter-btn-open');
    else this.filterBtn.remove_css_class('gnomecast-filter-btn-open');

    this._updateFooter();
  }

  _updateFooter() {
    if (this.toast) {
      this.footerIcon.set_from_icon_name(this.toast.style === 'failure' ? 'dialog-warning-symbolic' : 'emblem-ok-symbolic');
      this.footerIcon.set_pixel_size(14);
      this.footerIcon.remove_css_class('gnomecast-accent-icon');
      this.footerIcon.remove_css_class('gnomecast-danger-icon');
      this.footerIcon.add_css_class(this.toast.style === 'failure' ? 'gnomecast-danger-icon' : 'gnomecast-accent-icon');
      this.footerStatus.set_label(this.toast.title);
      this.footerStatus.remove_css_class('gnomecast-footer-status');
      this.footerStatus.add_css_class('gnomecast-footer-toast');
      this.footerToastHint.set_visible(this.toast.actions.length > 0);
    } else {
      setImageToLogo(this.footerIcon, 16);
      this.footerIcon.remove_css_class('gnomecast-danger-icon');
      this.footerIcon.remove_css_class('gnomecast-accent-icon');
      this.footerStatus.set_label(this.view.title || 'Gnomecast');
      this.footerStatus.remove_css_class('gnomecast-footer-toast');
      this.footerStatus.add_css_class('gnomecast-footer-status');
      this.footerToastHint.set_visible(false);
    }

    let primary = null;
    if (this.view.kind === 'alias') {
      primary = { title: 'Save Alias' };
    } else {
      const list = this.actionsForSelected();
      if (list.length) primary = list[0];
    }

    this.footerPrimaryLabel.set_visible(!!primary);
    this.footerPrimaryHint.set_visible(!!primary);
    if (primary) this.footerPrimaryLabel.set_label(primary.title);

    const showActions = this.view.kind !== 'alias';
    this.footerSep.set_visible(showActions);
    this.footerActionsLabel.set_visible(showActions);
    this.footerActionsHintBox.set_visible(showActions);
    this._clearContainer(this.footerActionsHintBox);
    if (showActions) {
      this.footerActionsHintBox.append(makeKeyHints(this.vim ? 'Alt K' : 'Ctrl K'));
    }
  }

  actionsForSelected() {
    if (this.searchPending || !this.selectedRow) return [];
    const r = this.backend.callSync('rootSearch.getActions', { id: this.selectedRow.itemId });
    return r.ok ? r.data : [];
  }

  perform(actionId, index = undefined) {
    if (this.searchPending) return;
    if (index !== undefined && index >= 0) this.select(index);
    if (!this.selectedRow) return;
    this.actionPanelOpen = false;
    this._renderOverlays();

    if (actionId === 'open' && this.argDefs.length) {
      const missing = RootSearch.missingArgument(this.argDefs, this.argValues);
      if (missing >= 0) {
        this.argFocus = missing;
        this._renderPills();
        return;
      }
    }
    this.request({
      id: this.selectedRow.itemId,
      action: actionId,
      query: this.query,
      arguments: this.argValues
    });
  }

  request(payload) {
    const r = this.backend.callSync('rootSearch.performAction', payload);
    if (!r.ok) {
      this.showToast('failure', r.error);
      return;
    }
    const outcome = r.data || {};
    if (outcome.confirm) {
      this.alert = { spec: outcome.confirm, payload };
      this._renderOverlays();
      return;
    }
    if (outcome.push) {
      this.push(outcome.push);
      return;
    }
    if (outcome.close) {
      if (outcome.hud) this.backend.notifyHud(outcome.hud);
      this.hide();
      this.argValues = {};
      this.argFocus = -1;
      if (this.atRoot) {
        this._setEntryText('');
        this.setQuery('');
      }
      return;
    }
    if (outcome.toast) {
      this.showToast(outcome.toast.style, outcome.toast.title, outcome.toast.actions);
    }
    this.rebuild(false);
  }

  confirmAlert() {
    if (!this.alert) return;
    const payload = Object.assign({}, this.alert.payload, { confirmed: true });
    this.alert = null;
    this._renderOverlays();
    this.request(payload);
  }

  performNth(n) {
    const list = this.actionsForSelected();
    if (list.length > n) this.perform(list[n].id);
  }

  performIfOffered(actionIds) {
    const list = this.actionsForSelected();
    for (let i = 0; i < list.length; i++) {
      if (actionIds.indexOf(list[i].id) >= 0) {
        this.perform(list[i].id);
        return true;
      }
    }
    return false;
  }

  toggleActionPanel() {
    if (this.actionPanelOpen) {
      this.actionPanelOpen = false;
      this._renderOverlays();
      return;
    }
    this.actions = this.actionsForSelected();
    if (this.actions.length === 0) return;
    this.dropdownOpen = false;
    this.toastPanelOpen = false;
    this.aboutOpen = false;
    this.popupFilter = '';
    this.popupIndex = 0;
    this.actionPanelOpen = true;
    this._renderOverlays();
  }

  toggleDropdown() {
    if (this.dropdownOpen || !this.atRoot) {
      this.dropdownOpen = false;
      this._updateLayoutState();
      this._renderOverlays();
      return;
    }
    this.actionPanelOpen = false;
    this.toastPanelOpen = false;
    this.aboutOpen = false;
    this.popupFilter = '';
    const at = RootSearch.FILTERS.map(f => f.id).indexOf(this.rootFilter);
    this.popupIndex = Math.max(0, at);
    this.dropdownOpen = true;
    this._updateLayoutState();
    this._renderOverlays();
  }

  setRootFilter(id) {
    this.dropdownOpen = false;
    this._updateLayoutState();
    this._renderOverlays();
    if (this.rootFilter === id) return;
    this.rootFilter = id;
    this._updateLayoutState();
    this.rebuild(true);
  }

  toggleAbout() {
    if (this.aboutOpen || !this.selectedRow) {
      this.aboutOpen = false;
      this._renderOverlays();
      return;
    }
    const r = this.backend.callSync('rootSearch.getItemInfo', { id: this.selectedRow.itemId, query: this.query });
    if (!r.ok) {
      this.showToast('failure', r.error);
      return;
    }
    this.actionPanelOpen = false;
    this.dropdownOpen = false;
    this.toastPanelOpen = false;
    this.aboutRows = r.data;
    this.aboutOpen = r.data.length > 0;
    this._renderOverlays();
  }

  toggleToastPanel() {
    if (this.toastPanelOpen) {
      this.toastPanelOpen = false;
      this._scheduleToastClear(2500);
      this._renderOverlays();
      return;
    }
    if (!this.toast || !this.toast.actions.length) return;
    this.actionPanelOpen = false;
    this.dropdownOpen = false;
    this.aboutOpen = false;
    this.popupFilter = '';
    this.popupIndex = 0;
    this.toastPanelOpen = true;
    if (this._toastTimerId) {
      GLib.source_remove(this._toastTimerId);
      this._toastTimerId = 0;
    }
    this._renderOverlays();
  }

  runToastAction(actionId) {
    const action = (this.toast ? this.toast.actions : []).find(a => a.id === actionId);
    this.toastPanelOpen = false;
    this._renderOverlays();
    if (!action) return;
    if (action.copy !== undefined) {
      this.backend.copyText(action.copy);
      this.showToast('success', 'Copied to Clipboard');
      return;
    }
    const r = this.backend.callSync(action.call.method, action.call.data);
    if (!r.ok) {
      this.showToast('failure', r.error);
      return;
    }
    this.toast = null;
    this._updateFooter();
    this.rebuild(false);
    if (action.done) this.showToast('success', action.done);
  }

  showToast(style, title, actions = []) {
    const list = (actions || []).slice();
    if (style === 'failure') {
      list.push({ id: 'copy-error', title: 'Copy Error Message', copy: String(title || '') });
    }
    this.toastPanelOpen = false;
    this.toast = { style, title: String(title || ''), actions: list };
    this._updateFooter();
    this._renderOverlays();
    this._scheduleToastClear(list.length ? 6000 : 2500);
  }

  _scheduleToastClear(ms) {
    if (this._toastTimerId) {
      GLib.source_remove(this._toastTimerId);
      this._toastTimerId = 0;
    }
    this._toastTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
      this._toastTimerId = 0;
      if (!this.toastPanelOpen) {
        this.toast = null;
        this._updateFooter();
      }
      return GLib.SOURCE_REMOVE;
    });
  }

  _activePopupItems() {
    let raw = [];
    if (this.actionPanelOpen) raw = this.actions;
    else if (this.dropdownOpen) {
      raw = RootSearch.FILTERS.map(f => ({
        id: f.id,
        title: f.title,
        shortcut: '',
        section: 'filter',
        checked: f.id === this.rootFilter
      }));
    } else if (this.toastPanelOpen) {
      raw = (this.toast ? this.toast.actions : []).map(a => ({
        id: a.id,
        title: a.title,
        shortcut: '',
        section: 'toast'
      }));
    }
    const f = this.popupFilter.trim().toLowerCase();
    return raw.filter(a => !f || a.title.toLowerCase().indexOf(f) >= 0);
  }

  _renderOverlays() {
    const popupMode = this.actionPanelOpen
      ? 'actions'
      : this.dropdownOpen
        ? 'dropdown'
        : this.toastPanelOpen
          ? 'toast'
          : '';

    this.popupBox.set_visible(!!popupMode);
    if (popupMode) {
      this.popupBox.set_halign(popupMode === 'toast' ? Gtk.Align.START : Gtk.Align.END);
      this.popupBox.set_valign(popupMode === 'dropdown' ? Gtk.Align.START : Gtk.Align.END);
      this.popupBox.set_margin_start(popupMode === 'toast' ? 12 : 0);
      this.popupBox.set_margin_end(popupMode === 'toast' ? 0 : 12);
      this.popupBox.set_margin_top(popupMode === 'dropdown' ? this.px(68) : 0);
      this.popupBox.set_margin_bottom(popupMode === 'dropdown' ? 0 : this.px(48));
      this.popupBox.set_size_request(this.px(popupMode === 'dropdown' ? 240 : popupMode === 'toast' ? 280 : 340), -1);

      const items = this._activePopupItems();
      if (this.popupIndex >= items.length) this.popupIndex = Math.max(0, items.length - 1);
      this._clearContainer(this.popupList);

      items.forEach((item, idx) => {
        if (idx > 0 && items[idx - 1].section !== item.section) {
          const div = new Gtk.Box();
          div.add_css_class('gnomecast-divider');
          div.set_margin_top(3);
          div.set_margin_bottom(3);
          this.popupList.append(div);
        }
        const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8 });
        row.add_css_class('gnomecast-popover-row');
        if (idx === this.popupIndex) row.add_css_class('gnomecast-popover-row-selected');

        if (item.checked) {
          const chk = new Gtk.Label({ label: '✓' });
          chk.add_css_class('gnomecast-accent-icon');
          row.append(chk);
        }
        const title = new Gtk.Label({ label: item.title, xalign: 0, hexpand: true, ellipsize: Pango.EllipsizeMode.END });
        row.append(title);
        if (item.shortcut) row.append(makeKeyHints(item.shortcut));

        const hover = new Gtk.EventControllerMotion();
        hover.connect('enter', () => {
          if (this.popupIndex !== idx) {
            this.popupIndex = idx;
            this._renderOverlays();
          }
        });
        row.add_controller(hover);

        const click = new Gtk.GestureClick();
        click.connect('released', () => {
          this.popupIndex = idx;
          this._activatePopupItem();
        });
        row.add_controller(click);
        this.popupList.append(row);
      });

      const ph = popupMode === 'dropdown' ? 'Filter…' : popupMode === 'toast' ? 'Search toast actions…' : 'Search for actions…';
      this.popupFilterLabel.set_label(this.popupFilter || ph);
      if (this.popupFilter) this.popupFilterLabel.remove_css_class('gnomecast-popover-filter-empty');
      else this.popupFilterLabel.add_css_class('gnomecast-popover-filter-empty');
    }

    // About Panel
    this.aboutBox.set_visible(this.aboutOpen);
    if (this.aboutOpen) {
      this._clearContainer(this.aboutBox);
      const wrap = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
      wrap.set_margin_top(12);
      wrap.set_margin_bottom(12);
      wrap.set_margin_start(12);
      wrap.set_margin_end(12);

      const title = new Gtk.Label({ label: this.selectedRow ? this.selectedRow.title : '', xalign: 0, ellipsize: Pango.EllipsizeMode.END });
      title.add_css_class('gnomecast-info-title');
      wrap.append(title);

      const div = new Gtk.Box();
      div.add_css_class('gnomecast-divider');
      wrap.append(div);

      for (const r of this.aboutRows) {
        const row = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10 });
        const lbl = new Gtk.Label({ label: r.label, xalign: 0, valign: Gtk.Align.START });
        lbl.set_size_request(100, -1);
        lbl.add_css_class('gnomecast-info-label');
        const val = new Gtk.Label({ label: r.value, xalign: 0, hexpand: true, wrap: true, wrap_mode: Pango.WrapMode.WORD_CHAR });
        val.add_css_class('gnomecast-info-val');
        row.append(lbl);
        row.append(val);
        wrap.append(row);
      }
      this.aboutBox.append(wrap);
    }

    // Confirm Alert
    this.alertScrim.set_visible(!!this.alert);
    if (this.alert) {
      this._clearContainer(this.alertBox);
      const spec = this.alert.spec;
      const t = new Gtk.Label({ label: spec.title || '', justify: Gtk.Justification.CENTER, wrap: true });
      t.add_css_class('gnomecast-alert-title');
      this.alertBox.append(t);

      if (spec.message) {
        const m = new Gtk.Label({ label: spec.message, justify: Gtk.Justification.CENTER, wrap: true });
        m.add_css_class('gnomecast-alert-msg');
        this.alertBox.append(m);
      }

      const btnRow = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 10, homogeneous: true });
      btnRow.set_margin_top(6);

      const cancelBtn = new Gtk.Button();
      cancelBtn.add_css_class('gnomecast-btn');
      const cancelInner = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, halign: Gtk.Align.CENTER });
      cancelInner.append(new Gtk.Label({ label: 'Cancel' }));
      cancelInner.append(makeKeyHints('Esc'));
      cancelBtn.set_child(cancelInner);
      cancelBtn.connect('clicked', () => {
        this.alert = null;
        this._renderOverlays();
        this._focusEntry();
      });

      const okBtn = new Gtk.Button();
      okBtn.add_css_class('gnomecast-btn');
      okBtn.add_css_class(spec.destructive ? 'gnomecast-btn-danger' : 'gnomecast-btn-primary');
      const okInner = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 8, halign: Gtk.Align.CENTER });
      okInner.append(new Gtk.Label({ label: spec.primary || 'OK' }));
      okInner.append(makeKeyHints('↵'));
      okBtn.set_child(okInner);
      okBtn.connect('clicked', () => this.confirmAlert());

      btnRow.append(cancelBtn);
      btnRow.append(okBtn);
      this.alertBox.append(btnRow);
    }
  }

  _activatePopupItem() {
    const items = this._activePopupItems();
    const item = items[this.popupIndex];
    if (!item) return;
    if (this.actionPanelOpen) this.perform(item.id);
    else if (this.dropdownOpen) this.setRootFilter(item.id);
    else if (this.toastPanelOpen) this.runToastAction(item.id);
    this._focusEntry();
  }

  saveAlias() {
    const r = this.backend.callSync('settings.updateCommandSettings', {
      commandId: this.view.commandId,
      alias: this.query
    });
    if (!r.ok) {
      this.showToast('failure', r.error);
      return;
    }
    const saved = this.query.trim();
    this.pop();
    this.showToast('success', saved ? 'Alias saved' : 'Alias removed');
    this.rebuild(false);
  }

  recallHistory(direction) {
    const r = this.backend.callSync('rootSearch.getSearchHistory', null);
    const history = r.ok ? r.data : [];
    if (history.length === 0) return false;
    const next = Math.max(-1, Math.min(history.length - 1, this.historyIndex + direction));
    if (next === this.historyIndex) return true;
    const nextQ = next < 0 ? '' : history[next];
    this.query = nextQ;
    this._setEntryText(nextQ);
    this.rebuild(true);
    this.historyIndex = next;
    return true;
  }

  setZoom(value) {
    const z = Math.round(Math.max(0.8, Math.min(1.5, value)) * 10) / 10;
    this.backend.callSync('settings.updateGeneralSettings', { uiZoom: z });
  }

  _handleEscape(shift) {
    if (this.alert) { this.alert = null; this._renderOverlays(); return; }
    if (this.aboutOpen) { this.aboutOpen = false; this._renderOverlays(); return; }
    if (this.dropdownOpen) { this.dropdownOpen = false; this._updateLayoutState(); this._renderOverlays(); return; }
    if (this.toastPanelOpen) { this.toggleToastPanel(); return; }
    if (this.actionPanelOpen) { this.actionPanelOpen = false; this._renderOverlays(); return; }
    if (this.argFocus >= 0 && !shift) { this.argFocus = -1; this._renderPills(); this._focusEntry(); return; }
    if (shift) { this.popToRoot(); return; }
    if (this.general.escapeKeyBehavior === 'close-and-pop-to-root') {
      this.hide();
      this.popToRoot();
      return;
    }
    if (this.query && this.view.kind !== 'alias') {
      this._setEntryText('');
      this.setQuery('');
    } else if (!this.atRoot) {
      this.pop();
    } else {
      this.hide();
    }
  }

  _direction(keyval, ctrl, alt, shift, inPopup) {
    if (!ctrl && !alt && keyval === Gdk.KEY_Down) return 1;
    if (!ctrl && !alt && keyval === Gdk.KEY_Up) return -1;
    if (!ctrl || alt || shift) return 0;
    const lower = Gdk.keyval_to_lower(keyval);
    if (this.vim) return lower === Gdk.KEY_j ? 1 : (lower === Gdk.KEY_k ? -1 : 0);
    return lower === Gdk.KEY_n ? 1 : (lower === Gdk.KEY_p && inPopup ? -1 : 0);
  }

  _isActionPanelKey(ctrl, alt, shift, lower) {
    if (lower !== Gdk.KEY_k || shift) return false;
    return this.vim ? alt && !ctrl : ctrl && !alt;
  }

  _printableFromKeyval(keyval, state) {
    if ((state & (Gdk.ModifierType.CONTROL_MASK | Gdk.ModifierType.ALT_MASK | Gdk.ModifierType.SUPER_MASK)) !== 0) {
      return '';
    }
    const uni = Gdk.keyval_to_unicode(keyval);
    if (!uni || uni < 32 || uni === 127) return '';
    return String.fromCodePoint(uni);
  }

  _handlePopupKey(keyval, state) {
    const ctrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
    const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0;
    const alt = (state & Gdk.ModifierType.ALT_MASK) !== 0;
    const lower = Gdk.keyval_to_lower(keyval);
    const items = this._activePopupItems();

    const dir = this._direction(keyval, ctrl, alt, shift, true);
    if (dir && items.length > 0) {
      this.popupIndex = (this.popupIndex + dir + items.length) % items.length;
      this._renderOverlays();
      return true;
    }
    if (keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter) {
      this._activatePopupItem();
      return true;
    }
    if (keyval === Gdk.KEY_BackSpace || (ctrl && lower === Gdk.KEY_h)) {
      this.popupFilter = this.popupFilter.slice(0, -1);
      this.popupIndex = 0;
      this._renderOverlays();
      return true;
    }
    if (ctrl && lower === Gdk.KEY_u) {
      this.popupFilter = '';
      this.popupIndex = 0;
      this._renderOverlays();
      return true;
    }
    const ch = this._printableFromKeyval(keyval, state);
    if (ch) {
      this.popupFilter += ch;
      this.popupIndex = 0;
      this._renderOverlays();
      return true;
    }
    return true;
  }

  _handleArgumentKey(keyval, state) {
    const def = this.argDefs[this.argFocus];
    if (!def) return false;
    const ctrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
    const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0;
    const lower = Gdk.keyval_to_lower(keyval);
    const val = this.argValues[def.name] || '';

    const setVal = (next) => {
      this.argValues = Object.assign({}, this.argValues, { [def.name]: next });
      this._renderPills();
    };

    if (keyval === Gdk.KEY_Tab || keyval === Gdk.KEY_ISO_Left_Tab) {
      const step = shift || keyval === Gdk.KEY_ISO_Left_Tab ? -1 : 1;
      const next = this.argFocus + step;
      this.argFocus = next >= this.argDefs.length ? 0 : next;
      this._renderPills();
      return true;
    }
    if (keyval === Gdk.KEY_BackSpace && !val) {
      this.argFocus--;
      this._renderPills();
      return true;
    }
    if (keyval === Gdk.KEY_BackSpace) {
      setVal(val.slice(0, -1));
      return true;
    }
    if (ctrl && lower === Gdk.KEY_u) {
      setVal('');
      return true;
    }
    const ch = this._printableFromKeyval(keyval, state);
    if (ch) {
      setVal(val + ch);
      return true;
    }
    return false;
  }

  _pasteFromClipboard() {
    const display = Gdk.Display.get_default();
    if (!display) return;
    display.get_clipboard().read_text_async(null, (_cb, res) => {
      try {
        let text = display.get_clipboard().read_text_finish(res);
        if (!text) return;
        text = text.replace(/[\r\n\u2028\u2029]+/g, ' ');
        if (this.actionPanelOpen || this.dropdownOpen || this.toastPanelOpen) {
          this.popupFilter += text;
          this.popupIndex = 0;
          this._renderOverlays();
        } else if (this.argFocus >= 0 && this.argDefs[this.argFocus]) {
          const name = this.argDefs[this.argFocus].name;
          this.argValues = Object.assign({}, this.argValues, { [name]: (this.argValues[name] || '') + text });
          this._renderPills();
        } else {
          if (this.view.kind === 'alias') text = text.replace(/\s/g, '');
          const next = this.query + text;
          this._setEntryText(next);
          this.setQuery(next);
        }
      } catch (_e) {}
    });
  }

  _onKeyPressed(keyval, state) {
    const ctrl = (state & Gdk.ModifierType.CONTROL_MASK) !== 0;
    const shift = (state & Gdk.ModifierType.SHIFT_MASK) !== 0;
    const alt = (state & Gdk.ModifierType.ALT_MASK) !== 0;
    const meta = (state & Gdk.ModifierType.SUPER_MASK) !== 0;
    const lower = Gdk.keyval_to_lower(keyval);
    const enter = keyval === Gdk.KEY_Return || keyval === Gdk.KEY_KP_Enter;

    if (this.alert) {
      if (keyval === Gdk.KEY_Escape) { this.alert = null; this._renderOverlays(); }
      else if (enter) this.confirmAlert();
      return true;
    }
    if (keyval === Gdk.KEY_Escape) {
      this._handleEscape(shift);
      return true;
    }
    if (ctrl && (keyval === Gdk.KEY_plus || keyval === Gdk.KEY_equal || keyval === Gdk.KEY_KP_Add)) {
      this.setZoom(this.zoom + 0.1);
      return true;
    }
    if (ctrl && (keyval === Gdk.KEY_minus || keyval === Gdk.KEY_KP_Subtract)) {
      this.setZoom(this.zoom - 0.1);
      return true;
    }
    if (ctrl && keyval === Gdk.KEY_0) {
      this.setZoom(1);
      return true;
    }
    if (ctrl && keyval === Gdk.KEY_bracketleft) {
      this.closePopups();
      this.pop();
      return true;
    }
    if ((lower === Gdk.KEY_v && ctrl && !alt && !meta) || (keyval === Gdk.KEY_Insert && shift && !ctrl && !alt && !meta)) {
      this._pasteFromClipboard();
      return true;
    }

    if (this.aboutOpen) {
      if (ctrl && shift && lower === Gdk.KEY_k) {
        this.aboutOpen = false;
        this._renderOverlays();
      }
      return true;
    }
    if (this.dropdownOpen) {
      if (ctrl && !shift && lower === Gdk.KEY_p) {
        this.dropdownOpen = false;
        this._updateLayoutState();
        this._renderOverlays();
        return true;
      }
      return this._handlePopupKey(keyval, state);
    }
    if (this.toastPanelOpen) {
      if (ctrl && lower === Gdk.KEY_t) {
        this.toggleToastPanel();
        return true;
      }
      return this._handlePopupKey(keyval, state);
    }
    if (this.actionPanelOpen) {
      if (this._isActionPanelKey(ctrl, alt, shift, lower)) {
        this.actionPanelOpen = false;
        this._renderOverlays();
        return true;
      }
      return this._handlePopupKey(keyval, state);
    }

    if (this.view.kind === 'alias') {
      if (enter) { this.saveAlias(); return true; }
      if (keyval === Gdk.KEY_space) return true;
    } else {
      if (ctrl && shift && lower === Gdk.KEY_k) { this.toggleAbout(); return true; }
      if (this._isActionPanelKey(ctrl, alt, shift, lower)) { this.toggleActionPanel(); return true; }
      if (ctrl && !shift && lower === Gdk.KEY_p) { this.toggleDropdown(); return true; }
      if (ctrl && !shift && lower === Gdk.KEY_t) { this.toggleToastPanel(); return true; }
      if (enter && shift && !ctrl && !alt && this.performIfOffered(['open-new'])) return true;
      if (enter && ctrl && shift) { this.performNth(2); return true; }
      if (enter && ctrl) { this.performNth(1); return true; }
      if (enter) { this.performNth(0); return true; }

      if (this.argFocus >= 0 && this._handleArgumentKey(keyval, state)) return true;
      if (keyval === Gdk.KEY_Tab && this.argDefs.length) {
        this.argFocus = 0;
        this._renderPills();
        return true;
      }

      if (ctrl && alt && keyval === Gdk.KEY_Up) { this.performIfOffered(['favorite-up']); return true; }
      if (ctrl && alt && keyval === Gdk.KEY_Down) { this.performIfOffered(['favorite-down']); return true; }
      if (ctrl && keyval === Gdk.KEY_Up) { this.jumpSection(-1); return true; }
      if (ctrl && keyval === Gdk.KEY_Down) { this.jumpSection(1); return true; }

      const dir = this._direction(keyval, ctrl, alt, shift, false);
      if (dir < 0) {
        if (this.atRoot && (this.query === '' || this.historyIndex >= 0) &&
            this.selectedIndex === this.nextSelectable(-1, 1) && this.recallHistory(1)) {
          return true;
        }
        this.move(-1);
        return true;
      }
      if (dir > 0) {
        if (this.historyIndex >= 0) {
          this.recallHistory(-1);
          return true;
        }
        this.move(1);
        return true;
      }

      if (keyval === Gdk.KEY_Page_Up) { this.move(-8); return true; }
      if (keyval === Gdk.KEY_Page_Down) { this.move(8); return true; }
      if (ctrl && shift && lower === Gdk.KEY_f) { this.performIfOffered(['favorite-add', 'favorite-remove']); return true; }
      if (ctrl && shift && lower === Gdk.KEY_c) { this.performIfOffered(['copy-command', 'copy-id', 'copy-question-answer']); return true; }
      if (ctrl && shift && lower === Gdk.KEY_d) { this.performIfOffered(['delete-all-entries']); return true; }
      if (ctrl && lower === Gdk.KEY_d) { this.performIfOffered(['delete-entry']); return true; }
      if (alt && shift && lower === Gdk.KEY_d) { this.performIfOffered(['disable']); return true; }
      if (ctrl && keyval >= Gdk.KEY_1 && keyval <= Gdk.KEY_9) {
        const target = this.nthItem(keyval - Gdk.KEY_0);
        if (target >= 0) this.perform('open', target);
        return true;
      }
    }

    if (keyval === Gdk.KEY_BackSpace && !this.query && !this.atRoot) {
      this.pop();
      return true;
    }
    if (ctrl && lower === Gdk.KEY_u) {
      this._setEntryText('');
      this.setQuery('');
      return true;
    }
    return false;
  }
}
