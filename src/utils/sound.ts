export type SoundName = "add" | "delete" | "done" | "undo" | "redo" | "error" | "click" | "celebrate" | "celebrate-pro"| "whoosh";

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

async function playSound(name: SoundName, volume = 0.2) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const now = ctx.currentTime;

    // helper to create an oscillator with gain envelope
    const makeTone = (freqStart: number, freqEnd: number, type: OscillatorType, dur = 0.2, offset = 0) => {
      const t0 = now + offset;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t0);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, t0);
      // gentle ramp if freqEnd != freqStart
      if (freqEnd !== freqStart) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);

      osc.connect(gain);

      gain.gain.cancelScheduledValues(t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);

      osc.onended = () => {
        try { osc.disconnect(); gain.disconnect(); } catch { /* ignore */ }
      };
    };

    switch (name) {
      case "add":
        makeTone(880, 880, "sine", 0.12, 0);
        break;
      case "delete":
        makeTone(220, 220, "sawtooth", 0.18, 0);
        break;
      case "done":
        makeTone(660, 660, "triangle", 0.14, 0);
        break;
      case "undo":
        makeTone(520, 520, "sine", 0.12, 0);
        break;
      case "redo":
        makeTone(760, 760, "sine", 0.12, 0);
        break;
      case "error":
        makeTone(180, 180, "sawtooth", 0.22, 0);
        break;
      case "click":
        makeTone(1200, 1200, "square", 0.06, 0);
        break;
      case "celebrate":
        makeTone(880, 1100, "triangle", 0.14, 0);
        makeTone(1100, 1400, "triangle", 0.12, 0.06);
        makeTone(1400, 1760, "triangle", 0.12, 0.12); 
        break;
      case "celebrate-pro":
        makeTone(880, 1100, "triangle", 0.14, 0);
        makeTone(1100, 1400, "triangle", 0.12, 0.06);
        makeTone(1400, 1760, "triangle", 0.12, 0.12);
        makeTone(1760, 2000, "sine", 0.12, 0.18);
        makeTone(2000, 2200, "sine", 0.12, 0.24);
        break;
      case "whoosh": {
        const masterGain = ctx.createGain();
        const masterLevel = volume * 5;
        masterGain.gain.setValueAtTime(masterLevel, now);
        masterGain.connect(ctx.destination);

        const sampleRate = ctx.sampleRate;
        const length = Math.floor(sampleRate * 1.2);
        const noiseBuf = ctx.createBuffer(1, length, sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = (Math.random() * 2 - 1) * (1 - i / length) * 0.6;
        }
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = noiseBuf;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "bandpass";
        noiseFilter.Q.value = 0.7;
        noiseFilter.frequency.setValueAtTime(2200, now);

        noiseFilter.frequency.exponentialRampToValueAtTime(300, now + 0.9);

        const hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.setValueAtTime(400, now);
        hp.frequency.exponentialRampToValueAtTime(60, now + 0.65);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.0001, now);
        noiseGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.03);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

        noiseSrc.connect(noiseFilter);
        noiseFilter.connect(hp);
        hp.connect(noiseGain);
        noiseGain.connect(masterGain);

        const rumble = ctx.createOscillator();
        rumble.type = "sine";
        rumble.frequency.setValueAtTime(60, now);
        const rumbleGain = ctx.createGain();
        rumbleGain.gain.setValueAtTime(0.0001, now);

        rumbleGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.35), now + 0.05);
        rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

        const lowpass = ctx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(300, now);

        rumble.connect(lowpass);
        lowpass.connect(rumbleGain);
        rumbleGain.connect(masterGain);

        noiseSrc.start(now);
        noiseSrc.stop(now + 1.05);
        rumble.start(now);
        rumble.stop(now + 1.05);

        // cleanup
        setTimeout(() => {
          try { noiseSrc.disconnect(); noiseFilter.disconnect(); hp.disconnect(); noiseGain.disconnect(); rumble.disconnect(); rumbleGain.disconnect(); lowpass.disconnect(); masterGain.disconnect(); } catch { /* empty */ }
        }, 1400);

        break;
      }
    }
  } catch {
    // ignore failures silently (older browsers, permissions)
  }
}

export function haptic(pattern: number | number[] = 35) {
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

export function play(name: SoundName, doHaptic = false) {
  if (!isSoundEnabled()) return;
  playSound(name);
  if (doHaptic) haptic(25);
}
