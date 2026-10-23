/**
 * Aemeath's voice.
 *
 * A character feels alive when the same idea can be said in many ways. These
 * helpers give her varied phrasing, a small set of moods, and a few voice
 * presets the user can pick from.
 */

export type CompanionVoice = 'gembira' | 'tenang' | 'fokus' | 'playful';

export interface CompanionVoiceProfile {
  id: CompanionVoice;
  label: string;
  /** Sentence endings she tends to use. */
  endings: readonly string[];
  /** Small interjections she sprinkles in. */
  interjections: readonly string[];
  /** Words she avoids, so she does not sound like a documentation page. */
  banned: readonly string[];
}

export const COMPANION_VOICES: readonly CompanionVoiceProfile[] = [
  {
    id: 'gembira',
    label: 'Gembira',
    endings: ['~', '!', ' yaa~'],
    interjections: ['Wah', 'Yatta', 'Aww'],
    banned: ['Furthermore', 'Additionally', 'In conclusion'],
  },
  {
    id: 'tenang',
    label: 'Tenang',
    endings: ['.', ' ya.', ' kok.'],
    interjections: ['Hmm', 'Oke', 'Baik'],
    banned: ['Furthermore', 'Additionally', 'In conclusion'],
  },
  {
    id: 'fokus',
    label: 'Fokus',
    endings: ['.', '.'],
    interjections: ['Oke', 'Siap', 'Check'],
    banned: ['Furthermore', 'Additionally', 'In conclusion'],
  },
  {
    id: 'playful',
    label: 'Iseng',
    endings: ['~', ' hehe.', ' lho.'],
    interjections: ['Hihihi', 'Wkwk', 'Ayo'],
    banned: ['Furthermore', 'Additionally', 'In conclusion'],
  },
];

export function companionVoiceProfile(voice: CompanionVoice): CompanionVoiceProfile {
  return COMPANION_VOICES.find(profile => profile.id === voice) ?? COMPANION_VOICES[0] ?? COMPANION_VOICES[0]!;
}

/**
 * Adds a light, natural flourish to a line without changing its meaning.
 * The result stays short so the speech bubble never becomes a wall of text.
 */
export function applyVoice(text: string, voice: CompanionVoice, seed = 0): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const profile = companionVoiceProfile(voice);
  let result = trimmed;
  for (const word of profile.banned) {
    result = result.replace(new RegExp(`\\b${word}\\b,?\\s*`, 'gi'), '');
  }
  const ending = profile.endings[Math.abs(seed) % profile.endings.length] ?? '.';
  if (!/[~!.?]$/.test(result)) result = `${result}${ending}`;
  return result;
}

/** Picks a fresh line from a pool without repeating the previous one. */
export function pickLine(lines: readonly string[], previous?: string, seed = 0): string {
  if (!lines.length) return '';
  const candidates = lines.filter(line => line !== previous);
  const pool = candidates.length ? candidates : lines;
  return pool[Math.abs(seed) % pool.length] ?? pool[0] ?? '';
}

/** Phrasings she uses while she is busy with something. */
export const COMPANION_WORKING_LINES: readonly string[] = [
  'Sebentar ya, aku kerjakan~',
  'Oke, aku fokus dulu sebentar~',
  'Hmm, aku lihat detailnya ya~',
  'Satu-satu ya, jangan buru-buru~',
];

/** Phrasings she uses when the work is finished. */
export const COMPANION_DONE_LINES: readonly string[] = [
  'Selesai~! Kamu cek ya.',
  'Berhasil! Aku tunggu perintah berikutnya~',
  'Udah beres~ Kalau ada revisi, bilang aja.',
  'Mantap! Kalau mau, kita lanjut lagi~',
];

/** Phrasings she uses when something went wrong. */
export const COMPANION_ERROR_LINES: readonly string[] = [
  'Hmm, ada yang error. Aku telusuri lagi ya~',
  'Ups, belum berhasil. Aku coba lagi sebentar~',
  'Hmm, ini kayaknya perlu dicek lebih teliti~',
];

/** Phrasings she uses when the user is idle for a while. */
export const COMPANION_CHECKIN_LINES: readonly string[] = [
  'Hai~ masih di sini! Ada yang mau dikerjain?',
  'Aku standby~ Jadi jangan ragu manggil, ya?',
  'Hmm, kamu menghilang dari radar~ Aku ada di sini kok.',
];

/** Phrasings she uses when she notices something in the real run. */
export const COMPANION_NOTICED_LINES: readonly string[] = [
  'Oh, aku lihat~',
  'Hmm, menarik~',
  'Wah, ada yang menarik di sini~',
  'Aku notice sesuatu nih~',
];

/** Removes the accidental markers used while drafting the strings above. */
export function cleanCompanionLines(lines: readonly string[]): string[] {
  return lines.map(line => line.replace(/(\w)ofo\b/g, '$1').replace(/akulihat/g, 'aku lihat').replace(/(\w)notice/g, '$1 notice'));
}
