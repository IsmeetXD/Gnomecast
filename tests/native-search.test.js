const test = require("node:test")
const assert = require("node:assert/strict")
const F = require("../core/FleaSearch.js")
const R = require("../core/Ranker.js")

const hit = { index: 0, title: 4000000, alternate: null, subtitle: null, keyword: null }

test("protocol rejects duplicate entries and bounds, and folds native input like the ranker", () => {
  assert.throws(() => F.hits({ hits: [hit, hit] }, ["x"]), /repeats/)
  assert.throws(() => F.hits({ hits: [{ ...hit, index: 1 }] }, ["x"]), /index/)
  assert.throws(() => F.hits({ hits: [{ index: 0 }] }, ["x"]), /score/)
  assert.equal(F.entries([{ title: "Café", keywords: ["Straße"] }], R.transliterate)[0].keywords[0], "Strasse")
})

test("native scores retain exact aliases, learning, pins, alternate names and frecency", () => {
  const c = [
    { id: "long", title: "Firefox Developer Edition", type: "application" },
    { id: "short", title: "Firefox", type: "application" },
    { id: "alias", title: "Unrelated", alias: "fir", type: "application" }
  ]
  const scores = { long: { ...hit }, short: { ...hit } }
  const ids = extra => R.rank(c, "fir", { fleaHits: scores, nowMs: 1000, ...extra }).map(r => r.candidate.id)
  assert.deepEqual(ids(), ["alias", "short", "long"])
  c[0].frecency = 100
  assert.deepEqual(ids(), ["alias", "long", "short"])
  c[1].pinPriority = 1
  assert.equal(ids()[0], "short")
  delete c[1].pinPriority
  c[1].frecency = 100
  assert.equal(ids()[1], "short")
  c[0].openedAt = 1000
  c[0].searchTerms = ["fir"]
  assert.equal(ids()[1], "long")
  scores.short = { ...hit, title: null, alternate: 5000000 }
  assert.equal(R.buildRecord(c[1], "fir", { fleaHits: scores }).titleMatch, "exact")
})

test("keyword-only tiers rank exact ahead of typo while titles keep priority", () => {
  const c = [{ id: "typo", title: "Alpha", frecency: 100 }, { id: "exact", title: "Zulu", frecency: 1 }]
  const fleaHits = {
    typo: { title: null, alternate: null, subtitle: null, keyword: 999000 },
    exact: { title: null, alternate: null, subtitle: null, keyword: 5000000 }
  }
  assert.deepEqual(R.rank(c, "browser", { fleaHits }).map(r => r.candidate.id), ["exact", "typo"])
  fleaHits.typo.title = 2000001
  assert.equal(R.rank(c, "browser", { fleaHits })[0].candidate.id, "typo")
})
