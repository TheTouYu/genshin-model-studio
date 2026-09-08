# Binding Trials

Accepted mesh unchanged. No candidate in this directory is promoted.

Shoulder-only weights: 5 blends sampled over unchanged motions, 12 failing poses at rigid baseline; remaining blends still have 9 failures. This does not repair the defect.

Elbow/wrist/knee/ankle ring blends: weights 0, .25, .5, .75 tested on two walks and run. Every sampled pose still failed geometric checks. A reduction in intersection count is not acceptance.

Retarget source FK and source T-pose vs target A-pose alignment defects were independently found and corrected during this work. Terminal rest directions remain under review. Do not conclude all remaining defects originate solely in mesh density or weights until orientation and translation are independently validated.

Scripts: scripts/parts/test-shoulder-binding.mjs and scripts/parts/trial-joint-weights.mjs. Browser samples: browser-weight-samples.json. Results: shoulder-weights.json and joint-weight-results.json.
