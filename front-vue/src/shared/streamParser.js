export function createStreamTextParser(onTextChunk) {
  let buffer = '';

  return {
    push(chunkText) {
      buffer += String(chunkText || '');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          const text = parsed && typeof parsed.delta === 'string'
            ? parsed.delta
            : (parsed && typeof parsed.text === 'string' ? parsed.text : '');
          if (text) onTextChunk(text, parsed);
        } catch (_) {
          onTextChunk(trimmed, null);
        }
      }
    },
    flush() {
      const last = buffer.trim();
      if (!last) return;
      try {
        const parsed = JSON.parse(last);
        const text = parsed && typeof parsed.delta === 'string'
          ? parsed.delta
          : (parsed && typeof parsed.text === 'string' ? parsed.text : '');
        if (text) onTextChunk(text, parsed);
      } catch (_) {
        onTextChunk(last, null);
      }
      buffer = '';
    }
  };
}
