/* email.mjs — what an email address may look like, in one place (the server, the boot guard and the tests read it; migrations 0005 and
   0006 hold the same rule in the database). One strict shape: letters, digits and the few marks an address may carry. A comma, a quote,
   an angle bracket, a space or a line break is refused, because the mail library reads those as a list of addresses or a display name:
   "a,victim@bank.example" used to be accepted and the message went to the second address. */
export const EMAIL_SHAPE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
export const validEmail = (e) => typeof e === "string" && EMAIL_SHAPE.test(e) && e.length <= 254;

/* the address the public pages give for notices (a takedown, a deletion by email): LEXOS_NOTICE_EMAIL if it is set and well formed,
   else the address sign-in mail comes from (LEXOS_MAIL_FROM, which production must have), else none (a test host) */
export function noticeEmail(env = process.env) {
  const one = (v) => { const s = String(v == null ? "" : v).trim(); const m = /<([^<>]+)>\s*$/.exec(s); const a = (m ? m[1] : s).trim().toLowerCase(); return validEmail(a) ? a : ""; };
  return one(env.LEXOS_NOTICE_EMAIL) || one(env.LEXOS_MAIL_FROM);
}
