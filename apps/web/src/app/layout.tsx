import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Operium — Persistent Memory for AI Coding Assistants",
  description:
    "Secondary memory for your AI coding assistant. Capture decisions, recall context, share knowledge across your team.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:8000"),
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
