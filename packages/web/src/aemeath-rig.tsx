import { useI18n } from './i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompanionState } from '@astra/core/companion';

export interface AemeathRigProps {
  state: CompanionState;
  /** Live text the character is saying, when speaking. */
  speech?: string | undefined;
  /** Short status line shown under the character. */
  detail?: string | undefined;
  useArtwork?: boolean;
  size?: number;
  /** Softens decorative motion while keeping the character alive. */
  calm?: boolean;
}

const ASSET_BASE = '/assets/companion/aemeath';

const STATE_FRAME: Record<CompanionState, string> = {
  idle: 'idle',
  listening: 'listen',
  thinking: 'think',
  planning: 'plan',
  speaking: 'talk',
  using_tool: 'work',
  waiting_for_approval: 'approve',
  success: 'happy',
  error: 'sorry',
  cancelled: 'sorry',
};

const IDLE_CHATTER: readonly string[] = [
  'Hi~ I am here if you need anything.',
  'Kalau mau, aku bisa bantu bersihin kode sekalian.',
  'Tinggal bilang aja, aku standby.',
  'Lagi mumet? Aku bantuin deh.',
  'Workspace-nya udah siap, tinggal mulai aja.',
  'Klik aku kalau mau ngobrol dulu~',
  'Aku baca-baca project kamu udah, lho.',
  'Siap kapan pun kamu mau mulai.',
];

const STATE_BUBBLE: Record<CompanionState, string> = {
  idle: 'Hi~ I am here if you need anything.',
  listening: 'Aku dengerin kamu...',
  thinking: 'Hmm, let me think for a moment...',
  planning: 'Aku susun langkah-langkahnya dulu ya.',
  speaking: '',
  using_tool: 'I am working on it~',
  waiting_for_approval: 'Hei, aku butuh persetujuan kamu dulu.',
  success: 'Success! You are great!',
  error: 'Hmm, there is an error... let me check again.',
  cancelled: 'Oke, aku berhenti di sini.',
};

/**
 * Layered vector rig for Aemeath.
 *
 * The artwork shipped with the game cannot be animated without a rigged model,
 * so the built-in rig reproduces the character design in layers: hair, halo,
 * eyes with star pupils, mouth, body and sparkles. Every layer is animated
 * independently and reacts to the shared companion state contract, which makes
 * her read as a live presence rather than a static picture.
 */
