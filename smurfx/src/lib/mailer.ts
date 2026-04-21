import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import path from "node:path";

const FROM = process.env.SMTP_FROM || "SMURFX <hello@smurfx.com>";

let transporter: nodemailer.Transporter | null = null;

if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
  });
}

export async function sendMail({
  to,
  subject,
  html
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (transporter) {
    await transporter.sendMail({ from: FROM, to, subject, html });
    return { delivered: true, file: null };
  }
  const dir = path.join(process.cwd(), "tmp", "emails");
  await fs.mkdir(dir, { recursive: true });
  const filename = `${Date.now()}_${to.replace(/[^a-z0-9]/gi, "_")}.html`;
  const file = path.join(dir, filename);
  await fs.writeFile(file, `<!-- to: ${to} | subject: ${subject} -->\n` + html, "utf8");
  return { delivered: false, file };
}

export function brandedEmail(title: string, body: string, ctaLabel?: string, ctaHref?: string) {
  const cta = ctaLabel && ctaHref
    ? `<p style="margin:32px 0;text-align:center"><a href="${ctaHref}" style="background:#534AB7;color:#fff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;display:inline-block">${ctaLabel}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f5f8;font-family:Helvetica,Arial,sans-serif;color:#0a0a0a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ececef">
    <div style="background:#534AB7;padding:24px 32px;color:#fff;font-weight:800;letter-spacing:.18em;font-size:22px">SMURF<span style="color:#CECBF6">X</span></div>
    <div style="padding:32px">
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2">${title}</h1>
      <div style="font-size:15px;line-height:1.6;color:#23232b">${body}</div>
      ${cta}
    </div>
    <div style="padding:20px 32px;background:#fafafb;color:#74747e;font-size:12px">© ${new Date().getFullYear()} SMURFX · Move in blue</div>
  </div>
</body></html>`;
}
