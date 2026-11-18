/**
 * Application Constants for Sianjab ABK
 */

export const SUPPORTED_YEARS = ['2025', '2026', '2027', '2028', '2029', '2030'];
export const DEFAULT_YEAR = '2026';

// PRF-07: Cache activeYear di memori modul agar tidak melakukan bacaan localStorage berulang
let cachedActiveYear: string | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'sianjab_active_year') {
      cachedActiveYear = e.newValue || DEFAULT_YEAR;
    }
  });
}

export function getActiveYear(): string {
  if (typeof window !== 'undefined') {
    if (cachedActiveYear) return cachedActiveYear;
    const stored = localStorage.getItem('sianjab_active_year') || DEFAULT_YEAR;
    cachedActiveYear = stored;
    return stored;
  }
  return DEFAULT_YEAR;
}

export function setActiveYearCache(year: string): void {
  cachedActiveYear = year;
  if (typeof window !== 'undefined') {
    localStorage.setItem('sianjab_active_year', year);
  }
}

export const INSTANSI_NAME = 'Pemerintah Kabupaten Muaro Jambi';
export const REGENCY_NAME = 'Kabupaten Muaro Jambi';
