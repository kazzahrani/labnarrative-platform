"use client";

/**
 * Retired with Engine v2.
 *
 * This legacy enhancer watched the entire DOM and recolored old pipeline-event
 * cards. The Engine v2 dashboard renders its own state directly and should not
 * be mutated after render.
 */
export default function PipelineEventColorEnhancer() {
  return null;
}
