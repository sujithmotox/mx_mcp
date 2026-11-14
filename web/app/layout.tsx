import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Data chat",
  description: "Ask questions about your MySQL data",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
