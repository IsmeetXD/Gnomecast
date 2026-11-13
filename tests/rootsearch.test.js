const test = require("node:test")
const assert = require("node:assert/strict")
const Ranker = require("../core/Ranker.js")
const Frecency = require("../core/Frecency.js")
const RS = require("../core/RootSearch.js")

const deps = { Ranker, Frecency }
const NOW = Date.UTC(2026, 9, 19, 12)

const apps = ["firefox", "chromium", "signal-desktop", "org.gnome.Nautilus", "Alacritty", "libreoffice-writer"].map((id) => ({
  id,
  name: { firefox: "Firefox", chromium: "Chromium", "signal-desktop": "Signal", "org.gnome.Nautilus": "Files", Alacritty: "Alacritty", "libreoffice-writer": "LibreOffice Writer" }[id],
  genericName: { firefox: "Web Browser", chromium: "Web Browser", "org.gnome.Nautilus": "File Manager" }[id] || "",
  keywords: [],
  icon: id
}))

const commands = [
  {
    id: "gnome:system.lock",
    type: "command",
    kind: "gnome-action",
    title: "Lock Screen",
    subtitle: "System",
    keywords: ["lock"],
    typeLabel: "Command",
    action: "loginctl lock-session",
    rootSearch: { when: "always" }
  },
  {
    id: "gnome:system.shutdown",
    type: "command",
    kind: "gnome-action",
    title: "Shut Down",
    subtitle: "System",
    keywords: ["poweroff", "shutdown"],
    typeLabel: "Command",
    action: "systemctl poweroff",
    rootSearch: { when: "always" }
  },
  {
    id: "gnome:settings",
    type: "command",
    kind: "gnome-menu",
    title: "GNOME Settings Panels",
    subtitle: "System",
    keywords: ["settings", "preferences"],
    typeLabel: "Menu",
    menuId: "gnome:settings",
    rootSearch: { when: "always" }
  },
  {
    id: "gnome:settings.gnome-display-panel",
    type: "command",
    kind: "gnome-action",
    title: "Displays",
    subtitle: "Settings",
    keywords: ["monitor", "resolution"],
    typeLabel: "Settings",
    action: "gnome-control-center display",
    rootSearch: { when: "searching" }
  }
]

function candidates() {
  return apps.map(RS.appCandidate)
    .concat(commands)
    .concat(RS.BUILTINS.map(RS.builtinCandidate))
}

function ctx(extra) {
  return Object.assign({ commands: {}, frecency: {}, nowMs: NOW, sensitivity: "medium" }, extra || {})
}

const titles = (section) => section.rows.map((r) => r.candidate.title)
const results = (query, c) => RS.rootSections(candidates(), query, c || ctx(), deps)

test("fir finds Firefox first", () => {
  const sections = results("fir")
  assert.equal(sections[0].id, "results")
  assert.equal(titles(sections[0])[0], "Firefox")
})

test("a query always ends with the fallback section", () => {
  const sections = results("zzzz-nothing")
  assert.equal(sections.length, 1)
  assert.equal(sections[0].id, "fallback-commands")
  assert.equal(sections[0].title, "Use “zzzz-nothing” with…")
  assert.deepEqual(titles(sections[0]), ["Search Google", "Search DuckDuckGo"])
})

test("an exact alias puts its command on top", () => {
  const c = ctx({ commands: { "app:chromium": { alias: "ff" } } })
  assert.equal(titles(results("ff", c)[0])[0], "Chromium")
  assert.equal(titles(results("f", c)[0])[0], "Chromium", "an alias prefix also wins over title scores")
})

test("launching bumps frecency and teaches the query", () => {
  const before = titles(results("web")[0])
  assert.deepEqual(before.slice(0, 2), ["Chromium", "Firefox"])
  const visit = Frecency.recordVisit(null, NOW - 1000, "web")
  const c = ctx({ frecency: { "app:firefox": visit } })
  assert.deepEqual(titles(results("web", c)[0]).slice(0, 2), ["Firefox", "Chromium"])
})

