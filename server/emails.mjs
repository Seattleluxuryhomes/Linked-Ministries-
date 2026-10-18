/* emails.mjs — every email this site sends, as plain text, in one place. Each one says who sent it and why, in the first lines, and
   none is marketing: a sign-in code, an answer to a post, an invitation to a team, and a note to the stewards about a report. The
   tests read every sentence at grade 8 or under (tests/plainwords-test.mjs) and check that none sells anything. */
import { CRISIS, PRODUCT, STAY_SAFE, REPORT_REASONS } from "../public/js/pure.js";

const WHO = `${PRODUCT.name} (${PRODUCT.domain}) is a free board where ministries ask for help and offer help.`;
const NO_ADS = "We send no news and no ads.";
export const NO_VOUCH = `${PRODUCT.name} does not check or vouch for any ministry or person. The board moves no money, and Linked Ministries does not take part in what you agree on.`;

export function signInEmail(code) {
  return {
    subject: `${code} is your ${PRODUCT.name} sign-in code`,
    text: [`Your ${PRODUCT.name} sign-in code is ${code}. It works for 10 minutes.`, "",
      `Why you got this: someone typed this email address at ${PRODUCT.domain} to sign in. ${WHO}`,
      `We sent this one message because of that, and for no other reason. ${NO_ADS}`, "",
      "If you did not ask for it, ignore this message. Nobody can use the code without your inbox.", ""].join("\n"),
  };
}

export function answerEmail({ toContact, fromMinistry, place, kind, title, words, fromName, fromEmail, phone, website }) {
  return {
    subject: `${fromMinistry} ${kind === "ask" ? "can help with" : "needs"}: ${title}`,
    text: [`Hello ${toContact},`, "",
      `Why you got this: ${fromMinistry} (${place}) answered your ${kind === "ask" ? "ask" : "give"} on the ${PRODUCT.name} board.`,
      `We sent you their words for them. ${WHO}`, "",
      `Your post: "${title}"`, "",
      kind === "ask" ? "They say they can help:" : "They say they need this:", "",
      words, "",
      `To reply, write to ${fromName} at ${fromEmail}${phone ? ` or call ${phone}` : ""}.`,
      ...(website ? [`Their website: ${website}`] : []), "",
      STAY_SAFE, NO_VOUCH, CRISIS, ""].join("\n"),
  };
}

export function inviteEmail({ inviter, ministry, joinUrl }) {
  return {
    subject: `${inviter || "Someone"} added you to ${ministry} on ${PRODUCT.name}`,
    text: [`${inviter || "A lead"} added you to the team at ${ministry} on ${PRODUCT.name}.`, "",
      `Why you got this: a lead of that ministry typed your email address to ask you to join. ${WHO} ${NO_ADS}`, "",
      "Sign in with this email address to join the team:", joinUrl, "",
      "If this is not for you, ignore this message. Nothing happens unless you sign in and choose to join.", ""].join("\n"),
  };
}


export function reportEmail({ title, ministry, reason, note, reporter, url, stewardUrl }) {
  return {
    subject: `A post was reported on ${PRODUCT.name}: ${title}`,
    text: [`Why you got this: you are a steward at ${PRODUCT.name}, and a person pressed Report on a post.`, "",
      `Post: "${title}" from ${ministry}`, `Link: ${url}`, `What is wrong: ${REPORT_REASONS[reason] || reason}`,
      note ? `What they wrote: ${note}` : "They wrote nothing more.",
      reporter ? `They gave this address, so you can write back: ${reporter}` : "They gave no address.", "",
      "Nothing has been hidden. The post stays on the board until a steward closes it or keeps it.",
      `Read the report and decide here: ${stewardUrl}`, ""].join("\n"),
  };
}
