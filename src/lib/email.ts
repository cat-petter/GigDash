/** One email, sent through Resend. */
export type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends with Resend's API (RESEND_API_KEY, from EMAIL_FROM). In `next dev` without a key, the email
 * is printed to the terminal instead, so links can be tried locally.
 */
export async function sendEmail(email: Email): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "development") {
      console.info(`\n[email] To: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n`);
      return;
    }
    throw new Error("Email isn't set up: RESEND_API_KEY and EMAIL_FROM are needed");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
  });
  if (!response.ok) throw new Error(`Resend didn't send the email (${response.status})`);
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A short email with one button. */
export function linkEmail(to: string, subject: string, lines: string[], button: string, url: string): Email {
  const footer = "If you didn't ask for this, ignore this email.";
  return {
    to,
    subject,
    text: [...lines, "", url, "", footer].join("\n"),
    html: [
      `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;max-width:28rem">`,
      ...lines.map((line) => `<p>${escape(line)}</p>`),
      `<p><a href="${escape(url)}" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#111;color:#fff;text-decoration:none">${escape(button)}</a></p>`,
      `<p style="color:#666;font-size:14px">${escape(footer)}</p>`,
      `</div>`,
    ].join(""),
  };
}
