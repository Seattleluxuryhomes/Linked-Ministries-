#!/usr/bin/env node
/* tools/make-front-shots.mjs — the two pictures on the front page, taken from the running app, never a stock photograph and never a mock:
   a post on the board, and a ministry's own page, each as a phone shows it (390 wide). It boots the real server on a database of its own,
   makes a sample ministry through the real API (the form, a picture, a steward who reads it), and photographs what the server sends.
   The ministry is a sample and the front page says so beside the pictures.
     LEXOS_DB_NAME=linkedm_front_shots node tools/make-front-shots.mjs     (needs a local Postgres 16 and a Chromium, as the tests do) */
import fs from "node:fs";
import path from "node:path";
import { ownDatabase, startServer, client, signIn, ROOT } from "../tests/helpers.mjs";
import { launch, open, drawPhoto } from "../tests/browser-lib.mjs";

process.env.LEXOS_DB_NAME = process.env.LEXOS_DB_NAME || "linkedm_front_shots";
const db = await ownDatabase("front_shots");
const s = await startServer({ url: db.url, env: { LEXOS_NOTICE_EMAIL: "notices@linkedm.example" } });
if (!s.up) { console.error("the server did not start"); process.exit(1); }
const { pool } = await import("../server/db.mjs");
const browser = await launch();
const lead = client(s.base), sam = client(s.base);
await signIn(lead, s, "lead@sample.example"); await signIn(sam, s, "sam@linkedm.example");
await pool.query("select lm.make_steward('sam@linkedm.example')");
await lead.post("/api/ministry", { name: "Sample Table Ministry", city: "Seattle", state: "WA", about: "A sample ministry made to show the site.", contact_name: "Sample Lead", contact_email: "lead@sample.example", website: "" });
const mid = (await lead.get("/api/me")).json.ministry.id;
const photo = await drawPhoto(browser);
const up = await fetch(s.base + "/api/page/photos?alt=" + encodeURIComponent("Tables set for a Saturday meal"), { method: "POST", headers: { "content-type": "image/jpeg", cookie: lead.jar() }, body: photo });
const pid = (await up.json()).id;
await lead.post("/api/page", { name: "Sample Table Ministry", city: "Seattle", state: "WA", tagline: "A hot meal every Saturday for our neighbors", verse: "", about: "We serve a hot meal at noon every Saturday. Everyone is welcome.\nOn Thursday nights we run a small youth night.",
  meets: [{ day: "Saturdays", time: "12:00 pm", place: "Grace Hall" }], email: "hello@sample.example", phone: "", website: "", give_url: "", photos: [{ id: pid, alt: "Tables set for a Saturday meal" }], submit: true });
await sam.post(`/api/steward/ministries/${mid}/review`, { decision: "approve" });
await sam.post(`/api/steward/pages/${mid}/review`, { decision: "approve" });
const day = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const post = await lead.post("/api/posts", { kind: "ask", category: "furniture", title: "Ten folding tables for our Saturday meal", body: "We feed about eighty neighbors every Saturday and we are short of tables. We can pick them up anywhere near Seattle.", open_until: day, submit: true });
await sam.post(`/api/steward/posts/${post.json.id}/review`, { decision: "approve" });

const out = path.join(ROOT, "public", "img");
const v = await open(browser, s.base, "phone");
await v.page.goto("/m/sample-table-ministry"); await v.page.waitForSelector(".mphoto img");
await v.page.evaluate(() => Promise.all([...document.images].map((im) => im.complete ? 0 : new Promise((r) => { im.onload = im.onerror = r; })))); await v.page.evaluate(() => document.fonts.ready); await v.page.waitForTimeout(400);
await v.page.screenshot({ path: path.join(out, "front-ministry.png"), clip: { x: 0, y: 0, width: 390, height: 700 } });
await v.page.goto("/board"); await v.page.waitForSelector("article.post"); await v.page.evaluate(() => document.fonts.ready); await v.page.waitForTimeout(400);
await v.page.locator("article.post").first().screenshot({ path: path.join(out, "front-post.png") });
await v.close(); await browser.close(); await pool.end(); await s.stop();
for (const f of ["front-ministry.png", "front-post.png"]) { const b = fs.readFileSync(path.join(out, f)); console.log(f, b.length + " bytes", b.readUInt32BE(16) + "x" + b.readUInt32BE(20)); }
