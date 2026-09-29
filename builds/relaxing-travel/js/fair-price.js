// Fair-price verdict bands (ratio of quoted price to local median).
// Moved out of data.js when the destination data moved to data/kb + js/kb-data.js.
export function fairVerdict(ratio) {
  if (ratio <= 0.75) return { verdict: "A real deal", tone: "good", note: "Below what locals pay. Enjoy it." };
  if (ratio <= 1.15) return { verdict: "Fair price", tone: "good", note: "Right around the local median." };
  if (ratio <= 1.6) return { verdict: "Slightly high", tone: "ok", note: "A touch above local rates. Acceptable in a tourist zone." };
  if (ratio <= 2.2) return { verdict: "Tourist price", tone: "warn", note: "You are paying the visitor tax. Try two streets away." };
  return { verdict: "Overpriced", tone: "bad", note: "More than double the local median. Walk away or negotiate." };
}
