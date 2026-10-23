import React from 'react';
import { useI18n, Language } from './i18n';

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();

  const languages: { code: Language; label: string }[] = [
    { code: 'en', label: '🇬🇧 English' },
    { code: 'id', label: '🇮🇩 Indonesia' },
    { code: 'zh', label: '🇨🇳 中文' },
    { code: 'ja', label: '🇯🇵 日本語' },
  ];

  return (
    <select 
      value={lang} 
      onChange={(e) => setLang(e.target.value as Language)}
      style={{
        background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)',
        padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', outline: 'none', fontSize: '14px',
        fontWeight: 500, margin: '0 10px'
      }}
    >
      {languages.map((l) => (
        <option key={l.code} value={l.code} style={{ color: '#000' }}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
