import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import CookieBanner from "@/components/CookieBanner";

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
  metadataBase: new URL('https://xn--faoporti-t0a.com'),
  openGraph: {
    title: "FaçoPorTi — Orçamentos Automáticos para Profissionais",
    description: "Recebe pedidos de orçamento qualificados, sem concorrência. Starter a €19/mês.",
    locale: 'pt_PT',
    type: 'website',
  },
};

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
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
