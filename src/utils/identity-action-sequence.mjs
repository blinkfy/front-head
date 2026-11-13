// Client-only capture assistance, never an authentication decision.
export function createIdentityActionSequence(actions = ['blink', 'mouth']) {
  let neutral = 0, index = 0, active = 0, recovered = 0, entered = false, done = false, previousTime = -1
  return {
    pause() {
      // Preserve completed steps, but never combine partial actions across an interruption.
      neutral = 0; active = 0; recovered = 0; entered = false; done = false; previousTime = -1
    },
    update(blink, mouth, timestamp) {
      if (timestamp - previousTime < 90) return { index, done }
      previousTime = timestamp
      const front = blink < 0.25 && mouth < 0.25
      if (neutral < 3) { neutral = front ? neutral + 1 : 0; return { index, done, neutral: false } }
      if (index >= actions.length) { done = front; return { index, done } }
      const score = actions[index] === 'blink' ? blink : mouth
      const other = actions[index] === 'blink' ? mouth : blink
      if (!entered) { active = score > 0.5 && other < 0.35 ? active + 1 : 0; entered = active >= 2 }
      else {
        recovered = front ? recovered + 1 : 0
        if (recovered >= 2) { index++; entered = false; active = 0; recovered = 0 }
      }
      return { index, done }
    }
  }
}
