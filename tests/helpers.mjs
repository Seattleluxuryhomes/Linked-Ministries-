/* tests/helpers.mjs — what every test shares: a counter, a free port, a database of its own, a server of its own, a browserless
   client with a cookie jar, and a stand-in mail server (adapted from Behavioral Health's; origin in commons.json). A test never
   touches a database it did not make, and never kills a process it did not start (by PID, never by name). */
import net from "node:net";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(here, "..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ADMIN = process.env.LEXOS_PG_ADMIN_URL || "postgres://postgres:lexos-local@127.0.0.1:5432/postgres";

export function counter(name) {
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? "ok    " : "FAIL  ") + m + (c || x === undefined ? "" : " · " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400))); };
  const done = () => { console.log(`\n${name}: ${pass} pass · ${fail} fail`); return fail ? 1 : 0; };
  return { ok, done, get pass() { return pass; }, get fail() { return fail; } };
}

export const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); s.on("error", rej); });

/** a database of this test's own: LEXOS_DB_NAME if given, else linkedm_t_<name> (the run-all tool drops only linkedm_t_*) */
export async function ownDatabase(name) {
  const db = process.env.LEXOS_DB_NAME || ("linkedm_t_" + name.replace(/[^a-z0-9]/gi, "_").toLowerCase());
  if (db === "lexos") throw new Error("never the shared lexos database");
  process.env.LEXOS_DB_NAME = db;
  const { resetDatabase } = await import("../tools/db-local.mjs");
  const r = await resetDatabase({ name: db, quiet: true });
  return { name: db, url: r.url };
}

/** boot the real server (production mode unless env says test) and wait for /api/health */
export async function startServer({ url, env = {}, prod = false } = {}) {
  const port = await freePort(), base = `http://127.0.0.1:${port}`;
  const log = path.join(os.tmpdir(), `lm-server-${process.pid}-${port}.log`); fs.writeFileSync(log, "");
  const full = { ...process.env, PORT: String(port), DATABASE_URL: url, LEXOS_ENV: prod ? "production" : "test", LEXOS_PUBLIC_URL: prod ? "https://linkedm.example.up.railway.app" : base, LEXOS_DEV_CODES: prod ? "" : "1", ...env };
  if (env.LEXOS_SMTP_URL === "") delete full.LEXOS_SMTP_URL;
  const child = spawn(process.execPath, [path.join(ROOT, "server", "index.mjs")], { env: full, stdio: ["ignore", fs.openSync(log, "a"), fs.openSync(log, "a")] });
  let exited = null; child.on("exit", (c) => { exited = c; });
  let up = false;
  for (let i = 0; i < 200 && exited === null; i++) { try { const r = await fetch(base + "/api/health"); if (r.status === 200 || r.status === 503) { up = r.status === 200; break; } } catch (e) { /* not yet */ } await sleep(150); }
  return { base, port, child, log, up, exited: () => exited, logText: () => fs.readFileSync(log, "utf8"), stop: async () => { try { child.kill(); } catch (e) { /* gone */ } await sleep(100); } };
}

