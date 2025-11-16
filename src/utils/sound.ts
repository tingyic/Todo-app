type SoundName = "add" | "delete" | "done" | "undo" | "redo" | "error" | "click";

const ctxRef: { ctx: AudioContext | null } = { ctx: null };

function getAudioContext(): AudioContext {
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };

  if (!ctxRef.ctx) {
    const Constructor = g.AudioContext ?? g.webkitAudioContext;
    if (!Constructor) {
      throw new Error("Web Audio API not supported in this browser");
    }
    ctxRef.ctx = new Constructor();
  }
  return ctxRef.ctx!;
}

function playSound(name: SoundName, volume = 0.12) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.connect(ctx.destination);

    let oscType: OscillatorType = "sine";
    let freq = 440;
    let duration = 0.12;

    switch (name) {
      case "add": freq = 880; oscType = "sine"; duration = 0.12; break;
      case "delete": freq = 220; oscType = "sawtooth"; duration = 0.18; break;
      case "done": freq = 660; oscType = "triangle"; duration = 0.14; break;
      case "undo": freq = 520; oscType = "sine"; duration = 0.12; break;
      case "redo": freq = 760; oscType = "sine"; duration = 0.12; break;
      case "error": freq = 180; oscType = "sawtooth"; duration = 0.22; break;
      case "click": freq = 1200; oscType = "square"; duration = 0.06; break;
    }

    const osc = ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);

    // envelope
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.start(now);
    osc.stop(now + duration + 0.02);

    osc.onended = () => {
      try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
    };
  } catch {
    // ignore failures silently (older browsers, permissions)
  }
}

function haptic(pattern: number | number[] = 35) {
  try {
    const nav = navigator as Navigator & { vibrate?: (pattern: number | number[]) => unknown };
    if (typeof nav.vibrate === "function") nav.vibrate(pattern);
  } catch {
    /* no-op */
  }
}


export function isSoundEnabled(): boolean {
  try {
    return localStorage.getItem("todo-sound-enabled") !== "0";
  } catch {
    return true;
  }
}

export function setSoundEnabled(v: boolean) {
  try {
    localStorage.setItem("todo-sound-enabled", v ? "1" : "0");
  } catch {
    // ignore
  }
}

/** Play: will respect isSoundEnabled(); optionally vibrate as well */
export function play(name: SoundName, doHaptic = false) {
  if (!isSoundEnabled()) return;
  playSound(name);
  if (doHaptic) haptic(25);
}
