"""Original procedural UI sound set. No third-party audio samples."""
import argparse, json, math, os, subprocess, tempfile, wave
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output-dir', type=Path, default=Path(tempfile.gettempdir()) / 'fentouxia-ui-sounds')
OUT = parser.parse_args().output_dir
OUT.mkdir(parents=True, exist_ok=True)
SR = 48000
rng = np.random.default_rng(271027)

def ease(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)

def note(freq, length, decay=.10, warmth=.30, attack=.006, gloss=.06):
    t = np.arange(round(length * SR)) / SR
    phase = 2 * np.pi * freq * t
    env = ease(t / attack) * np.exp(-t / decay) * ease((length - t) / .045)
    # Resonant, softly struck body with a quieter, faster-decaying upper layer.
    body = np.sin(phase + .075 * np.exp(-t / .035) * np.sin(phase * 2))
    body += .14 * np.sin(phase * 2.003) * np.exp(-t / .050)
    body += gloss * np.sin(phase * 3.985) * np.exp(-t / .032)
    body += warmth * np.sin(phase * .5) * np.exp(-t / (decay * .7))
    return body * env

def add(buffer, sound, start, gain=1):
    offset = round(start * SR)
    n = min(len(sound), len(buffer) - offset)
    if n > 0:
        buffer[offset:offset+n] += sound[:n] * gain

def air(length, center, width, gain=.05):
    n = round(length * SR)
    white = rng.normal(size=n)
    spectrum = np.fft.rfft(white)
    freq = np.fft.rfftfreq(n, 1/SR)
    spectrum *= np.exp(-.5 * ((freq - center) / width) ** 2)
    result = np.fft.irfft(spectrum, n)
    result /= max(1e-8, np.max(np.abs(result)))
    t = np.arange(n) / SR
    return result * np.sin(np.pi * t / length) ** 2 * gain

def room(signal, width=.045):
    # Keep the direct sound centered; only the quiet short reflections are wide.
    stereo = np.column_stack([signal.copy(), signal.copy()])
    for index, (delay, gain) in enumerate([(.019,.065),(.033,.043),(.057,.027),(.081,.014),(.119,.008)]):
        for channel in range(2):
            shift = round((delay + (.0014 if (channel + index) % 2 else 0)) * SR)
            if shift < len(signal):
                stereo[shift:, channel] += signal[:-shift] * gain * (1 + width * (1 if channel else -1))
    return stereo

def master(signal, rms_db, peak_limit=.29):
    stereo = room(signal)
    # Gentle rolloff above 4.5 kHz avoids a hard, piercing attack on small speakers.
    f = np.fft.rfftfreq(len(signal), 1/SR)
    rolloff = 1 / np.sqrt(1 + (f / 4500) ** 8)
    for ch in range(2):
        stereo[:,ch] = np.fft.irfft(np.fft.rfft(stereo[:,ch]) * rolloff, len(signal))
    mono = stereo.mean(axis=1)
    active = np.abs(mono) > np.max(np.abs(mono)) * .018
    rms = np.sqrt(np.mean(mono[active] ** 2))
    gain = 10 ** (rms_db / 20) / max(rms, 1e-9)
    stereo *= min(gain, peak_limit / max(np.max(np.abs(stereo)), 1e-9))
    # Quiet finite edges prevent clicks and cut-off tails.
    fade = round(.012 * SR)
    stereo[:fade] *= ease(np.arange(fade) / fade)[:, None]
    stereo[-fade:] *= ease(np.arange(fade - 1, -1, -1) / fade)[:, None]
    return stereo

