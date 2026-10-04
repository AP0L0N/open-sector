"""
Tiger main gun: one cannon report, synthesized from scratch (original audio, no samples).

Layers, in the order the ear meets them:
  crack   - a few ms of bright broadband noise: the muzzle blast front
  thump   - a sine dropping ~95 Hz -> 38 Hz: the chest hit
  blast   - band-limited noise, 150-2000 Hz, fast decay: the body of the bang
  rumble  - low-passed brown noise, long decay with a slow wobble: the roll over the ground
  clank   - a quiet inharmonic metal tick ~0.32 s later: breech and recoil in the hull
  echo    - two dark, late copies: slapback off hills and walls

Output: mono 16-bit 44.1 kHz WAV, peak at -1 dBFS.

    python3 tools/sfx/tiger_cannon.py
"""

from __future__ import annotations

import pathlib
import wave

import numpy as np

SR = 44100
DUR = 2.0
SEED = 88

OUT = pathlib.Path(__file__).resolve().parents[2] / "gridlock/packages/client/src/assets/sfx/tiger-cannon.wav"


def t_axis(n: int) -> np.ndarray:
    return np.arange(n) / SR


def env(n: int, attack: float, decay: float, start: float = 0.0) -> np.ndarray:
    """Linear attack, exponential decay (time constant `decay` s), from `start` s."""
    t = t_axis(n) - start
    e = np.where(t < 0, 0.0, np.where(t < attack, t / max(attack, 1e-6), np.exp(-(t - attack) / decay)))
    return e


def one_pole_lp(x: np.ndarray, hz: float | np.ndarray) -> np.ndarray:
    hz_arr = np.broadcast_to(np.asarray(hz, dtype=float), x.shape)
    a = 1.0 - np.exp(-2 * np.pi * hz_arr / SR)
    y = np.empty_like(x)
    s = 0.0
    for i in range(len(x)):
        s += a[i] * (x[i] - s)
        y[i] = s
    return y


def lp(x: np.ndarray, hz: float | np.ndarray, order: int = 2) -> np.ndarray:
    for _ in range(order):
        x = one_pole_lp(x, hz)
    return x


def hp(x: np.ndarray, hz: float, order: int = 1) -> np.ndarray:
    for _ in range(order):
        x = x - one_pole_lp(x, hz)
    return x


def main() -> None:
    rng = np.random.default_rng(SEED)
    n = int(SR * DUR)
    t = t_axis(n)
    white = rng.standard_normal(n)

    # Crack: bright, 1 ms attack, ~6 ms decay.
    crack = hp(white, 1800, 2) * env(n, 0.0008, 0.006) * 1.4

    # Thump: pitch falls fast, then settles low.
    f = 38 + 57 * np.exp(-t / 0.07)
    phase = 2 * np.pi * np.cumsum(f) / SR
    thump = np.sin(phase) * env(n, 0.002, 0.22) * 1.3

    # Blast: the mid body, darkening as it dies.
    blast_src = hp(white, 150)
    blast = lp(blast_src, 2000 * np.exp(-t / 0.18) + 250, 2) * env(n, 0.003, 0.09) * 2.2

    # Rumble: brown noise, slow beat so the tail rolls instead of hissing.
    brown = np.cumsum(rng.standard_normal(n))
    brown = hp(brown, 20, 2)
    brown /= np.max(np.abs(brown)) + 1e-9
    wobble = 1 + 0.25 * np.sin(2 * np.pi * 3.1 * t) * np.sin(2 * np.pi * 0.7 * t + 1.0)
    rumble = lp(brown, 380 * np.exp(-t / 0.35) + 60, 2) * env(n, 0.015, 0.38) * wobble * 0.9

    # Clank: a heavy breech, three detuned partials, very short.
    clank = sum(
        np.sin(2 * np.pi * fr * t + p) * a
        for fr, p, a in ((612, 0.0, 1.0), (1433, 1.3, 0.6), (2671, 2.1, 0.35))
    ) * env(n, 0.001, 0.035, start=0.32) * 0.06

    dry = crack + thump + blast + rumble + clank

    # Slapback: two late, dark, quiet copies.
    echo = np.zeros(n)
    for delay, gain, cut in ((0.19, 0.22, 900), (0.47, 0.12, 600)):
        k = int(delay * SR)
        echo[k:] += lp(dry[: n - k], cut, 2) * gain
    mix = dry + echo

    # Soft clip for punch, fade the last 80 ms, normalize to -1 dBFS.
    mix = np.tanh(mix * 0.9) / np.tanh(0.9)
    fade = int(0.08 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade) ** 2
    mix -= np.mean(mix)
    mix *= 10 ** (-1 / 20) / np.max(np.abs(mix))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pcm = (mix * 32767).astype(np.int16)
    with wave.open(str(OUT), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {OUT} ({len(pcm) / SR:.2f}s, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
