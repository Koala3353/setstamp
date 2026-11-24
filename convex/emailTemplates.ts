// Branded transactional email templates (DESIGN.md "Email").
//
// Pure functions, no Convex imports: unit-tested in emailTemplates.test.ts and
// rendered to docs/email-previews/ by scripts/email-previews.ts.
//
// Convex Auth v2 gives no hook for custom email content: it calls
// `mail.sendEmail` with a fixed subject and a plain-text body. `renderEmail`
// recognises each of those emails from its subject/text, keeps the link and
// expiry exactly as Convex Auth produced them, and re-renders it here. Any mail
// it does not recognise still gets the branded layout through `genericEmail`.

export type EmailContent = { subject: string; text: string; html: string };

export const APP_NAME = "Setstamp";
export const TAGLINE = "Stamp the set. Keep it for good.";

// ---------------------------------------------------------------------------
// Tokens (DESIGN.md "Email")
// ---------------------------------------------------------------------------

const C = {
  outer: "#ebe9e6",
  card: "#fcfbfa",
  cardBorder: "#d4d2cf",
  text: "#181613",
  secondary: "#4b4742",
  fine: "#5f5a55",
  orange: "#f86111",
  orangeBorder: "#a63c0c",
  ink: "#140b06",
  codeBg: "#dedcd9",
} as const;

const STENCIL = "'Big Shoulders Stencil','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const BODY = "Archivo,'Helvetica Neue',Helvetica,Arial,sans-serif";
const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@400;700&family=Big+Shoulders+Stencil:wght@800&display=swap";

const DEFAULT_FOOTER = `You got this because someone used this address on ${APP_NAME}. If it wasn't you, ignore this email.`;
const NOTICE_FOOTER = `You got this because this address belongs to a ${APP_NAME} account. We send it for every change to your sign-in details.`;

// ---------------------------------------------------------------------------
// Escaping
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only absolute http(s) URLs become links; anything else is shown as text. */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** A run of text inside a paragraph; `strong` runs are bold. */
export type Inline = string | { strong: string };
export type Paragraph = Inline[];

export type LayoutInput = {
  subject: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  heading: string;
  paragraphs: Paragraph[];
  button?: { label: string; url: string };
  /** Show the copy-this-link fallback under the button (default true). */
  fallbackLink?: boolean;
  /** Short code shown in a block (unused by Convex Auth today, kept for codes). */
  code?: string;
  /** Smaller secondary lines under the button (expiry, caveats). */
  notes?: string[];
  footer?: string;
};

const inlineHtml = (p: Paragraph) =>
  p.map((r) => (typeof r === "string" ? escapeHtml(r) : `<strong style="font-weight:700">${escapeHtml(r.strong)}</strong>`)).join("");
const inlineText = (p: Paragraph) => p.map((r) => (typeof r === "string" ? r : r.strong)).join("");

function paragraphHtml(p: Paragraph): string {
  return `<p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:24px;color:${C.text}">${inlineHtml(p)}</p>`;
}

function buttonHtml(label: string, url: string): string {
  const href = escapeHtml(url);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;border-collapse:separate">` +
    `<tr><td align="center" bgcolor="${C.orange}" style="background-color:${C.orange};border:1px solid ${C.orangeBorder};border-radius:8px;mso-padding-alt:14px 24px">` +
    `<a href="${href}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 24px;font-family:${BODY};font-size:16px;line-height:20px;font-weight:700;color:${C.ink};text-decoration:none;border-radius:8px">${escapeHtml(label)}</a>` +
    `</td></tr></table>`
  );
}

function fallbackLinkHtml(url: string): string {
  const e = escapeHtml(url);
  return (
    `<p style="margin:0 0 6px;font-family:${BODY};font-size:14px;line-height:20px;color:${C.secondary}">Button not working? Copy this link into your browser:</p>` +
    `<p style="margin:0 0 24px;font-family:${BODY};font-size:13px;line-height:20px;word-break:break-all;overflow-wrap:anywhere"><a href="${e}" target="_blank" rel="noopener" style="color:${C.text};text-decoration:underline">${e}</a></p>`
  );
}

