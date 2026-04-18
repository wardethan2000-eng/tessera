import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins";
import { createTransport } from "nodemailer";
import { db } from "./db.js";
import * as schema from "@familytree/database";

const mailer = createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? "1025"),
  secure: false,
});

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await mailer.sendMail({
          from: process.env.SMTP_FROM ?? "noreply@familytree.local",
          to: email,
          subject: "Sign in to FamilyTree",
          html: `<p>Sign in to your FamilyTree account: <a href="${url}">Click here to sign in</a></p><p>This link expires shortly. If you did not request this, you can ignore it.</p>`,
          text: `Sign in to FamilyTree: ${url}`,
        });
      },
    }),
  ],
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "http://localhost:3000").split(","),
  secret: process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production",
  baseURL: process.env.API_BASE_URL ?? "http://localhost:3001",
});

export type Auth = typeof auth;
