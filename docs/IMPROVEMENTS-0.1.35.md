# AnF 0.1.35 preview

Windows Home now distinguishes the managed local OmniRoute gateway from an external gateway connection. The AI chat card exposes missing, stopped, running and unavailable states without opening an online connection disclosure. Setup opens the managed gateway controls and moves keyboard focus to their heading. When running, a direct action checks native readiness before selecting managed AI in Chat. Errors remain visible and do not select another provider.

Checking Home status does not install, start or stop a service, send a generation request, or change external connection settings. External credential-store failures do not hide managed local status. The existing offline Chat action remains available without a gateway, API key or account.

Validation covers TypeScript, browser state/error/busy flows and native Windows Home/settings/Chat navigation in isolated profiles. Current Android packages and Windows packages pass their release gates; published assets are checked against local SHA-256. Android is rebuilt at 0.1.35; this Home change applies to Windows. Native model and gateway process implementation is unchanged from 0.1.34.

The existing optional OmniRoute 3.8.51 component remains compatible. Windows is unsigned; Android is development-signed and has not been device-tested. Private recordings and private voice models are excluded. Reviewed gateway upgrades/recovery, mobile parity and other reader/music/service gaps remain in REMAINING-IMPLEMENTATION-PLAN.md.