test("deep GNOME settings panels only appear while searching", () => {
  const empty = results("")
  const all = empty.flatMap((s) => s.rows.map((r) => r.candidate.title))
  assert.ok(all.includes("Lock Screen") && all.includes("GNOME Settings Panels"))
  assert.ok(!all.includes("Displays"))
  const displays = results("displays")[0].rows[0].candidate
  assert.equal(displays.title, "Displays")
  assert.equal(displays.subtitle, "Settings")
  assert.equal(displays.kind, "gnome-action")
})

test("empty root: favorites, suggestions, commands, applications", () => {
  const c = ctx({
    commands: { "gnome:system.lock": { favoriteOrder: 0 } },
    frecency: { "app:signal-desktop": Frecency.recordVisit(null, NOW - 1000, "") }
  })
  const sections = results("", c)
  assert.deepEqual(sections.map((s) => s.id), ["favorites", "suggestions", "commands", "apps"])
  assert.deepEqual(titles(sections[0]), ["Lock Screen"])
  assert.deepEqual(titles(sections[1]), ["Signal"])
  assert.ok(!titles(sections[3]).includes("Signal"), "suggested apps are not repeated")
})

test("disabled commands are left out", () => {
  const off = results("signal", ctx({ commands: { "app:signal-desktop": { enabled: false } } }))
  assert.ok(!off.some((s) => s.id === "results" && titles(s).includes("Signal")))
})

test("a submenu lists its children, and searches its descendants", () => {
  const children = RS.submenuSections(candidates(), "gnome:settings", "", ctx(), deps)
  assert.deepEqual(titles(children[0]), ["Displays"])
  const found = RS.submenuSections(candidates(), "gnome:settings", "disp", ctx(), deps)
  assert.deepEqual(titles(found[0]), ["Displays"])
})

test("actions: primary first, favourites and alias offered", () => {
  const app = RS.decorate(RS.appCandidate(apps[0]), ctx(), deps)
  const ids = RS.actionsFor(app).map((a) => a.id)
  assert.equal(ids[0], "open")
  assert.ok(ids.includes("favorite-add") && ids.includes("set-alias") && ids.includes("copy-id"))
  const cmdItem = RS.decorate(candidates().find((c) => c.id === "gnome:system.lock"), ctx(), deps)
  assert.deepEqual(RS.actionsFor(cmdItem).slice(0, 2).map((a) => a.id), ["open", "copy-command"])
})

test("favourite reordering", () => {
  const cmds = { a: { favoriteOrder: 0 }, b: { favoriteOrder: 1 }, c: {} }
  assert.deepEqual(RS.reorderFavorites(cmds, "c", "favorite-add"), { a: 0, b: 1, c: 2 })
  assert.deepEqual(RS.reorderFavorites(cmds, "b", "favorite-up"), { b: 0, a: 1 })
  assert.deepEqual(RS.reorderFavorites(cmds, "a", "favorite-remove"), { a: null, b: 0 })
})

test("fallback URLs encode the query", () => {
  assert.equal(RS.fallbackUrl(RS.FALLBACKS[0], " a&b c "), "https://www.google.com/search?q=a%26b%20c")
})

test("web searches take an inline argument", () => {
  const google = results("google")[0].rows[0].candidate
  assert.equal(google.id, "builtin:google-search")
  assert.deepEqual(google.arguments.map((a) => a.name), ["query"])
  assert.equal(RS.missingArgument(google.arguments, {}), 0)
  assert.equal(RS.missingArgument(google.arguments, { query: " a b " }), -1)
  assert.equal(RS.fillArguments(google.run.url, { query: " a&b " }), "https://www.google.com/search?q=a%26b")
  assert.equal(results("ddg")[0].rows[0].candidate.id, "builtin:duckduckgo-search")
})

