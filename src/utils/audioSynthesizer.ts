import { TrafficColor } from '../types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private isLooping = false;
  private isPaused = false;
  private activeColor: TrafficColor | null = null;
  private activeOnEnd: (() => void) | undefined = undefined;
  private loopEndTimestamp: number = 0;
  private remainingLoopMs: number = 0;
  private currentTimeout: number | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private masterGain: GainNode | null = null;
  private volume = 0.8;
  private customAudio: HTMLAudioElement | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended' && !this.isPaused) {
      this.ctx.resume().catch(() => {});
    }
    if (!this.masterGain && this.ctx) {
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
  }

  public setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
    if (this.customAudio) {
      this.customAudio.volume = this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public pause() {
    this.isPaused = true;
    if (this.currentTimeout) {
      this.remainingLoopMs = Math.max(100, this.loopEndTimestamp - Date.now());
      window.clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
    if (this.customAudio) {
      this.customAudio.pause();
    }
  }

  public resume() {
    this.isPaused = false;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.customAudio) {
      this.customAudio.play().catch(() => {});
    }
    if (this.isLooping && this.activeColor) {
      const delay = Math.max(50, this.remainingLoopMs || 500);
      this.loopEndTimestamp = Date.now() + delay;
      this.currentTimeout = window.setTimeout(() => {
        if (this.isLooping && !this.isPaused && this.activeColor) {
          this.playColorSynth(this.activeColor, this.activeOnEnd);
        } else if (this.activeOnEnd && !this.isPaused) {
          this.activeOnEnd();
        }
      }, delay);
    }
  }

  // Play pleasant mechanical/tactile click sound on button press
  public playClickSound() {
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(300, this.ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.3 * this.volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start();
      osc.stop(this.ctx.currentTime + 0.05);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  // Play a gentle musical chime notification (playNotificationAlert)
  public playNotificationAlert() {
    try {
      this.initCtx();
      if (!this.ctx || !this.masterGain) return;
      const now = this.ctx.currentTime + 0.05;
      const chimeNotes = [this.notes.C5, this.notes.E5, this.notes.G5, this.notes.C6];
      chimeNotes.forEach((freq, idx) => {
        this.playNote(freq, now + idx * 0.18, 0.6, 'sine', 0.8);
      });
    } catch {
      // Fallback
    }
  }

  // Play a single musical note with envelope
  private playNote(
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType = 'triangle',
    decay = 0.2
  ) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(0.4 * this.volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + Math.max(0.05, duration * decay));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(startTime);
    osc.stop(startTime + duration);
    this.activeOscillators.push(osc);
  }

  // Note frequency map (Hz)
  private readonly notes = {
    C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.00, A3: 220.00, B3: 246.94,
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, B4: 493.88,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.00, B5: 987.77,
    C6: 1046.50
  };

  public playColorSynth(color: TrafficColor, onEnd?: () => void) {
    this.stop();
    this.initCtx();
    if (!this.ctx) return;

    this.isLooping = true;
    this.isPaused = false;
    this.activeColor = color;
    this.activeOnEnd = onEnd;
    const now = this.ctx.currentTime + 0.05;

    if (color === 'red') {
      // 🔴 Красная (🚀): Активность / Поехали! / Энергия (Upbeat, Driving, Fast Tempo)
      const bpm = 155;
      const beat = 60 / bpm;
      const melody: [number, number, number][] = [
        [this.notes.E5, 0 * beat, beat * 0.7],
        [this.notes.E5, 0.5 * beat, beat * 0.7],
        [this.notes.G5, 1 * beat, beat * 1.2],
        [this.notes.E5, 2 * beat, beat * 0.7],
        [this.notes.C5, 2.5 * beat, beat * 0.7],
        [this.notes.G5, 3 * beat, beat * 1.5],

        [this.notes.A5, 4 * beat, beat * 0.8],
        [this.notes.G5, 5 * beat, beat * 0.8],
        [this.notes.F5, 6 * beat, beat * 0.8],
        [this.notes.D5, 7 * beat, beat * 0.8],
        [this.notes.C5, 8 * beat, beat * 1.8],
      ];

      const bass: [number, number, number][] = [
        [this.notes.C4, 0 * beat, beat * 0.5],
        [this.notes.E4, 1 * beat, beat * 0.5],
        [this.notes.G4, 2 * beat, beat * 0.5],
        [this.notes.C4, 3 * beat, beat * 0.5],
        [this.notes.F4, 4 * beat, beat * 0.5],
        [this.notes.C4, 5 * beat, beat * 0.5],
        [this.notes.G4, 6 * beat, beat * 0.5],
        [this.notes.G3, 7 * beat, beat * 0.5],
        [this.notes.C4, 8 * beat, beat * 1.2],
      ];

      melody.forEach(([freq, offset, dur]) => {
        this.playNote(freq, now + offset, dur, 'triangle', 0.5);
      });
      bass.forEach(([freq, offset, dur]) => {
        this.playNote(freq, now + offset, dur, 'sawtooth', 0.3);
      });

      const loopLength = 9.5 * beat;
      this.loopEndTimestamp = Date.now() + loopLength * 1000;
      this.currentTimeout = window.setTimeout(() => {
        if (this.isLooping && !this.isPaused) {
          this.playColorSynth(color, onEnd);
        } else if (onEnd && !this.isPaused) {
          onEnd();
        }
      }, loopLength * 1000);

    } else if (color === 'yellow') {
      // 🟡 Жёлтая (🔄): Восстановление / Настройка / Речь (Playful melodic chime & steady rhythm)
      const bpm = 120;
      const step = 60 / bpm;
      const melody: [number, number, number][] = [
        [this.notes.G4, 0 * step, step * 0.8],
        [this.notes.C5, 0.5 * step, step * 0.8],
        [this.notes.E5, 1 * step, step * 0.8],
        [this.notes.G5, 1.5 * step, step * 0.8],
        [this.notes.A5, 2 * step, step * 1.2],
        [this.notes.G5, 3 * step, step * 1.5],

        [this.notes.F5, 4 * step, step * 0.8],
        [this.notes.E5, 4.5 * step, step * 0.8],
        [this.notes.D5, 5 * step, step * 0.8],
        [this.notes.E5, 5.5 * step, step * 0.8],
        [this.notes.C5, 6 * step, step * 2.0],
      ];

      const bass: [number, number, number][] = [
        [this.notes.C3, 0 * step, step * 0.6],
        [this.notes.G3, 1 * step, step * 0.6],
        [this.notes.C3, 2 * step, step * 0.6],
        [this.notes.F3, 3 * step, step * 0.6],
        [this.notes.G3, 4 * step, step * 0.6],
        [this.notes.G3, 5 * step, step * 0.6],
        [this.notes.C3, 6 * step, step * 1.2],
      ];

      melody.forEach(([freq, offset, dur]) => {
        this.playNote(freq, now + offset, dur, 'triangle', 0.6);
      });
      bass.forEach(([freq, offset, dur]) => {
        this.playNote(freq, now + offset, dur, 'square', 0.35);
      });

      const loopLength = 7.5 * step;
      this.loopEndTimestamp = Date.now() + loopLength * 1000;
      this.currentTimeout = window.setTimeout(() => {
        if (this.isLooping && !this.isPaused) {
          this.playColorSynth(color, onEnd);
        } else if (onEnd && !this.isPaused) {
          onEnd();
        }
      }, loopLength * 1000);

    } else if (color === 'green') {
      // 🟢 Зелёная (🌊): Спокойствие / Умиротворение / Сон (Soft soothing waves & lullaby)
      const pattern: [number, number, number][] = [
        [this.notes.C5, 0.0, 0.6],
        [this.notes.E5, 0.6, 0.6],
        [this.notes.G5, 1.2, 0.8],
        [this.notes.E5, 2.0, 0.6],
        [this.notes.F5, 2.6, 0.6],
        [this.notes.A5, 3.2, 0.8],
        [this.notes.G5, 4.0, 1.2],

        [this.notes.E5, 5.4, 0.6],
        [this.notes.D5, 6.0, 0.6],
        [this.notes.C5, 6.6, 0.8],
        [this.notes.D5, 7.4, 0.6],
        [this.notes.E5, 8.0, 0.6],
        [this.notes.C5, 8.6, 1.5],

        // Ambient Bass & Sea Wave resonance
        [this.notes.C3, 0.0, 2.0],
        [this.notes.F3, 2.6, 2.0],
        [this.notes.G3, 4.0, 1.8],
        [this.notes.C3, 5.4, 2.2],
        [this.notes.G3, 7.4, 1.5],
        [this.notes.C3, 8.6, 2.0],
      ];

      const loopLength = 10.5;
      pattern.forEach(([freq, offset, dur]) => {
        this.playNote(freq, now + offset, dur, 'sine', 0.95);
      });

      this.loopEndTimestamp = Date.now() + loopLength * 1000;
      this.currentTimeout = window.setTimeout(() => {
        if (this.isLooping && !this.isPaused) {
          this.playColorSynth(color, onEnd);
        } else if (onEnd && !this.isPaused) {
          onEnd();
        }
      }, loopLength * 1000);
    }
  }

  public playCustomAudio(url: string, onEnded?: () => void) {
    this.stop();
    this.customAudio = new Audio(url);
    this.customAudio.volume = this.volume;
    this.customAudio.play().catch(() => {
      // Handle playback error
    });
    this.customAudio.onended = () => {
      if (onEnded) onEnded();
    };
  }

  public stop() {
    this.isLooping = false;
    this.isPaused = false;
    this.activeColor = null;
    this.activeOnEnd = undefined;
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
    this.activeOscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // Already stopped
      }
    });
    this.activeOscillators = [];

    if (this.customAudio) {
      this.customAudio.pause();
      this.customAudio.currentTime = 0;
      this.customAudio = null;
    }
  }
}

export const soundEngine = new SoundEngine();
