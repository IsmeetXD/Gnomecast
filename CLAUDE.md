# CLAUDE.md

**Gnomecast** is a clean-room rebuild of Raycast for **GNOME (Fedora Workstation & Wayland/X11)** by [ismeetxd](https://github.com/ismeetxd). It runs natively via a persistent GJS + GTK4/Libadwaita daemon (`gnome/daemon.js`), a companion GNOME Shell extension (`gnomecast@ismeetxd.dev`), and a Super+Space Shortcut Toggle GUI app (`gnome/app.js`). The behaviour and interfaces come from a static reverse-engineering pass over Raycast 2.8.2 on macOS, done with the `reverse-engineer-anything` skill. This repo holds that pass's results and no Raycast code.

## Read these first

| File | What it is | When to read it |
|---|---|---|
| `SPEC.md` | **The plan.** Architecture, IPC contract, platform matrix, data layer, root-search algorithm, feature catalog, extension runtime, frontend, `.rayconfig` import, phased build plan with acceptance checks. | Before any work. Re-read the relevant section before each phase. |
| `reference/01-host-ipc.md` | Native host: window model, ~408 host capabilities (§4.1), WebView bridge, host↔backend wire protocol, helper processes, a Linux mapping for each (§4.3). | Phase 1 (window), Phase 5 (supervisor, for the Node extension host), Phase 6 (WM) |
| `reference/02-backend.md` | Backend service map and RPC methods, DB engine, **root-search ranking (§4)**, frecency (§4.6), clipboard (§5.1), snippet placeholder grammar (§5.2), quicklinks (§6), calculator, indexer. | Phases 1–4, 7 |
| `reference/03-extensions.md` | `@raycast/api` runtime: worker model, reconciler, **render-tree JSON schema (§2.4)**, API→RPC table (§3.2), manifest (§4), Script Commands (§5), install pipeline (§6), Icon enum (App. A). | Phase 2 (script commands), Phase 5 |
| `reference/04-frontend-features.md` | **Built-in command catalog (§1, App. A)**, launcher UI anatomy (§2), default shortcuts (§2.8), settings pages (§3, App. B/C), themes and design tokens (§4). | Phase 1 onward, every UI task |
| `reference/05-data-config.md` | On-disk layout, DB encryption, reconstructed schema, `.rayconfig` format (§5), XDG mapping (§8). | Phase 0 (paths, DB), Phase 8 (import) |
| `reference/schema-nonai.sql` | Raycast's non-AI DDL, reconstructed. **Reference only.** The clone uses the simpler schema in `SPEC.md §6.4`. | When you need a field Raycast stores |
| `reference/backend-methods-nonai.txt` | Every non-AI backend RPC method name. **Do not implement all of them.** Reuse the names for what each phase needs. | When naming an IPC method |

Spec legend: **[O]** observed in Raycast, **[I]** inferred, **[D]** design decision for this clone. [O] is ground truth for behaviour. [D] may be changed if you have a reason; note the change in `SPEC.md`.

## Ground rules (from SPEC.md §0, non-negotiable)

1. **Clean room.** Never copy, bundle or redistribute anything from `Raycast.app` (JS, icons, fonts, `.node` modules). Allowed: the public npm `@raycast/api` / `@raycast/utils` packages (check the license of the pinned version) and the MIT `raycast/extensions` repo.
2. **Never call `*.raycast.com`.** No store, account, sync, telemetry or currency APIs. Build extensions from a local `raycast/extensions` clone.
3. **No telemetry.** No Sentry, no PostHog.
4. **No embedded AI features.** No model API or credential handling.
5. **Port the root-search ranker exactly** from `reference/02-backend.md §4.2–4.5`. Do not substitute fzf, nucleo or fuse.js. The user-authorized flea-search matcher (`search/` + `core/FleaSearch.js`) is the matching exception; personalization still uses this ranker.
6. **No user text in argv; private files stay private.** Queries, calculator text and anything else the user typed go to other processes on stdin (`gnome/lib/platform.js`), never as arguments. Gnomecast dirs are `0700` and store files `0600` (SPEC §2.0 "Privacy").

## How to work

- Build **phase by phase** following `SPEC.md §12` (Phase 0 → 9). A phase is done only when its **Accept** checks pass. Then move on.
- After each phase, update the **Status** section at the bottom of this file: what works, what's stubbed, and any deviations from the spec.
- If the reference docs don't answer a question, choose a sensible value, mark it `[I]` or `[D]` in a code comment, and keep going. Raycast.app is not on the Linux machine.
- The app name is **`Gnomecast`** (`gnomecast`): CLI `gnomecast`, GNOME D-Bus/app ID `dev.ismeetxd.Gnomecast`, Toggle Settings app ID `dev.ismeetxd.GnomecastSettings`, GNOME Shell extension `gnomecast@ismeetxd.dev`, URL scheme `gnomecast://` (later). Also register `raycast://` for extension deep links (SPEC §5.5).

## Architecture: GNOME GTK4/Libadwaita daemon & Shell extension

Gnomecast runs natively on **GNOME (Fedora Workstation)** via `gnome/daemon.js` (`dev.ismeetxd.Gnomecast` over D-Bus) with a Libadwaita Settings toggle app (`gnome/app.js`, `dev.ismeetxd.GnomecastSettings`) and companion GNOME Shell extension (`gnome-extension/gnomecast@ismeetxd.dev/`) to make `Super+Space` instant and reliable.

**Keep external dependencies near zero:** GJS, GTK4/Libadwaita, and plain JS only, using what GNOME / Fedora Workstation already ships (plus the optional static Rust `bin/gnomecast-search` helper when `cargo` is installed). No Tauri, Node runtime, npm packages, or external native modules in runtime dependencies.

## Repo layout

```
gnome/                   # GNOME GJS + GTK4/Libadwaita daemon, launcher UI, Super+Space toggle app, core wrapper
gnome/lib/               # backend, platform IPC, GNOME commands & safe Trash helper, hotkey manager, logo loader, NativeSearch
gnome/ui/                # GTK4 launcher window & Adwaita Super+Space Shortcut Toggle window
gnome-extension/         # companion GNOME Shell extension (gnomecast@ismeetxd.dev) for Super+Space & window focus
assets/                  # Gnomecast transparent logo (assets/logo.png) and hicolor icon theme PNGs
core/*.js                # pure logic, no GTK imports: shared by GJS and node tests (module.exports guard)
                         #   Calculator, FleaSearch, Frecency (ref 02 §4), Log, Migrate, Paths, Ranker, RootSearch, Rows, Rpc, Schema
bin/gnomecast            # bash CLI (install, setup, hotkey, app, daemon, toggle/show/hide, run, call, doctor)
bin/build-search         # builds bin/gnomecast-search from search/ into ~/.cache/gnomecast/search-target
bin/gnomecast-search     # built flea-search helper (gitignored; built by bin/build-search)
search/                  # Rust source of the optional helper
SPEC.md, reference/      # reconstruction spec and reverse-engineering notes
tests/*.test.js          # node --test unit tests for core/ (ranker, frecency, root search, privacy, …)
tests/gnome-*.js         # GJS verification suite (backend, GTK4/Adw UI over Broadway, Super+Space & Empty Trash)
tests/smoke.sh           # live acceptance check against the running daemon. Checks latency (<100 ms), never synthesizes keystrokes.
LICENSE, README.md       # MIT license (credits ismeetxd), install/removal instructions
```

Keep the tree free of symlinks (`find . -type l` should be empty).

Rules for `core/*.js`: one self-contained file per module so `gnome/lib/core.js` and node `require` both work cleanly; expose functions through the `if (typeof module !== "undefined") module.exports = …` guard. `gnome/lib/core.js` wires the modules together for GJS.

## Commands

```sh
node --test tests/*.test.js   # unit tests (node's built-in runner; no npm install)
gjs -m tests/gnome-check.js   # GNOME backend, NativeSearch, GSettings/Trash & privacy checks
tests/smoke.sh                # live checks: doctor, IPC, rootSearch, toggle latency (<100 ms). Never types.

bin/gnomecast install         # install icons, D-Bus service, systemd user unit, extension & CLI link
bin/gnomecast setup [--yes]   # bind Super+Space (Windows+Space) in GNOME
bin/gnomecast app             # open the Gnomecast Super+Space toggle Settings window
bin/gnomecast hotkey <on|off|toggle|status>
bin/gnomecast reload          # restart GNOME daemon
bin/gnomecast uninstall

gnomecast toggle | show | hide
gnomecast run <commandId>     # Phase 1+
gnomecast call <method> [json]
gnomecast doctor
```

**Reloading.** After editing files in `core/` or `gnome/`, run `bin/gnomecast reload` (or `systemctl --user restart gnomecast.service`) so the persistent `dev.ismeetxd.Gnomecast` daemon picks up the new JS modules.

## Running on GNOME / Fedora Workstation

- **Hotkey (`Super+Space` / `Windows+Space`).** Managed by `gnome/lib/hotkey.js` + `gnome-extension/gnomecast@ismeetxd.dev` + the GUI app (`gnome/app.js`). Turning it ON binds `<Super>space`, backs up `org.gnome.desktop.wm.keybindings` `switch-input-source` into `org.gnome.shell.extensions.gnomecast` GSettings, and routes presses directly to `dev.ismeetxd.Gnomecast.Toggle` (with a `gnome-settings-daemon` custom-keybinding fallback before Shell reload/logout). Turning it OFF restores the backed-up input-source binding cleanly.
- **IPC.** Single-instance GTK4/Gio daemon owns `dev.ismeetxd.Gnomecast` at `/dev/ismeetxd/Gnomecast` (`Toggle`, `Show`, `Hide`, `Quit`, `Ping`, `IsOpen`, `Run`, `Call`). `bin/gnomecast toggle` calls `busctl --user --auto-start=no` in ~5 ms when the daemon is warm.
- **App launching & focus.** Apps come from `Gio.DesktopAppInfo`; pressing ↵ focuses an open window via the companion extension's D-Bus window tracker or launches a new instance (`Shift+↵` always launches).
- **Empty Trash.** `gnome/lib/gnome_commands.js` explicitly calls `/usr/bin/gio trash --empty` (skipping Linuxbrew `gio` wrappers that lack GVfs modules), falling back to `Gio.File.new_for_uri('trash:///')` or safe `NOFOLLOW_SYMLINKS` deletion inside Trash.
- **Testing on the live desktop.** `tests/smoke.sh` verifies live daemon latency without typing into windows. Offline UI & hotkey window checks run against `gtk4-broadwayd` (`tests/gnome-ui-check.js`, `tests/gnome-hotkey-check.js`) with `GSETTINGS_BACKEND=memory` and isolated temp XDG dirs.

## Status

**Gnomecast (`gnomecast`)** — created & maintained by [ismeetxd](https://github.com/ismeetxd) (`https://github.com/ismeetxd/gnomecast`). GNOME app ID `dev.ismeetxd.Gnomecast`, Toggle Settings app ID `dev.ismeetxd.GnomecastSettings`, Shell extension `gnomecast@ismeetxd.dev`, CLI `gnomecast`, XDG dirs `gnomecast`. Logo assets live at `assets/logo.png` and `assets/icons/hicolor/*/apps/dev.ismeetxd.Gnomecast.png`.

**GNOME (Fedora Workstation) target: active.** Core Phases 0–1 + Super+Space toggle app + safe Empty Trash + optional Rust `flea-search` helper: working.

Works:
- **Root search** ported from ref 02 §4.2–4.6 (`core/Ranker.js`, `core/Frecency.js`, golden tests). Sections (`core/RootSearch.js`):
  - empty root: Favorites, Suggestions (frecency > 1, top 6), Commands, Applications
  - query: Results, then `Use "<q>" with…` (Google, DuckDuckGo fallbacks)
- **Providers:** apps from `Gio.DesktopAppInfo`, GNOME Workstation system actions/settings panels + safe Trash emptying (`gnome/lib/gnome_commands.js`).
- **Opening an open app [D]:** ↵ on an app focuses its most recently used window (matched by desktop id, `StartupWMClass`, or Chromium/Brave web-app URL class via `RootSearch.findAppWindow`), switching workspace if needed, and launches only when none is open. Shift+↵ ("Open New Window") always launches.
- **Ranking state:** frecency (+100 per launch, 10-day half-life) and learned search terms in `db/frecency.json`. Aliases (exact → top; duplicates rejected), favourites (`Ctrl+Shift+F`, reorder `Ctrl+Alt+↑↓`) and disabled commands live in `db/settings.json` `commands`.
- **Navigation:** pushed submenus (search within them), alias editor, back with `Esc` / `Ctrl+[` / `Backspace` on an empty query / header arrow, and `Shift+Esc` to pop to root.
- **Keyboard:** `Ctrl+K` action panel (filterable, per-row shortcuts), `↵` / `Ctrl+↵` / `Ctrl+Shift+↵` for the first three actions, `Ctrl+1`–`9`, `Ctrl+↑↓` to jump sections, `PageUp`/`PageDown`, `↑` on an empty root for search history, `Ctrl+Shift+C` copy, `Alt+Shift+D` disable, `Ctrl + / − / 0` zoom.
  - Navigation bindings (`general.navigationBindings`): `emacs` moves down with `Ctrl+N`; `vim-motions` moves with `Ctrl+J/K` and puts the action panel on **Alt+K**. Set it with `gnomecast call settings.updateGeneralSettings '{"navigationBindings":"vim-motions"}'`.
  - **Ctrl+P** opens the root dropdown (`All` / `Applications` / `Commands`).
  - **Ctrl+T** opens toast actions (`Copy Error Message` on failures, `Undo` after Disable Command). **Ctrl+Shift+K** opens the About panel for the selected row.
  - **Argument pills:** *Search Google* / *Search DuckDuckGo* take a query in a pill after the search text (`Tab` in, `Shift+Tab` out).
  - **Alerts:** Shut Down, Restart, Log Out, Empty Trash, and Delete All Entries ask first (`↵` confirms, `Esc` cancels). `gnomecast run` skips the alert.
- **Feedback:** toasts in the footer and desktop HUD notifications (`notify-send -i dev.ismeetxd.Gnomecast`) when the window closes; static footer "Loading…" appears after 500 ms of visible loading, yields to toasts, and resets on hide.
- **Window behaviour:** `escapeKeyBehavior`, `popToRootTimeout` auto-reset, `compact` mode, query clear on root launch [I], hover selection only after pointer motion.
- **Calculator** (`core/Calculator.js`, self-contained JS engine [D]; no `qalc`/`fend` dependency): two-pane card supporting arithmetic/functions, Soulver percentages (`$30 + 20%`, `20% off 50`, `50 as a % of 200`), ~250 units (`5 ft to cm`, `60 mph * 2 h`, `16px to rem`), currencies (ECB rates from `frankfurter.dev`, cached daily in `~/.cache/gnomecast/currencies.json`; disable via `"currencyRates": false` in `config.json`), dates, time zones, bases, mixed units, work time, Unix time, and **Calculator History** (`db/calculator.json`, 4096 rows / 90 days).
- **Latency:** < 100 ms D-Bus round-trip on GNOME Fedora Workstation (`tests/smoke.sh`).
- **Tests:** core, ranker, calculator, search integration and privacy coverage (`node --test tests/*.test.js`), plus GNOME GJS backend, NativeSearch, Empty Trash, and Broadway GTK4/Adw UI & hotkey checks (`gjs -m tests/gnome-*.js`).

Stubbed / not yet:
- Full in-app command-management settings window; re-enable disabled commands with Undo on the toast (`Ctrl+T`) or by editing `~/.local/share/gnomecast/db/settings.json` (delete its `enabled: false`).
- Deep links (`gnomecast://`, `raycast://`); Phase 2 / Phase 9.
- Phases 3–8 (clipboard history, snippets/expansion, `@raycast/api` extensions, window tiling layouts, file search).

Testing lesson: the query survives hide/show until `popToRootTimeout`. A live test must clear it first (`Ctrl+U`), or typed text gets appended to the old query.
