/* legal.mjs — the words of /terms and /privacy, as data, in plain words (grade 8 or under: tests/plainwords-test.mjs reads every
   paragraph). These two pages are DRAFTS that a lawyer has not read, and they say so at the top. They claim nothing the product does
   not do: no tax words, no status the corporation does not have yet, no promise that an ask is met, no name of another company.
   {notice} stands for the address the site gives for notices (lib/email.mjs noticeEmail). Each section is [heading, [paragraph or
   ["list", item, item ...]]]. */
export const LAST_CHANGED = "2026-10-18";
export const DRAFT_LINE = "Draft. A lawyer has not read this yet.";

export const TERMS = {
  title: "Terms of use",
  lead: "These are the rules for using the Linked Ministries board. They are short. Please read them.",
  sections: [
    ["What Linked Ministries is", [
      "Linked Ministries is a free board. A ministry posts what it needs, or what it can give. Another ministry answers.",
      "Linked Ministries is forming as a Washington nonprofit corporation. A small group of people, called stewards, runs it.",
    ]],
    ["Who can use it", [
      "This site is for ministries and for adults. You must be 18 or older to join, to post, or to answer. No one under 18 may post.",
      "When you join, you say that you are 18 or older. You also say that you may speak for your ministry.",
    ]],
    ["What we do and what we do not do", [
      "A steward reads each new ministry page and each new post before it goes on the board. That is all a steward does.",
      "We do not check or vouch for any ministry or person on the board. We cannot know that what is posted is true.",
      "The board moves no money between ministries. No ministry pays another through this site. Linked Ministries may take gifts. Its board may use them to fund an ask. Each grant is written down and made public. We do not promise that any ask will be met, or that any give will be taken.",
      "What two ministries agree on is between them. Linked Ministries is not part of it.",
      "We do not give legal, medical or counseling advice.",
    ]],
    ["Your part", [
      "Post only what is true, and only what you may share. Do not ask for money.",
      "Do not post anything that breaks the law, that tricks people, or that could hurt someone.",
      "You answer for what you post. You also answer for how you act when you meet or work with another ministry.",
      "Stay safe: meet in a public place, bring someone with you, and never send money to someone you have not met.",
      "If someone is in danger, call 911. If someone is thinking of hurting themselves, call or text 988.",
    ]],
    ["What stewards can do", [
      "A steward can send a page or a post back, close a post, or end an account. A steward may do this when these rules are broken, or to keep people safe.",
      "We will say why when we can.",
    ]],
    ["Reports", [
      "Anyone can press Report on a post. The report goes to the stewards by email.",
      "Nothing is hidden when a report comes in. A steward reads it, and then closes the post or keeps it.",
    ]],
    ["Your words, and the work of others", [
      "Your words stay yours. When you post, you let Linked Ministries show them on this site. You also let us send them by email to the ministries that answer.",
      "Do not post words, pictures or other work that belong to someone else, unless they said you may.",
    ]],
    ["Copyright and takedown", [
      "If you think a post copies your work, write to {notice}.",
      ["list",
        "Tell us your name, and how to reach you.",
        "Tell us what was copied, and send the link to the post.",
        "Say that you believe in good faith that the post is not allowed.",
        "Say that what you wrote is true. Then sign it with your name."],
      "We read every notice. We may close the post while we look. We tell the person who posted.",
    ]],
    ["Ending your account", [
      "You can delete your account at any time. Sign in, open My ministry, and press Delete my account. Or write to {notice}.",
      "The privacy page says what that removes.",
    ]],
    ["No promises", [
      "The board is given as it is. It may be down, or it may have mistakes. We do not promise that it will always work.",
      "As far as the law allows, we are not to blame for what a ministry or a person posts or does.",
      "These rules follow the laws of the State of Washington.",
    ]],
    ["Changes", [
      "We may change these rules. The date at the top says when. If you keep using the board, you agree to the new rules.",
    ]],
    ["Write to us", ["Write to {notice}."]],
  ],
};

export const PRIVACY = {
  title: "Privacy",
  lead: "This page says what Linked Ministries keeps about you, who can see it, and how to take it away.",
  sections: [
    ["What we keep", [
      ["list",
        "Your email address and your name.",
        "Your ministry's page: its name, city, state, what it does, its website, and a contact name and email.",
        "Your posts, with the drafts.",
        "Answers you send and get: the words, a phone number if you add one, and the reply email.",
        "A sign-in code, kept for 10 minutes and stored scrambled. A sign-in record, kept for 30 days.",
        "A short record of who did what, and when. It holds names and ids. It never holds the words you wrote.",
        "Reports: what the person chose, what they wrote, and their email if they gave one."],
    ]],
    ["Who can see what", [
      "Anyone can see a public post. They see its title, its words, and its city and dates. They also see your ministry's name and city.",
      "Your ministry's contact email is never on the board. We use it to send you answers by email, and for nothing else.",
      "When you answer a post, the ministry that posted gets one email. It has your ministry's name, your name, your words, your email, and your phone if you add one.",
      "Stewards can see ministry pages, posts that wait to be read, and reports. They need this to do their work.",
      "Another ministry cannot see your drafts, your team, or answers it was not part of.",
    ]],
    ["Email we send", [
      "We send sign-in codes, answers, invitations to join a team, and notes to stewards. We send no news and no ads.",
    ]],
    ["What we do not do", [
      "We do not track you. We do not sell or rent your data. We show no ads. We do not share your data with advertisers.",
      "This site sets one cookie, and only when you sign in. It keeps you signed in. We use no other cookie.",
    ]],
    ["Where it is kept", [
      "We rent a database from a hosting company, and your data is kept there. Email goes out through an email company. They touch your data only to do that work.",
    ]],
    ["How long we keep it", [
      "We keep your data until you delete your account, or ask us to. Old sign-in codes and old sign-in records are removed on their own.",
    ]],
    ["Take a copy", [
      "Sign in, open My ministry, and press Download my data. You get one file with what we hold about you and your ministry.",
    ]],
    ["Delete your account and your data", [
      "Sign in, open My ministry, and press Delete my account. Or write to {notice}, and we will do it.",
      ["list",
        "Your sign-in is erased: your email, your name, and your sign-ins.",
        "If you are the only person in your ministry, the ministry leaves with you. Its posts close, and its page is hidden. Its contact name and email are erased, and so are the words of its answers.",
        "If others are on your team, you only leave the team. A lead must name another lead first.",
        "Answers you sent lose their words, phone and email in our copy. We cannot take back an email that was already sent.",
        "The record of what you did stays, with your name taken off. It says: A person who left.",
        "The last steward cannot delete an account. Another steward must be named first."],
    ]],
    ["Children", [
      "This site is not for anyone under 18. We do not mean to collect data from anyone under 18. If we find that we have, we will delete it.",
    ]],
    ["Changes", ["We may change this page. The date at the top says when."]],
    ["Write to us", ["Write to {notice}."]],
  ],
};
