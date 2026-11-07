"""Generate the original looping incoming-call ringtone for web calls."""
import hashlib
import importlib.util
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FRONT_OUT = ROOT / 'src' / 'static' / 'app' / 'sounds'
BACK_OUT = ROOT.parent / 'back-end' / 'public' / 'audio' / 'ui-sounds'
NAME = '09-incoming-call.mp3'
SR = 48000


def load_chat_synth():
    """Reuse the existing soft note synthesis and mastering helpers."""
    path = Path(__file__).with_name('generate-chat-sounds.py')
    spec = importlib.util.spec_from_file_location('chat_sound_synth', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render(synth):
    # Two original, gently rising three-note calls; the final second is a rest.
    # The phrase uses a pentatonic contour to keep the repeated ring calm.
    signal = np.zeros(round(SR * 4.0))
    phrase = [
        (659.25, 0.25, 0.08, 0.23),
        (783.99, 0.25, 0.09, 0.25),
        (987.77, 0.34, 0.12, 0.28),
    ]
    for start, phrase_gain in ((0.14, 0.78), (1.72, 0.68)):
        for index, (freq, length, decay, warmth) in enumerate(phrase):
            onset = start + (0.0, 0.34, 0.72)[index]
            tone = synth.note(freq, length, decay, warmth, attack=.009, gloss=.026)
            synth.add(signal, tone, onset, phrase_gain * (0.88 if index == 2 else 1.0))

    # The existing mastering adds subtle body and a short edge fade. Its output
    # remains at exactly four seconds for predictable loop timing.
    return synth.master(signal, -25.0, peak_limit=.18)


def write_mp3(signal):
    FRONT_OUT.mkdir(parents=True, exist_ok=True)
    BACK_OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp:
        wav_path = Path(temp.name)
    try:
        pcm = np.round(np.clip(signal, -1, 1) * 32767).astype('<i2')
        with wave.open(str(wav_path), 'wb') as audio:
            audio.setnchannels(2)
            audio.setsampwidth(2)
            audio.setframerate(SR)
            audio.writeframes(pcm.tobytes())
        front_path = FRONT_OUT / NAME
        subprocess.run([
            'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav_path),
            '-codec:a', 'libmp3lame', '-b:a', '96k', '-write_xing', '0', str(front_path),
        ], check=True)
    finally:
        wav_path.unlink(missing_ok=True)
    back_path = BACK_OUT / NAME
    shutil.copyfile(front_path, back_path)
    return front_path, back_path


if __name__ == '__main__':
    synth = load_chat_synth()
    signal = render(synth)
    front, back = write_mp3(signal)
    digest = hashlib.sha256(front.read_bytes()).hexdigest()
    assert front.stat().st_size < 85 * 1024
    assert front.read_bytes() == back.read_bytes()
    assert np.isfinite(signal).all()
    assert np.max(np.abs(signal)) < .30
    print({
        'generated': str(front),
        'source_seconds': len(signal) / SR,
        'source_peak_dbfs': round(20 * np.log10(max(np.max(np.abs(signal)), 1e-9)), 2),
        'size_bytes': front.stat().st_size,
        'sha256': digest,
    })
