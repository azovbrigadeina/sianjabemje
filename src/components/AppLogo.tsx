import React from 'react';
import { BRANDING } from '@/config/branding';

interface AppLogoProps {
  showBadge?: boolean;
}

export default function AppLogo({ showBadge = false }: AppLogoProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '10px',
        background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--secondary)))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: '1.1rem',
        fontWeight: 800,
        boxShadow: '0 4px 14px hsla(var(--primary), 0.35)',
        flexShrink: 0
      }}>
        P
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span className="text-gradient" style={{ fontWeight: 800, fontSize: '1.15rem', letterSpacing: '-0.02em' }}>
          {BRANDING.shortName}
        </span>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'hsl(var(--secondary))', letterSpacing: '0.05em' }}>
          MUARO JAMBI
        </span>
      </div>
      {showBadge && (
        <span style={{
          fontSize: '0.625rem',
          background: 'linear-gradient(135deg, #a855f7 0%, #3b82f6 100%)',
          color: 'white',
          padding: '0.15rem 0.45rem',
          borderRadius: '6px',
          textTransform: 'uppercase',
          fontWeight: 800,
          letterSpacing: '0.07em',
          boxShadow: '0 2px 8px rgba(168, 85, 247, 0.2)'
        }}>
          AI Powered
        </span>
      )}
    </div>
  );
}
