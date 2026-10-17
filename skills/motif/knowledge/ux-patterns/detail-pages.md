# Detail pages

Everything about one item (a product, an order, a person, a document) and the things people can do with it.

## Goal

- Show the details people came for, in order of importance.
- Keep the primary action visible and obvious.
- Make it easy to get back to where they came from, in the same place.

## Anatomy

- **Header:** the item's title (`title`) and its key status or price, visible without scrolling.
- **Media:** a photo, gallery or preview, with a consistent aspect ratio.
- **Key facts:** the three to six details that matter most, as label–value pairs.
- **Primary action:** the one thing people most often do here ("Add to cart", "Reply", "Book"), using `action-primary`.
- **Secondary actions:** edit, duplicate, archive, delete in an overflow menu; destructive ones in `danger` and separated.
- **Related items:** other items people tend to look at next, if the app has them.
- **History and metadata:** created, updated, by whom; activity log if it matters.
- **Back navigation:** a back button on mobile; a breadcrumb or back link on the web.
- **Share:** where sharing makes sense, using the platform's share sheet on mobile.

## Required states

- **Loading:** show what the list already knew (title, image, price) at once, and skeletons for the rest.
- **Not found or deleted:** say the item no longer exists and link back to the list.
- **No permission:** say they can't view it and who can give access; don't pretend it doesn't exist if they followed a valid link.
- **Error:** a short message with Retry; keep anything already shown.
- **Editing:** fields in place or a separate edit screen, with Save and Cancel.
- **Saving:** the Save button shows progress; the page doesn't jump.
- **Saved:** a brief confirmation and the updated values in place.

## Common mistakes

- The primary action buried at the bottom → keep it visible (in the header or a sticky bar).
- Repeating only what the list already showed → add the details people opened the page for.
- A wall of specifications → group them, and lead with the few that matter.
- Details in a modal → a page, or a side panel on wide screens, so it can be linked and navigated back from.
- Going back loses the list's place → restore scroll position and filters.
- Delete next to Edit with the same weight → move delete into the overflow menu, in `danger`.
- Every field editable all the time → view first, edit on request.

## Mobile and web

- **Mobile:** hero media at the top; stacked sections; a sticky bottom bar holding the primary action (and the price, if there is one) within thumb reach; back with the back button or the edge swipe.
- **Web:** two columns on wide screens, content on one side and a sticky action panel on the other; a breadcrumb for deep hierarchies; master–detail (list beside detail) when people move through many items in a row.
- **Both:** the URL or route identifies the item, so it can be shared, bookmarked and reopened.