function codeHtml(code: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr>` +
    `<td bgcolor="${C.codeBg}" style="background-color:${C.codeBg};border-radius:6px;padding:12px 20px;font-family:Archivo,Arial,sans-serif;font-size:32px;line-height:40px;font-weight:700;letter-spacing:4px;color:${C.text}">${escapeHtml(code)}</td>` +
    `</tr></table>`
  );
}

export function layout(input: LayoutInput): EmailContent {
  const footer = input.footer ?? DEFAULT_FOOTER;
  const button = input.button && isSafeUrl(input.button.url) ? input.button : undefined;

  const body = [
    ...input.paragraphs.map(paragraphHtml),
    input.code ? codeHtml(input.code) : "",
    button ? buttonHtml(button.label, button.url) : "",
    button && input.fallbackLink !== false ? fallbackLinkHtml(button.url) : "",
    ...(input.notes ?? []).map(
      (n) =>
        `<p style="margin:0 0 12px;font-family:${BODY};font-size:14px;line-height:20px;color:${C.secondary}">${escapeHtml(n)}</p>`,
    ),
  ].join("");

  // Zero-width padding keeps clients from pulling body text into the preview.
  const preheaderPad = "&#847;&zwnj;&nbsp;".repeat(40);

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${escapeHtml(input.subject)}</title>
<!--[if !mso]><!--><link href="${FONTS_URL}" rel="stylesheet"><!--<![endif]-->
<style>
:root{color-scheme:light only;supported-color-schemes:light only}
body{margin:0!important;padding:0!important;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}
a{color:${C.text}}
@media only screen and (max-width:600px){
.g-outer{padding:20px 12px!important}
.g-pad{padding:24px 20px!important}
.g-h1{font-size:28px!important}
}
</style>
<!--[if mso]><style>body,table,td,p,a,h1{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${C.outer}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${C.outer}">${escapeHtml(input.preheader)}${preheaderPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.outer}" style="background-color:${C.outer};width:100%">
<tr><td align="center" class="g-outer" style="padding:32px 16px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 4px 16px;font-family:${STENCIL};font-size:24px;line-height:1;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${C.text}">${escapeHtml(APP_NAME)}</td></tr>
<tr><td bgcolor="${C.card}" style="background-color:${C.card};border:1px solid ${C.cardBorder};border-radius:8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
<tr><td height="6" bgcolor="${C.orange}" style="height:6px;line-height:6px;font-size:6px;background-color:${C.orange};border-radius:7px 7px 0 0">&nbsp;</td></tr>
<tr><td class="g-pad" style="padding:32px">
<h1 class="g-h1" style="margin:0 0 20px;font-family:${STENCIL};font-size:32px;line-height:1;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;color:${C.text}">${escapeHtml(input.heading)}</h1>
${body}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 4px 0;font-family:${BODY};font-size:13px;line-height:20px;color:${C.fine}">${escapeHtml(footer)}</td></tr>
<tr><td style="padding:12px 4px 0;font-family:${BODY};font-size:13px;line-height:20px;color:${C.fine}"><strong style="font-weight:700;color:${C.secondary}">${escapeHtml(APP_NAME)}</strong>. ${escapeHtml(TAGLINE)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;

  const textParts: string[] = [APP_NAME.toUpperCase(), "", input.heading, ""];
  for (const p of input.paragraphs) textParts.push(inlineText(p), "");
  if (input.code) textParts.push(input.code, "");
  if (button) textParts.push(`${button.label}:`, button.url, "");
  for (const n of input.notes ?? []) textParts.push(n, "");
  textParts.push("--", footer, "", `${APP_NAME}. ${TAGLINE}`);

  return { subject: input.subject, text: textParts.join("\n"), html };
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export type LinkArgs = { link: string; ttl?: string };
export type NoticeArgs = { siteUrl?: string };

const linkNotes = (ttl: string, where: string) => [
  `The link stops working after ${ttl} and only works in the browser where you ${where}.`,
];

export function verifyEmail({ link, ttl = "1 hour" }: LinkArgs): EmailContent {
  return layout({
    subject: `Confirm your email for ${APP_NAME}`,
    preheader: `One tap to finish signing up. The link works for ${ttl}.`,
    heading: "Confirm your email",
    paragraphs: [[`Tap the button to confirm this address and finish setting up your ${APP_NAME} account.`]],
    button: { label: "Confirm email", url: link },
    notes: linkNotes(ttl, "signed up"),
  });
}

export function passwordReset({ link, ttl = "10 minutes" }: LinkArgs): EmailContent {
  return layout({
    subject: `Reset your ${APP_NAME} password`,
    preheader: `Choose a new password. The link works for ${ttl}.`,
    heading: "Reset your password",
    paragraphs: [
      [`Someone asked to reset the password of the ${APP_NAME} account that uses this address. Tap the button to choose a new one.`],
    ],
    button: { label: "Choose a new password", url: link },
    notes: linkNotes(ttl, "asked for it"),
  });
}

export function confirmEmailChange({ link, ttl = "1 hour" }: LinkArgs): EmailContent {
  return layout({
    subject: `Confirm your new email for ${APP_NAME}`,
    preheader: `Confirm this as your new ${APP_NAME} address. The link works for ${ttl}.`,
    heading: "Confirm new email",
    paragraphs: [[`Tap the button to make this the email address of your ${APP_NAME} account.`]],
    button: { label: "Confirm new email", url: link },
    notes: linkNotes(ttl, "asked for the change"),
  });
}

function noticeButton(siteUrl: string | undefined) {
  return siteUrl && isSafeUrl(siteUrl) ? { label: `Open ${APP_NAME}`, url: siteUrl } : undefined;
}

export function passwordChanged({ siteUrl }: NoticeArgs = {}): EmailContent {
  return layout({
    subject: `Your ${APP_NAME} password was changed`,
    preheader: "If this was you, there's nothing to do.",
    heading: "Password changed",
    paragraphs: [
      [`The password of your ${APP_NAME} account was just changed.`],
      [
        "If this was you, there's nothing to do. If it wasn't, reset your password now from the sign-in screen, then reply to this email.",
      ],
    ],
    button: noticeButton(siteUrl),
    fallbackLink: false,
    footer: NOTICE_FOOTER,
  });
}

export function emailChanged({ newEmail, siteUrl }: NoticeArgs & { newEmail: string }): EmailContent {
  return layout({
    subject: `Your ${APP_NAME} email address was changed`,
    preheader: `Your account now uses ${newEmail}.`,
    heading: "Email changed",
    paragraphs: [
      [`The email address of your ${APP_NAME} account was changed to `, { strong: newEmail }, "."],
      [
        "If this was you, there's nothing to do. If it wasn't, reply to this email right away so the account can be locked. A password reset would go to the new address.",
      ],
    ],
    button: noticeButton(siteUrl),
    fallbackLink: false,
    footer: NOTICE_FOOTER,
  });
}

const URL_RE = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

/** Wraps arbitrary plain text. A lone link becomes the button. */
export function genericEmail({ subject, text }: { subject: string; text: string }): EmailContent {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const urls = [...new Set(text.match(URL_RE) ?? [])];
  const single = urls.length === 1 && isSafeUrl(urls[0]) ? urls[0] : undefined;

  // HTML paragraphs: drop the block that is only the lone link (it becomes the
  // button); otherwise linkify inline.
  const htmlBlocks = blocks.filter((b) => !(single && b === single));
  const paragraphsHtml = htmlBlocks
    .map((b) => {
      let out = "";
      let last = 0;
      for (const m of b.matchAll(URL_RE)) {
        const url = m[0];
        out += escapeHtml(b.slice(last, m.index)).replace(/\n/g, "<br>");
        out += isSafeUrl(url)
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" style="color:${C.text};text-decoration:underline;word-break:break-all">${escapeHtml(url)}</a>`
          : escapeHtml(url);
        last = (m.index ?? 0) + url.length;
      }
      out += escapeHtml(b.slice(last)).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;font-family:${BODY};font-size:16px;line-height:24px;color:${C.text}">${out}</p>`;
    })
    .join("");

  const heading = subject.trim() || APP_NAME;
  const base = layout({
    subject: heading,
    preheader: (htmlBlocks[0] ?? heading).replace(/\s+/g, " ").slice(0, 120),
    heading,
    paragraphs: [],
    button: single ? { label: "Open link", url: single } : undefined,
  });
  // Insert the pre-rendered paragraphs right after the heading.
  const html = base.html.replace(/(<\/h1>\n)/, `$1${paragraphsHtml}`);
  const textOut = `${APP_NAME.toUpperCase()}\n\n${text.trim()}\n\n--\n${DEFAULT_FOOTER}\n\n${APP_NAME}. ${TAGLINE}`;
  return { subject: heading, text: textOut, html };
}

