import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "GigDash",
  description: "Stats about gig bookings from Apple Calendar.",
  // The name under the Home Screen icon.
  appleWebApp: { capable: true, title: "GigDash" },
  // A private dashboard: keep even the login page out of search results.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  // Matches --bg, so the browser bar blends into the page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
  // Date pickers and dropdowns follow the phone's light or dark mode.
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
