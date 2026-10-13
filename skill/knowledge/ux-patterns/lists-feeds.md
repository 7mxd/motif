# Lists and feeds

Many items of the same kind, for scanning, finding and acting on: messages, orders, contacts, posts.

## Goal

- Let people scan many items quickly and find the one they want.
- Make the common action on an item fast, and the rare ones findable.
- Keep people's place: coming back to a list returns them exactly where they were.

## Anatomy

- **Row:** leading avatar, icon or media; a title (`body`, one line); secondary text (`text-secondary`, one or two lines); metadata such as time or status (`caption`); a trailing action, value or chevron.
- **Section headers:** group by date, status or letter when the list is long.
- **Search:** at the top for lists people look things up in.
- **Sort and filter entry:** a single button or a row of chips; the active ones always visible.
- **Pagination or loading more:** pages for large sets people navigate; loading more at the end for feeds.
- **Pull to refresh:** on touch screens, for lists that change.
- **Swipe actions:** on touch, one or two quick actions (archive, delete) revealed by swiping a row.
- **Selection mode:** a way to select several rows for bulk actions, with a count and the actions in a bar.
- **Add action:** a button for creating a new item, in the header or as a floating button on mobile.

## Required states

- **First page loading:** skeleton rows with the same structure as real rows.
- **Empty on first use:** what will appear here, and one action to add the first item.
- **No results:** the search term repeated, and a suggestion (check spelling, clear a filter).
- **Everything filtered out:** say which filters are active and offer to clear them.
- **Error:** a short message and Retry, keeping any rows already shown.
- **Loading more:** a small loading row at the end; the rest of the list stays usable.
- **End of the list:** a quiet end marker, so people know there's nothing more.
- **Item updating or removed:** the change appears immediately; removal offers Undo in a toast.
- **Offline:** cached items with a note that they may be out of date.

## Common mistakes

- Cards for a plain list → rows; cards are for items with rich media.
- Uneven row heights from inconsistent content → one row structure, truncated consistently.
- Only the title is tappable → the whole row is the target.
- Infinite scroll hiding a footer people need → paginate, or move the footer's links elsewhere.
- Going back loses the scroll position → restore it, along with any open filters.
- Delete without Undo → remove at once and offer Undo, rather than an "Are you sure?" dialog.
- Five actions on every row → one primary action, the rest in an overflow menu.
- The same empty message for first use, no results and filtered out → three different messages.

## Mobile and web

- **Mobile:** full-width rows at least 44 px tall (usually 56–72 px with secondary text); swipe actions that are also reachable another way (long press or the detail screen); pull to refresh; a floating add button only if adding is the main job of the screen.
- **Web:** tables for data people compare across columns, with sortable column headers and a sticky header row; secondary row actions visible on hover and on keyboard focus; arrow keys move between rows; pagination with a page size for large sets.
- **Both:** the selected or opened item stays highlighted when people return to the list.
