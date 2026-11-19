# OX Novels: PayPal renewal + Dodo live-preparation (local only)

**Source baseline:** main-worker canary SHA-256 prefix `1a3e7bfcec374ad0` from the user's 21 October upload. **No Cloudflare operation executed.**

## Outcome

- PayPal checkout and subscription renewal/webhook paths remain present and unchanged.
- Existing main→Player protected-Play canary remains in the source.
- Adds a narrowly scoped safeguard that restores an authenticated OTHER provider's active/paid-through entitlement following a cancelled/expired payment event. A Dodo **test** subscription is excluded from live entitlement restoration. Any existing admin `Granted` status is retained.
- No extra tables, Worker bindings, billing provider changes, secret edits, or dependencies.
- Public Dodo sandbox checkout and webhook routes are DISABLED by default in this candidate; simulated payments must not grant real access. To conduct future private sandbox testing would require `OX_ENABLE_DODO_SANDBOX=1`; the sandbox checkout routes also require existing admin login. Never enable this flag during public promotion.
- Does **not** enable Dodo live transactions. Dodo test product IDs are not valid evidence for production products.

## Files

- `OX-NOVELS-CANARY-COEXISTENCE-CANDIDATE.mjs` — fully merged local **candidate**, NOT a deployable replacement for a newer live Worker.
- `REVIEW-PROVIDER-COEXISTENCE.patch` — precise changes for review.
- `README-START-HERE.md` — this document.

## Safety and next step

Do not deploy this file yet. First compare it against the **freshest live `ox-novels` Worker** (from Cloudflare editor), make sure none of the production source or assets has changed since 21 October, and preserve the current deployment rollback. If newer production exists, rebase this diff onto that source instead.

For Dodo production launch we still need **live** product IDs for the membership tier(s) and $49 lifetime item, a separate production Dodo API key and webhook signing key stored only as Cloudflare Secrets, new live checkout routes, strict product and customer/checkout-session matching, signed webhook idempotency, refunds/cancellation handling, and updated front-end checkout links. Keep PayPal live webhook endpoints and existing subscriptions intact. In particular, Dodo test endpoints must not be used for real checkout, and we should lock test routes to authorized testing before public promotion.

Do not paste credentials into chat. Product IDs are not secrets; live API keys and webhook signing keys are.
