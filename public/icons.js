// Crewbrain's one icon set: plain line icons (24px grid, 2px stroke, round ends), drawn in
// currentColor so they take the color of the text around them. No emoji anywhere in the UI.

const P = {
  // People and helpers
  house: '<path d="M3 11.5L12 4l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5.5h4V20"/>',
  hardhat: '<path d="M2 18.5h20"/><path d="M4 18.5V16a8 8 0 0 1 16 0v2.5"/><path d="M10 8.3V5.5h4v2.8"/><path d="M8 16v-3M16 16v-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  helpers: '<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><circle cx="17" cy="8" r="2.5"/><path d="M16 13.5a4.5 4.5 0 0 1 5 4.5"/>',
  owner: '<path d="M4 9h16v10H4z"/><path d="M9 9V6h6v3M4 13h16"/>',
  deny: '<circle cx="12" cy="12" r="8.5"/><path d="M6 18L18 6"/>',
  company: '<path d="M4 20V8l6-4v16M10 20h10V10h-10M13 13h4M13 16h4"/>',
  // Actions
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v7h14v-7"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  qr: '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  attach: '<path d="M20.5 11.5l-8.2 8.2a5.2 5.2 0 0 1-7.4-7.4l8.6-8.6a3.5 3.5 0 0 1 5 5l-8.6 8.6a1.8 1.8 0 0 1-2.5-2.5l7.9-7.9"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  power: '<path d="M12 3v9"/><path d="M6.3 6.8a8 8 0 1 0 11.4 0"/>',
  // Messages and channels
  message: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 6.5l8.5 7 8.5-7"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
  answer: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 10.5l2 2 4-4"/>',
  // Knowledge
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8.5 7.5h7"/>',
  brain: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  source: '<path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5.5-5 4 3.5 3-2.5L20 17"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  drive: '<path d="M8.5 4h7l5 9-3.5 6h-10L3.5 13z"/><path d="M8.5 4l5 9h7M3.5 13h10l-3.5 6"/>',
  // Status
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r=".6" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".6" fill="currentColor"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.4"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
};
// Aliases: older names used across the app, and the plain words people reach for.
const ALIAS = { cam: "camera", x: "close", gmail: "mail", sms: "message", text: "message", issue: "alert", other: "company", knowledge: "book" };

export const ICON_NAMES = Object.freeze([...Object.keys(P), ...Object.keys(ALIAS)]);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** An inline SVG icon as a string. Decorative (aria-hidden) unless a `label` is given. */
export function icon(name, { size = 24, label } = {}) {
  const body = P[name] || P[ALIAS[name]];
  if (!body) return "";
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${label ? `<title>${esc(label)}</title>` : ""}${body}</svg>`;
}

// ---------- helper avatars ----------
// A helper's avatar is a key ("house" for the homeowner helper, "hardhat" for the crew helper).
// Sandboxes made before the switch may still hold the old emoji; map those at render time.
export const AVATARS = Object.freeze(["house", "hardhat"]);
const LEGACY = { "\u{1F3E1}": "house", "\u{1F3E0}": "house", "\u{1F9BA}": "hardhat", "\u{1F477}": "hardhat" };

/** Normalize any stored avatar value to a known key, or "" when unknown. */
export function avatarKey(av) {
  const v = String(av || "").replace(/\uFE0F/g, "").trim();
  if (AVATARS.includes(v)) return v;
  return LEGACY[v] || "";
}
