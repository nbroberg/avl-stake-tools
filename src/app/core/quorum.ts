/**
 * High Council quorum constants.
 *
 * For the POC we treat the stake high council as a fixed 12-member body.
 * Real stakes vary (10-12 is typical); if a real deployment needs a
 * different size, change HC_TOTAL here rather than deriving from the
 * users collection - a query over users would require loosening
 * firestore.rules to let approved users list each other, which we're
 * deliberately avoiding.
 *
 * The threshold is stored on each workflow at creation (as `hcRequired`),
 * so a mid-vote change to these constants doesn't rewrite the goalposts
 * for in-flight workflows.
 */
export const HC_TOTAL = 12;

export const HC_QUORUM_FRACTION = 0.7;

/** Approvals needed to advance a workflow to high_council_approved. */
export const HC_QUORUM_REQUIRED = Math.ceil(HC_TOTAL * HC_QUORUM_FRACTION);
