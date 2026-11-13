const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const Paths = require("../core/Paths.js")

// Privacy invariants: histories stay private under a normal umask 022,
// with owner-only dirs (0700) and store files (0600), and no private text may reach any argv.
const root = path.join(__dirname, "..")
const mode = (p) => fs.statSync(p).mode & 0o777

function tempHome(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "gnomecast-privacy-"))
  fs.chmodSync(home, 0o755)
  t.after(() => fs.rmSync(home, { recursive: true, force: true }))
  return home
}

function runSetup(home) {
  const p = Paths.resolve((name) => ({ HOME: home, XDG_RUNTIME_DIR: home + "/run" })[name] || "")
  fs.mkdirSync(home + "/run", { mode: 0o755 })
  const files = ["settings.json", "frecency.json", "calculator.json"].map((f) => p.db + "/" + f)
  const [cmd, ...args] = Paths.setupArgv(p, files)
  const r = spawnSync("bash", ["-c", "umask 022; exec \"$@\"", "umask-022", cmd, ...args], { encoding: "utf8" })
  assert.equal(r.status, 0, r.stderr)
  return p
}

test("first start under umask 022 creates owner-only dirs and 0600 store files", (t) => {
  const p = runSetup(tempHome(t))
  for (const dir of Paths.privateRoots(p)) assert.equal(mode(dir), 0o700, dir)
  for (const dir of Paths.directoriesToCreate(p)) assert.equal(mode(dir), 0o700, dir)
  for (const f of ["settings.json", "frecency.json", "calculator.json"]) assert.equal(mode(p.db + "/" + f), 0o600, f)
})

test("an atomic save into a pre-created file keeps it private", (t) => {
  const p = runSetup(tempHome(t))
  const target = p.db + "/frecency.json"
  const temp = target + ".tmp"
  fs.writeFileSync(temp, '{"searchHistory":["secret"]}', { mode: 0o644 })
  fs.chmodSync(temp, mode(target))
  fs.renameSync(temp, target)
  assert.equal(mode(target), 0o600)
})

test("readable histories from older builds are repaired; stricter modes are kept", (t) => {
  const home = tempHome(t)
  const db = home + "/.local/share/gnomecast/db"
  fs.mkdirSync(db, { recursive: true, mode: 0o755 })
  fs.chmodSync(home + "/.local/share/gnomecast", 0o755)
  fs.writeFileSync(db + "/frecency.json", "{}", { mode: 0o644 })
  fs.writeFileSync(db + "/calculator.json", "{}", { mode: 0o644 })
  fs.writeFileSync(db + "/settings.json", "{}")
  fs.chmodSync(db + "/frecency.json", 0o644)
  fs.chmodSync(db + "/calculator.json", 0o664)
  fs.chmodSync(db + "/settings.json", 0o400)
  const p = runSetup(home)
  assert.equal(mode(p.data), 0o700)
  assert.equal(mode(p.db), 0o700)
  assert.equal(mode(db + "/frecency.json"), 0o600)
  assert.equal(mode(db + "/calculator.json"), 0o600)
  assert.equal(mode(db + "/settings.json"), 0o400)
  assert.equal(fs.readFileSync(db + "/frecency.json", "utf8"), "{}", "repair never rewrites contents")
})

test("copyText pipes copied text over stdin without placing it in wl-copy argv", (t) => {
  const platformSrc = fs.readFileSync(path.join(root, "gnome/lib/platform.js"), "utf8")
  assert.match(platformSrc, /Gio\.Subprocess\.new\(\s*\['wl-copy'\]/)
  assert.match(platformSrc, /communicate_utf8_async\(str,/)

  const home = tempHome(t)
  const log = home + "/cmdlines"
  const fake = '#!/bin/bash\ntr "\\0" " " </proc/$$/cmdline >>"$LOG"; echo >>"$LOG"\ncat >"$LOG.clipboard"\n'
  fs.writeFileSync(home + "/wl-copy", fake, { mode: 0o755 })
  const secret = "1234 * 5678 = 7006652 my private question"
  const r = spawnSync("wl-copy", [], {
    input: secret, encoding: "utf8",
    env: { ...process.env, LOG: log, PATH: home + ":" + process.env.PATH }
  })
  assert.equal(r.status, 0, r.stderr)
  assert.equal(fs.readFileSync(log + ".clipboard", "utf8"), secret)
  const cmdlines = fs.readFileSync(log, "utf8")
  assert.ok(!cmdlines.includes("private"), cmdlines)
})

test("no GNOME JS file hands clipboard text or prompts to subprocess argv", () => {
  const dirs = ["gnome", "gnome/lib", "gnome/ui", "gnome-extension/gnomecast@ismeetxd.dev"]
  const files = dirs.flatMap((d) =>
    fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".js")).map((f) => d + "/" + f)
  )
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), "utf8")
    assert.doesNotMatch(source, /\['wl-copy'\s*,/, file)
  }
})
