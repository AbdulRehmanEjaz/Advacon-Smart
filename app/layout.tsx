import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workforce — Resource Management",
  description: "Manage projects, labour, equipment and rental partners in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
