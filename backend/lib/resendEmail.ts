// Notification delivery via Resend's free tier, instead of real APNs push —
// a paid Apple Developer Program membership ($99/yr) is required for actual
// push notifications, including to a SideStore-sideloaded app, so this app
// doesn't have that. Email gets you the same effect for $0: your phone's
// Mail app already has its own push notifications, so a new email still
// lands as an instant lock-screen alert.
//
// Resend's free tier without a verified custom domain can only send FROM
// their shared `onboarding@resend.dev` address and only TO the email
// address your Resend account is registered under — which is exactly this
// app's use case (one person, notifying themselves).

const RESEND_API_URL = "https://api.resend.com/emails";
const FROM_ADDRESS = "RU Course Sniper <onboarding@resend.dev>";

export async function sendNotificationEmail(subject: string, htmlBody: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;

  if (!apiKey || !to) {
    console.warn("[resendEmail] RESEND_API_KEY / NOTIFY_EMAIL_TO not set — skipping email send");
    return;
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html: htmlBody,
    }),
  });

  if (!res.ok) {
    console.error(`[resendEmail] ${res.status} ${res.statusText}:`, await res.text());
    return;
  }
  console.log(`[resendEmail] sent: "${subject}"`);
}
