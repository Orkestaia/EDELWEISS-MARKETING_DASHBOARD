import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edelweiss Marketing Studio",
  description: "Centro operativo de marketing de Edelweiss Pastry Shop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
