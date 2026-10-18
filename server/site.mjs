/* site.mjs — what the public pages read besides the board: a ministry's page, its pictures and, later, the giving record. Every
   read runs as the `anon` role (asAnon), so the database, not this file, decides what is public: a page is returned only while it
   has a copy a steward read and its ministry is public, and a picture only while that copy names it. */
import { asAnon, asUser } from "./db.mjs";

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** the public page at /m/<slug>, or null */
export async function publicPage(slug) {
  const s = String(slug || "").toLowerCase();
  if (!SLUG.test(s) || s.length > 60) return null;
  return asAnon(async (c) => (await c.query("select lm.page_public($1) as p", [s])).rows[0].p);
}
/** the addresses of every public page, newest first (for the sitemap) */
export const publicPageList = () => asAnon(async (c) => (await c.query("select lm.page_list_public() as l")).rows[0].l);

/** a picture for whoever may see it: the public first, then the signed-in person (their own ministry's, or a steward's reading) */
export async function photo(id, userId) {
  if (!UUID.test(String(id || ""))) return null;
  const pub = await asAnon(async (c) => (await c.query("select content_type, bytes, is_public from lm.photo_get($1)", [id])).rows[0] || null);
  if (pub) return pub;
  if (!userId) return null;
  return asUser(userId, async (c) => (await c.query("select content_type, bytes, is_public from lm.photo_get($1)", [id])).rows[0] || null);
}

/** the signed-in person's own page (a preview of the draft at /m/<slug> for its ministry's people) */
export const myPage = (userId) => asUser(userId, async (c) => (await c.query("select lm.page_mine() as p")).rows[0].p);
