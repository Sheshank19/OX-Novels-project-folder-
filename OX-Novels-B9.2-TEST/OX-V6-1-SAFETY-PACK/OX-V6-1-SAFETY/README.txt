OX Novels V6.1 — commission safety patch
========================================
Applies ONLY to the local OX-V6-PROMOTIONS-REBUILT-LOCAL candidate.
Creates a NEW OX-V6-1-PROMOTIONS-RELEASE-LOCAL candidate.
No production deployment, D1 commands, migrations, env changes, or secrets.

Fix: Do not credit a friend's referrals for payments or lifetime purchases
that happened BEFORE the buyer answered the promotions questionnaire.
Also ensures a later Dodo Live renewal of an older subscription is NOT
misclassified as the friend's first paid month.

Windows PowerShell:
  node.exe .\OX-V6-1-SAFETY\BUILD-OX-V6-1-COMMISSION-SAFETY.cjs

Expected output: PASS statements and NO PRODUCTION DEPLOYMENT OR D1 CHANGES.

NOTE: This is still subject to live runtime validation, including partner
login behavior on the Cloudflare Workers Free CPU limit. The Add Friend
UI tracks gross recorded transaction amounts, not settled net proceeds.
