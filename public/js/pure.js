/* pure.js — what the server and the pages share: the name, the lists, and every sentence the pages say on their own.
   The server imports this file, the pages load it, and the tests read every sentence in WORDS at grade 8 or under.
   Nothing here touches the network or the page. Text only. */

export const PRODUCT = {
  name: "Linked Ministries",
  service: "Linked Ministries",
  domain: "linkedm.org",
  da: { name: "Disciples' Authority", url: "https://www.disciplesauthority.org" },
};

/* the founder's list. There is no money category: the board moves no money. */
export const CATEGORIES = [
  ["housing", "Housing"], ["food", "Food"], ["clothing", "Clothing"], ["transportation", "Transportation"], ["volunteers", "Volunteers"],
  ["equipment", "Equipment"], ["furniture", "Furniture"], ["teaching_training", "Teaching and training"], ["prayer", "Prayer"], ["other", "Other"],
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c[0]);
export const categoryLabel = (id) => (CATEGORIES.find((c) => c[0] === id) || [id, String(id || "")])[1];

export const KINDS = ["ask", "give"];
export const KIND = {
  ask: { label: "Ask", plural: "Asks", post: "Post an ask", button: "I can help", blurb: "A ministry needs something." },
  give: { label: "Give", plural: "Gives", post: "Post a give", button: "We need this", blurb: "A ministry has something to give." },
};

export const STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];
export const STATE_CODES = STATES.map((s) => s[0]);

/* "2026-10-18" or an ISO time -> "October 18, 2026" (the calendar day in UTC, the same on every machine) */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function dateWords(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  if (!m) return "";
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

export const CRISIS = "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988.";
export const STAY_SAFE = "Stay safe: meet in a public place, bring someone with you, and never send money.";
export const NO_MONEY = "The board moves no money between ministries. Ministries ask for and give things, time, space and skills. Linked Ministries may fund an ask from its gifts when its board says yes.";

/* what a poster reads about a post, and what a lead reads about the ministry. "On the board" only when it is. */
export const POST_STATUS = {
  draft: "A draft. Only your ministry can see it.",
  waiting: "Waiting for a person at Linked Ministries to read it.",
  public: "On the board. Other ministries can answer it.",
  closed: "Closed. It is off the board.",
};
export const MINISTRY_STATUS = {
  waiting: "Waiting for a person at Linked Ministries to read your ministry's page. Your posts stay off the board until then.",
  public: "A person at Linked Ministries read your ministry's page. It is part of the network.",
  sent_back: "A person at Linked Ministries sent your page back with a note. Change it and it goes back to be read.",
};
export const CLOSE_REASON = { met: "Met", no_longer_needed: "No longer needed", removed: "Taken down by a steward" };
/* what a person can say is wrong with a post (the Report button); a steward reads it, and nothing is hidden until a steward acts */
export const REPORT_REASONS = {
  scam: "It looks like a scam",
  money: "It asks for money",
  unsafe: "It does not look safe",
  copy: "It copies my work",
  private: "It shares private information",
  other: "Something else",
};

/* the ministry's own public page (/m/<slug>): what its lead reads about it. "Public" only when it is. */
export const PAGE_STATUS = {
  draft: "A draft. Only your ministry can see it.",
  waiting: "Waiting for a person at Linked Ministries to read it.",
  sent_back: "A person at Linked Ministries sent your page back with a note. Change it and send it again.",
  approved: "A person at Linked Ministries read your page. Anyone can see it.",
  changes_waiting: "Your page is public. Your changes are waiting for a person at Linked Ministries to read them. Until then, people see the page as it was.",
  changes_draft: "Your page is public. You have changes that are not sent yet. People see the page as it was.",
  ministry_waiting: "Your page will be public after a person at Linked Ministries reads your ministry.",
};
export const MEET_DAYS = ["Every day", "Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Weekdays", "Weekends", "First of the month", "Once a month"];
export const PAGE_LIMITS = { tagline: 140, about: 3000, meets: 8, photos: 2, photoBytes: 1572864 };

/* dollars from whole cents, the way a person reads them: 123456 -> "$1,234.56". Money is only ever whole cents; never a float. */
export function money(cents) {
  const n = BigInt(cents == null || cents === "" ? 0 : cents), neg = n < 0n, a = neg ? -n : n;
  const d = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","), c = (a % 100n).toString().padStart(2, "0");
  return `${neg ? "-" : ""}$${d}.${c}`;
}
/* "1,234.56" or "20" -> whole cents, or null when it is not an amount (more than two decimals, a sign, letters) */
export function parseCents(v) {
  const t = String(v == null ? "" : v).trim().replace(/^\$/, "").replace(/,/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(t)) return null;
  const [d, c = ""] = t.split(".");
  return Number(d) * 100 + Number((c + "00").slice(0, 2));
}

