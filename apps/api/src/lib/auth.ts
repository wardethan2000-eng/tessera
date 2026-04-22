import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { magicLink } from "better-auth/plugins";
import { db } from "./db.js";
import * as schema from "@familytree/database";
import { mailer, MAIL_FROM } from "./mailer.js";

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
          from: MAIL_FROM,
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
  baseURL: process.env.API_BASE_URL ?? "http://localhost:4000",
});

export type Auth = typeof auth;
