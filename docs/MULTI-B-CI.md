# Multi-b CI (paste into GitHub Actions)

OAuth pushes cannot create `.github/workflows/*` without `workflow` scope.
Founder: create `.github/workflows/multi-b.yml` with:

```yaml
name: Multi-b gates

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  product-gates:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
      - run: npm ci
      - run: npx prisma generate
      - run: npm run test:trust
      - run: npm run economics:check
      - run: MULTI_B_CI=1 npm run multi-b:check
```

Local / agent: `npm run multi-b:check`
