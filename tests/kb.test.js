// tests/kb.test.js — validates the destination knowledge base.
// Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KB_DIR = join(ROOT, "builds/relaxing-travel/data/kb");

const REQUIRED = ["key", "kind", "name", "country", "flag", "lat", "lng", "tz",
  "currency", "bestMonths", "crowd", "prices"];
const KEYS_RE = /^[a-z0-9-]+$/; // ASCII slugs only

function loadAll() {
  return readdirSync(KB_DIR).filter(f => f.endsWith(".json") && f !== "index.json")
    .map(f => ({ file: f, data: JSON.parse(readFileSync(join(KB_DIR, f), "utf8")) }));
}

test("kb directory exists", () => { assert.ok(existsSync(KB_DIR)); });

test("every entry has required fields with sane types", () => {
  for (const { file, data } of loadAll()) {
    for (const k of REQUIRED) assert.ok(data[k] !== undefined && data[k] !== "", `${file}: missing ${k}`);
    assert.ok(data.kind === "featured" || data.kind === "city", `${file}: bad kind`);
    assert.match(data.key, KEYS_RE, `${file}: key must be an ascii slug`);
    assert.ok(Number.isFinite(data.lat) && data.lat >= -90 && data.lat <= 90, `${file}: lat`);
    assert.ok(Number.isFinite(data.lng) && data.lng >= -180 && data.lng <= 180, `${file}: lng`);
    for (const [k, v] of Object.entries(data.prices)) assert.ok(Number.isFinite(v) && v >= 0, `${file}: prices.${k}`);
    if (data.visa) assert.ok(/^https?:\/\//.test(data.visa.source), `${file}: visa.source must be a URL`);
  }
});

test("keys and filenames are unique and match", () => {
  const seen = new Set();
  for (const { file, data } of loadAll()) {
    assert.ok(!seen.has(data.key), `duplicate key ${data.key}`);
    seen.add(data.key);
    assert.equal(file, `${data.key}.json`, "filename must equal <key>.json");
  }
  assert.ok(seen.size >= 26, `expected >=26 destinations, got ${seen.size}`);
});

test("generated artifacts are in sync with source JSON", () => {
  const idx = JSON.parse(readFileSync(join(KB_DIR, "index.json"), "utf8"));
  const keys = loadAll().map(e => e.data.key).sort();
  assert.deepEqual(idx.map(e => e.key).sort(), keys, "index.json keys must match kb files");
  const mod = readFileSync(join(ROOT, "builds/relaxing-travel/js/kb-data.js"), "utf8");
  for (const { data } of loadAll()) {
    assert.ok(mod.includes(`"${data.key}"`), `js/kb-data.js missing ${data.key}`);
  }
});

test("featured set is exactly the 8 planner places", () => {
  const feat = loadAll().filter(e => e.data.kind === "featured").map(e => e.data.key).sort();
  assert.deepEqual(feat,
    ["faroe", "iceland", "kyoto", "lofoten", "napali", "wadirum", "whitehaven", "yasawa"]);
});
