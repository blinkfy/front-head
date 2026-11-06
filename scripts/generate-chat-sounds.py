"""Generate the original received and sent chat notification sounds."""
import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'src' / 'static' / 'app' / 'sounds'
SR = 48000


def ease(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def note(freq, length, decay=.09, warmth=.30, attack=.006, gloss=.035):
    t = np.arange(round(length * SR)) / SR
    phase = 2 * np.pi * freq * t
    env = ease(t / attack) * np.exp(-t / decay) * ease((length - t) / .035)
    body = np.sin(phase + .075 * np.exp(-t / .035) * np.sin(phase * 2))
    body += .12 * np.sin(phase * 2.003) * np.exp(-t / .045)
    body += gloss * np.sin(phase * 3.985) * np.exp(-t / .030)
    body += warmth * np.sin(phase * .5) * np.exp(-t / (decay * .7))
    return body * env


def add(buffer, sound, start, gain=1):
    offset = round(start * SR)
    n = min(len(sound), len(buffer) - offset)
    if n > 0:
        buffer[offset:offset + n] += sound[:n] * gain


def master(signal, target_db, peak_limit=.22):
    stereo = np.column_stack([signal.copy(), signal.copy()])
    # Subtle short reflections give the notes the existing set's warm, soft body.
    for index, (delay, gain) in enumerate([(.019, .045), (.041, .025), (.068, .012)]):
        for channel in range(2):
            shift = round((delay + (.001 if (channel + index) % 2 else 0)) * SR)
            if shift < len(signal):
                stereo[shift:, channel] += signal[:-shift] * gain
    f = np.fft.rfftfreq(len(signal), 1 / SR)
    rolloff = 1 / np.sqrt(1 + (f / 4500) ** 8)
    for channel in range(2):
        stereo[:, channel] = np.fft.irfft(np.fft.rfft(stereo[:, channel]) * rolloff, len(signal))
    mono = stereo.mean(axis=1)
    active = np.abs(mono) > np.max(np.abs(mono)) * .018
    rms = np.sqrt(np.mean(mono[active] ** 2))
    gain = 10 ** (target_db / 20) / max(rms, 1e-9)
    stereo *= min(gain, peak_limit / max(np.max(np.abs(stereo)), 1e-9))
    fade = round(.009 * SR)
    stereo[:fade] *= ease(np.arange(fade) / fade)[:, None]
    stereo[-fade:] *= ease(np.arange(fade - 1, -1, -1) / fade)[:, None]
    return stereo


def render_received():
    # D5 to F#5: a quiet, friendly two-note upward cue, about 280 ms long.
    signal = np.zeros(round(SR * .28))
    add(signal, note(587.33, .205, .075, .28), .008, .62)
    add(signal, note(739.99, .175, .068, .22, gloss=.025), .092, .43)
    return master(signal, -29.5)


def render_sent():
    # A5: a brief, lighter acknowledgment below the received cue's level.
    signal = np.zeros(round(SR * .16))
    add(signal, note(880.0, .125, .052, .20, attack=.005, gloss=.018), .006, .58)
    return master(signal, -35.0, peak_limit=.14)


def write_mp3(name, signal):
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp:
        wav_path = Path(temp.name)
    try:
        pcm = np.round(signal * 32767).astype('<i2')
        with wave.open(str(wav_path), 'wb') as file:
            file.setnchannels(2)
            file.setsampwidth(2)
            file.setframerate(SR)
            file.writeframes(pcm.tobytes())
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path),
            '-codec:a', 'libmp3lame', '-b:a', '160k', str(OUT / name),
        ], check=True)
    finally:
        wav_path.unlink(missing_ok=True)
    public_dir = ROOT.parent / 'back-end' / 'public' / 'audio' / 'ui-sounds'
    public_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(OUT / name, public_dir / name)
    assert np.isfinite(signal).all()
    assert np.max(np.abs(signal)) < .30
    assert np.max(np.abs(signal[0])) == 0 and np.max(np.abs(signal[-1])) == 0
    return {
        'file': str(OUT / name),
        'seconds': len(signal) / SR,
        'peak_dbfs': round(20 * math.log10(max(np.max(np.abs(signal)), 1e-9)), 2),
    }


if __name__ == '__main__':
    print({'generated': [
        write_mp3('07-message-received.mp3', render_received()),
        write_mp3('08-message-sent.mp3', render_sent()),
    ]})
