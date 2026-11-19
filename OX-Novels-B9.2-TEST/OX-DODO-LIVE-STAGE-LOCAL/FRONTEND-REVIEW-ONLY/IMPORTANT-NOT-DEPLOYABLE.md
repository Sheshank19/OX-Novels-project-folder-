# Frontend reference candidate from Oct project archive

These files originate from the user-uploaded project archive `OX-Novels-B9.2-TEST(1).zip` and are NOT proven identical to the website's latest production ASSETS. Do not deploy them blindly.

The review candidate provides new-purchase Dodo Live endpoints, a signed-webhook-dependent return flow, and changes $49 display labels to $65 for future purchases. It preserves the legacy PayPal functions and Dodo sandbox functions, but routes NEW purchase-button clicks to Dodo Live by default. Customer payment/entitlement is still established only by server-verified signed webhooks.

**IMPORTANT**: Verify and merge these changes against the currently deployed `public/assets/app.js`, `public/index.html`, and `public/49.html` BEFORE production launch. This local comparison is not a browser payment test. Do not turn on the Live feature flag until reviewed.
