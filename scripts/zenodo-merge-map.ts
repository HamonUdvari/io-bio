// Merge a mint run's DOI map onto the latest main (used by the Zenodo mint
// workflow's commit step). Applies only the records the run changed, so DOIs
// committed by another run or by hand since the run started are kept.
//
//   node scripts/zenodo-merge-map.ts <base.json> <ours.json> <target.json>
//
//   base   — the map the run started from
//   ours   — the map the run produced
//   target — main's current map (may not exist yet); overwritten with the merge
import { mergeDoiMaps, readDoiMap, writeDoiMap } from "./lib/zenodo-state.ts";

const [base, ours, target] = process.argv.slice(2);
if (!base || !ours || !target) {
  console.error(
    "usage: node scripts/zenodo-merge-map.ts <base.json> <ours.json> <target.json>",
  );
  process.exit(1);
}
writeDoiMap(
  target,
  mergeDoiMaps(readDoiMap(base), readDoiMap(ours), readDoiMap(target)),
);
