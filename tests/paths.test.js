const test = require("node:test")
const assert = require("node:assert/strict")
const Paths = require("../core/Paths.js")

const envOf = (vars) => (name) => vars[name] || ""

test("defaults follow the XDG base directory spec", () => {
  const p = Paths.resolve(envOf({ HOME: "/home/u", XDG_RUNTIME_DIR: "/run/user/1000" }))
  assert.equal(p.config, "/home/u/.config/gnomecast")
  assert.equal(p.configFile, "/home/u/.config/gnomecast/config.json")
  assert.equal(p.db, "/home/u/.local/share/gnomecast/db")
  assert.equal(p.extensions, "/home/u/.local/share/gnomecast/extensions")
  assert.equal(p.cache, "/home/u/.cache/gnomecast")
  assert.equal(p.logs, "/home/u/.local/state/gnomecast/logs")
  assert.equal(p.runtime, "/run/user/1000/gnomecast")
  assert.equal(p.scriptCommands, "/home/u/.config/gnomecast/script-commands")
})

test("absolute XDG overrides win, relative ones are ignored", () => {
  const p = Paths.resolve(envOf({
    HOME: "/home/u/",
    XDG_CONFIG_HOME: "/cfg/",
    XDG_DATA_HOME: "relative/data",
    XDG_STATE_HOME: "/st"
  }))
  assert.equal(p.config, "/cfg/gnomecast")
  assert.equal(p.data, "/home/u/.local/share/gnomecast")
  assert.equal(p.state, "/st/gnomecast")
})

test("missing HOME is an error", () => {
  assert.throws(() => Paths.resolve(envOf({})), /HOME is not set/)
})

test("startup creates the persistent dirs and the runtime dir", () => {
  const p = Paths.resolve(envOf({ HOME: "/h", XDG_RUNTIME_DIR: "/r" }))
  assert.deepEqual(Paths.directoriesToCreate(p), [
    "/h/.config/gnomecast", "/h/.local/share/gnomecast/db", "/h/.cache/gnomecast",
    "/h/.local/state/gnomecast/logs", "/h/.local/state/gnomecast/backups", "/r/gnomecast"
  ])
})

test("legacyMoves is empty for clean Gnomecast installs", () => {
  const p = Paths.resolve(envOf({ HOME: "/h", XDG_CONFIG_HOME: "/cfg" }))
  assert.deepEqual(Paths.legacyMoves(p), [])
})
