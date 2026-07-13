export const trackedFinishPositionCount = 5;

export function calculateFinishPositionShares(
  scores: Map<string, number>,
  positionCount = trackedFinishPositionCount,
) {
  const sorted = Array.from(scores, ([name, score]) => ({ name, score })).sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  );
  const shares = new Map(sorted.map(({ name }) => [name, Array<number>(positionCount).fill(0)]));

  for (let groupStart = 0; groupStart < sorted.length; ) {
    const score = sorted[groupStart].score;
    let groupEnd = groupStart + 1;
    while (groupEnd < sorted.length && sorted[groupEnd].score === score) groupEnd += 1;

    const groupSize = groupEnd - groupStart;
    const positionShare = 1 / groupSize;
    const lastTrackedPosition = Math.min(groupEnd, positionCount);

    for (let playerIndex = groupStart; playerIndex < groupEnd; playerIndex++) {
      const playerShares = shares.get(sorted[playerIndex].name);
      if (!playerShares) continue;

      for (let positionIndex = groupStart; positionIndex < lastTrackedPosition; positionIndex++) {
        playerShares[positionIndex] = positionShare;
      }
    }

    groupStart = groupEnd;
  }

  return shares;
}
