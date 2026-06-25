import test from "node:test";
import assert from "node:assert/strict";
import { extractConcepts } from "../src/memory/memory-extractor.ts";
import { createMemoryGraph, recordConcepts } from "../src/memory/memory-graph.ts";

test("extracts files, symbols, and error types from real text", () => {
  const text = "Please fix src/http/server.ts. The function forwardStream throws a TimeoutError when the upstream is slow.";
  const concepts = extractConcepts(text);
  const ids = concepts.map((c) => c.id);
  assert.ok(ids.includes("file:src/http/server.ts"), "file concept");
  assert.ok(ids.includes("symbol:forwardStream"), "symbol concept");
  assert.ok(ids.includes("error:TimeoutError"), "error concept");
});

test("ignores long opaque tokens and caps results", () => {
  const concepts = extractConcepts("token abcdefghijklmnopqrstuvwxyz0123456789.json normal class Foo");
  assert.ok(concepts.every((c) => c.label.length <= 48));
  assert.ok(concepts.length <= 8);
});

test("builds a co-occurrence graph that accumulates counts and links", () => {
  const graph = createMemoryGraph();
  recordConcepts(graph, extractConcepts("class Parser in src/parse.ts"), "t1");
  recordConcepts(graph, extractConcepts("class Parser again in src/parse.ts"), "t2");
  const parser = graph.nodes.find((n) => n.id === "symbol:Parser");
  assert.equal(parser?.count, 2, "repeated concept count grows");
  const edge = graph.edges.find((e) => e.from.includes("parse.ts") || e.to.includes("parse.ts"));
  assert.ok(edge, "co-occurring concepts are linked");
  assert.equal(graph.updatedAt, "t2");
});

test("keeps same-basename files distinct", () => {
  const concepts = extractConcepts("src/client/index.ts packages/server/index.ts");
  assert.ok(concepts.some((c) => c.id === "file:src/client/index.ts"));
  assert.ok(concepts.some((c) => c.id === "file:packages/server/index.ts"));
});

test("evicts stale low-value nodes and cleans their edges", () => {
  const graph = createMemoryGraph();
  recordConcepts(graph, extractConcepts("class Keeper src/keeper.ts"), "t1");
  recordConcepts(graph, extractConcepts("class Keeper src/keeper.ts"), "t2");
  for (let i = 0; i < 140; i++) recordConcepts(graph, extractConcepts(`class C${i} src/file-${i}.ts`), `t${i + 3}`);
  assert.ok(graph.nodes.length <= 120);
  assert.ok(graph.edges.length <= 240);
  assert.ok(graph.nodes.some((node) => node.id === "symbol:Keeper"));
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)));
});

test("empty or tiny text yields no concepts", () => {
  assert.deepEqual(extractConcepts(""), []);
  assert.deepEqual(extractConcepts("hi"), []);
});
