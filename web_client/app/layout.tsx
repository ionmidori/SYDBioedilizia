import type { Metadata } from "next";
import { Outfit, Playfair_Display, Lato, Cinzel } from "next/font/google";
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

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-trajan", // Mapping effectively to Trajan style
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["100", "300", "400", "700", "900"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sydbioedilizia.vercel.app"),
  title: {
    template: "%s | SYD BIOEDILIZIA",
    default: "SYD BIOEDILIZIA - Ristrutturazioni Tradizionali e Bioedilizia a Roma",
  },
  description: "Leader a Roma e Provincia: uniamo l'eccellenza artigiana tradizionale all'innovazione della bioedilizia. Ristrutturazioni su misura a Fiumicino, Pomezia, Tivoli, Castelli Romani e litorale.",
  keywords: [
    "ristrutturazioni roma",
    "bioedilizia roma",
    "ristrutturazioni tradizionali",
    "impresa edile roma",
    "fiumicino",
    "pomezia",
    "tivoli",
    "albano laziale",
    "cerveteri",
    "bracciano",
    "ciampino",
    "ladispoli",
    "frascati",
    "acilia",
    "ristrutturazioni chiavi in mano"
  ],
  alternates: {
    canonical: "/",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "SYD BIOEDILIZIA - Ristrutturazioni e Bioedilizia a Roma",
    description: "Dalla tradizione alla bioedilizia: realizziamo la casa dei tuoi sogni a Roma, Castelli Romani e litorale. Servizi su misura per ogni esigenza.",
    url: "https://sydbioedilizia.vercel.app",
    siteName: "SYD BIOEDILIZIA",
    locale: "it_IT",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "SYD BIOEDILIZIA - Ristrutturazioni Roma e Provincia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SYD BIOEDILIZIA - Ristrutturazioni Roma",
    description: "Eccellenza nelle ristrutturazioni tradizionali e bioedilizia a Roma e provincia.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  other: {
    "geo.region": "IT-RM",
    "geo.placename": "Roma",
    "geo.position": "41.9028;12.4964",
    "ICBM": "41.9028, 12.4964"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#264653",
};

import { ChatProvider } from "@/components/chat/ChatProvider";
import { CookieConsent } from "@/components/CookieConsent";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className="scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${playfair.variable} ${lato.variable} ${cinzel.variable} antialiased font-sans bg-luxury-bg text-luxury-text`}
        suppressHydrationWarning
      >
        <AppCheckProvider>
          <AuthProvider>
            <ChatProvider>
              {children}
              <CookieConsent />
            </ChatProvider>
          </AuthProvider>
        </AppCheckProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
