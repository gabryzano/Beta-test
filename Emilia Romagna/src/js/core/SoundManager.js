class SoundManager {
  constructor() {
    // Initialize mute state
    window.soundMuted = window.soundMuted || false;
    this.sounds = {
      phone_ring: new Howl({
        src: ['src/assets/sounds/phone_ring.mp3'],
        loop: true,
        html5: true,
        volume: 1.0,
        onloaderror: (id, err) => console.error('[SoundManager] phone_ring load error', err),
        onplayerror: (id, err) => {
          console.error('[SoundManager] phone_ring play error', err);
          // Attempt to unload and retry
          const sound = this.sounds.phone_ring;
          sound.load();
          sound.play();
        }
      }),
      confirm: new Howl({
        src: ['src/assets/sounds/confirm.mp3'],
        html5: true,
        volume: 1.0,
        onloaderror: (id, err) => console.error('[SoundManager] confirm load error', err),
        onplayerror: (id, err) => console.error('[SoundManager] confirm play error', err)
      }),
      report: new Howl({
        src: ['src/assets/sounds/report.mp3'],
        html5: true,
        volume: 1.0,
        onloaderror: (id, err) => console.error('[SoundManager] report load error', err),
        onplayerror: (id, err) => console.error('[SoundManager] report play error', err)
      }),
      radio: new Howl({
        src: ['src/assets/sounds/radio.mp3'],
        html5: true,
        volume: 1.0,
        onloaderror: (id, err) => console.error('[SoundManager] radio load error', err),
        onplayerror: (id, err) => console.error('[SoundManager] radio play error', err)
      })
    };
  }
  play(key) {
    if (window.soundMuted) return;
    const s = this.sounds[key];
    if (!s) {
      console.error('[SoundManager] Sound not found:', key);
      return;
    }
    console.log(`[SoundManager] requested play: ${key}, state: ${s.state ? s.state() : 'unknown'}`);
    if (key === 'phone_ring') {
      s.play();
      // stop after 2 seconds
      setTimeout(() => s.stop(), 2000);
    } else {
      // Ensure sound is loaded before playing
      if (typeof s.state === 'function' && s.state() !== 'loaded') {
        console.log(`[SoundManager] ${key} not loaded, loading and will play on load`);
        s.once('load', () => {
          console.log(`[SoundManager] ${key} loaded, playing now`);
          s.play();
          // stop after 2 seconds
          setTimeout(() => s.stop(), 2000);
        });
        s.load();
      } else {
        s.play();
        // stop after 2 seconds for confirm and report
        setTimeout(() => s.stop(), 2000);
      }
    }
  }
}
window.soundManager = new SoundManager();