test("the root filter narrows by type and drops calculator and fallbacks", () => {
  const appsOnly = results("", ctx({ filter: "applications" }))
  assert.deepEqual(appsOnly.map((s) => s.id), ["apps"])
  const cmdsOnly = results("lock", ctx({ filter: "commands", calculation: { result: "1" } }))
  assert.ok(cmdsOnly.every((s) => s.id === "results"))
  assert.ok(cmdsOnly[0].rows.every((r) => r.candidate.type === "command"))
  assert.deepEqual(RS.FILTERS.map((f) => f.id), ["all", "applications", "commands"])
})

test("power commands, empty-trash and delete-all ask for confirmation", () => {
  assert.equal(RS.confirmationFor("gnome:system.shutdown", "open").primary, "Shut Down")
  assert.equal(RS.confirmationFor("gnome:system.empty-trash", "open").primary, "Empty Trash")
  assert.equal(RS.confirmationFor("gnome:system.shutdown", "copy-command"), null)
  assert.equal(RS.confirmationFor("gnome:system.lock", "open"), null)
  assert.ok(RS.confirmationFor("calculator-history:x", "delete-all-entries").destructive)
})

test("the about panel describes a row", () => {
  const lock = results("lock")[0].rows[0].candidate
  const about = Object.fromEntries(RS.aboutFor(lock, NOW).map((r) => [r.label, r.value]))
  assert.equal(about.Command, "loginctl lock-session")
  assert.equal(about.ID, "gnome:system.lock")
  assert.equal(about.Location, "System")
  const calc = RS.aboutFor({ kind: "calculator", calcInput: "2+2", calcResult: "4", calcResultCaption: "Four" }, NOW)
  assert.deepEqual(calc.map((r) => r.label), ["Question", "Answer", "Type"])
})

test("app windows: keys from desktop id, StartupWMClass and web app URL", () => {
  assert.deepEqual(RS.appWindowKeys({ id: "sublime_text", startupClass: "subl" }), ["sublime_text", "subl"])
  assert.deepEqual(RS.appWindowKeys({ id: "WhatsApp", execString: '/home/u/.local/bin/chrome-webapp "https://web.whatsapp.com/"' }), ["whatsapp", "webapp:web.whatsapp.com"])
  assert.deepEqual(RS.appWindowKeys({ id: "Chat", command: ["xdg-open", "--app=https://app.parlichat.com/chats"] }), ["chat", "webapp:app.parlichat.com/chats"])
  assert.deepEqual(RS.windowClassKeys("chrome-discord.com__channels_@me-Profile_1"), ["chrome-discord.com__channels_@me-profile_1", "webapp:discord.com/channels/@me"])
  assert.deepEqual(RS.appWindowKeys({ id: "firefox", execString: "firefox https://example.com" }), ["firefox"])
  assert.deepEqual(RS.windowClassKeys("chrome-web.whatsapp.com__-Default"), ["chrome-web.whatsapp.com__-default", "webapp:web.whatsapp.com"])
  assert.deepEqual(RS.windowClassKeys("brave-app.parlichat.com__chats-Default"), ["brave-app.parlichat.com__chats-default", "webapp:app.parlichat.com/chats"])
})

test("app windows: picks the most recently focused mapped window", () => {
  const clients = [
    { class: "firefox", address: "0xa", focusHistoryID: 3, mapped: true },
    { class: "Firefox", address: "0xb", focusHistoryID: 1, mapped: true },
    { class: "firefox", address: "0xc", focusHistoryID: 0, mapped: false },
    { class: "chrome-web.whatsapp.com__-Default", address: "0xd", focusHistoryID: 2, mapped: true }
  ]
  assert.equal(RS.findAppWindow(clients, ["firefox"]), "0xb")
  assert.equal(RS.findAppWindow(clients, ["whatsapp", "webapp:web.whatsapp.com"]), "0xd")
  assert.equal(RS.findAppWindow(clients, ["signal-desktop"]), "")
  assert.equal(RS.findAppWindow(clients, []), "")
})

test("actions: apps offer Open New Window on Shift+Enter", () => {
  const app = RS.decorate(RS.appCandidate(apps[0]), ctx(), deps)
  const openNew = RS.actionsFor(app).find((a) => a.id === "open-new")
  assert.equal(openNew.shortcut, "Shift ↵")
})
