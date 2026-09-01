/**
 * 程序化音效（Web Audio API，无需任何音频文件）。
 * 灵感来自 GameHelix 等竞品的 Web Audio 方案：用振荡器实时合成短音，
 * 零体积、零网络请求，且天然支持「静音开关」。
 *
 * 设计要点：
 * - AudioContext 懒创建，并在首次播放时 resume()，满足浏览器自动播放策略
 *   （首个落子本身即用户手势，可解锁）。
 * - 全局静音开关持久化到 localStorage（键 `othello_sound`，默认开启）。
 * - 所有调用对 SSR / 测试环境（无 window/AudioContext）安全降级为 no-op。
 */

const SOUND_KEY = 'othello_sound';

let enabled = readInitialEnabled();
let ctx: AudioContext | null = null;

function readInitialEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SOUND_KEY);
    if (raw === null) return true; // 首次：默认开启
    return raw === 'true';
  } catch {
    return true;
  }
}

export function getSoundEnabled(): boolean {
  return enabled;
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(SOUND_KEY, value ? 'true' : 'false');
  } catch {
    /* 忽略存储异常 */
  }
}

/** 切换并返回新状态（供 UI 开关直接消费） */
export function toggleSound(): boolean {
  setSoundEnabled(!enabled);
  return enabled;
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!ctx) {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    // 部分浏览器初始为 suspended，需在用户手势后 resume
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

/** 单个音：指数包络的短促振荡器，避免爆音 */
function tone({ freq, dur, type = 'sine', gain = 0.16, delay = 0 }: ToneOpts): void {
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

function arp(freqs: number[], step: number, opts?: Partial<ToneOpts>): void {
  freqs.forEach((f, i) => tone({ freq: f, dur: 0.18, delay: i * step, ...opts }));
}

/** 落子：清脆的双音「嗒」 */
export function playPlace(): void {
  if (!enabled) return;
  tone({ freq: 520, dur: 0.09, type: 'triangle', gain: 0.15 });
  tone({ freq: 760, dur: 0.07, type: 'triangle', gain: 0.1, delay: 0.045 });
}

/** 翻转：轻微的泛音点缀（可选，跟随落子） */
export function playFlip(): void {
  if (!enabled) return;
  tone({ freq: 900, dur: 0.06, type: 'sine', gain: 0.07 });
}

/** 无子可下（跳过）：下行两音提示 */
export function playPass(): void {
  if (!enabled) return;
  tone({ freq: 440, dur: 0.12, type: 'sine', gain: 0.1 });
  tone({ freq: 330, dur: 0.16, type: 'sine', gain: 0.1, delay: 0.1 });
}

/** 胜利：上行大三和弦琶音 */
export function playWin(): void {
  if (!enabled) return;
  arp([523.25, 659.25, 783.99, 1046.5], 0.09, { type: 'triangle', gain: 0.16 });
}

/** 失败：下行小调 */
export function playLose(): void {
  if (!enabled) return;
  arp([440, 349.23, 261.63], 0.12, { type: 'sine', gain: 0.14 });
}

/** 平局：同度双音 */
export function playDraw(): void {
  if (!enabled) return;
  tone({ freq: 523.25, dur: 0.16, type: 'triangle', gain: 0.12 });
  tone({ freq: 523.25, dur: 0.16, type: 'triangle', gain: 0.12, delay: 0.18 });
}

/** 非法落子：短促低音提示 */
export function playInvalid(): void {
  if (!enabled) return;
  tone({ freq: 160, dur: 0.12, type: 'square', gain: 0.09 });
}
