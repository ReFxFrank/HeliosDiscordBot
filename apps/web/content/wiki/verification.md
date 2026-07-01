# Verification

Gate new members behind a **button click** or an **image captcha** before they can see the server — strong protection against bots and throwaway alts.

## How it works

1. You deploy a **panel** (an embed with a Verify button) to a channel new members can see.
2. Optionally, an **unverified role** is auto-applied on join to lock down the rest of the server.
3. The member clicks Verify. With the captcha method they must read a generated image code and type it in.
4. On success they get the **verified role** (and the unverified role is removed).

## Settings

Dashboard → **Verification**:

| Section | Settings |
| --- | --- |
| Verification Method | Button click (low friction) or image captcha (strong) |
| Roles | Verified role (required) and optional unverified gate role |
| Captcha Security | Code length (4–8), max attempts (1–10), fail action (nothing or kick) |
| Requirements | Minimum account age (hours) and minimum time in server (minutes) before verifying |
| Verification Panel | Title, message, button label, success message, panel channel + deploy |
| Logging | A channel that receives passes, failures, and kicks |

## Anti-alt gates

The **Requirements** section blocks instant verification: a member must have a Discord account older than N hours and/or have been in your server for N minutes before the Verify button works. Captcha attempt counts survive re-clicking the button, so limits can't be reset.

## Commands

| Command | What it does |
| --- | --- |
| `/verification panel [channel]` | Post the verification panel (also deployable from the dashboard) |

> Put the unverified role's permissions in order first: it should see only your rules/verify channel. Solari's role must sit **above** both roles it manages.
