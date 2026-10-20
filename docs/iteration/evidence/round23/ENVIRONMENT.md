# Round23 environment

- Input authoritative archive v5.22.0, no remote repository or private saves.
- Browser extension selected successfully, but navigation to http://127.0.0.1:4188/ failed with `net::ERR_CONNECTION_REFUSED`.
- Cloud CDP browser likewise failed to reach the executor loopback with `net::ERR_CONNECTION_REFUSED`.
- Taskbook explicitly permits independent Chromium/Playwright validation. Used installed Playwright runtime and existing Chrome Headless Shell, with isolated contexts and synthetic saves only.
- Default sandbox loopback bind was EPERM; automatic approval review allowed running the reviewed server on 127.0.0.1:4188 and :4189. No external deployment.
- Native game scripts require no third party runtime packages. Browser QA dependencies are external tools and excluded from delivery.
- Node v24.19.0, Python 3.12.14; software ANGLE/SwiftShader browser measurements will be identified from each actual report.
- Performance windows run without other task-owned CPU-intensive jobs. Baseline correctness jobs and UI-only smoke may overlap; their wall times are execution evidence, not speedup claims.
