/**
 * Application Constants for Sianjab ABK
 */

export const SUPPORTED_YEARS = ['2025', '2026', '2027', '2028', '2029', '2030'];
export const DEFAULT_YEAR = '2026';

export function getActiveYear(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('sianjab_active_year') || DEFAULT_YEAR;
  }
  return DEFAULT_YEAR;
}

export const INSTANSI_NAME = 'Pemerintah Kabupaten Muaro Jambi';
export const REGENCY_NAME = 'Kabupaten Muaro Jambi';
