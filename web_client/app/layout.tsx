import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { AppCheckProvider } from "@/components/providers/AppCheckProvider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SYD BIOEDILIZIA - Il Futuro della Ristrutturazione",
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
    <html lang="it" className="scroll-smooth" suppressHydrationWarning>
      <body
        className={`${outfit.variable} antialiased font-sans bg-luxury-bg text-luxury-text`}
        suppressHydrationWarning
      >
        <AppCheckProvider>
          {children}
        </AppCheckProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
