/* Scripture on the public pages, in the King James Version (public domain), each with its chapter and verse.
   Founder, 2026-10-18: "This needs to be as biblical as possible ... feeding the unhoused and the widows." The words are the
   Bible's, quoted exactly; nothing here is ours and nothing is paraphrased. A verse is never shown without its reference, and a
   reference the file does not hold is never shown (Disciples' Authority's rule: cite chapter and verse or do not speak). */
export const VERSES = {
  gal_6_2: { ref: "Galatians 6:2", text: "Bear ye one another's burdens, and so fulfil the law of Christ." },
  acts_2_44_45: { ref: "Acts 2:44–45", text: "And all that believed were together, and had all things common; And sold their possessions and goods, and parted them to all men, as every man had need." },
  ps_68_5_6: { ref: "Psalm 68:5–6", text: "A father of the fatherless, and a judge of the widows, is God in his holy habitation. God setteth the solitary in families: he bringeth out those which are bound with chains: but the rebellious dwell in a dry land." },
  isa_58_7: { ref: "Isaiah 58:7", text: "Is it not to deal thy bread to the hungry, and that thou bring the poor that are cast out to thy house? when thou seest the naked, that thou cover him; and that thou hide not thyself from thine own flesh?" },
  cor2_9_7: { ref: "2 Corinthians 9:7", text: "Every man according as he purposeth in his heart, so let him give; not grudgingly, or of necessity: for God loveth a cheerful giver." },
  prov_19_17: { ref: "Proverbs 19:17", text: "He that hath pity upon the poor lendeth unto the LORD; and that which he hath given will he pay him again." },
  matt_25_40: { ref: "Matthew 25:40", text: "And the King shall answer and say unto them, Verily I say unto you, Inasmuch as ye have done it unto one of the least of these my brethren, ye have done it unto me." },
  jas_1_27: { ref: "James 1:27", text: "Pure religion and undefiled before God and the Father is this, To visit the fatherless and widows in their affliction, and to keep himself unspotted from the world." },
  heb_13_2: { ref: "Hebrews 13:2", text: "Be not forgetful to entertain strangers: for thereby some have entertained angels unawares." },
};
export const TRANSLATION = "KJV";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* one verse as HTML; a key the file does not hold renders nothing, never a guess */
export function verse(key, cls = "") {
  const v = VERSES[key]; if (!v) return "";
  return `<blockquote class="scripture${cls ? " " + cls : ""}"><p>${esc(v.text)}</p><cite>${esc(v.ref)} (${TRANSLATION})</cite></blockquote>`;
}
