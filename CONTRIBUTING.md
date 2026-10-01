# Contributing to Cloudworks

Thanks for your interest. Bug reports, ideas and pull requests are all welcome.

## Getting started

Requires Node.js 20.19+ or 22.12+.

```bash
git clone https://github.com/0xNoramiya/cloudwork.git
cd cloudwork
npm install
npm run dev
```

Demo mode needs no API key, so you can work on almost everything without one.

## Before you open a pull request

Run the checks:

```bash
npm run typecheck
npm run lint
npm run build
```

If you changed the engine or the UI, run the end-to-end tests. They use headless Chromium (install it once with `npx playwright install chromium`) and expect a dev server on port 5199:

```bash
npm run dev -- --port 5199 &

npm run e2e:demo                                     # a full sample project in demo mode
node dev/plan_review_test.mjs dev/out/plan.png       # editing a proposed plan
node dev/plan_interrupt_test.mjs                     # pause, cancel and retry during plan review
node dev/reload_test.mjs                             # reload mid-project and resume
node dev/ui_audit.mjs dev/out/phone 390x844 mobile   # screenshots and a text-overflow report
node dev/tour_test.mjs dev/out/tour 390x844 mobile   # the first-run tour
```

To test live mode without real keys, point the proxy at the bundled mock server:

```bash
npm run mock-llm &
ANTHROPIC_UPSTREAM=http://localhost:5299 ANTHROPIC_API_KEY=sk-ant-test npm run dev -- --port 5199 &
npm run e2e:live-mock
```

Screenshots and reports go to `dev/out/`, which git ignores.

## Guidelines

- **Keep pull requests focused.** One change per PR is easier to review than a bundle.
- **Match the surrounding code.** TypeScript, no semicolons, single quotes. The UI is plain CSS in `src/styles/app.css`, using its existing tokens.
- **Keep the world honest.** Animation and UI state should come from engine state in the store, not from separate timers.
- **Label simulated output.** Anything scripted or cosmetic must stay distinguishable from real model output.
- **Check small screens.** Look at a phone-sized viewport (390×844) as well as desktop.

## Reporting bugs

Open an issue with what you did, what you expected and what happened. Include your browser and whether you were in demo or live mode. A screenshot or the exported log (Log panel → JSON) helps a lot.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
