/**
 * Behaviour helpers that make the companion feel like a person rather than a
 * widget: time-aware greetings, reactive moods and proactive suggestions.
 *
 * Kept in the shared package so the web app and the CLI can both use them.
 */

export interface CompanionMood {
  /** Short emotional label, e.g. "gembira". */
  mood: 'gembira' | 'tenang' | 'fokus' | 'santai';
  /** One line the character can say. */
  line: string;
}

const GREETINGS: Record<CompanionMood['mood'], readonly string[]> = {
  gembira: [
    'Hai! Kamu datang juga~',
    'Yatta, aku siap bantu!',
    'Halo~ ada yang mau dikerjain?',
  ],
  tenang: [
    'Hai, aku di sini kalau kamu butuh.',
    'Halo~ pelan-pelan aja, kita kerjakan bareng.',
    'Hei, aku siap nemenin.',
  ],
  fokus: [
    'Oke, aku fokus. Kasih tahu targetnya.',
    'Siap, aku kerjakan serius sekarang.',
    'Mode fokus on. Mulai dari mana?',
  ],
  santai: [
    'Hai~ santai dulu yuk~',
    'Halo~ sebelum kita mulai, boleh santai sebentar?',
    'Hei~ aku di sini, santai aja.',
  ],
};

/** Time of day bucket used to pick a greeting tone. */
export type CompanionDayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export function companionDayPart(hour: number): CompanionDayPart {
  if (hour < 5) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

/** Builds a greeting appropriate for the time of day. */
export function companionGreeting(hour: number, seed = 0): CompanionMood {
  const part = companionDayPart(hour);
  const mood: CompanionMood['mood'] = part === 'night' ? 'tenang' : part === 'morning' ? 'fokus' : part === 'afternoon' ? 'gembira' : 'santai';
  const lines = GREETINGS[mood];
  const line = lines[Math.abs(seed) % lines.length] ?? lines[0] ?? '';
  return { mood, line };
}

/**
 * Reacts to what the user just did. Used to make the companion acknowledge
 * the user instead of sitting there silently.
 */
export function companionReaction(event: 'greet' | 'thanks' | 'error' | 'idle', seed = 0): CompanionMood {
  switch (event) {
    case 'greet':
      return { mood: 'gembira', line: 'Haii~ senang kamu nyapa!' };
    case 'thanks':
      return { mood: 'gembira', line: 'Sama-sama~ kamu yang hebat!' };
    case 'error':
      return { mood: 'fokus', line: 'Hmm, ada yang error. Aku bantu telusuri ya.' };
    case 'idle':
    default: {
      const lines = GREETINGS.santai;
      return { mood: 'santai', line: lines[Math.abs(seed) % lines.length] ?? lines[0] ?? '' };
    }
  }
}

/** Contextual suggestions the companion can offer based on the workspace. */
export interface CompanionSuggestion {
  label: string;
  prompt: string;
}

export function companionSuggestions(options: {
  hasWorkspace: boolean;
  hasChats: boolean;
  isError: boolean;
  isIdle: boolean;
}): CompanionSuggestion[] {
  if (options.isError) {
    return [
      { label: 'Bantu debug error terakhir', prompt: 'Tolong telusuri error terakhir di workspace ini.' },
      { label: 'Ringkas apa yang terjadi', prompt: 'Ringkas kronologi error terakhir secara singkat.' },
    ];
  }
  if (!options.hasWorkspace) {
    return [
      { label: 'Pilih workspace dulu', prompt: 'Bantu aku memilih folder project yang mau dikerjain.' },
      { label: 'Apa saja yang bisa kamu?', prompt: 'Kamu bisa bantu apa saja di Astra?' },
    ];
  }
  if (options.isIdle && !options.hasChats) {
    return [
      { label: 'Jelaskan isi project ini', prompt: 'Jelaskan isi project ini secara singkat.' },
      { label: 'Cari bug di kode', prompt: 'Cari bug tersembunyi di kode project ini.' },
      { label: 'Ringkas perubahan terakhir', prompt: 'Ringkas perubahan terakhir di workspace ini.' },
    ];
  }
  return [
    { label: 'Lanjut', prompt: 'Lanjutkan pekerjaan tadi.' },
    { label: 'Cek ulang hasilnya', prompt: 'Verifikasi ulang hasil pekerjaan terakhir.' },
  ];
}

/**
 * Detects an explicit request addressed to the companion, so the message can
 * be routed to her instead of the engineering agent.
 */
export function isCompanionAddress(text: string): boolean {
  return /(^|\s)(@aemeath|aemeath)\b/i.test(text.trim());
}

/** Removes the companion mention so the rest of the message reads naturally. */
export function stripCompanionAddress(text: string): string {
  return text.replace(/(^|\s)(@aemeath|aemeath)\b\s*/i, ' ').trim();
}

/** Emotional reaction to what the user just said. */
export type CompanionTone = 'greeting' | 'thanks' | 'question' | 'help' | 'praise' | 'sad' | 'neutral';

export function companionTone(message: string): CompanionTone {
  const text = message.toLowerCase();
  if (/\b(halo|hai|hei|hi|hello|pagi|siang|sore|malam|assalam)\b/.test(text)) return 'greeting';
  if (/\b(terima kasih|makasih|thanks|thank you|tq)\b/.test(text)) return 'thanks';
  if (/\b(tolong|bantu|help|please|bisa tolong|gimana caranya)\b/.test(text)) return 'help';
  if (/\b(mantap|keren|bagus|hebat|great|nice|awesome|keren banget)\b/.test(text)) return 'praise';
  if (/\b(error|gagal|bug|salah|nggak bisa|tidak bisa|broken)\b/.test(text)) return 'sad';
  if (text.includes('?')) return 'question';
  return 'neutral';
}

/** Short emotive line the companion can show before she answers. */
export function companionReactionLine(tone: CompanionTone): string | undefined {
  switch (tone) {
    case 'greeting':
      return 'Haii~ kamu datang!';
    case 'thanks':
      return 'Sama-sama~!';
    case 'help':
      return 'Tentu! Aku bantu ya~';
    case 'praise':
      return 'Wah, keren juga kamu~';
    case 'sad':
      return 'Hmm, ada yang bermasalah? Aku cek ya...';
    case 'question':
      return 'Hmm, aku pikirkan sebentar...';
    case 'neutral':
    default:
      return undefined;
  }
}

/** What the companion noticed about the real agent run. */
export interface CompanionObservation {
  /** Tool the agent just ran. */
  tool?: string;
  /** Number of tools already used in this task. */
  toolCount?: number;
  /** Text the agent just produced. */
  reply?: string;
  /** Whether the task finished successfully. */
  done?: boolean;
  /** Whether the task failed. */
  failed?: boolean;
}

/**
 * Produces a short remark about what the agent is really doing.
 * Returns undefined when there is nothing meaningful to say, so the companion
 * never invents progress.
 */
export function companionObservationLine(observation: CompanionObservation, seed = 0): string | undefined {
  if (observation.failed) return 'Hmm, error-nya kelihatan. Aku bantu intip ya~';
  if (observation.done) {
    const lines = ['Berhasil! Kamu hebat~', 'Yatta, selesai!', 'Mantap, semua beres!'];
    return lines[Math.abs(seed) % lines.length];
  }
  if (observation.tool) {
    const tool = observation.tool;
    if (/read|list|glob|search/i.test(tool)) return `Aku lihat-lihat dulu isi projectnya~`;
    if (/write|edit|patch/i.test(tool)) return 'Oke, aku ubah bagian itu ya~';
    if (/shell|exec|run|test/i.test(tool)) return 'Aku jalankan perintahnya dulu biar pasti~';
    if (/grep/i.test(tool)) return 'Aku cari referensinya sebentar~';
    return `Aku pakai ${tool} dulu ya~`;
  }
  if (observation.reply) {
    const length = observation.reply.length;
    if (length > 600) return 'Wah panjang juga jawabannya, aku ringkas ya~';
  }
  return undefined;
}

/** A moment that happened during the session. */
export interface CompanionMoment {
  kind: 'greet' | 'request' | 'tool' | 'reply' | 'error' | 'done';
  text: string;
  at: number;
}

/**
 * Builds a running summary of the session so the companion can refer back to
 * what already happened instead of losing the thread.
 */
export function companionSessionSummary(moments: readonly CompanionMoment[], limit = 6): string {
  if (!moments.length) return '';
  const recent = moments.slice(-limit);
  return recent
    .map(moment => {
      switch (moment.kind) {
        case 'request':
          return `The user asked: "${moment.text.slice(0, 80)}"`;
        case 'tool':
          return `Astra used ${moment.text}`;
        case 'error':
          return `There was an error: ${moment.text.slice(0, 80)}`;
        case 'done':
          return 'Astra finished the task';
        case 'greet':
          return 'The user said hello';
        case 'reply':
        default:
          return `Astra replied: "${moment.text.slice(0, 80)}"`;
      }
    })
    .join('; ');
}

/** A line that shows she is following the thread of the session. */
export function companionContinuityLine(moments: readonly CompanionMoment[]): string | undefined {
  const tools = moments.filter(moment => moment.kind === 'tool');
  const requests = moments.filter(moment => moment.kind === 'request');
  if (tools.length >= 2) return 'Aku masih nemenin yang tadi~';
  if (requests.length >= 2) return 'Wah masih lanjut nih~';
  if (moments.some(moment => moment.kind === 'error')) return 'Aku bantu benahi yang error tadi ya~';
  return undefined;
}
