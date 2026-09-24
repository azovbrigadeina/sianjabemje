/**
 * Central Branding Configuration for SI-PRABU Muaro Jambi
 * 
 * IMPORTANT:
 * - `codename`: Kept as 'sianjab' for backward compatibility with database schema,
 *   API actions, auth cookies, and third-party integrations (e.g. SiTPP / SPT).
 * - `displayName`, `shortName`, `fullName`: Used across the frontend UI and document titles.
 */

export const BRANDING = {
  codename: "sianjab",
  shortName: "SI-PRABU",
  displayName: "SI-PRABU Muaro Jambi",
  fullName: "SI-PRABU (Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja) Muaro Jambi",
  tagline: "Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja",
  region: "Kabupaten Muaro Jambi",
  government: "Pemerintah Kabupaten Muaro Jambi",
  metaTitle: "SI-PRABU Muaro Jambi | Analisis Jabatan & Beban Kerja",
  metaDescription: "Sistem Informasi Perencanaan, Rekapitulasi, Analisis Beban & Unit Kerja Kabupaten Muaro Jambi",
  defaultSiteName: "SI-PRABU Muaro Jambi",
} as const;

export default BRANDING;
