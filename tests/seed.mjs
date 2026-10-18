/* tests/seed.mjs — a small, made-up network built through the real API, the way people would build it: four ministries, a steward
   (set by SQL), and posts in every state. The light test and the browser test paint it. Nothing here is on any real host. */
import { client, signIn, sleep } from "./helpers.mjs";

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
export const MINISTRIES = [
  { who: "alex@alpha.example", name: "Alpha Table Ministry", city: "Seattle", state: "WA", about: "We serve a hot meal every Saturday and run a small youth night.", contact: "Alex Rivera" },
  { who: "blake@bravo.example", name: "Bravo House Ministry", city: "Spokane", state: "WA", about: "We run a recovery house for men and a Tuesday supper for the neighborhood.", contact: "Blake Turner" },
  { who: "gina@gamma.example", name: "Gamma Outreach", city: "Tacoma", state: "WA", about: "We run a food bank and a clothing closet on Saturdays.", contact: "Gina Flores" },
  { who: "dev@delta.example", name: "Delta Fellowship", city: "Portland", state: "OR", about: "We teach small groups to study the Bible and to lead others.", contact: "Dev Patel" },
];
export const POSTS = [
  ["alex@alpha.example", { kind: "ask", category: "furniture", title: "Ten folding tables for our Saturday meal", body: "We feed about eighty neighbors every Saturday and we are short of tables. We can pick them up anywhere near Seattle.", open_until: day(30) }],
  ["alex@alpha.example", { kind: "give", category: "food", title: "Surplus canned goods, forty cases", body: "A grocer gave us more cans than we can store. Come and get what you can use. Pickup in Seattle.", open_until: day(20) }],
  ["blake@bravo.example", { kind: "ask", category: "transportation", title: "A 15-passenger van on weekends", body: "We need to bring men to church and to meetings. We would borrow a van from Friday night to Sunday night.", open_until: day(45) }],
  ["blake@bravo.example", { kind: "ask", category: "volunteers", title: "Two cooks for our Tuesday supper", body: "Our supper feeds fifty people. We need two people who can cook for a crowd, from three to seven in the evening.", open_until: day(60) }],
  ["gina@gamma.example", { kind: "give", category: "clothing", title: "Gently used winter coats", body: "We have about sixty coats in all sizes. We will hand them to any ministry that will give them out for free.", open_until: day(25) }],
  ["gina@gamma.example", { kind: "ask", category: "housing", title: "Two beds for a men's recovery house", body: "Two twin beds with frames, in good shape, for a new house that opens next month in Tacoma.", open_until: day(35) }],
  ["dev@delta.example", { kind: "give", category: "teaching_training", title: "Free training for small group leaders", body: "A four-week class on how to lead a Bible study. We can teach online, or visit your church in Oregon or Washington.", open_until: day(50) }],
  ["dev@delta.example", { kind: "ask", category: "prayer", title: "Prayer partners for our youth night", body: "We want three people to pray for our youth night each Thursday, at home or at the church.", open_until: day(40) }],
];

/** builds the network; returns { clients by email, ids, sam } */
export async function seedWorld({ base, smtp, sql }) {
  const c = {};
  for (const m of MINISTRIES) {
    c[m.who] = client(base);
    await signIn(c[m.who], null, m.who, { smtp });
    const r = await c[m.who].post("/api/ministry", { name: m.name, city: m.city, state: m.state, about: m.about, contact_name: m.contact, contact_email: m.who, website: "" });
    if (r.status !== 201) throw new Error("ministry failed " + r.text);
  }
  const sam = client(base); await signIn(sam, null, "sam@linkedm.example", { smtp });
  await sql("select lm.make_steward('sam@linkedm.example')");
  for (const m of MINISTRIES) { const id = (await c[m.who].get("/api/me")).json.ministry.id; const r = await sam.post(`/api/steward/ministries/${id}/review`, { decision: "approve" }); if (r.status !== 200) throw new Error("approve ministry failed " + r.text); }
  const ids = {};
  for (const [who, p] of POSTS) {
    const r = await c[who].post("/api/posts", { ...p, submit: true }); if (r.status !== 201) throw new Error("post failed " + r.text);
    const a = await sam.post(`/api/steward/posts/${r.json.id}/review`, { decision: "approve" }); if (a.status !== 200) throw new Error("approve post failed " + a.text);
    ids[p.title] = r.json.id; await sleep(15);
  }
  return { c, sam, ids, base };
}

/** states a ministry's own page needs to show: a draft, a waiting post, a post sent back, a closed one, and an answer received */
export async function seedAlexExtras({ world, smtp }) {
  const { c, sam, ids } = world; const alex = c["alex@alpha.example"], blake = c["blake@bravo.example"];
  const mk = async (p, submit) => (await alex.post("/api/posts", { ...p, submit })).json.id;
  const draft = await mk({ kind: "give", category: "equipment", title: "A used sound system", body: "A small sound system with two speakers and a stand. It works well.", open_until: day(30) }, false);
  const waiting = await mk({ kind: "ask", category: "volunteers", title: "Greeters for our Saturday meal", body: "We want four people to greet and seat guests, from noon to two.", open_until: day(30) }, true);
  const back = await mk({ kind: "ask", category: "other", title: "Help", body: "We need help with a thing at our building soon.", open_until: day(30) }, true);
  await sam.post(`/api/steward/posts/${back}/review`, { decision: "send_back", note: "Please say what kind of help and where." });
  const closed = await mk({ kind: "give", category: "clothing", title: "Baby clothes, sizes newborn to two", body: "Two boxes of baby clothes in very good shape. Free to any ministry.", open_until: day(10) }, true);
  await sam.post(`/api/steward/posts/${closed}/review`, { decision: "approve" });
  await alex.post(`/api/posts/${closed}/close`, { reason: "met" });
  const r = await blake.post(`/api/posts/${ids["Ten folding tables for our Saturday meal"]}/answer`, { words: "We have eleven folding tables and a truck. We can bring them on Friday.", phone: "509-555-0142" });
  if (r.status !== 201) throw new Error("seed answer failed " + r.text);
  /* a ministry nobody has read yet, with a post waiting: the steward's queue has something in it */
  const erin = client(world.base); await signIn(erin, null, "erin@echo.example", { smtp });
  await erin.post("/api/ministry", { name: "Echo Fellowship", city: "Olympia", state: "WA", about: "We run a Wednesday supper and a clothing swap for neighbors in need.", contact_name: "Erin Walsh", contact_email: "erin@echo.example", website: "https://echo.example.org" });
  await erin.post("/api/posts", { kind: "ask", category: "equipment", title: "A commercial coffee maker", body: "Our Wednesday supper serves sixty people and our old coffee maker has failed.", open_until: day(30), submit: true });
  return { draft, waiting, back, closed, erin };
}