specs = [
    ('01-confirm','操作确认',.30,-25.5, .012),
    ('02-glide','机器人飞入',.44,-30.0, .17),
    ('03-success','识别成功',.72,-24.0, .13),
    ('04-retry','温和重试',.54,-28.0, .014),
    ('05-reveal','效果图完成',.78,-26.0, .19),
    ('06-reward','获得奖励',1.00,-24.0, .18),
]
manifest = []
rendered = []
for index, (name, title, duration, target, cue) in enumerate(specs):
    x = np.zeros(round(SR * duration))
    if index == 0:
        add(x, note(587.33,.19,.052,.34,gloss=.035),.012,.85)
        add(x, note(739.99,.17,.055,.20,gloss=.025),.075,.32)
        add(x, air(.055,1400,650,.007),.012)
    elif index == 1:
        t = np.arange(round(SR * .34)) / SR
        freq = 290 + 160 * ease(t / .34)
        tone = np.sin(2*np.pi*np.cumsum(freq)/SR) * np.sin(np.pi*t/.34)**2 * .035
        add(x, air(.35,1050,700,.16),.016)
        add(x, tone,.025)
        add(x, note(587.33,.16,.055,.20,gloss=.015),.252,.13)
    elif index == 2:
        for start, freq, strength in [(.012,587.33,.66),(.125,739.99,.57),(.246,880.0,.62)]:
            add(x,note(freq,.38,.105,.26,attack=.007,gloss=.045),start,strength)
        add(x,note(293.665,.38,.13,.10,attack=.013,gloss=.01),.242,.18)
    elif index == 3:
        add(x,note(440.0,.27,.087,.36,attack=.010,gloss=.012),.014,.65)
        add(x,note(369.99,.32,.095,.30,attack=.011,gloss=.01),.159,.55)
    elif index == 4:
        add(x,air(.29,1900,1000,.025),.020)
        for start, freq, strength in [(.055,587.33,.34),(.17,880.0,.40),(.235,1108.73,.24),(.32,1174.66,.12)]:
            add(x,note(freq,.39,.13,.12,attack=.012,gloss=.025),start,strength)
        add(x,note(440.0,.41,.15,.20,attack=.018,gloss=.01),.19,.13)
    else:
        for start, freq, strength in [(.012,587.33,.50),(.105,739.99,.46),(.20,880.0,.48),(.305,987.77,.32),(.414,1174.66,.42)]:
            add(x,note(freq,.46,.135,.22,attack=.008,gloss=.04),start,strength)
        add(x,note(293.665,.52,.19,.12,attack=.016,gloss=.01),.40,.24)
        add(x,note(880.0,.43,.14,.15,attack=.012,gloss=.02),.47,.19)
    result = master(x, target)
    pcm = np.round(result * 32767).astype('<i2')
    with wave.open(str(OUT / (name+'.wav')),'wb') as file:
        file.setnchannels(2); file.setsampwidth(2); file.setframerate(SR)
        file.writeframes(pcm.tobytes())
    assert np.isfinite(result).all()
    assert np.max(np.abs(result)) < .30
    assert np.max(np.abs(result[0])) == 0 and np.max(np.abs(result[-1])) == 0
    manifest.append({'id':name,'title':title,'duration':duration,'cue_seconds':cue,
        'peak_dbfs':round(20*math.log10(np.max(np.abs(result))),2),
        'wav':name+'.wav','mp3':name+'.mp3','loop':False})
    rendered.append(result)

# Same order as the manifest, with enough silence to hear each individual tail.
preview = []
for sound in rendered:
    preview += [sound, np.zeros((round(SR*.65),2))]
montage = np.concatenate(preview)
with wave.open(str(OUT/'00-full-preview.wav'),'wb') as file:
    file.setnchannels(2); file.setsampwidth(2); file.setframerate(SR)
    file.writeframes(np.round(montage*32767).astype('<i2').tobytes())
(OUT/'manifest.json').write_text(json.dumps({'version':2,'sample_rate':SR,'sounds':manifest},ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'README.txt').write_text('分投侠交互音效 · 原创音效 v2\n\n全部由随包 Python 脚本合成，未使用第三方音频采样。\n试听顺序：操作确认、机器人飞入、识别成功、温和重试、效果图完成、获得奖励。\nWAV 为制作母版，MP3 为播放版本。manifest.json 记录时长及建议对齐的声音重心。\n整套音效不循环；重试和滑动音刻意比成功音轻。\n音效由应用的 ui-sounds.js 统一管理，默认开启，支持在设置中关闭。\n',encoding='utf-8')
print(json.dumps({'directory':str(OUT),'sounds':manifest},ensure_ascii=False))

for item in manifest:
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(OUT/item['wav']), '-codec:a', 'libmp3lame', '-b:a', '160k', str(OUT/item['mp3'])], check=True)
