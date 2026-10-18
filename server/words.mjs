/* words.mjs — what the database's refusals say, and the few lines the founder edits (shaped on Behavioral Health's
   server/words.mjs; origin in commons.json). A refusal is a calm explanation with the next step, never an alarm.
   A screen mirrors the database's decision; it is never the mechanism. */

/* ---- THE ONE PLACE THE FOUNDER EDITS ----------------------------------------------------------------------------------------
   The line at the bottom of every page about the nonprofit corporation. When the application for 501(c)(3) recognition is
   filed, change FILING_STATUS here and nowhere else. Say only what is true on the day: no word about taxes or gifts. */
export const FILING_STATUS = "not yet filed";
export const NONPROFIT_LINE = `Linked Ministries is a Washington nonprofit corporation; its application for 501(c)(3) recognition is ${FILING_STATUS}.`;

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