/** a client with its own cookie jar: what one browser is */
export function client(base, startCookie = "") {
  let cookie = startCookie;
  const call = async (method, p, body, headers = {}) => {
    const r = await fetch(base + p, { method, redirect: "manual", headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
    for (const c of sc) { const kv = c.split(";")[0]; if (/=;?$/.test(kv) || /Max-Age=0/i.test(c)) cookie = ""; else cookie = kv; }
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch (e) { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  return { get: (p, h) => call("GET", p, undefined, h), post: (p, b = {}, h) => call("POST", p, b, h), jar: () => cookie, clear: () => { cookie = ""; }, fork: () => client(base, cookie) };
}

export const codeFromLog = (logText, email) => { const lines = logText.split("\n").filter((l) => l.includes("sign-in code for " + JSON.stringify(email))); const m = /: (\d{6})/.exec(lines[lines.length - 1] || ""); return m && m[1]; };

/* ---- a stand-in mail server: a real SMTP conversation on a local port, so the server's own mail path is what is tested.
   It keeps every message it accepted. With reject:true it answers every message with a refusal (550), as a provider would. */
const qp = (s) => s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_, x) => String.fromCharCode(parseInt(x, 16)));
function parseMail(cur) {
  cur = { ...cur, data: cur.data.replace(/^\.\./gm, ".") };   /* a real server takes off the extra dot a sender puts before a line that starts with one */
  const [head, ...rest] = cur.data.split("\r\n\r\n"); const body = rest.join("\r\n\r\n");
  const hdr = (n) => { const m = new RegExp("^" + n + ":\\s*(.*(?:\\r?\\n[ \\t].*)*)", "im").exec(head); return m ? m[1].replace(/\r?\n[ \t]+/g, " ").trim() : ""; };
  const enc = /quoted-printable/i.test(head), b64 = /Content-Transfer-Encoding:\s*base64/i.test(head);
  return { from: cur.from, to: cur.to, subject: hdr("Subject"), replyTo: hdr("Reply-To"), toHeader: hdr("To"), text: b64 ? Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8") : enc ? qp(body) : body, raw: cur.data };
}
export async function smtpStandIn({ reject = false } = {}) {
  const mails = []; const sockets = new Set(); const state = { reject };
  const server = net.createServer((sock) => {
    sockets.add(sock); sock.on("close", () => sockets.delete(sock)); sock.on("error", () => {});
    let buf = "", inData = false, cur = { from: "", to: [], data: "" };
    sock.write("220 stand-in ESMTP\r\n");
    sock.on("data", (d) => {
      buf += d.toString("utf8");
      for (;;) {
        if (inData) {
          const i = buf.indexOf("\r\n.\r\n"); if (i < 0) break;
          cur.data = buf.slice(0, i); buf = buf.slice(i + 5); inData = false;
          if (state.reject) sock.write("550 5.7.1 refused by the stand-in\r\n"); else { mails.push(parseMail(cur)); sock.write("250 2.0.0 accepted as STANDIN" + mails.length + "\r\n"); }
          cur = { from: "", to: [], data: "" }; continue;
        }
        const i = buf.indexOf("\r\n"); if (i < 0) break;
        const line = buf.slice(0, i); buf = buf.slice(i + 2); const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") sock.write("250-stand-in\r\n250 8BITMIME\r\n");
        else if (cmd === "HELO" || cmd === "RSET" || cmd === "NOOP") sock.write("250 OK\r\n");
        else if (cmd === "MAIL") { cur.from = (/<([^>]*)>/.exec(line) || [])[1] || ""; sock.write("250 OK\r\n"); }
        else if (cmd === "RCPT") { cur.to.push((/<([^>]*)>/.exec(line) || [])[1] || ""); sock.write("250 OK\r\n"); }
        else if (cmd === "DATA") { inData = true; sock.write("354 go ahead\r\n"); }
        else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("502 not here\r\n");
      }
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  return {
    port, mails, refuse: (v = true) => { state.reject = v; }, url: `smtp://127.0.0.1:${port}?ignoreTLS=true`,
    last: () => mails[mails.length - 1] || null,
    codeFor: (email) => { const m = [...mails].reverse().find((x) => x.to.includes(email) && /sign-in code/.test(x.subject)); const c = m && /^(\d{6}) is your/.exec(m.subject); return c && c[1]; },
    stop: async () => { for (const s of sockets) s.destroy(); await new Promise((r) => server.close(r)); },
  };
}

/** sign a client in as an email: the code comes from the stand-in mailbox if there is one, else from the server's log */
export async function signIn(c, server, email, { smtp } = {}) {
  const s = await c.post("/api/auth/start", { to: email });
  if (s.status !== 200) throw new Error("start failed " + s.text);
  await sleep(80);
  const code = smtp ? smtp.codeFor(email) : codeFromLog(server.logText(), email);
  if (!code) throw new Error("no code for " + email);
  const v = await c.post("/api/auth/verify", { to: email, code });
  if (v.status !== 200) throw new Error("verify failed " + v.text);
  return v.json;
}

/* ---- a stand-in for the model's server (Eden): a real HTTP server on a local port that keeps every request and answers by the job in
   the system prompt, or as the test tells it to. No test spends money or reaches the internet. */
/** The stand-in's idea of the classifier: a few plain keywords, so a test can see the server put the right job to work. It answers only
    from the kinds the request offered (the schema's enum), exactly as the real model is held to, and says "none" for the rest. This is not
    the real model's judgment; it proves the server's plumbing (the offered list, the check, the mapping to a job, the name check). */
export function standInClassify(body) {
  const text = String((body && body.messages && body.messages[0] && body.messages[0].content) || "");
  const words = (text.match(/words: ([\s\S]*?)\n<\/person_input>/) || [, ""])[1];
  const offered = (((body || {}).output_config || {}).format || {}).schema.properties.kind.enum || [];
  const w = words.toLowerCase();
  let kind = /\bthank/.test(w) ? "thank_you" : /\bgrant\b/.test(w) ? "grant_letter" : /\b(give|giving|offer|offering|spare|donate)\b/.test(w) ? "give" : /\b(need|needs|ask|looking for|want)\b/.test(w) ? "ask" : "none";
  if (!offered.includes(kind)) kind = "none";
  const m = words.match(/ to ((?:[A-Z][\w']*)(?: [A-Z][\w']*)*)/);
  return { kind, name: (kind === "thank_you" || kind === "grant_letter") && m ? m[1] : "" };
}

export async function modelStandIn() {
  const seen = []; const state = { next: null, verse: "none" };
  const server = http.createServer((req, res) => {
    let b = ""; req.on("data", (d) => { b += d; });
    req.on("end", () => {
      let body = null; try { body = JSON.parse(b); } catch (e) { /* not json */ }
      seen.push({ url: req.url, headers: req.headers, body });
      const sys = (body && body.system) || "";
      const classify = /Task: choose the kind of writing/.test(sys);
      const dflt = classify ? standInClassify(body) : /Task: write the title and the words/.test(sys) ? { title: "Ten folding tables for our meal", body: "We feed about eighty neighbors every Saturday. We need ten folding tables, and we can pick them up near Seattle." }
        : /Task: write the one line/.test(sys) ? { tagline: "A hot meal every Saturday for our neighbors", about: "We serve a hot meal at noon every Saturday. Everyone is welcome here.\nOn Thursday nights we run a small youth night." }
        : { letter: "Thank you for your gift. It helps us serve meals to our neighbors." };
      const out = state.next ? state.next : { text: JSON.stringify({ verse_key: state.verse, ...dflt }) };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "stand-in", content: [{ type: "text", text: out.text }], stop_reason: out.stop || "end_turn", stop_sequence: null, usage: { input_tokens: 120, output_tokens: 45 } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, seen, state, stop: () => new Promise((r) => server.close(r)) };
}
