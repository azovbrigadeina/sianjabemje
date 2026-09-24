import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/UserContext";
import { BRANDING } from "@/config/branding";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://anjabmj-44141.web.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${BRANDING.displayName} | ${BRANDING.tagline}`,
    template: `%s | ${BRANDING.displayName}`,
  },
  description: `${BRANDING.fullName}. Sistem Terpadu Analisis Jabatan (ANJAB) dan Analisis Beban Kerja (ABK) Pemerintah Kabupaten Muaro Jambi berdasarkan Permenpan RB No. 1 Tahun 2020.`,
  keywords: [
    BRANDING.shortName,
    BRANDING.displayName,
    "SI-PRABU",
    "Sianjab",
    "SianjabABK",
    "EM-JE",
    "Analisis Jabatan",
    "Analisis Beban Kerja",
    "ANJAB",
    "ABK",
    "Muaro Jambi",
    "Pemerintah Kabupaten Muaro Jambi",
    "Permenpan RB No 1 Tahun 2020",
    "SIASN",
    "SIMONA",
  ],
  authors: [{ name: BRANDING.government }],
  creator: BRANDING.government,
  publisher: "Bagian Organisasi Sekretariat Daerah Kabupaten Muaro Jambi",
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
  openGraph: {
    title: `${BRANDING.displayName} | ${BRANDING.tagline}`,
    description: `Sistem Terpadu Analisis Jabatan dan Analisis Beban Kerja berdasarkan Permenpan RB No. 1 Tahun 2020 - ${BRANDING.government}`,
    url: siteUrl,
    siteName: BRANDING.displayName,
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRANDING.displayName} | ${BRANDING.tagline}`,
    description: `Sistem Terpadu Analisis Jabatan dan Analisis Beban Kerja berdasarkan Permenpan RB No. 1 Tahun 2020 - ${BRANDING.government}`,
  },
  alternates: {
    canonical: siteUrl,
  },
  verification: {
    google: "ktW2T4VocB26WxhLOAlMFZDCqFdHsWN_UiPdvgfbYz0",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "GovernmentOrganization",
  "name": `${BRANDING.displayName} Kabupaten Muaro Jambi`,
  "alternateName": BRANDING.fullName,
  "url": siteUrl,
  "description": `${BRANDING.fullName} berdasarkan Permenpan RB No. 1 Tahun 2020 Kabupaten Muaro Jambi`,
  "areaServed": "Kabupaten Muaro Jambi",
  "parentOrganization": {
    "@type": "GovernmentOrganization",
    "name": BRANDING.government
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${outfit.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var t = localStorage.getItem('theme') || 'light';
                document.documentElement.setAttribute('data-theme', t);
                var c = localStorage.getItem('color-theme') || 'theme1';
                document.documentElement.setAttribute('data-color-theme', c);
              } catch (e) {}
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}

