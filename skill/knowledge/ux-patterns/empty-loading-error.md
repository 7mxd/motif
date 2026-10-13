# Empty, loading and error states

The states every screen has besides the happy path: nothing there yet, on its way, or something went wrong.

## Goal

- Never leave people looking at nothing or at a dead end.
- Every state says what is happening and what to do next.
- Keep the layout steady, so the screen doesn't jump when content arrives.

## Anatomy

- **Empty state:** an optional small illustration or icon (never larger than the text needs), a short title, one line in plain words explaining what will appear here, and one primary action.
- **Skeleton:** grey shapes in the final layout (lines for text, blocks for images, circles for avatars) on `surface-raised`, with a gentle pulse.
- **Inline spinner:** only for small waits inside a control, such as a button that's saving.
- **Progress bar:** for long tasks (uploads, exports), with a percentage or steps when known.
- **Error message:** what happened in plain words, what to do about it, a Retry action, and a way to get help when retrying won't fix it.
- **Offline banner:** a slim banner at the top saying the app is offline, which disappears when the connection returns.
- **Partial failure:** one section showing an error and Retry while the rest of the page works.

## Required states

- **First use:** nothing created yet; explain the value and offer the first action ("Create your first invoice").
- **No results:** the search or filter found nothing; suggest how to widen it.
- **Cleared:** everything is done ("All done for today"); celebrate quietly, no action needed.
- **Loading under about 300 ms:** show nothing, to avoid a flash of skeleton.
- **Loading over 300 ms:** skeleton.
- **Long waits over about three seconds:** progress, or a message saying what's taking time.
- **Recoverable error:** Retry, with everything typed kept.
- **Unrecoverable error:** a way out (back, home) and how to contact support.
- **Offline:** cached content where possible, the offline banner, and actions queued or clearly unavailable.
- **Permission needed:** what the feature needs and why, with a button to grant it or open the system settings.

## Common mistakes

- Blank screens while loading or when empty → always one of the states above.
- A full-page spinner → skeletons for content.
- Skeletons flashing for fast loads → wait about 300 ms before showing them.
- Error codes ("Error 500") → plain words; a code can go in small text for support.
- "Something went wrong" with no next step → Retry, or a way out.
- Blaming people ("You entered an invalid date") → describe the fix ("Use the format DD/MM/YYYY").
- An empty state with no action → one clear action.
- Layout jumping when content arrives → skeletons the same size as the content.
- The same message for first use, no results and cleared → three different messages.

## Mobile and web

- **Mobile:** states appear inside the content area, keeping the header and tab bar; pull to retry on lists; the offline banner sits at the top under the header; queued actions sync when the connection returns.
- **Web:** failures stay local to their section rather than replacing the page; failures of background tasks appear as a toast; state changes ("Loading results", "3 results", "Failed to load") are announced through a polite live region.
- **Both:** empty, loading and error states use the design guide's roles like everything else; they are part of the design, not afterthoughts.
