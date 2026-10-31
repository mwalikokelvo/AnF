# Hosted CI status - 2026-10-20

The latest inspected hosted jobs were refused before runner execution because the GitHub account has a payment or spending-limit restriction. This is an account-level scheduling failure, not a compiler/YAML failure. No failed build step ran in those jobs, so changing workflow YAML cannot resolve the observed error.

Evidence: https://github.com/mwalikokelvo/AnF/actions/runs/39479088428 and https://github.com/mwalikokelvo/AnF/actions/runs/39479087997, source c15ded93dab6a793447bb2011ae142eb9cb070ad. Eight recent workflow runs were inspected through authenticated GitHub API calls; their failing scheduled jobs had the same billing annotation. The local audit is retained as .tools/workflow-audit-20261020.json outside the repository.

Required action: an account administrator resolves payment/billing or changes the permitted spending limit, then reruns the required workflows. Do not mark hosted CI green or remove its remaining-work item until runner jobs actually complete successfully. No payment settings were changed by this audit.

Local Windows and Android release gates continue independently. They provide local artifact evidence and do not replace hosted CI, production signing or device tests. The current Android local release gate includes workflow contract checks; it passed for 0.1.36. No unverified YAML workaround or untrusted self-hosted runner was added.

Latest source check: https://github.com/mwalikokelvo/AnF/actions/runs/39511220205, source 9f5fe4d4d32971b9dce7f5eea2078226e9463497, conclusion failure. Its annotation again reports the account payment/spending restriction before job execution. This remains separate from passing local 0.1.36 release checks.

0.1.37 source check: https://github.com/mwalikokelvo/AnF/actions/runs/39514078541, source 47595d84a2c843bd19f33d74e2145131739ee8fd, conclusion failure; the job was again refused before execution for account payment/spending settings. Version-bump regression guards fix a separate local build failure and do not resolve this hosted account restriction.

0.1.38 source check: https://github.com/mwalikokelvo/AnF/actions/runs/39625512085, source 0be993155dc8435c747a5e7b9478a5499dfd7081, conclusion failure. Annotation: The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings. Local release checks do not resolve the hosted account restriction; keep its remaining-work instruction until runner jobs genuinely succeed.

0.1.39 source check: https://github.com/mwalikokelvo/AnF/actions/runs/39634456029, source 8e5f9f0be1fdacac69bcf2346d81db6b9d88982d, conclusion failure. Annotation: The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings. Local gates passed independently; retain the hosted-workflow task until real runner jobs succeed.

0.1.40 source check: https://github.com/mwalikokelvo/AnF/actions/runs/39661051104, source db6240f17b6976a5bfc7c8e99d3c81aa450e4b84, conclusion failure. Annotation: The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings. Local release gates passed independently; keep the hosted-workflow task until actual runner jobs succeed.
