import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Operium — Persistent Memory for AI Coding Assistants",
  description:
    "Secondary memory for your AI coding assistant. Capture decisions, recall context, share knowledge across your team.",
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:8000"),
};

// Runs before React hydrates to prevent flash of wrong theme
const themeScript = `(function(){var p='system';try{var s=localStorage.getItem('operium-theme');if(s==='light'||s==='dark'||s==='system')p=s;}catch(e){}var r=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;document.documentElement.setAttribute('data-theme-preference',p);document.documentElement.setAttribute('data-theme',r);})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" data-theme-preference="system" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
