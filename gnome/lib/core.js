import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

const SELF_DIR = Gio.File.new_for_uri(import.meta.url).get_parent();
export const GNOME_ROOT = SELF_DIR.get_parent().get_path();
export const REPO_ROOT = SELF_DIR.get_parent().get_parent().get_path();

const cache = new Map();

export function loadCoreModule(name) {
  if (cache.has(name)) return cache.get(name);
  const path = `${REPO_ROOT}/core/${name}.js`;
  const [ok, bytes] = GLib.file_get_contents(path);
  if (!ok) throw new Error(`Failed to load core module: ${path}`);
  const src = new TextDecoder().decode(bytes);
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', src);
  fn(mod, mod.exports);
  cache.set(name, mod.exports);
  return mod.exports;
}

export const Rpc = loadCoreModule('Rpc');
export const Paths = loadCoreModule('Paths');
export const Log = loadCoreModule('Log');
export const Migrate = loadCoreModule('Migrate');
export const Schema = loadCoreModule('Schema');
export const Frecency = loadCoreModule('Frecency');
export const Ranker = loadCoreModule('Ranker');
export const FleaSearch = loadCoreModule('FleaSearch');
export const RootSearch = loadCoreModule('RootSearch');
export const Calculator = loadCoreModule('Calculator');
export const Rows = loadCoreModule('Rows');
