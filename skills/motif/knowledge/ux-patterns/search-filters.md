# Search and filters

Finding one thing among many, by typing what you remember or narrowing down by attributes.

## Goal

- Help people find the right thing fast, even when their query is vague, misspelled or partial.
- Make it obvious what's being searched and which filters are on.
- Let people refine without starting over.

## Anatomy

- **Search field:** a clear label or placeholder saying what is searched ("Search orders"), a search icon, and a Clear button once there's text.
- **Recent searches:** shown when the field is focused and empty, each removable.
- **Suggestions:** appear as people type: matching items, categories or completed queries.
- **Results:** the matching words highlighted; the same row structure as the list they come from.
- **Result count:** "24 results" (and "for 'blue shoes'"), updated as filters change.
- **Filters:** chips for the few most-used filters; a panel or sheet for the rest.
- **Active filters:** removable chips above the results, with "Clear all".
- **Sort:** a single control ("Sort: Newest"), separate from filters.

## Required states

- **Idle:** recent searches and popular suggestions, or a short hint of what can be searched.
- **Typing:** suggestions after a short debounce (about 200–300 ms), so the list doesn't flicker on every key.
- **Loading:** a subtle indicator in the field or above the results; previous results stay until new ones arrive.
- **Results:** count, active filters and the list.
- **No results:** repeat the query, then suggest a fix: check the spelling, remove a filter, or try broader words.
- **Error:** a short message and Retry, keeping the query and filters.
- **Filtered to nothing:** say which filters are active and offer to clear them, one by one or all at once.

## Common mistakes

- Searching only on Enter with no feedback → live results, or a visible Search button.
- Going back loses the query → keep the query, filters and scroll position.
- Filters reset when people navigate away and back → keep them until cleared.
- No result count → show it, and update it as filters change.
- Active filters hidden inside a closed panel → chips above the results.
- Exact matches only → tolerate typos, plurals and different word order.
- A filter panel with dozens of options in one long list → group them and show the most used first.
- Clear wipes the filters as well as the query → Clear empties the field; "Clear all" is for filters.

## Mobile and web

- **Mobile:** tapping search opens a full-screen search with the keyboard up and recent searches below; filters live in a sheet with Apply and a live count ("Show 24 results"); the search key on the keyboard submits.
- **Web:** a persistent search bar in the header; a filter sidebar on wide screens; the query, filters and sort live in the URL so results can be shared and reloaded; `/` focuses the search field; arrow keys move through suggestions and Enter picks one.
- **Both:** the field keeps its text after a search, so refining is one edit away.
