# Event editing and experience review

Reviewed and implemented on 23 October 2026.

## Existing features

Evenit includes account signup/login, profiles and follows, event creation, guest questions, interest requests and host approvals, waiting lists, QR entry passes and check-in, host Insights, event discovery/search, saved events, an upcoming-plan board, direct/group messaging, unread activity, and post-event Aftermath. It has web, Android and iOS projects, shared event/profile links, themes, and an administration interface.

## Problems addressed

| Problem | Result |
| --- | --- |
| Hosts could not correct a published event | Edit event opens a prefilled editor from Insights and event details. |
| Host and guest cards ended in disabled actions | Cards open management, entry passes, request status, or event details as appropriate. |
| Bookmarks and saved collections did not form a usable flow | Bookmark buttons persist on this device; Saved opens working event rows. Unsupported collection tabs are removed. |
| Discover focused on past moments and hid search on phones | Upcoming plans, date/category filters, visible search, and an Aftermath tab. Search and filter state survive refreshes. |
| Hidden suggestions returned after refresh | Dismissals persist per account/device, with a working Undo action. |
| Future-event details said “Lived” | Upcoming-event copy and relevant owner/guest actions. |
| Sidebar showed sample events | Coming up uses actual event data. |
| Notification switches implied unavailable functionality | Settings explain the available in-app updates and link to activity. |
| Feedback was fleeting and some controls were inaccessible | Longer accessible status messages, clickable Undo, keyboard focus styles, reduced-motion support, and small-screen spacing fixes. |
| Leaving an edit could silently lose changes | Discard confirmation for app navigation and Back; unload warning for unsaved edits. |

These changes aim to make discovery and participation more useful. Increased retention has not been measured and is not claimed.

## Editing rules

- Only the organizer can edit, strictly before the event's current scheduled start time. The database enforces the rule, including after waiting for a concurrent write.
- Editable fields: title, tagline, description, category, date/time, meeting place, device coordinates, cover image/style, guest questions and options, verification requirement, and capacity.
- A new start time must be in the future. Capacity cannot fall below the confirmed guest count.
- Existing memberships and entry-pass tokens stay intact. Removed/changed questions are archived/versioned so old answers retain their original wording.
- Existing guest answers are not rewritten. Question changes affect new requests; verification requirements are checked on new approvals.
- The form preserves edits on save errors, prevents duplicate submission, and returns to Insights after success.

## Access and release status

- GitHub: authenticated access to `letsberesponsiblenafar-cmyk/Evenit` was confirmed, including repository push/admin permission.
- Supabase: authenticated CLI/database access to the linked project was confirmed. The edit migration and regression checks were executed together inside a transaction that was rolled back. No test users, events, answers, or passes were retained.
- Vercel: the production website was reachable. Authenticated deployment-management access was not available in this environment.
- This change is committed locally. It has not been pushed or deployed, and the new migration has not been applied to production.

Before deploying the frontend, apply `supabase/migrations/20261023120000_edit_upcoming_events.sql` through the normal migration process. The editor requires its new RPCs. Then deploy the committed web assets and rebuild/sync native applications as needed. The mobile asset-copy script includes the new modules and stylesheet.

The earlier access review also found separate profile-administrator and private-follow authorization concerns. They remain outside this event/UX change and should be addressed in a security-focused follow-up.

## Validation

- `npm test`: 46 passing tests, including editing ownership/cutoff, payload validation, local-time conversion, filters, and contextual actions.
- `scripts/test-event-edit.sql`: integration checks passed against the linked database in a rollback-only transaction. Checks include owner/non-owner access, invalid edits, atomic rollback, capacity, archived questions, original answers, direct-write rejection, unchanged pass tokens, and expired events.
- Browser checks with explicitly labeled synthetic data: edit/prefill/save, cover selection, return to Insights, bookmarks/Saved/detail navigation, hide/Undo, date/category filters and reset, search persistence across refresh, and keeping/discarding unsaved changes.
- Responsive checks at 390px and 320px browser widths; the editor and discovery page have no horizontal document overflow.
- Local test fixture: `node scripts/preview-fixture.mjs`, then open `http://127.0.0.1:4174`. It replaces Supabase with synthetic accounts/events and does not write to the database. Fixtures reset on page reload; saved/hidden browser preferences persist.

Native camera, actual email delivery, native-device builds, and live deployment were not exercised by this change.
