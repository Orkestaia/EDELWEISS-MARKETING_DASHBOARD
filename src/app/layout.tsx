import type { Metadata } from "next";
import "./studio.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edelweiss Marketing Studio",
  description: "Marketing operations and Swiss Passport for Edelweiss Pastry Shop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
