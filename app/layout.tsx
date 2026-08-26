import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/components/CookieBanner"
import PWAInstall from "@/components/PWAInstall";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FaçoPorTi — Orçamentos Automáticos para Profissionais",
  description: "Plataforma de gestão de leads e orçamentos para pintores, eletricistas, canalizadores e outros profissionais independentes em Portugal.",
  metadataBase: new URL('https://façoporti.com'),
  openGraph: {
    title: "FaçoPorTi — Orçamentos Automáticos para Profissionais",
    description: "Recebe pedidos de orçamento qualificados pelo teu link pessoal, sem concorrência com outros profissionais. Starter a €19/mês.",
    locale: 'pt_PT',
    type: 'website',
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FaçoPorTi',
  },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-touch-icon': '/icon-192.png',
    'msapplication-TileColor': '#6366f1',
  },
};

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'FaçoPorTi',
  url: 'https://façoporti.com',
  description: 'Plataforma de gestão de leads e orçamentos para profissionais independentes em Portugal — pintores, eletricistas, canalizadores e outras especialidades.',
  areaServed: { '@type': 'Country', name: 'Portugal' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
        {children}
        <CookieBanner />
        <PWAInstall />
      </body>
    </html>
  );
}
