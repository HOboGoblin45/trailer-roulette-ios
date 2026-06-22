/**
 * Shuffle — the feed is pure-random across all eras (stratified sampling in
 * tmdb.js handles the era spread), so a uniform Fisher–Yates is all we need.
 */
export function uniformShuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
