/* eden-engine.mjs — the one file that names the model and the company behind it. Nothing a person reads (a page, a script, an email, a
   setting's help text) carries either name: tests/unit-test.mjs fails if either appears anywhere else. The model is called only from
   the server, with ANTHROPIC_API_KEY from the environment; a key is never in the repository, the log, a page or a script.
   It is one plain HTTPS request (fetch) to the Messages endpoint, not the company's SDK: the SDK pulls in a package under the
   Unlicense, and this repository ships only MIT, ISC, BSD and Apache-2.0 code (CLAUDE.md, "Copy, never rebuild"). The request is the
   documented one: POST /v1/messages with x-api-key and anthropic-version, a system string, an output_config with effort and a
   json_schema format, and the messages.
   EDEN_MODEL (optional) changes the model without a code change. ANTHROPIC_BASE_URL (optional) points the call elsewhere; the tests use
   it to point Eden at a stand-in server on this machine, so no test spends money or reaches the internet. */
export const DEFAULT_MODEL = "claude-opus-5-5";
export const API_VERSION = "2023-06-01";
export const keyIsSet = (env = process.env) => String(env.ANTHROPIC_API_KEY || "").trim().length >= 10;
export const modelName = (env = process.env) => String(env.EDEN_MODEL || "").trim() || DEFAULT_MODEL;
const baseUrl = (env) => String(env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/+$/, "");

/** An error from the model's server, carrying only its status (never its words, which could echo what a person typed). */
export class EngineError extends Error { constructor(status, kind) { super("engine " + status); this.status = status; this.kind = kind; } }
export const isAuthError = (e) => e instanceof EngineError && (e.status === 401 || e.status === 403);
export const isBusyError = (e) => e instanceof EngineError && (e.status === 429 || e.status === 529);

/** send one request; returns the parsed answer ({ content, stop_reason, usage }) or throws EngineError */
export async function createMessage(request, env = process.env, { timeoutMs = 60000 } = {}) {
  const key = String(env.ANTHROPIC_API_KEY || "").trim();
  if (!key) throw new EngineError(0, "no_key");
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let r;
  try { r = await fetch(baseUrl(env) + "/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": API_VERSION }, body: JSON.stringify(request), signal: ctl.signal }); }
  catch (e) { throw new EngineError(0, e && e.name === "AbortError" ? "timeout" : "network"); }
  finally { clearTimeout(timer); }
  if (!r.ok) { try { await r.arrayBuffer(); } catch (e) { /* the body is not kept */ } throw new EngineError(r.status, "http"); }
  let j = null; try { j = await r.json(); } catch (e) { throw new EngineError(502, "unreadable"); }
  return j;
}
