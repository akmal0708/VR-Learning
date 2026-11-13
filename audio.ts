// Zero-dependency Web Audio API procedural soundscape & interaction SFX

export class IslandAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private surfGain: GainNode | null = null;
  private fallsGain: GainNode | null = null;
  private muted = false;
  private started = false;

  public start(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.45;
    this.masterGain.connect(this.ctx.destination);

    // Filtered noise buffer for ocean surf & waterfall
    const bufferSize = this.ctx.sampleRate * 3;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      lastOut = (lastOut + 0.035 * white) / 1.035;
      data[i] = lastOut * 2.8;
    }

    // Ocean breeze & gentle surf
    const surfSrc = this.ctx.createBufferSource();
    surfSrc.buffer = noiseBuffer;
    surfSrc.loop = true;
    const surfFilter = this.ctx.createBiquadFilter();
    surfFilter.type = 'lowpass';
    surfFilter.frequency.value = 340;
    this.surfGain = this.ctx.createGain();
    this.surfGain.gain.value = 0.14;
    surfSrc.connect(surfFilter);
    surfFilter.connect(this.surfGain);
    this.surfGain.connect(this.masterGain);
    surfSrc.start();

    // Waterfall rush (attenuated by distance)
    const fallsSrc = this.ctx.createBufferSource();
    fallsSrc.buffer = noiseBuffer;
    fallsSrc.loop = true;
    const fallsFilter = this.ctx.createBiquadFilter();
    fallsFilter.type = 'bandpass';
    fallsFilter.frequency.value = 780;
    fallsFilter.Q.value = 0.65;
    this.fallsGain = this.ctx.createGain();
    this.fallsGain.gain.value = 0.0;
    fallsSrc.connect(fallsFilter);
    fallsFilter.connect(this.fallsGain);
    this.fallsGain.connect(this.masterGain);
    fallsSrc.start();

    this.started = true;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.45, this.ctx.currentTime, 0.06);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public updateAmbience(distToWaterfall: number, distToShore: number, time: number): void {
    if (!this.ctx || !this.surfGain || !this.fallsGain) return;
    const now = this.ctx.currentTime;

    // Gentle surf swell modulated over time and coastal proximity
    const shoreFactor = Math.max(0.18, 1 - Math.min(distToShore, 85) / 85);
    const waveSwell = 0.72 + 0.28 * Math.sin(time * 0.42);
    this.surfGain.gain.setTargetAtTime(0.18 * shoreFactor * waveSwell, now, 0.15);

    // Waterfall roar increases smoothly within 52 units
    const fallsFactor = Math.max(0, 1 - distToWaterfall / 54);
    this.fallsGain.gain.setTargetAtTime(fallsFactor * fallsFactor * 0.34, now, 0.15);
  }

  public playFootstep(surface: 'stone' | 'sand' | 'grass'): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    if (surface === 'stone') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(165 + Math.random() * 28, now);
      osc.frequency.exponentialRampToValueAtTime(58, now + 0.075);
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    } else if (surface === 'sand') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95 + Math.random() * 18, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120 + Math.random() * 20, now);
      osc.frequency.exponentialRampToValueAtTime(52, now + 0.08);
      filter.type = 'lowpass';
      filter.frequency.value = 540;
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    }

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playCrystalChime(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [587.33, 880, 1174.66, 1567.98];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.11, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.55);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }

  public playDoorToggle(opening: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(opening ? 92 : 128, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 132 : 74, now + 0.26);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playSignOpen(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  public dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
