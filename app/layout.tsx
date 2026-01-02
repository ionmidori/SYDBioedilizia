import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Renovation AI - Il Futuro della Ristrutturazione",
  description: "Trasforma la tua casa con il potere dell'Intelligenza Artificiale. Design premium, esecuzione impeccabile.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="scroll-smooth">
      <body
        className={`${outfit.variable} antialiased font-sans bg-slate-950 text-slate-50`}
      >
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
