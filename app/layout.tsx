import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import SessionProvider from "@/components/auth/session-provider";

const poppins = Poppins({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-sans",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "VibeCheck",
  description: "Your vibe-coded app has vulnerabilities. We found them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-full flex flex-col bg-bg-primary text-text-primary",
          poppins.variable,
          jetbrainsMono.variable,
          "font-sans"
        )}
        suppressHydrationWarning
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
