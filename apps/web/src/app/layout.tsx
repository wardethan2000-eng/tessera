import type { Metadata, Viewport } from "next";
import { EB_Garamond, Source_Serif_4, Inter } from "next/font/google";
import "./globals.css";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";

const ebGaramond = EB_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tessera.family";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Tessera",
  description: "Tessera is a quiet, private family archive.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ebGaramond.variable} ${sourceSerif.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <VerifyEmailBanner />
        {children}
      </body>
    </html>
  );
}
