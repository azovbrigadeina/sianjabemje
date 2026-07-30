import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/lib/UserContext";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SianjabABK EM-JE | Analisis Jabatan & Beban Kerja",
  description: "Sistem Terpadu Analisis Jabatan dan Analisis Beban Kerja berdasarkan Permenpan RB No. 1 Tahun 2020",
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
      </head>
      <body>
        <UserProvider>{children}</UserProvider>
      </body>
    </html>
  );
}
