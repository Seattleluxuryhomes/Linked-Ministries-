/* mail.mjs — outbound email, with the truth told either way (adapted from Behavioral Health's; origin in commons.json).
   Email:  LEXOS_SMTP_URL (e.g. smtps://<user>:<password>@smtp.gmail.com:465) + LEXOS_MAIL_FROM
   Not configured → {sent:false, reason} and the caller says so. Never a fake "sent".
   Changes from the original: the text-message sender is gone (this site sends no texts), the default From names this
   site, and a Reply-To can be set (an answer is sent from the site's address and replied to at the answering ministry's). */

/* Timeouts, because the truth has to arrive while someone is still reading.
   Measured 2026-09-18 on a host that cannot reach smtp.gmail.com: the very
   first "create my firm" answered honestly — delivered:false, "Connection
   timeout", never a fake "sent" — but took over two minutes to say it, which
   on a first sign-in is indistinguishable from a hung app. nodemailer's own
   defaults are minutes long; it reads these three off the URL's query string
   (verified against its parser), so a paste-in URL needs no change and an
   explicit value in the URL still wins. */
const SMTP_TIMEOUTS = { connectionTimeout: 15000, greetingTimeout: 15000, socketTimeout: 30000 };

export function smtpUrlWithTimeouts(raw, env = process.env) {
  const base = Number(String(env.LEXOS_SMTP_TIMEOUT_MS || "").trim());
  const scale = Number.isFinite(base) && base > 0 ? base : 0;
  let u = null;
  try { u = new URL(raw); } catch (e) { return raw; }   /* not ours to repair; createTransport will report it */
  for (const [k, v] of Object.entries(SMTP_TIMEOUTS)) {
    if (u.searchParams.has(k)) continue;                /* whoever set it meant it */
    u.searchParams.set(k, String(scale ? (k === "socketTimeout" ? scale * 2 : scale) : v));
  }
  return u.toString();
}

let transport = null;
async function smtp() {
  if (transport !== null) return transport;
  const url = process.env.LEXOS_SMTP_URL;
  if (!url) { transport = false; return transport; }
  try {
    const nodemailer = (await import("nodemailer")).default;
    transport = nodemailer.createTransport(smtpUrlWithTimeouts(url));
  } catch (e) { console.error("smtp unavailable: LEXOS_SMTP_URL could not be read as a mail address (the value and the library's message are not printed; they can hold the password)"); transport = false; }
  return transport;
}

export const emailConfigured = () => !!process.env.LEXOS_SMTP_URL;

/* a header is one line: no line break, tab or other control character can get into a subject, whoever typed the words in it */
export const oneLine = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, " ").replace(/\s{2,}/g, " ").trim();

export async function sendEmail({ to, subject, text, replyTo, attachments }) {
  subject = oneLine(subject).slice(0, 200);
  const t = await smtp();
  if (!t) return { sent: false, reason: "LEXOS_SMTP_URL not configured" };
  try {
    const info = await t.sendMail({ from: process.env.LEXOS_MAIL_FROM || "Linked Ministries <no-reply@localhost>", to, subject, text, ...(replyTo ? { replyTo } : {}), ...(Array.isArray(attachments) && attachments.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) } : {}) });
    /* D-428: the server's message id travels back, so a desk that records "sent" only with an id can */
    return { sent: true, id: info && info.messageId ? String(info.messageId) : null };
  } catch (e) { console.error("sendEmail failed:", e.message); return { sent: false, reason: "smtp: " + e.message.slice(0, 80) }; }
}
