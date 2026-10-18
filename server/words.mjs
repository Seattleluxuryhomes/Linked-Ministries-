/* words.mjs — what the database's refusals say, and the few lines the founder edits (shaped on Behavioral Health's
   server/words.mjs; origin in commons.json). A refusal is a calm explanation with the next step, never an alarm.
   A screen mirrors the database's decision; it is never the mechanism. */

/* ---- THE ONE PLACE THE FOUNDER EDITS ----------------------------------------------------------------------------------------
   Three true-or-false facts about the corporation, and the date of one letter. A developer changes them on the day each becomes
   true, and nowhere else; every page and every receipt reads them from here.
     FORMED          true on the day the Washington Secretary of State confirms the articles
     APPLIED_501C3   true on the day the application for 501(c)(3) recognition is filed with the IRS
     IRS_LETTER_DATE the date on the IRS letter, as YYYY-MM-DD, and only when a letter has come ("" until then)
   Until IRS_LETTER_DATE is set, no page and no email says a gift is deductible, and nothing says "tax-deductible" or "write-off"
   at all. Once it is set, only the IRS's own sentence (IRS_PHRASE) says so, and a lawyer checks it against the letter. */
export const FORMED = false;
export const APPLIED_501C3 = false;
export const IRS_LETTER_DATE = "";
export const FLAGS = Object.freeze({ FORMED, APPLIED_501C3, IRS_LETTER_DATE });

/* the footer line (the founder's own sentence, with a legal name in it: the one sentence allowed over grade 8) */
export const FILING_STATUS = APPLIED_501C3 ? "filed" : "not yet filed";
export const NONPROFIT_LINE = `Linked Ministries is ${FORMED ? "a Washington nonprofit corporation" : "forming as a Washington nonprofit corporation"}; its application for 501(c)(3) recognition is ${FILING_STATUS}.`;

const MONTHS_ = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const letterDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || "")); return m ? `${MONTHS_[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : ""; };

/** the status line on /giving: what is true today about the corporation and the IRS, and no more */
export function statusLine(flags = FLAGS) {
  const body = flags.FORMED ? "Linked Ministries is a Washington nonprofit corporation." : "Linked Ministries is forming as a Washington nonprofit corporation.";
  if (flags.IRS_LETTER_DATE && letterDay(flags.IRS_LETTER_DATE)) return `${body} Linked Ministries is recognized under 501(c)(3), letter dated ${letterDay(flags.IRS_LETTER_DATE)}.`;
  if (flags.APPLIED_501C3) return `${body} Linked Ministries has applied for 501(c)(3) status.`;
  return `${body} Linked Ministries has not applied for 501(c)(3) status yet.`;
}

/** the one sentence a receipt says about the donor's gift. Before the IRS letter it says only what a receipt is. */
export function receiptStatusLine(flags = FLAGS) {
  if (flags.IRS_LETTER_DATE && letterDay(flags.IRS_LETTER_DATE)) return `Linked Ministries is recognized under 501(c)(3), letter dated ${letterDay(flags.IRS_LETTER_DATE)}. ${IRS_PHRASE}`;
  if (flags.APPLIED_501C3) return "Linked Ministries has applied for 501(c)(3) status; this receipt is a record of your gift.";
  return "Linked Ministries has not applied for 501(c)(3) status yet; this receipt is a record of your gift.";
}

/** The IRS's own sentence from its determination letter. Shown only when IRS_LETTER_DATE is set. A lawyer checks it against the letter. */
export const IRS_PHRASE = "Donors may deduct contributions to you as provided in section 170 of the Code.";

/* the database raises a short code (the message) and, for most, a hint in words; [status, words] when there is no hint */
const REFUSALS = {
  sign_in_required: [401, "Please sign in."],
  ministry_required: [409, "Add your ministry's page first. Then you can do that."],
  already_in_ministry: [409, "You are already part of a ministry. A person belongs to one ministry."],
  lead_required: [403, "Only a lead of your ministry can do that."],
  last_lead: [409, "A ministry always keeps one lead. Make someone else a lead first."],
  last_steward: [409, "Linked Ministries always keeps one steward. Make someone else a steward first."],
  steward_required: [403, "Only a steward at Linked Ministries can do that."],
  no_such_ministry: [404, "That ministry was not found."],
  no_such_post: [404, "That post was not found."],
  no_such_person: [404, "That person was not found."],
  no_such_invite: [404, "That invitation was not found, or it ran out."],
  already_on_team: [409, "That person is already on your team."],
  role_not_known: [400, "Choose lead or member."],
  not_waiting: [409, "That is not waiting to be read."],
  note_required: [422, "Write a short note so they know what to change."],
  not_a_draft: [409, "Only a draft can be sent to be read."],
  post_frozen: [409, "A post cannot be changed once it has been sent to be read. Close it and post again."],
  status_change_not_allowed: [409, "That change is not allowed."],
  reason_not_known: [400, "Choose Met or No longer needed."],
  already_closed: [409, "That post is already closed."],
  open_until_past: [422, "Choose a day that has not passed."],
  open_until_too_far: [422, "A post can stay open for 90 days at most. Choose an earlier day."],
  ministry_not_public: [409, "A person at Linked Ministries has not read the ministry's page yet."],
  post_not_open: [409, "That post is not open any more."],
  own_post: [409, "That is your own ministry's post."],
  already_answered: [409, "Your ministry already answered this post."],
  answers_are_records: [409, "An answer that was sent is a record. It is never changed or deleted."],
  email_not_readable: [400, "That email address does not look right."],
  contact_required: [400, "An email address is needed."],
  decision_not_known: [400, "Choose close the post, or keep it."],
  no_such_report: [404, "That report was not found."],
  no_such_page: [404, "That page was not found."],
  slug_taken: [409, "Another ministry has that address. Pick a different one."],
  slug_locked: [409, "The address cannot change once the page has been public."],
  slug_edited_once: [409, "The address can be changed once before the page is public. That one change is used."],
  too_many_photos: [409, "A page holds two pictures at most."],
  photo_not_found: [422, "That picture was not found. Add it again."],
};

/** Map a thrown error to { status, body } for the API. Never leaks a stack, a table name or a value. */
export function refusal(err) {
  if (err && err.status && err.words) return { status: err.status, body: { error: err.code || err.message, words: err.words } };
  const msg = String((err && err.message) || "");
  if (err && err.code === "P0001") {
    const key = msg.split(":")[0].trim();
    const known = REFUSALS[key];
    const hint = err.hint ? String(err.hint) : null;
    if (known) return { status: known[0], body: { error: key, words: hint || known[1] } };
    return { status: 422, body: { error: "refused", words: hint || "That was not accepted." } };
  }
  if (err && err.code === "42501") return { status: 403, body: { error: "not_allowed", words: "You cannot do that." } };
  if (err && err.code === "23505") return { status: 409, body: { error: "already_there", words: "That is already there." } };
  if (err && (err.code === "23514" || err.code === "22P02" || err.code === "22007" || err.code === "22008" || err.code === "22023")) return { status: 422, body: { error: "not_valid", words: "That is not in the form this page needs. Please check it." } };
  if (err && err.code === "23503") return { status: 422, body: { error: "not_found", words: "That does not exist here." } };
  if (err && err.status && err.status < 500) return { status: err.status, body: { error: err.code || msg || "refused", words: err.words || "That was not accepted." } };
  return { status: 500, body: { error: "server_error", words: "Something went wrong on our side. Nothing was changed. Try again in a minute." } };
}
