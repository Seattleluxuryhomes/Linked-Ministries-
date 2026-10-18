/* board.mjs — the public read of the board. It runs as the `anon` role (asAnon), so the database, not this file, decides that
   only a public, still-open post of a public ministry comes back, and only the columns 0004 grants. This file only asks.
   The front page, the board, a single post and the public API all come through here. */
import { asAnon } from "./db.mjs";
import { CATEGORY_IDS, STATE_CODES } from "../public/js/pure.js";

export const PAGE_SIZE = 20;

/** the filters from a query string, cleaned: an unknown value is ignored, never trusted */
export function cleanFilters(q = {}) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const s = (v, n) => String(one(v) == null ? "" : one(v)).trim().slice(0, n);
  const kind = s(q.kind, 10), category = s(q.category, 30), state = s(q.state, 2).toUpperCase();
  const page = Math.min(500, Math.max(1, parseInt(s(q.page, 5), 10) || 1));
  return {
    kind: kind === "ask" || kind === "give" ? kind : "",
    category: CATEGORY_IDS.includes(category) ? category : "",
    state: STATE_CODES.includes(state) ? state : "",
    city: s(q.city, 80),
    q: s(q.q, 120),
    page,
  };
}

const esc = (w) => w.replace(/[\\%_]/g, (c) => "\\" + c);
const COLS = `p.id, p.kind, p.category, p.title, p.body, p.city, p.state, to_char(p.open_until, 'YYYY-MM-DD') as open_until,
  to_char(p.approved_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as posted_at, m.name as ministry, m.city as ministry_city, m.state as ministry_state`;

/** public posts, newest first. Returns { posts, total, page, pages, filters } */
export async function boardQuery(input = {}, { limit = PAGE_SIZE } = {}) {
  const f = cleanFilters(input);
  const where = [], params = [];
  const add = (sql, v) => { params.push(v); const n = params.length; where.push(sql.replaceAll("$#", () => "$" + n)); };
  if (f.kind) add("p.kind = $#", f.kind);
  if (f.category) add("p.category = $#", f.category);
  if (f.state) add("p.state = $#", f.state);
  if (f.city) add("p.city ilike $# escape '\\'", esc(f.city) + "%");
  for (const w of f.q.split(/\s+/).filter(Boolean).slice(0, 6)) add("(p.title ilike $# escape '\\' or p.body ilike $# escape '\\' or m.name ilike $# escape '\\')", "%" + esc(w) + "%");
  const off = (f.page - 1) * limit;
  const rows = await asAnon(async (c) => (await c.query(
    `select ${COLS}, count(*) over()::int as total
       from lm.posts p join lm.ministries m on m.id = p.ministry_id
      ${where.length ? "where " + where.join(" and ") : ""}
      order by p.approved_at desc, p.id limit ${Number(limit)} offset ${off}`, params)).rows);
  const total = rows.length ? rows[0].total : 0;
  return { posts: rows.map(({ total: _t, ...r }) => r), total, page: f.page, pages: Math.max(1, Math.ceil(total / limit)), filters: f };
}

/** one public post by id, or null */
export async function boardPost(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""))) return null;
  return asAnon(async (c) => (await c.query(`select ${COLS} from lm.posts p join lm.ministries m on m.id = p.ministry_id where p.id = $1`, [String(id).toLowerCase()])).rows[0] || null);
}