/* every sentence the pages say by themselves; the tests read all of them */
export const WORDS = {
  joinTitle: "Join the network",
  joinLead: "Type your email. We will send a six-number code. There is no password to remember.",
  sendCode: "Send me a code",
  codeSent: "A code is on its way. Type it here.",
  codeHint: "It can take a minute. Spaces and dashes are fine.",
  codeNotSent: "This site cannot send email right now, so no code was sent. Try again later.",
  codeFailed: "The message did not go out. Try again in a minute.",
  signIn: "Sign in",
  differentEmail: "Use a different email",
  signedInAs: "You are signed in as",
  signOut: "Sign out",
  stewardWelcome: "You are a steward",
  stewardWelcomeLead: "You read what is new before it goes on the network. You do not need a ministry to do that.",
  stewardOpen: "Open the page for stewards",
  alsoMinistry: "I also run a ministry",
  profileTitle: "Tell us about your ministry",
  profileLead: "A person at Linked Ministries reads this page before your ministry is on the network. This takes a few minutes.",
  profileSave: "Send my ministry to be read",
  profileThanks: "Thank you. A person at Linked Ministries will read your page. You can write your first post now. It will wait with your page.",
  invitedTitle: "You were asked to join a ministry",
  invitedJoin: "Join this ministry",
  orOwn: "Or add your own ministry",
  fieldName: "Ministry name",
  fieldCity: "City",
  fieldState: "State",
  fieldAbout: "What your ministry does",
  fieldAboutHelp: "A few plain sentences. A person reads this. Other ministries do not see it.",
  fieldWebsite: "Website (if you have one)",
  fieldContact: "Contact name",
  fieldContactEmail: "Email for answers",
  fieldContactEmailHelp: "Answers to your posts come to this address.",
  yourName: "Your name",
  publicFields: "Your ministry's name and city show on the board. If you change either one, a person reads your page again, and your posts stay off the board until then.",
  mePageTitle: "Your ministry",
  profileChange: "Change this page",
  profileSaved: "Saved.",
  postAsk: KIND.ask.post,
  postGive: KIND.give.post,
  fieldCategory: "What is it about?",
  fieldTitle: "A short title",
  fieldBody: "Your words",
  fieldBodyHelp: "Say what you need or what you can give, how much, and where. Please do not ask for money. The board moves no money.",
  fieldUntil: "Open until",
  fieldUntilHelp: "A day within the next 90 days.",
  fieldPostCity: "City",
  saveDraft: "Save as a draft",
  sendToRead: "Send to be read",
  saveChanges: "Save changes",
  draftSaved: "Saved as a draft. Only your ministry can see it.",
  sentToRead: "Sent. It is waiting for a person at Linked Ministries to read it.",
  noPosts: "You have no posts yet.",
  yourPosts: "Your posts",
  closeAsk: "Close this post",
  sentBackNote: "A person at Linked Ministries sent this back with a note",
  answersReceived: "Answers you received",
  answersSent: "Answers you sent",
  noAnswersReceived: "No one has answered yet.",
  noAnswersSent: "You have not answered a post yet.",
  teamTitle: "Your team",
  teamInvite: "Add a person by email",
  teamInviteHelp: "They sign in with that email, then choose to join your ministry.",
  teamInviteSend: "Add this person",
  teamInviteSaved: "Added. They will see it when they sign in with that email.",
  teamLeave: "Leave this ministry",
  stewardTitle: "Waiting to be read",
  stewardLead: "Nothing goes on the network until a person reads it. Approve it, or send it back with a note the poster reads.",
  stewardEmpty: "Nothing is waiting. Thank you.",
  stewardOnly: "This page is for stewards at Linked Ministries.",
  approve: "Approve",
  sendBack: "Send back",
  sendBackNote: "A note for them",
  sendBackNoteHelp: "Say what to change, in plain words.",
  stewardAdd: "Make someone a steward",
  stewardAddHelp: "They must have signed in once.",
  filterKind: "Ask or give",
  filterCategory: "What it is about",
  filterState: "State",
  filterCity: "City",
  filterSearch: "Search words",
  filterGo: "Show these",
  filterClear: "Clear",
  boardEmpty: "No posts match. Try fewer words, or clear the filters.",
  boardEmptyNone: "Nothing is on the board yet. Be the first to post.",
  answerTitle: "Your answer",
  answerWords: "Your words",
  answerWordsHelp: "Say who you are and how you can help, or what you need. Your ministry's name and your email go with it.",
  answerPhone: "Phone (if you want a call)",
  answerSend: "Send",
  answerSent: "Sent to",
  answerNeedSignIn: "Sign in to answer. It takes a minute.",
  answerNeedMinistry: "Add your ministry first. Then you can answer.",
  answerNoMail: "The network is not set up to send yet. Nothing can be sent or saved.",
  answerWait: "Your ministry has not been read yet. You can answer once a person at Linked Ministries has read it.",
  answerHowItWorks: "One email goes to the ministry. It names your ministry and has your words and your email.",
  tryAgain: "Please try again.",
  noJs: "This page needs JavaScript turned on to work.",
  emptyTitle: "This board is new",
  emptyMore: "A ministry that joins can post the first ask or give.",
  emptyFiltered: "No posts match",
  report: "Report this post",
  reportTitle: "Report this post",
  reportLead: "A steward will read your report. The post stays up until a steward acts.",
  reportWhy: "What is wrong?",
  reportChoose: "Choose one",
  reportNote: "Tell us more (if you can)",
  reportEmail: "Your email (if you want an answer)",
  reportSend: "Send report",
  reportNeedWhy: "Choose what is wrong.",
  agreeTerms: "terms",
  agreePrivacy: "privacy page",
  adultsOnly: "You must be 18 or older.",
  accountTitle: "Your account",
  accountDownload: "Download my data",
  accountDownloadHelp: "One file with what we hold about you and your ministry.",
  accountDelete: "Delete my account",
  accountSure: "Yes, delete my account and my data",
  accountKeep: "No, keep my account",
  accountWarnAlone: "You are the only person in your ministry, so the ministry leaves with you. Its posts close, its page is hidden, and its contact name and email are erased.",
  accountWarnTeam: "You will leave your ministry's team. Your sign-in, your name and your email are erased.",
  accountWarnSent: "Answers you sent lose their words in our copy. Emails that already went out cannot be taken back. This cannot be undone.",
  accountDone: "Your account is deleted. Thank you for the time you gave.",
  removedNote: "A steward closed this post",
  stewardEmptyTitle: "All read",
  reportDecideNote: "A note for the record",
  reportDecideHelp: "Say why, in plain words. If you close the post, its poster reads this note.",
  reportClose: "Close the post",
  reportKeep: "Keep the post",
  pageTitle: "Your public page",
  pageLead: "A page of your own at linkedm.org. You fill in one form. A person at Linked Ministries reads it before anyone sees it.",
  pageStart: "Make your page",
  pageEdit: "Change your page",
  pageView: "See how it looks",
  pageSave: "Save as a draft",
  pageSend: "Send to be read",
  pageSaved: "Saved as a draft. Only your ministry can see it.",
  pageSent: "Sent. It is waiting for a person at Linked Ministries to read it.",
  pageNoChange: "Nothing has changed since the page that is public.",
  pageTagline: "One line about your ministry",
  pageTaglineHelp: "Up to 140 letters. It shows under your name.",
  pageAbout: "About your ministry",
  pageAboutHelp: "Your own words. Who you are, who you serve, and how a person can help. This is public.",
  pageMeets: "When and where you meet",
  pageMeetsHelp: "Add a row for each time. Leave it empty if you do not meet.",
  pageDay: "Day",
  pageTime: "Time",
  pagePlace: "Place",
  pageAddRow: "Add a time",
  pageRemoveRow: "Remove this row",
  pageReach: "How to reach you",
  pageReachHelp: "Each one is optional. It is public. It is not your private email for answers.",
  pageEmail: "Email",
  pagePhone: "Phone",
  pageWebsite: "Website",
  pageGive: "Where gifts to your ministry go",
  pageGiveHelp: "A link you give us, to your own way of taking gifts. It shows as a Give button only when Linked Ministries has opened its giving door. Linked Ministries never touches these gifts.",
  pagePhotos: "Pictures",
  pagePhotosHelp: "One or two. A JPEG or a PNG, 1.5 MB or smaller. Where a picture was taken is taken out of it.",
  pagePhotoAdd: "Add a picture",
  pagePhotoAlt: "Say what is in the picture",
  pagePhotoRemove: "Remove this picture",
  pageVerse: "A verse for your page (optional)",
  pageVerseNone: "No verse",
  pageAddress: "Your page address",
  pageAddressHelp: "You can change it once, before your page is public. Then it stays.",
  pageAddressLocked: "This address is final.",
  pageNeedMinistryRead: "A person at Linked Ministries must read your ministry first. Then your page can go public.",
  pageNameNote: "Your ministry's name and city show on the board. If you change either one, a person reads your ministry again, and your page and posts come off the site until then.",
  stewardPages: "Pages",
  stewardPageChange: "A change to a page that is public",
  stewardPageNew: "A new page",
};
