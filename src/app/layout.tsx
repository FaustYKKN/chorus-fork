import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LocaleProvider } from "@/contexts/locale-context";
import { ClipboardFallback } from "@/components/ClipboardFallback";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Chorus",
    template: "%s | Chorus",
  },
  description: "AI Agent & Human collaboration platform for the AI-Driven Development Lifecycle",
  openGraph: {
    title: "Chorus",
    description: "AI Agent & Human collaboration platform for the AI-Driven Development Lifecycle",
    type: "website",
    siteName: "Chorus",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClipboardFallback />
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}
