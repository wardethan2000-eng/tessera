import { createTransport, type Transporter } from "nodemailer";

function buildTransport(): Transporter {
  const host = process.env.SMTP_HOST ?? "localhost";
  const port = Number(process.env.SMTP_PORT ?? "1025");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  return createTransport({
    host,
    port,
    secure: port === 465,
    auth: user ? { user, pass: pass ?? "" } : undefined,
  });
}

export const mailer = buildTransport();

export const MAIL_FROM =
  process.env.SMTP_FROM ?? "Heirloom <onboarding@resend.dev>";
