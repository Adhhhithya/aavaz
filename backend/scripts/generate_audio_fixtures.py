import os
import numpy as np
import soundfile as sf

def generate_fixtures():
    fixtures_dir = os.path.join(os.path.dirname(__file__), '..', 'tests', 'fixtures', 'audio')
    os.makedirs(fixtures_dir, exist_ok=True)

    sr = 16000
    duration = 2.0  # seconds
    t = np.linspace(0, duration, int(sr * duration), False)

    # 1. Pure Silence
    silence = np.zeros_like(t)
    sf.write(os.path.join(fixtures_dir, 'silence.wav'), silence, sr)

    # 2. Pure Sine 440Hz (no jitter/shimmer)
    sine_440 = np.sin(440 * 2 * np.pi * t)
    sf.write(os.path.join(fixtures_dir, 'sine_440.wav'), sine_440, sr)

    # 3. Noisy Sine (to simulate jitter/shimmer/stress)
    noise = np.random.normal(0, 0.1, size=t.shape)
    # add some frequency modulation for jitter
    fm = np.sin(5 * 2 * np.pi * t) * 10
    noisy_sine = np.sin((440 + fm) * 2 * np.pi * t) + noise
    sf.write(os.path.join(fixtures_dir, 'distress_simulation.wav'), noisy_sine, sr)

    print(f"Generated fixtures in {fixtures_dir}")

if __name__ == "__main__":
    generate_fixtures()
