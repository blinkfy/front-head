// A snapshot is a baseline on first load. Only later changes celebrate credits.
export function reconcileDepositFeedback(seen, deposits, initialized) {
  const newRecords = []
  let pointsDelta = 0
  for (const record of deposits) {
    const previous = seen.get(record.id)
    if (initialized && !previous) newRecords.push(record)
    const points = record.pointsAwarded
    if (initialized && record.status === 'credited' && Number.isFinite(points) && points > 0 &&
        (!previous || previous.pointsAwarded === null)) {
      pointsDelta += points
    }
    seen.set(record.id, { pointsAwarded: points ?? null })
  }
  return { newRecords, pointsDelta }
}
