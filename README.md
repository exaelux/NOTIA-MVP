# IOTA HACKATHON 2026

Standalone delivery workspace for the NOTIA hackathon build.

## Structure

- `notia/`: current NOTIA runtime and demo CLI
- `notia-core/`: local semantic core consumed by NOTIA
- `iota-identity-backend/`: local identity verifier used by the runtime

## Run

1. `cd notia-core && npm install && npm run build`
2. `cd ../notia && npm install && npm run build`
3. `cd ../iota-identity-backend && ./start.sh`
4. `cd ../notia && ./bin/notia`
