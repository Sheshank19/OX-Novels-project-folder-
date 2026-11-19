OX Novels V6.2 patch
SOURCE: C:\Users\dundi\OX-Novels-B9.2-TEST\OX-V6-1-PROMOTIONS-RELEASE-LOCAL
TARGET: C:\Users\dundi\OX-Novels-B9.2-TEST\OX-V6-2-PROMOTIONS-RELEASE-LOCAL

This patch avoids PBKDF2 160,000 iterations in Cloudflare Workers Free 10ms request CPU budget by using
10,000 PBKDF2 iterations, requiring a 16+ character unique partner password, and preserving D1 login lockouts.
This is a security/performance tradeoff. Avoid reused or weak passwords.

It also excludes older PayPal and paid-once customers from newly claimed first-month commissions.

No production changes, D1 changes or secret changes are performed by the builder.
A separate additive D1 migration and explicit deployment are required.
