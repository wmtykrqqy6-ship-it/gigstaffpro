// Reliability rating tier boundaries (0.0-5.0 scale) — single source of truth.
// Used to bucket workers into Excellent/Good/Fair/Poor consistently across
// the staff filter, worker profile bar, and invite/application lists.
export const RELIABILITY_THRESHOLDS = {
  EXCELLENT: 4.5,
  GOOD: 3.5,
  FAIR: 2.0
};

export const getReliabilityTier = (rating) => {
  const r = rating ?? 5.0;
  if (r >= RELIABILITY_THRESHOLDS.EXCELLENT) return 'excellent';
  if (r >= RELIABILITY_THRESHOLDS.GOOD) return 'good';
  if (r >= RELIABILITY_THRESHOLDS.FAIR) return 'fair';
  return 'poor';
};
