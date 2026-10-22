export type TrainerClickMode = "all" | "backbeat" | "subdivisions" | "sparse-bars" | "progressive-silence";

export function shouldPlayTrainerClick(
  pattern: { beats: number; subdivision: number },
  step: number,
  mode: TrainerClickMode,
  repetitionIndex = 0,
  barsPerPattern = 1,
) {
  const stepsPerBeat = pattern.subdivision / 4;
  const safeBars = Math.max(1, Math.floor(barsPerPattern));
  const stepsPerBar = pattern.beats * stepsPerBeat / safeBars;
  const beatInBar = Math.floor((step % stepsPerBar) / stepsPerBeat) + 1;
  const isBeat = step % stepsPerBeat === 0;
  if (mode === "all") return isBeat;
  if (mode === "backbeat") return isBeat && (beatInBar === 2 || beatInBar === 4);
  if (mode === "subdivisions") return stepsPerBeat === 1 || !isBeat;

  const barInPhrase = Math.floor(step / stepsPerBar);
  if (mode === "sparse-bars") return (barInPhrase + 1) % 2 === 1 && isBeat;

  // Keep two bars of click, then drop it for two bars. Carry the cycle across
  // phrase repetitions so one-bar grooves still get meaningful silent bars.
  const barInRound = repetitionIndex * safeBars + barInPhrase;
  const clickBar = Math.floor(barInRound / 2) % 2 === 0;
  return clickBar && isBeat;
}
