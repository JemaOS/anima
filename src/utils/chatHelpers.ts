export const EMOTICONS: Record<string, string> = {
  ":)": "😊",
  ":-)": "😊",
  ":(": "😢",
  ":-(": "😢",
  ":D": "😀",
  ":-D": "😀",
  ";)": "😉",
  ";-)": "😉",
  ":P": "😛",
  ":-P": "😛",
  ":p": "😛",
  ":-p": "😛",
  ";P": "😜",
  ";-P": "😜",
  ";p": "😜",
  ";-p": "😜",
  ":O": "😮",
  ":-O": "😮",
  ":o": "😮",
  ":-o": "😮",
  ":|": "😐",
  ":-|": "😐",
  ":/": "😕",
  ":-/": "😕",
  ":*": "😘",
  ":-*": "😘",
  "<3": "❤️",
  "</3": "💔",
  ":')": "😂",
  ":-')": "😂",
  "xD": "😆",
  "XD": "😆",
  ":3": "🐱",
  ":-3": "🐱",
  ":>": "😊",
  ":->": "😊",
  ":<": "😢",
  ":-<": "😢",
  ":@": "😠",
  ":-@": "😠",
  "D:": "😧",
  ":S": "😖",
  ":-S": "😖",
  ":s": "😖",
  ":-s": "😖",
};

// Convert text emoticons to emojis
export const convertEmoticons = (text: string): string => {
  let result = text;
  // Sort by length (longest first) to avoid partial replacements
  const sortedEmoticons = Object.keys(EMOTICONS).sort((a, b) => b.length - a.length);
  for (const emoticon of sortedEmoticons) {
    // Use regex with word boundaries to avoid replacing inside words
    const escapedEmoticon = emoticon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Improved regex: use capturing group for start boundary instead of lookbehind
    // This improves compatibility and reliability
    const regex = new RegExp(`(^|\\s)${escapedEmoticon}(?=$|\\s)`, 'g');
    result = result.replace(regex, `$1${EMOTICONS[emoticon]}`);
  }
  return result;
};