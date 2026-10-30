# Anatomy Flashcards: web pilot and iOS plan

Decision: validate the new learning flow on the web this week. Keep the existing React/Vite and Three.js code. Add a shared learning backend before promising recovery from Safari data loss. Build an iOS client after the next round of feedback.

## Product for this pilot

The entry point is a browsable catalogue of 16 prepared decks. Learners can preview a deck, start immediately, or bookmark it in My learning. Starting a deck bookmarks it automatically. Removing a bookmark preserves learning history. Uploading and curating cards is no longer part of the main flow. Previously imported custom decks remain accessible on their original device and in downloadable backups.

The collection uses the existing 348 subjects (118 bones, 217 muscles, 13 ligaments/membranes) and 593 rendered views. It teaches image identification and Latin/English names. Regional decks use explicit catalogue IDs; the three reference collections cover every available subject. These are not comprehensive courses for all anatomical systems. Future organ, vessel, nerve, function, and attachment cards need additional content preparation and editorial review.

Deck definitions live in `lib/flashcards/decks.ts`. Each has a stable ID, version, scope, category, and card membership. Existing starter IDs are retained where applicable. A deck version can change membership without resetting the learning history of unchanged cards. The atlas sources and attribution remain visible in the app.

## Storage and recovery

Separate three things:

| Data | Authority | Device copy |
| --- | --- | --- |
| Prepared content and images | Versioned application assets | Browser HTTP cache; later, native bundled/downloaded assets |
| Learning history | Immutable review events, replicated to the signed-in account | IndexedDB on web; native SQLite on iOS |
| Selected decks | Per-user selections, including removal timestamps | IndexedDB / native SQLite |

A review event has a unique ID, a stable card ID, the deck used, action, practice mode, timestamp, and scheduler version. The same identification card has one history across all decks. Naming a structure and recalling its function should become distinct card IDs if additional question types are introduced; multiple image angles of the same identification task share an ID.

Each answer and its pending-sync record are committed in one IndexedDB transaction. The UI advances only after local persistence succeeds. An interrupted save retains the event ID for retry. Nothing waits until tab closing or session completion to save. Cookies and localStorage are no longer the authoritative learning database. The old storage code is used only to migrate existing data; original stores are retained.

The current scheduler is preserved and versioned. A deterministic reducer reconstructs state from the event union. Duplicate event delivery does not count as another review. Events are ordered by study timestamp, with ID as a stable tie-breaker; imported baseline states precede real reviews. When older per-deck histories overlap, the most recently saved baseline wins. Keep device clocks reasonably accurate during the pilot; before scaling, add recorded device sequence/clock-skew handling and explicit concurrent-review policy. This event history permits a later scheduler migration without throwing away user activity.

Supabase provides email sign-in and Postgres storage with per-user row-level access. Event inserts are idempotent, updates are disallowed, and the client retries pending uploads after reconnecting or returning to the app. Devices fetch the event union and recompute progress. For this small pilot, fetching is paginated but starts from the beginning at each sync; a database sequence allocated before commit is deliberately not treated as a permanent replication cursor. Add a commit-safe replication mechanism when volume justifies it.

Guest work is copied to the signed-in account's local database before leaving the guest store. Each signed-in account has its own database. Progress is recoverable after browser storage loss only if it has reached the account backend, or if the learner has a downloaded backup. Unsynced browser-only data can still be lost if Safari evicts site data or the user clears it. Native storage can also be lost on uninstall; cloud recovery still matters on iOS.

The UI distinguishes device-only, syncing, synced, and failed-sync states. Authentication credentials may expire or be removed independently of learning data; signing in again restores the cloud history. An anonymous server ID without a recoverable sign-in would not solve the loss scenario.

## Connect the web backend

The integration is implemented but is inactive without a configured Supabase project. No project has been provisioned and no live recovery claim is made yet.

1. Create/select a Supabase project. Run `supabase/schema.sql` once in its SQL Editor. This creates private learning-event and deck-selection tables and the selection merge function.
2. Enable email authentication. Set the Site URL and allowed Redirect URLs to the exact deployed test origin and `http://localhost:3016/` for local development.
3. Configure production email delivery/SMTP for external testers. Supabase's default email service is restricted and is not a general-purpose pilot mail service. Test delivery to a real tester address before launch.
4. Create a root `.env.local` using `.env.example` and add the same two public variables to the web hosting project. Use a publishable key, never a service-role or database-admin key. Vite embeds these public values at build time, so restart/rebuild after changing them.
5. Sign in from the same browser used for guest study so that its history can be attached to the account. Opening the email link in a different browser signs in there but cannot read the first browser's unsynced data.
6. Verify isolation with two accounts, and verify recovery by signing in on a fresh browser after the first shows “Saved to your account.” Also test an interrupted network, repeat delivery, and account changes.

Use the existing static hosting setup for React assets. Supabase is the shared backend; no long-running application server is required. Keep server credentials out of the browser. Before a wider release, establish database backup/restore operations and an account deletion endpoint using server-side authority.

Local custom deck definitions from the previous version are included in downloadable backups but are not uploaded by the new curated-deck sync service. Their migrated card knowledge is synced. This limitation is explained in account settings.

## Near-future App Store architecture

My default recommendation after web validation is React + Capacitor, a native SQLite storage adapter, the same Supabase account/event backend, and native StoreKit purchases. This reuses the study interface, scheduling logic, prepared content, and Three.js explorer. Wrapping the website while leaving the new database in browser storage would not provide the intended native persistence.

Keep storage behind the learning-store interface so that the native implementation can replace IndexedDB with SQLite transactions. Bundle a starter collection for offline study; download larger content packs separately with version/integrity checks. The current card assets are approximately 22 MB on disk; the model directory is approximately 90 MB and includes compressed and uncompressed geometry, so audit the actual native package before bundling everything.

The iOS product should include offline study, a deliberate iPhone/iPad layout, optional native review reminders, accessibility, secure token storage, purchase restoration, and useful study history. Apple evaluates the complete experience, and its minimum-functionality rule applies to repackaged websites. Native features do not guarantee approval.

If testing leads to an Apple-only product with a substantial native interface, SwiftUI with SwiftData/CloudKit is a reasonable alternative. SwiftData can synchronize through iCloud, but keeping a full web client and shared account progress is simpler with the backend already used for the web pilot. Do not maintain separate CloudKit and Supabase sources of truth for the same progress.

For the first paid release, consider a free starter collection and a one-time full-library unlock. Subscription pricing should follow a credible plan for ongoing content/service value. Use StoreKit for the ordinary in-app digital unlock path, verify entitlements server-side for shared web access, and handle restoration, revocation/refunds, and account deletion. Recheck storefront-specific payment rules before submission.

## Release sequence

1. Test deck discovery, immediate study, and the content scope with learners on the web.
2. Connect Supabase and email delivery. Prove account recovery on real iPhone Safari before using “reliable backup” in the pilot description.
3. Preserve/export legacy data, test a staged migration, and deploy through the existing hosting workflow.
4. Use feedback to expand or revise deck membership and learning tasks.
5. Add the native storage and platform adapters, StoreKit, and TestFlight testing. Choose whether a native UI rewrite adds enough value only after the web workflow is validated.

## References

- [WebKit storage eviction and persistence](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Capacitor storage guidance](https://capacitorjs.com/docs/guides/storage)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase email delivery guidance](https://supabase.com/docs/guides/auth/auth-smtp)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [StoreKit](https://developer.apple.com/storekit/)
- [SwiftData and iCloud sync](https://developer.apple.com/documentation/swiftdata/syncing-model-data-across-a-persons-devices)