export function AemeathRig({
  state, speech, detail, size = 210, useArtwork = false, calm = false }: AemeathRigProps) {
  const { t } = useI18n();
  const [blinkSeed, setBlinkSeed] = useState(0);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [artworkFailed, setArtworkFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [poked, setPoked] = useState(false);
  const [typingDots, setTypingDots] = useState(0);
  const [fidget, setFidget] = useState(0);
  const [glance, setGlance] = useState(0);
  const [bubbleOverride, setBubbleOverride] = useState<string | undefined>(undefined);
  const [chatterIndex, setChatterIndex] = useState(0);
  const [visibleState, setVisibleState] = useState<CompanionState>(state);
  const rigRef = useRef<HTMLDivElement | null>(null);

  // Minimum dwell time: a state must stay visible long enough to be read.
  // Without this the companion flickers between states and looks static.
  useEffect(() => {
    if (state === visibleState) return;
    const timer = window.setTimeout(() => setVisibleState(state), 900);
    return () => window.clearTimeout(timer);
  }, [state, visibleState]);

  // Idle chatter: she keeps talking while waiting, like a real assistant on standby.
  useEffect(() => {
    if (state !== 'idle' && state !== 'listening') return;
    const timer = window.setInterval(() => {
      setChatterIndex(index => (index + 1) % IDLE_CHATTER.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [state]);

  // Reacting to a poke: she hops and greets the user.
  useEffect(() => {
    if (!poked) return;
    const timer = window.setTimeout(() => setPoked(false), 1800);
    return () => window.clearTimeout(timer);
  }, [poked]);

  const handlePoke = () => {
    setPoked(true);
    setBubbleOverride('Hai~ ada yang bisa kubantu?');
  };

  // Animated typing indicator while the companion composes a reply.
  useEffect(() => {
    if (state !== 'thinking' && state !== 'speaking' && state !== 'listening') {
      setTypingDots(0);
      return;
    }
    const timer = window.setInterval(() => setTypingDots(value => (value + 1) % 3), 320);
    return () => window.clearInterval(timer);
  }, [state]);

  // Ambient life: occasional unplanned movements so she never feels scripted.
  useEffect(() => {
    if (state !== 'idle' && state !== 'listening') return;
    const timer = window.setInterval(() => {
      setFidget(value => value + 1);
      if (Math.random() > 0.55) setGlance(value => value + 1);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [state]);

  // Blinking: independent of the state so it always feels alive.
  useEffect(() => {
    const schedule = () => {
      const delay = 2200 + Math.random() * 3200;
      const timer = window.setTimeout(() => {
        setBlinkSeed(value => value + 1);
        schedule();
      }, delay);
      return timer;
    };
    const timer = schedule();
    return () => window.clearTimeout(timer);
  }, []);

  // Lip sync while speaking: the mouth opens and closes with the stream.
  useEffect(() => {
    if (state !== 'speaking') {
      setMouthOpen(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      setMouthOpen(Math.random() * 0.85 + 0.1);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [state]);

  // Eyes follow the pointer, like a real presence watching the user.
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const rig = rigRef.current;
      if (!rig) return;
      const rect = rig.getBoundingClientRect();
      const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
      const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
      setGaze({
        x: Math.max(-1, Math.min(1, dx)) * 3.2,
        y: Math.max(-1, Math.min(1, dy)) * 2.2,
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const artworkSrc = useMemo(() => {
    if (expanded) return `${ASSET_BASE}/portrait/aemeath-fullbody.webp`;
    return `${ASSET_BASE}/sprite/aemeath-${STATE_FRAME[state]}.webp`;
  }, [state, expanded]);

  const line =
    bubbleOverride ??
    speech?.trim() ??
    (state === 'idle' ? (IDLE_CHATTER[chatterIndex % IDLE_CHATTER.length] ?? '') : (STATE_BUBBLE[state] ?? ''));

  if (useArtwork && !artworkFailed) {
    return (
      <div className={`aemeath-rig aemeath-rig-artwork state-${state}`} ref={rigRef} style={{ width: size }}>
        <button
          type="button"
          className="aemeath-art"
          title="Double click to switch body view"
          onDoubleClick={() => setExpanded(value => !value)}
        >
          <img src={artworkSrc} alt="Aemeath" draggable={false} onError={() => setArtworkFailed(true)} className={expanded ? 'is-fullbody' : 'is-portrait'} />
        </button>
        <AemeathCaption line={line} detail={detail} state={state} />
      </div>
    );
  }

  return (
    <div
      className={`aemeath-rig aemeath-rig-vector state-${visibleState}${poked ? ' is-poked' : ''}${calm ? ' calm' : ''} fidget-${fidget % 3} glance-${glance % 2}`}
      ref={rigRef}
      style={{ width: size }}
      data-state={visibleState}
      onClick={handlePoke}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlePoke();
        }
      }}
    >
      <div className="rig-presence">
        <span className={`rig-presence-core state-${state}`} />
        <span className="rig-presence-label">{detail ?? state}</span>
        {state === 'listening' || state === 'thinking' || state === 'speaking' ? (
          <span className="rig-typing" aria-hidden="true">
            {[0, 1, 2].map(index => (
              <i key={index} className={index === typingDots ? 'is-on' : ''} />
            ))}
          </span>
        ) : null}
        <span className={`rig-dots state-${state}`} aria-hidden="true">
          <i /><i /><i />
        </span>
      </div>
      <svg viewBox="0 0 220 260" className="aemeath-rig-svg rig-float" role="img" aria-label="Aemeath">
        <defs>
          <linearGradient id="rigHair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff9ec4" />
            <stop offset="55%" stopColor="#f47ba8" />
            <stop offset="100%" stopColor="#ffd86b" />
          </linearGradient>
          <linearGradient id="rigHairTip" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd86b" />
            <stop offset="100%" stopColor="#ffe9a8" />
          </linearGradient>
          <linearGradient id="rigSkin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff6ee" />
            <stop offset="100%" stopColor="#f9dccd" />
          </linearGradient>
          <radialGradient id="rigIris" cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ffe9a8" />
            <stop offset="65%" stopColor="#f5b72c" />
            <stop offset="100%" stopColor="#c98209" />
          </radialGradient>
          <linearGradient id="rigOutfit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4a5c94" />
            <stop offset="100%" stopColor="#2b3559" />
          </linearGradient>
          <radialGradient id="rigRim" cx="50%" cy="50%" r="52%">
            <stop offset="72%" stopColor="#5ec8ff" stopOpacity="0" />
            <stop offset="92%" stopColor="#7fd8ff" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#7fd8ff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="rigHalo" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#7fd8ff" />
            <stop offset="50%" stopColor="#5ec8ff" />
            <stop offset="100%" stopColor="#7fd8ff" />
          </linearGradient>
        </defs>

        {/* --- halo: floating digital ring with wing motifs --- */}
        <g className="rig-halo">
          <ellipse cx="110" cy="24" rx="40" ry="9" fill="none" stroke="url(#rigHalo)" strokeWidth="3" />
          <ellipse cx="110" cy="24" rx="48" ry="11" fill="none" stroke="#5ec8ff" strokeWidth="1" opacity="0.45" />
          <path className="rig-halo-wing rig-halo-wing-left" d="M70 20c-9-6-16-3-19 4 6-1 10 1 13 6-5-1-8 1-9 5 6-1 11 1 15 5" fill="none" stroke="#5ec8ff" strokeWidth="2.2" strokeLinecap="round" />
          <path className="rig-halo-wing rig-halo-wing-right" d="M150 20c9-6 16-3 19 4-6-1-10 1-13 6 5-1 8 1 9 5-6-1-11 1-15 5" fill="none" stroke="#5ec8ff" strokeWidth="2.2" strokeLinecap="round" />
          <circle className="rig-halo-dot" cx="110" cy="24" r="3" fill="#bdeeff" />
        </g>

        {/* --- back hair --- */}
        <g className="rig-hair-back">
          <path d="M110 32c-46 0-72 32-68 78 3 34 9 68 18 104 13-9 27-13 39-12 5 4 11 6 11 6s6-2 11-6c12-1 26 3 39 12 9-36 15-70 18-104 4-46-22-78-68-78Z" fill="url(#rigHair)" />
          <path d="M110 32c-46 0-72 32-68 78 1 16 3 31 6 45-9-34-8-60 6-76 14-16 32-24 56-24s42 8 56 24c14 16 15 42 6 76 3-14 5-29 6-45 4-46-22-78-68-78Z" fill="#ffc0d8" opacity="0.45" />
          {/* ponytail with yellow tips */}
          <path className="rig-ponytail" d="M164 74c16 22 22 52 18 82-2 16-8 30-16 42 2-24 1-46-6-64-5-13-6-26-2-38 2-8 4-16 6-22Z" fill="url(#rigHair)" />
          <path className="rig-ponytail-tip" d="M166 158c3 14 2 28-2 40-3 8-7 14-12 19 4-18 4-34 1-48Z" fill="url(#rigHairTip)" />
        </g>

        {/* --- rim light so the silhouette separates from the dark UI --- */}
        <ellipse className="rig-rim" cx="110" cy="128" rx="74" ry="96" fill="url(#rigRim)" />

        {/* --- body --- */}
        <g className="rig-body">
          <path d="M110 168c-26 0-47 14-53 36-2 6-3 12-3 18h112c0-6-1-12-3-18-6-22-27-36-53-36Z" fill="url(#rigOutfit)" />
          <path d="M110 168c-8 0-15 1-21 3 5 11 12 18 21 18s16-7 21-18c-6-2-13-3-21-3Z" fill="url(#rigSkin)" />
          <path d="M88 174c6 4 13 6 22 6s16-2 22-6l5 5c-8 6-16 9-27 9s-19-3-27-9Z" fill="#5ec8ff" opacity="0.45" />
          <path className="rig-collar" d="M86 176c8 7 16 10 24 10s16-3 24-10l-3 8c-6 5-13 8-21 8s-15-3-21-8Z" fill="#5ec8ff" opacity="0.7" />
          <circle className="rig-brooch" cx="110" cy="190" r="5" fill="#bdeeff" />
          <circle className="rig-brooch-ring" cx="110" cy="190" r="9" fill="none" stroke="#5ec8ff" strokeWidth="1.2" opacity="0.6" />
        </g>

        {/* --- face --- */}
        <g
        className="rig-head"
        style={{
          transform: `rotate(${gaze.x * 1.4 + (glance % 2 ? 3.5 : 0)}deg) translate(${gaze.x * 1.2 + (glance % 2 ? 2 : 0)}px, ${gaze.y * 0.8}px)`,
        }}
      >
        <g className="rig-face">
          <path d="M110 48c-27 0-46 20-46 47 0 20 7 36 20 45 9 6 17 9 26 9s17-3 26-9c13-9 20-25 20-45 0-27-19-47-46-47Z" fill="url(#rigSkin)" />
          <ellipse cx="110" cy="140" rx="26" ry="17" fill="#fbe2d4" opacity="0.55" />
        </g>

        {/* --- bangs --- */}
        <g className="rig-bangs">
          <path d="M64 94c-3-30 14-52 46-52s49 22 46 52c-3-6-6-9-12-11-2 6-6 11-12 14 3-9 3-18 1-26-8 12-22 20-38 22-3 8-9 15-18 20 4-7 6-13 7-20-6 3-13 4-20 1Z" fill="url(#rigHair)" />
          <path d="M110 42c-32 0-49 20-46 52 6-4 10-5 12-11 2 6 6 11 12 14 3-9 3-18 1-26-8 12-22 20-38 22 13-9 20-22 22-38 7 14 19 23 37 23s30-9 37-23c2 16 9 29 22 38-16-2-30-10-38-22-2 8-2 17 1 26 6-3 10-8 12-14 2 6 6 7 12 11 3-32-14-52-46-52Z" fill="#ffb6d0" opacity="0.28" />
          {/* yellow-gradient tips on the fringe */}
          <path className="rig-bang-tip" d="M74 78c2-14 12-24 24-27-9 6-14 14-16 25-1 6-4 10-9 12 2-3 2-7 1-10Z" fill="url(#rigHairTip)" opacity="0.85" />
          <path className="rig-bang-tip rig-bang-tip-2" d="M146 78c-2-14-12-24-24-27 9 6 14 14 16 25 1 6 4 10 9 12-2-3-2-7-1-10Z" fill="url(#rigHairTip)" opacity="0.85" />
        </g>

        {/* --- side locks --- */}
        <g className="rig-locks">
          <path d="M64 76c-6 24-5 48 3 70 3 8 7 15 11 20-2-15-2-29 1-42 2-10 1-20-3-28-5 2-9 1-12-20Z" fill="url(#rigHair)" />
          <path d="M156 76c6 24 5 48-3 70-3 8-7 15-11 20 2-15 2-29-1-42-2-10-1-20 3-28 5 2 9 1 12-20Z" fill="url(#rigHair)" />
          <path className="rig-lock-tip" d="M70 158c3 6 4 12 3 18-1 5-3 9-6 12 3-9 4-18 3-30Z" fill="url(#rigHairTip)" opacity="0.8" />
          <path className="rig-lock-tip rig-lock-tip-2" d="M150 158c-3 6-4 12-3 18 1 5 3 9 6 12-3-9-4-18-3-30Z" fill="url(#rigHairTip)" opacity="0.8" />
        </g>
        </g>

        {/* --- brows --- */}
        <g className="rig-brows">
          <path d="M80 84c4-3 10-4 15-2" stroke="#c26b8f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <path d="M125 82c5-2 11-1 15 2" stroke="#c26b8f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
        </g>

        {/* --- eyes with star pupils --- */}
        <g className="rig-eyes">
          <g className="rig-eye rig-eye-left" key={`blink-l-${blinkSeed}`}>
            <ellipse cx="90" cy="102" rx="10" ry="12" fill="#ffffff" />
            <g className="rig-gaze" style={{ transform: `translate(${gaze.x}px, ${gaze.y}px)` }}>
              <ellipse className="rig-iris" cx="90" cy="103" rx="8" ry="10" fill="url(#rigIris)" />
              <path className="rig-star" d="M90 95l1.9 3.9 4.2.6-3 3 .7 4.2L90 104.7l-3.8 2 .7-4.2-3-3 4.2-.6Z" fill="#fffbe8" />
              <circle className="rig-glint" cx="86" cy="98" r="2.4" fill="#fff" opacity="0.9" />
            </g>
            <path className="rig-lid" d="M80 100c3-4 7-6 11-6 4 0 8 2 10 6" stroke="#f9dccd" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M80 100c3-4 7-6 11-6 4 0 8 2 10 6" stroke="#b8557d" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </g>
          <g className="rig-eye rig-eye-right" key={`blink-r-${blinkSeed}`}>
            <ellipse cx="130" cy="102" rx="10" ry="12" fill="#ffffff" />
            <g className="rig-gaze" style={{ transform: `translate(${gaze.x}px, ${gaze.y}px)` }}>
              <ellipse className="rig-iris" cx="130" cy="103" rx="8" ry="10" fill="url(#rigIris)" />
              <path className="rig-star" d="M130 95l1.9 3.9 4.2.6-3 3 .7 4.2L130 104.7l-3.8 2 .7-4.2-3-3 4.2-.6Z" fill="#fffbe8" />
              <circle className="rig-glint" cx="126" cy="98" r="2.4" fill="#fff" opacity="0.9" />
            </g>
            <path className="rig-lid" d="M120 100c3-4 7-6 11-6 4 0 8 2 10 6" stroke="#f9dccd" strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M120 100c3-4 7-6 11-6 4 0 8 2 10 6" stroke="#b8557d" strokeWidth="2.6" strokeLinecap="round" fill="none" />
          </g>
        </g>

        {/* --- blush --- */}
        <g className="rig-blush">
          <ellipse cx="76" cy="117" rx="11" ry="7" fill="#ff8fb0" opacity="0.42" />
          <ellipse cx="144" cy="117" rx="11" ry="7" fill="#ff8fb0" opacity="0.42" />
          <path d="M72 116l3 2M79 114l3 2M138 116l3 2M145 114l3 2" stroke="#e06185" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
        </g>

        {/* --- nose --- */}
        <path className="rig-nose" d="M110 112c1.6 1.8 1.6 3.6 0 4.4" stroke="#e0a892" strokeWidth="1.5" strokeLinecap="round" fill="none" />

        {/* --- mouth --- */}
        <g className="rig-mouth">
          <path className="rig-mouth-rest" d="M103 124c3 2.6 11 2.6 14 0" stroke="#c9566f" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          <g className="rig-mouth-open" style={{ '--mouth': mouthOpen } as React.CSSProperties}>
            <path d="M102 122c4 8 12 8 16 0-4-2-12-2-16 0Z" fill="#c9566f" />
            <path className="rig-mouth-tongue" d="M105 127c2 1.6 8 1.6 10 0-2-1.2-8-1.2-10 0Z" fill="#f0909f" opacity={0.4 + mouthOpen * 0.6} />
          </g>
          <path className="rig-mouth-smile" d="M98 121c5 9 19 9 24 0-7 3-17 3-24 0Z" fill="#c9566f" />
        </g>

        {/* --- holographic rim light and scanline sweep --- */}
        <g className="rig-holo" aria-hidden="true">
          <ellipse className="rig-holo-ring rig-holo-ring-1" cx="110" cy="120" rx="76" ry="96" fill="none" stroke="#5ec8ff" strokeWidth="1" opacity="0.35" />
          <ellipse className="rig-holo-ring rig-holo-ring-2" cx="110" cy="120" rx="88" ry="108" fill="none" stroke="#9fe0ff" strokeWidth="0.6" opacity="0.2" />
          <rect className="rig-scanline" x="20" y="0" width="180" height="14" fill="#5ec8ff" opacity="0.08" />
        </g>

        {/* --- ambient presence: soft aura and drifting motes --- */}
        <g className="rig-ambient">
          <ellipse className="rig-aura" cx="110" cy="120" rx="72" ry="92" fill="#5ec8ff" opacity="0.07" />
          <circle className="rig-mote rig-mote-1" cx="34" cy="96" r="2.4" fill="#9fe0ff" />
          <circle className="rig-mote rig-mote-2" cx="188" cy="132" r="2" fill="#ffd98a" />
          <circle className="rig-mote rig-mote-3" cx="58" cy="182" r="1.8" fill="#ffb6d0" />
          <circle className="rig-mote rig-mote-4" cx="168" cy="72" r="1.6" fill="#9fe0ff" />
        </g>

        {/* --- sparkles --- */}
        <g className="rig-sparkles">
          <path className="rig-spark rig-spark-1" d="M26 52l2.4 4.8 4.8 2.4-4.8 2.4L26 67l-2.4-5.2-4.8-2.4 4.8-2.4Z" fill="#ffd98a" />
          <path className="rig-spark rig-spark-2" d="M194 74l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#9fe0ff" />
          <path className="rig-spark rig-spark-3" d="M30 138l1.8 3.6 3.6 1.8-3.6 1.8L30 149l-1.8-3.8-3.6-1.8 3.6-1.8Z" fill="#ffb6d0" />
        </g>
      </svg>
      <div className="aemeath-stage-base" aria-hidden="true" />
      <AemeathCaption line={line} detail={detail} state={state} />
    </div>
  );
}

function AemeathCaption({ line, detail, state }: { line: string; detail: string | undefined; state: CompanionState }) {
  return (
    <div className="aemeath-caption">
      {line ? (
        <div className="aemeath-bubble" role="status">
          {line}
        </div>
      ) : null}
      <div className="aemeath-status">
        <span className={`aemeath-dot state-${state}`} />
        <span className="aemeath-status-label">{detail ?? state}</span>
      </div>
      {detail && detail !== state ? (
        <div className="aemeath-ticker" role="log">
          <span className="aemeath-ticker-spinner" />
          <span className="aemeath-ticker-text">{detail}</span>
        </div>
      ) : null}
    </div>
  );
}
