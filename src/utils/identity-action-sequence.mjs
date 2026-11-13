// Client-only capture assistance, never an authentication decision.
export function createIdentityActionSequence(actions = ['blink', 'mouth']) {
  let neutral = 0, index = 0, active = 0, recovered = 0, entered = false, done = false, previousTime = -1, openBlink = 0
  return {
    pause() {
      // Preserve completed steps, but never combine partial actions across an interruption.
      neutral = 0; active = 0; recovered = 0; entered = false; done = false; previousTime = -1; openBlink = 0
    },
    update(blink, mouth, timestamp) {
      if (timestamp - previousTime < 90) return { index, done }
      previousTime = timestamp
      const front = blink < 0.25 && mouth < 0.25
      if (neutral < 3) {
        if (front) { openBlink = (openBlink * neutral + blink) / (neutral + 1); neutral++ }
        else { neutral = 0; openBlink = 0 }
        return { index, done, neutral: false }
      }
      if (index >= actions.length) return { index, done: true }
      const isMouth = actions[index] === 'mouth'
      const score = isMouth ? mouth : blink
      if (!entered) {
        const threshold = isMouth ? .5 : Math.max(.38, openBlink + .24)
        active = score > threshold && (!isMouth || blink < .35) ? active + 1 : 0
        // A clear short closure may occupy one sampled frame; weaker signals
        // still need two. Both paths must subsequently reopen the eyes.
        entered = active >= 2 || (!isMouth && active === 1 && blink > Math.max(.68, openBlink + .45))
        // Opening the mouth completes this step; neutral expression is checked before capture.
        if (entered && isMouth) { index++; entered = false; active = 0; recovered = 0 }
      }
      else {
        recovered = blink < Math.min(.35, Math.max(.25, openBlink + .10)) ? recovered + 1 : 0
        if (recovered >= 2) { index++; entered = false; active = 0; recovered = 0 }
      }
      done = index >= actions.length
      return { index, done }
    }
  }
}
