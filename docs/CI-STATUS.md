# Hosted CI status - 2026-10-20

The latest inspected hosted jobs were refused before runner execution because the GitHub account has a payment or spending-limit restriction. This is an account-level scheduling failure, not a compiler/YAML failure. No failed build step ran in those jobs, so changing workflow YAML cannot resolve the observed error.

Evidence: https://github.com/mwalikokelvo/AnF/actions/runs/39479088428 and https://github.com/mwalikokelvo/AnF/actions/runs/39479087997, source c15ded93dab6a793447bb2011ae142eb9cb070ad. Eight recent workflow runs were inspected through authenticated GitHub API calls; their failing scheduled jobs had the same billing annotation. The local audit is retained as .tools/workflow-audit-20261020.json outside the repository.

Required action: an account administrator resolves payment/billing or changes the permitted spending limit, then reruns the required workflows. Do not mark hosted CI green or remove its remaining-work item until runner jobs actually complete successfully. No payment settings were changed by this audit.

Local Windows and Android release gates continue independently. They provide local artifact evidence and do not replace hosted CI, production signing or device tests. The current Android local release gate includes workflow contract checks; it passed for 0.1.36. No unverified YAML workaround or untrusted self-hosted runner was added.
