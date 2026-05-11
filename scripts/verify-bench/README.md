# verify-bench — M0 GO/NO-GO

Measures the on-chain CU cost of Equihash verification at given `(n, k)` parameters. The result locks the PoW choice for the rest of the project.

## Decision Tree

| CU at (144,5) | Action |
|---|---|
| ≤ 1.1M | Lock (144,5) |
| 1.1M–1.3M | Re-bench at (96,5); lock if ≤ ~1M |
| > 1.3M at both | Pivot to DrillX/Equix |

## Run

```
cd scripts/verify-bench
anchor build
anchor deploy --provider.cluster localnet
ts-node bench.ts        # generates a known-valid solution, submits, reads CU from logs
```

The bench client (`bench.ts`, M0 task) generates a (n,k) Equihash solution for a fixed input via the upstream `equihash` crate's solver feature, submits the verify ix with `setComputeUnitLimit(1_400_000)`, and parses the two `consumed N of M compute units` log lines to compute the verifier's exact CU cost.
