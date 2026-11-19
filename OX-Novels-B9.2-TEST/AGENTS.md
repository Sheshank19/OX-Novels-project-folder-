# OX Novels - Codex Project Instructions

## Project Goal

OX Novels is a fast, simple audio-story membership website.

The website should feel extremely easy to understand for users of all ages and should work properly on:

- Windows desktops
- Mac computers
- laptops
- tablets
- iPads
- iPhones
- Android phones
- small and large screens

## Current Priority

We are currently working ONLY on polishing the public-facing website.

Do not build the complete membership backend, payment backend, user database, or advanced admin functionality unless specifically requested.

The public website must be completed and approved first.

## Main Public Website Structure

The website is inspired by the simple layout and usability of a Ko-fi creator page.

OX Novels should have only two main content tabs:

1. Membership
2. Gallery

Do not add:

- Posts
- Shop
- About tab
- unnecessary navigation
- unnecessary menus
- complicated UI

## Gallery

The Gallery should be image-first.

Story covers should appear as a clean gallery of cover images.

Do NOT put large descriptions or Open Story buttons directly under every gallery image.

When a user clicks a cover:

- open a clean story viewer/modal
- show the story cover
- show story title
- show story description
- show ONE main action button

For a guest:

Join Membership

For an active member:

Play Story

## Membership

The membership section should:

- be very easy to understand
- clearly explain what the user receives
- have one strong Join Membership button
- look clean and trustworthy
- not feel crowded

## Design

Use a bright, clean creator-page style inspired by Ko-fi.

Preferred characteristics:

- white cards
- light gray page background
- teal/turquoise OX accent
- rounded corners
- subtle borders
- subtle shadows
- excellent spacing
- readable typography
- minimal clutter

Do not copy Ko-fi logos, graphics, branding, or copyrighted assets.

Create an original OX Novels implementation using a similar usability/layout philosophy.

## Responsive Design

Every change must be checked for:

- desktop
- laptop
- tablet
- mobile

Avoid:

- horizontal overflow
- tiny buttons
- tiny text
- broken modal heights
- cropped controls
- inaccessible navigation

Mobile should feel intentionally designed, not merely a smaller desktop layout.

## Performance

Keep the website lightweight and fast.

Prefer:

- HTML
- CSS
- vanilla JavaScript

Avoid adding large frameworks unless there is a strong technical reason.

Optimize images and avoid unnecessary dependencies.

## Existing Architecture

Public files are under:

public/

Cloudflare Worker/backend files are under:

src/

Do not expose private Google Drive URLs through public JavaScript.

Story Drive links that must stay private should remain Worker-side.

## Admin

The admin panel will eventually include:

- website profile image
- website banner/cover image
- profile information
- story add/edit/delete
- story cover replacement
- story descriptions
- Drive links
- story ordering
- hide/unhide
- users
- membership status
- subscription/payment status
- member management
- site settings

However, DO NOT build all of this yet.

Public website polish comes first.

## Working Rules

Before making a large change:

1. inspect the relevant existing files
2. understand the current implementation
3. preserve working functionality
4. make the smallest sensible set of changes
5. check for JavaScript/CSS errors
6. run available project checks
7. summarize which files changed

Never delete working features just to redesign something unless specifically requested.

Do not change Cloudflare configuration, payment architecture, authentication architecture, or story security without explicit instructions.

## Local Development

Windows is the development computer.

Use Windows-compatible commands.

For Wrangler, prefer:

npx.cmd wrangler dev

instead of:

npx wrangler dev

because PowerShell script execution may block npx.ps1.

## Communication

After completing a task, clearly report:

- files changed
- what changed
- anything that still needs testing
- local URL to check when relevant
## Current phase — Admin frontend
- Public frontend UI Fix v8 is approved and frozen unless an actual public bug is reported.
- Complete the Admin frontend with mock/sample/local-only interactions before connecting backend services.
- Admin sections: Dashboard; Appearance; Site Settings; Story Library; Add Stories (Manual, Drive Import, Covers); Story Checks; Users; Chat; Notifications; Membership Tiers; Payment Methods; Finance; Integrations; Activity Log; Backup / Restore.
- Do not imply that real database, payment, chat, Drive import, email, or automatic source-checking backend functionality is connected yet.
- Each finished OX Novels copy is an independent codebase/site, not a multi-tenant platform.
- Manual story status override must offer Proceed and Proceed & Lock.
- Future automatic genre/status checking must use full story title + source/provider context and available evidence, never title-only guessing.

## Current phase — Cloneable backend foundation
- Public frontend v8 design and Admin frontend v10 design/functionality are approved baselines.
- Backend work has started with Cloudflare Workers + D1.
- Each finished site is an independent copy/codebase with its own Cloudflare resources, not a shared multi-tenant platform.
- Core D1-backed data: Appearance, Site Settings, Stories and Membership Tiers.
- Admin write access must remain protected; production secrets must never be exposed to public JavaScript.
- Public story API must never return private Drive URLs.
- Remaining users/chat/payments/Drive importer/storage/checker features are separate backend phases.
