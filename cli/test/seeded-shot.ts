/**
 * What `motif shot --audit` shows of a planted problem another detector owns (a review's crammed card whose names are cut
 * to one line, which the audit's text-fit rule now reports too). A seeded app's list declares it on the problem as `shot`,
 * and its test accepts a screenshot finding only when it matches one exactly: the category, the screen, and the words.
 */
export type ShotSign = { category: string; screens: string[]; summary: string };
type Place = { screen: string };
type Found = { category: string; location: Place; locations?: Place[]; summary: string };

/** True when the finding is one the problem's `shot` signs describe, at every place it names. */
export function shownInShot(issue: { shot?: ShotSign[] }, f: Found, sameScreen: (listed: string, route: string) => boolean): boolean {
  return (issue.shot ?? []).some(
    (s) =>
      s.category === f.category &&
      new RegExp(s.summary).test(f.summary) &&
      [f.location, ...(f.locations ?? [])].every((p) => s.screens.some((listed) => sameScreen(listed, p.screen))),
  );
}
