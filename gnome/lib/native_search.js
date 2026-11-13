import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { FleaSearch, REPO_ROOT } from './core.js';

/**
 * Optional Rust flea-search helper bridge (bin/gnomecast-search).
 * Falls back cleanly to null (synchronous Ranker.js) if the helper is not built
 * or times out.
 */
export class NativeSearch {
  constructor({ onFailed = null } = {}) {
    this.executable = `${REPO_ROOT}/bin/gnomecast-search`;
    this.onFailed = onFailed;
    this.entries = [];
    this.ids = [];
    this.disabled = false;
    this.loaded = false;
    this.serial = 0;
    this.loadId = 0;
    this.pending = null;
    this._proc = null;
    this._stdin = null;
    this._stdout = null;
    this._timeoutId = 0;
  }

  setEntries(ids, entries) {
    this.ids = ids;
    this.entries = entries;
    this.invalidate();
  }

  cancel() {
    this.pending = null;
    if (this._timeoutId) {
      GLib.source_remove(this._timeoutId);
      this._timeoutId = 0;
    }
  }

  invalidate() {
    const req = this.pending;
    this.cancel();
    this.loaded = false;
    this.loadId = 0;
    if (this._proc) this._sendLoad();
    if (req) req.callback(null);
  }

  search(query, sensitivity, callback) {
    this.cancel();
    if (this.disabled || query.length > FleaSearch.MAX_QUERY_LENGTH || !GLib.file_test(this.executable, GLib.FileTest.IS_EXECUTABLE)) {
      callback(null);
      return;
    }
    this.pending = { id: ++this.serial, query, sensitivity, callback };
    this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
      this._timeoutId = 0;
      this.fail('Search helper timed out; using the built-in matcher');
      return GLib.SOURCE_REMOVE;
    });
    if (!this._proc) this._start();
    else if (this.loaded) this._sendQuery();
  }

  _start() {
    try {
      this._proc = Gio.Subprocess.new(
        [this.executable],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE
      );
      this._stdin = new Gio.DataOutputStream({ base_stream: this._proc.get_stdin_pipe() });
      this._stdout = new Gio.DataInputStream({ base_stream: this._proc.get_stdout_pipe() });
      this._proc.wait_async(null, () => {
        this._proc = null;
        if (!this.disabled) this.fail('Search helper exited; using the built-in matcher');
      });
      this._readLoop();
      this._sendLoad();
    } catch (e) {
      this.fail(`Search helper unavailable: ${e.message || e}`);
    }
  }

  _writeLine(obj) {
    if (!this._stdin) return;
    this._stdin.put_string(`${JSON.stringify(obj)}\n`, null);
    this._stdin.flush(null);
  }

  _sendLoad() {
    this.loadId = ++this.serial;
    try {
      this._writeLine({ id: this.loadId, entries: this.entries });
    } catch (e) {
      this.fail(`Search helper write failed: ${e.message || e}`);
    }
  }

  _sendQuery() {
    if (!this.pending) return;
    try {
      this._writeLine({ id: this.pending.id, query: this.pending.query, sensitivity: this.pending.sensitivity });
    } catch (e) {
      this.fail(`Search helper query write failed: ${e.message || e}`);
    }
  }

  _readLoop() {
    if (!this._stdout) return;
    this._stdout.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, res) => {
      try {
        const [line] = stream.read_line_finish_utf8(res);
        if (line === null) return;
        this._receive(line);
        if (this._proc && !this.disabled) this._readLoop();
      } catch (_e) {
        // Exit handler covers cleanup.
      }
    });
  }

  _receive(line) {
    try {
      const data = FleaSearch.reply(line);
      const request = this.pending;
      if (data.id !== this.loadId && (!request || data.id !== request.id)) return;
      if (data.error) throw new Error(String(data.error));
      if (data.id === this.loadId) {
        if (data.loaded !== this.entries.length) throw new Error('Search helper loaded the wrong entry count');
        this.loaded = true;
        this._sendQuery();
        return;
      }
      if (!request || data.id !== request.id) return;
      const matches = FleaSearch.hits(data, this.ids);
      this.cancel();
      request.callback(matches);
    } catch (e) {
      this.fail(String(e.message || e));
    }
  }

  fail(message) {
    const req = this.pending;
    this.cancel();
    this.disabled = true;
    this.loaded = false;
    if (this._proc) {
      try { this._proc.force_exit(); } catch (_e) {}
      this._proc = null;
    }
    if (this.onFailed) this.onFailed(message);
    if (req) req.callback(null);
  }

  destroy() {
    this.disabled = true;
    this.cancel();
    if (this._proc) {
      try { this._proc.force_exit(); } catch (_e) {}
      this._proc = null;
    }
  }
}
