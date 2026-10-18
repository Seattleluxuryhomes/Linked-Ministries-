/* ratelimit-pg.mjs — rate limits and the sign-in code lockout, in Postgres (W-5).

   Replaces the in-memory limited() with rl.take (0026): a sliding window
   that survives a restart and is shared by every instance. Fails CLOSED: if
   the database cannot answer, the request is over the limit. A refused
   sign-in is the cheapest item on the severity scale; an unmetered guessing
   window is near the top.

   The only correct client address behind Railway is req.ip with
   app.set('trust proxy', 1) — never x-forwarded-for read by hand, which is
   caller-supplied and turns a per-IP limit into no limit at all. */

const ms = (n) => `${Math.max(1, Math.round(Number(n) || 0))} milliseconds`;

/* limited(key, max, windowMs) → true when this call is OVER the limit.
   Same call shape as the old in-memory function, so every caller reads the
   same; the difference is that the answer is the database's. */
export function makeLimiter(query, { bucket = "lexos", failClosed = true, log = console } = {}) {
  return async function limited(key, max = 6, windowMs = 10 * 60 * 1000) {
    const k = String(key || "unknown").slice(0, 200);
    try {
      const { rows } = await query("select rl.take($1, $2, $3, $4::interval) as ok", [bucket, k, Math.max(0, Math.floor(max)), ms(windowMs)]);
      return !(rows[0] && rows[0].ok === true);
    } catch (err) {
      log.error(`ratelimit_error bucket=${bucket} err=${JSON.stringify(String(err && (err.code || err.message) || err))}`);
      return failClosed; /* over the limit when the limiter itself is down */
    }
  };
}

/* Sign-in code lockout. After maxFail wrong codes for one identity inside
   the window, the identity is locked: the caller marks the outstanding codes
   used and a new one must be requested. Fails closed. */
export function makeCodeGate(query, { maxFail = 5, window = "15 minutes", log = console } = {}) {
  const id = (identity) => String(identity || "").slice(0, 200);
  return {
    maxFail, window,
    async lockedOut(identity) {
      try {
        const { rows } = await query("select count(*)::int as n from rl.code_failures where identity = $1 and at > now() - $2::interval", [id(identity), window]);
        return (rows[0] ? rows[0].n : 0) >= maxFail;
      } catch (err) { log.error(`code_gate_error err=${JSON.stringify(String(err && (err.code || err.message) || err))}`); return true; }
    },
    /* D-438: the address rides along so the alerting can count wrong codes per address; nothing here reads it to refuse */
    async record(identity, ip = null) {
      try { await query("insert into rl.code_failures (identity, ip) values ($1, $2)", [id(identity), ip ? String(ip).slice(0, 64) : null]); }
      catch (err) { log.error(`code_gate_record_error err=${JSON.stringify(String(err && (err.code || err.message) || err))}`); }
    },
    async clear(identity) {
      try { await query("delete from rl.code_failures where identity = $1", [id(identity)]); }
      catch (err) { log.error(`code_gate_clear_error err=${JSON.stringify(String(err && (err.code || err.message) || err))}`); }
    },
  };
}

/* req.ip is right only with trust proxy set; the warning is loud on purpose */
export function clientIp(req) {
  if (req.app && typeof req.app.get === "function" && !req.app.get("trust proxy")) console.warn("trust proxy is off — per-IP limits are meaningless");
  return String(req.ip || (req.socket && req.socket.remoteAddress) || "unknown");
}

/* call once at boot; keeps rl tables from growing without bound */
export function startReaper(query, { everyMs = 10 * 60 * 1000, log = console } = {}) {
  const tick = async () => { try { await query("select rl.reap()"); } catch (err) { log.error(`ratelimit_reap_error err=${JSON.stringify(String(err && (err.code || err.message) || err))}`); } };
  tick();
  const t = setInterval(tick, everyMs); t.unref?.();
  return () => clearInterval(t);
}
