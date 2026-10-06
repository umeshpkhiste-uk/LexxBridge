// Security-sensitive account-change notices (password/email/phone changed)
// that Supabase Auth has no email-template slot for — it only emails for
// the *request* to change something, never for the change completing.
// Called only by the three database triggers in
// supabase/migrations/0051_account_change_notices.sql (net.http_post, no
// caller JWT — same pattern send-push already uses), never directly by
// the client.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RESEND_API_URL = "https://api.resend.com/emails";

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (c) => map[c]);
}

function brandWrap(title: string, bodyHtml: string): string {
  return `<div style="background-color:#F8FAFC;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="background-color:#1E3A5F;padding:24px 32px;">
        <span style="color:#FFFFFF;font-size:20px;font-weight:700;letter-spacing:0.3px;">LexxBridge</span>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h1 style="margin:0 0 16px;color:#0F172A;font-size:20px;">${title}</h1>
        ${bodyHtml}
      </td>
    </tr>
  </table>
</div>`;
}

const SECURITY_NOTICE =
  '<p style="margin:0 0 24px;color:#B3261E;font-size:14px;line-height:1.5;background-color:#FEF2F2;border-radius:8px;padding:14px 16px;">' +
  "If this wasn't you, your account may be compromised — contact us immediately so we can help secure it.</p>" +
  '<p style="margin:0;color:#64748B;font-size:13px;line-height:1.5;">If you made this change yourself, no action is needed.</p>';

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (typeof payload !== "object" || payload === null) return new Response("Bad request", { status: 400 });
  const body = payload as Record<string, unknown>;
  if (!isEmail(body.email)) return new Response("Bad request", { status: 400 });

  let subject: string;
  let html: string;

  if (body.type === "password_changed") {
    subject = "Your LexxBridge password was changed";
    html = brandWrap(
      "Your password was changed",
      `<p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.5;">This is a confirmation that the password for your LexxBridge account (<strong>${escapeHtml(body.email)}</strong>) was just changed.</p>${SECURITY_NOTICE}`,
    );
  } else if (body.type === "email_changed" && isEmail(body.old_email) && isEmail(body.new_email)) {
    subject = "Your LexxBridge email address was changed";
    html = brandWrap(
      "Your email address was changed",
      `<p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.5;">This is a confirmation that the email on your LexxBridge account was changed from <strong>${escapeHtml(body.old_email)}</strong> to <strong>${escapeHtml(body.new_email)}</strong>.</p>${SECURITY_NOTICE}`,
    );
  } else if (body.type === "phone_changed" && typeof body.old_phone === "string" && typeof body.new_phone === "string") {
    subject = "Your LexxBridge phone number was changed";
    html = brandWrap(
      "Your phone number was changed",
      `<p style="margin:0 0 24px;color:#334155;font-size:15px;line-height:1.5;">This is a confirmation that the phone number on your LexxBridge account was changed from <strong>${escapeHtml(body.old_phone)}</strong> to <strong>${escapeHtml(body.new_phone)}</strong>.</p>${SECURITY_NOTICE}`,
    );
  } else {
    return new Response("Bad request", { status: 400 });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500 });

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "LexxBridge <onboarding@resend.dev>",
      to: [body.email],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return new Response(JSON.stringify({ error: `Failed to send: ${errText}` }), { status: 502 });
  }

  return Response.json({ sent: true });
});
