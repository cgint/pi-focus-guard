# Follow-ups

- Recheck the full development dependency audit after Pi resolves [issue #7005](https://github.com/earendil-works/pi/issues/7005). The latest `@earendil-works/pi-coding-agent@0.81.1` ships a shrinkwrapped `protobufjs@7.6.4`, which triggers GHSA-j3f2-48v5-ccww; the upstream fix must republish Pi with `protobufjs >=7.6.5`. Do not suppress the audit, hand-edit the lockfile, or patch `node_modules` as a workaround.
