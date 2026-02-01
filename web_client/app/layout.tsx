import type { Metadata } from "next";
import { Outfit, Playfair_Display, Lato } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { AppCheckProvider } from "@/components/providers/AppCheckProvider";
import { AuthProvider } from "@/components/providers/AuthProvider";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"],
  variable: "--font-sans",
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

import { CookieConsent } from "@/components/CookieConsent";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="scroll-smooth" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${playfair.variable} ${lato.variable} antialiased font-sans bg-luxury-bg text-luxury-text`}
        suppressHydrationWarning
      >
        <AppCheckProvider>
          <AuthProvider>
            {children}
            <CookieConsent />
          </AuthProvider>
        </AppCheckProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
