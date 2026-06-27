# Molenkopf Product Intent

Molenkopf is a local agent gateway for API and CLI based coding agents. The
product must connect OpenAI/Codex and Anthropic/Claude traffic into one local
endpoint and one local memory layer.

## Target

- Accept agent traffic from OpenAI-compatible APIs, Anthropic/Claude-compatible APIs, Codex CLI, and Claude CLI.
- Let CLI agents run locally while their prompt/context stream is still observable through the gateway.
- Reduce the real text/context that is sent upstream or into a CLI runtime.
- Show live token savings only from real transferred payloads, not placeholder counters.
- Store safe derived memory from transferred text so later turns can reuse it.
- Build an Obsidian-style graph from the transferred text and derived memory, not from generic HTTP metadata.

## Plugin Meaning

Plugins are local capabilities in the agent path, not decorative dashboard pages.
Plugins are middleware, but not all middleware can mutate traffic. Mutation
rights are explicit plugin descriptor fields and are enforced by the proxy.

- Context compression plugin: owns token reduction, before/after accounting, saved-token totals, skip reasons, and retrieval IDs for real context chunks.
- Memory/Obsidian plugin: owns the derived text memory graph, semantic nodes, links, and local store updates from real agent text.
- Provider/runtime plugins: adapt OpenAI API, Anthropic API, Codex CLI, Claude CLI, and later MCP into the same run/event contract.
- Core safety pipeline: redacts secrets and prevents raw credentials, full prompts, and full responses from leaking into UI/logs. This is not optional plugin behavior.

## UI Rules

- Empty state must say no payloads observed yet. It must not show fake token pressure.
- No unauthenticated proxy traffic graph as a product target. If attribution is
  unknown, show it only as a routing/accounting warning.
- Compression views must answer: what text entered, what was removed or represented by ID, what was sent, and how many tokens were saved.
- Graph views must answer: what concepts/entities/threads were learned from transferred text and how they relate.
- HTTP metadata graphs are diagnostics only, not the Obsidian workspace goal.

Molenkopf should adapt that pattern at the gateway/runtime boundary instead of pretending all agents are API-key-only HTTP clients.
