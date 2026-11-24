// Writes one HTML preview per email template to docs/email-previews/.
//
//   node --experimental-strip-types scripts/email-previews.ts
import fs from "node:fs";
import path from "node:path";
import {
  confirmEmailChange,
  emailChanged,
  genericEmail,
  passwordChanged,
  passwordReset,
  verifyEmail,
} from "../convex/emailTemplates.ts";

const site = "https://setstamp.example";
const previews = {
  "verify-email": verifyEmail({ link: `${site}/auth/validate-email?code=PREVIEW_8f3kQ2vX9mLr7TzA1bNc4dEe6gHh0iJj`, ttl: "1 hour" }),
  "password-reset": passwordReset({ link: `${site}/auth/reset-password?code=PREVIEW_Qw7eRt5yUi3oPa1sDf9gHj2kLz4xCv6b`, ttl: "10 minutes" }),
  "confirm-email-change": confirmEmailChange({ link: `${site}/auth/confirm-email-change?code=PREVIEW_Mn8bVc6xZl4kJh2gFd0sAp9oIu7yTr5e`, ttl: "1 hour" }),
  "password-changed": passwordChanged({ siteUrl: site }),
  "email-changed": emailChanged({ newEmail: "new.address@example.com", siteUrl: site }),
  generic: genericEmail({
    subject: "Something about your account",
    text: "This is a message that has no template of its own.\n\nOpen it here:\n\nhttps://setstamp.example/somewhere?x=1",
  }),
};

const dir = path.join(import.meta.dirname, "..", "docs", "email-previews");
fs.mkdirSync(dir, { recursive: true });
for (const [name, mail] of Object.entries(previews)) {
  fs.writeFileSync(path.join(dir, `${name}.html`), mail.html);
  fs.writeFileSync(path.join(dir, `${name}.txt`), `Subject: ${mail.subject}\n\n${mail.text}\n`);
}
console.log(`wrote ${Object.keys(previews).length} previews to ${path.relative(process.cwd(), dir)}`);
