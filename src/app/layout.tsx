import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/UserContext";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://anjabmj-44141.web.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "SianjabABK EM-JE | Analisis Jabatan & Beban Kerja Kabupaten Muaro Jambi",
    template: "%s | SianjabABK EM-JE",
  },
  description: "Sistem Terpadu Analisis Jabatan (ANJAB) dan Analisis Beban Kerja (ABK) Pemerintah Kabupaten Muaro Jambi berdasarkan Permenpan RB No. 1 Tahun 2020.",
  keywords: [
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
  authors: [{ name: "Pemerintah Kabupaten Muaro Jambi" }],
  creator: "Pemerintah Kabupaten Muaro Jambi",
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
    title: "SianjabABK EM-JE | Analisis Jabatan & Beban Kerja Kabupaten Muaro Jambi",
    description: "Sistem Terpadu Analisis Jabatan dan Analisis Beban Kerja berdasarkan Permenpan RB No. 1 Tahun 2020",
    url: siteUrl,
    siteName: "SianjabABK EM-JE",
    locale: "id_ID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SianjabABK EM-JE | Analisis Jabatan & Beban Kerja Kabupaten Muaro Jambi",
    description: "Sistem Terpadu Analisis Jabatan dan Analisis Beban Kerja berdasarkan Permenpan RB No. 1 Tahun 2020",
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
  "name": "SianjabABK EM-JE Kabupaten Muaro Jambi",
  "alternateName": "SianjabABK Muaro Jambi",
  "url": siteUrl,
  "description": "Sistem Terpadu Analisis Jabatan dan Analisis Beban Kerja berdasarkan Permenpan RB No. 1 Tahun 2020 Kabupaten Muaro Jambi",
  "areaServed": "Kabupaten Muaro Jambi",
  "parentOrganization": {
    "@type": "GovernmentOrganization",
    "name": "Pemerintah Kabupaten Muaro Jambi"
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

