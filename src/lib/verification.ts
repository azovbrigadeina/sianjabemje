export interface VerificationRecord {
  code: string;
  documentType: string;
  opdName: string;
  title: string;
  createdAt: string;
  printedBy?: string;
  metadata?: Record<string, any>;
}

export function generateVerificationCode(
  documentType: string,
  opdName: string,
  title: string,
  printedBy?: string,
  metadata?: Record<string, any>
): VerificationRecord {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomHash = Math.random().toString(36).substring(2, 8).toUpperCase();
  const code = `BAGORMJ-${dateStr}-${randomHash}`;
  
  const record: VerificationRecord = {
    code,
    documentType,
    opdName,
    title,
    createdAt: new Date().toISOString(),
    printedBy: printedBy || 'Operator Sianjab',
    metadata
  };

  try {
    const existingStr = typeof window !== 'undefined' ? localStorage.getItem('sianjab_verification_logs') : null;
    const logs: Record<string, VerificationRecord> = existingStr ? JSON.parse(existingStr) : {};
    logs[code] = record;
    if (typeof window !== 'undefined') {
      localStorage.setItem('sianjab_verification_logs', JSON.stringify(logs));
    }
  } catch (e) {
    console.error('Failed to save verification record:', e);
  }

  return record;
}

export function getVerificationRecord(code: string): VerificationRecord | null {
  try {
    if (typeof window === 'undefined') return null;
    const existingStr = localStorage.getItem('sianjab_verification_logs');
    if (!existingStr) return null;
    const logs: Record<string, VerificationRecord> = JSON.parse(existingStr);
    return logs[code] || null;
  } catch (e) {
    console.error('Failed to read verification record:', e);
    return null;
  }
}
