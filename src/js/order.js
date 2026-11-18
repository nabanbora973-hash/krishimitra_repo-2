// ============================================================================
//  Ordering the market table — kept as a pure function so it can be TESTED.
// ----------------------------------------------------------------------------
//  The screen used to do this inline, and a farmer looking at a two-row table
//  could not tell whether the "Nearest first / Best net first" buttons did
//  anything. Now the rule lives here, and tests/markets_table_test.cjs proves
//  that the two modes really produce two different orders.
//
//  near → smallest distance first (the honest default: a farmer in Dhubri opens
//         this screen to see Dhubri, not Sivasagar)
//  net  → biggest take-home first (price minus the trip, per quintal)
// ============================================================================

const FAR = 1e9;   // a mandi with no distance set sorts last, never first

export function orderRows(rows, mode){
  const list = Array.isArray(rows) ? rows.slice() : [];
  if (mode === 'net')
    return list.sort((a, b) => (b.netPerQtl ?? -1) - (a.netPerQtl ?? -1));
  return list.sort((a, b) => (a.distanceKm ?? FAR) - (b.distanceKm ?? FAR));
}
