import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import { Migrate } from './core.js';

/**
 * Versioned JSON store with atomic writes, schema migrations,
 * read-only fallback on unreadable/newer files, and debounced persistence.
 */
export class JsonStore {
  constructor({ path, migrations, now = () => Date.now(), onChanged = null, onMessage = null }) {
    this.path = path;
    this.migrations = migrations;
    this.now = now;
    this.onChanged = onChanged;
    this.onMessage = onMessage;

    this.doc = null;
    this.loaded = false;
    this.readOnly = false;
    this.lastError = '';
    this._lastWritten = '';
    this._saveTimerId = 0;
    this._monitor = null;
  }

  init() {
    this.reload();
    this._watch();
  }

  _emitMessage(level, text, metadata = null) {
    if (this.onMessage) this.onMessage(level, text, metadata);
  }

  _emitChanged() {
    if (this.onChanged) this.onChanged();
  }

  _watch() {
    try {
      const file = Gio.File.new_for_path(this.path);
      this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
      this._monitor.connect('changed', (_mon, _file, _other, eventType) => {
        if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT ||
            eventType === Gio.FileMonitorEvent.CREATED ||
            eventType === Gio.FileMonitorEvent.MOVED_IN) {
          this.reload();
        }
      });
    } catch (_e) {
      // Directory/file watching is optional if unsupported.
    }
  }

  reload() {
    let text = '';
    try {
      const file = Gio.File.new_for_path(this.path);
      if (file.query_exists(null)) {
        const [ok, bytes] = GLib.file_get_contents(this.path);
        if (!ok) throw new Error('read failed');
        text = new TextDecoder().decode(bytes);
      }
    } catch (e) {
      this.readOnly = true;
      this.lastError = `cannot read ${this.path}: ${e.message || e}`;
      this._emitMessage('error', this.lastError);
      return;
    }
    this.ingest(text);
  }

  ingest(text) {
    if (this.loaded && !this.readOnly && text === this._lastWritten) return;

    const parsed = Migrate.parse(text);
    if (parsed.error) {
      this.readOnly = true;
      this.lastError = `unreadable ${this.path}: ${parsed.error}`;
      this._emitMessage('error', `${this.lastError} (left untouched; fix or remove it)`);
      return;
    }

    let result;
    try {
      result = Migrate.migrate(parsed.doc, this.migrations, this.now());
    } catch (e) {
      this.readOnly = true;
      this.lastError = `migration failed for ${this.path}: ${e.message || e}`;
      this._emitMessage('error', this.lastError);
      return;
    }

    if (result.error) {
      this.readOnly = true;
      this.lastError = result.error;
      this._emitMessage('error', `${this.path}: ${result.error}`);
      return;
    }

    this.readOnly = result.readOnly;
    this.lastError = '';
    if (result.readOnly) {
      this._emitMessage('warning', `${this.path} has schemaVersion ${result.from}, newer than this build; not writing it`);
    }
    if (result.applied.length > 0) {
      this._emitMessage('info', `migrated ${this.path}`, { from: result.from, to: result.to, applied: result.applied });
    }

    this._lastWritten = String(text || '');
    this.doc = result.doc;
    this.loaded = true;
    if (result.changed) this.write();
    this._emitChanged();
  }

  update(mutator) {
    if (!this.loaded || this.readOnly) return false;
    const next = JSON.parse(JSON.stringify(this.doc));
    const result = mutator(next);
    this.doc = result === undefined ? next : result;
    this._scheduleSave();
    this._emitChanged();
    return true;
  }

  _scheduleSave() {
    if (this._saveTimerId) {
      GLib.source_remove(this._saveTimerId);
      this._saveTimerId = 0;
    }
    this._saveTimerId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
      this._saveTimerId = 0;
      this.write();
      return GLib.SOURCE_REMOVE;
    });
  }

  flush() {
    if (this._saveTimerId) {
      GLib.source_remove(this._saveTimerId);
      this._saveTimerId = 0;
      this.write();
    }
  }

  write() {
    if (!this.loaded || this.readOnly) return;
    const text = Migrate.serialize(this.doc);
    if (text === this._lastWritten) return;
    try {
      const file = Gio.File.new_for_path(this.path);
      const bytes = new TextEncoder().encode(text);
      file.replace_contents(
        bytes,
        null,
        false,
        Gio.FileCreateFlags.PRIVATE | Gio.FileCreateFlags.REPLACE_DESTINATION,
        null
      );
      this._lastWritten = text;
    } catch (e) {
      this._emitMessage('error', `cannot write ${this.path}: ${e.message || e}`);
    }
  }

  destroy() {
    this.flush();
    if (this._monitor) {
      this._monitor.cancel();
      this._monitor = null;
    }
  }
}