// ---------------------------------------------------------------------------
// Recognising what Convex Auth v2 sends
// ---------------------------------------------------------------------------
//
// Copy in @convex-dev/auth 2.1.0:
// - "Validate your email address" + "Open this link to validate your email
//   address:\n\n<link>\n\nThe link stops working after <ttl>, ..." for
//   sign-up and for the new address of an email change (told apart by the
//   landing path, /auth/confirm-email-change).
// - "Reset your password" + the same body shape.
// - "Your password was changed" (notice, no link).
// - "Your email address was changed" + "... was changed to <email>.\n\n..."

export type DetectedEmail =
  | { kind: "verifyEmail"; link: string; ttl?: string }
  | { kind: "confirmEmailChange"; link: string; ttl?: string }
  | { kind: "passwordReset"; link: string; ttl?: string }
  | { kind: "passwordChanged" }
  | { kind: "emailChanged"; newEmail: string }
  | { kind: "generic"; subject: string; text: string };

export function detectEmail({ subject, text }: { subject: string; text: string }): DetectedEmail {
  const s = subject.trim().toLowerCase();
  const link = text.match(URL_RE)?.[0];
  const ttl = text.match(/stops working after (\d+ (?:minutes?|hours?))/)?.[1];
  const withTtl = <T extends object>(o: T) => (ttl ? { ...o, ttl } : o);

  if (s === "validate your email address" && link && isSafeUrl(link)) {
    const path = new URL(link).pathname;
    return withTtl({ kind: path.includes("confirm-email-change") ? "confirmEmailChange" : "verifyEmail", link }) as DetectedEmail;
  }
  if (s === "reset your password" && link && isSafeUrl(link)) {
    return withTtl({ kind: "passwordReset" as const, link });
  }
  if (s === "your password was changed") return { kind: "passwordChanged" };
  if (s === "your email address was changed") {
    const newEmail = text.match(/changed to (\S+?@\S+?)\.?(?:\s|$)/)?.[1];
    if (newEmail) return { kind: "emailChanged", newEmail };
  }
  return { kind: "generic", subject, text };
}

/** Turn whatever the caller sent into the branded email. */
export function renderEmail(input: { subject: string; text: string; siteUrl?: string }): EmailContent {
  const d = detectEmail(input);
  switch (d.kind) {
    case "verifyEmail":
      return verifyEmail(d);
    case "confirmEmailChange":
      return confirmEmailChange(d);
    case "passwordReset":
      return passwordReset(d);
    case "passwordChanged":
      return passwordChanged({ siteUrl: input.siteUrl });
    case "emailChanged":
      return emailChanged({ newEmail: d.newEmail, siteUrl: input.siteUrl });
    case "generic":
      return genericEmail(d);
  }
}

/** Crude HTML → text, for callers that send only `html`. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h\d|tr|li)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
