/**
 * Setstamp mail relay — Google Apps Script web app.
 *
 * Receives POST JSON {to, subject, text, html, secret} from the Convex action
 * convex/mail.ts:deliver and sends it from the Gmail account that owns this script.
 *
 * Setup (done once):
 *   1. Project Settings → Script Properties → add MAIL_SECRET = <same value as Convex MAIL_WEBHOOK_SECRET>.
 *   2. Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 *   3. Put the /exec URL in Convex: npx convex env set MAIL_WEBHOOK_URL <url>
 *
 * Security: the URL is public, so every request must carry the shared secret.
 * Only short transactional mail with a single recipient is accepted, and a daily
 * cap keeps a leaked secret from burning the account's Gmail quota.
 */

var DAILY_CAP = 80; // personal Gmail allows ~100 recipients/day for MailApp
var SENDER_NAME = "Setstamp";

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var expected = PropertiesService.getScriptProperties().getProperty("MAIL_SECRET");
    if (!expected || !safeEqual_(String(body.secret || ""), expected)) {
      return json_({ ok: false, error: "unauthorized" });
    }

    var to = String(body.to || "").trim();
    var subject = String(body.subject || "").slice(0, 200);
    var text = String(body.text || "").slice(0, 20000);
    var html = String(body.html || "").slice(0, 50000);
    if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return json_({ ok: false, error: "bad_recipient" });
    if (!subject || !text) return json_({ ok: false, error: "missing_fields" });

    if (!takeQuota_()) return json_({ ok: false, error: "daily_cap_reached" });
    if (MailApp.getRemainingDailyQuota() < 1) return json_({ ok: false, error: "gmail_quota_exhausted" });

    MailApp.sendEmail({ to: to, subject: subject, body: text, htmlBody: html || undefined, name: SENDER_NAME });
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: "exception", detail: String(err).slice(0, 200) });
  }
}

/** Health check that leaks nothing. */
function doGet() {
  return json_({ ok: true, service: "gym-app-mail" });
}

function takeQuota_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var props = PropertiesService.getScriptProperties();
    var day = Utilities.formatDate(new Date(), "UTC", "yyyy-MM-dd");
    var key = "SENT_" + day;
    var n = Number(props.getProperty(key) || "0");
    if (n >= DAILY_CAP) return false;
    props.setProperty(key, String(n + 1));
    return true;
  } finally {
    lock.releaseLock();
  }
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
