import { izdelekForm } from "./bundle";

/** Search copy. */
export const search = {
  open: "Iskanje",
  title: "Iščite izdelke",
  placeholder: "Iščite izdelke …",
  close: "Zapri iskanje",
  instantEmpty: "Ni zadetkov — poskusite drug izraz.",
  allResults: "Vsi rezultati",
  resultsFor: "Rezultati za",
  zeroTitle: "Ni zadetkov",
  zeroBody: "Za to iskanje ni rezultatov. Preverite črkovanje ali poskusite splošnejši izraz.",
  submitLabel: "Išči",
  /** "1 izdelek", "2 izdelka", "3 izdelki", "5 izdelkov" — Slovenian number agreement. */
  resultsCount: (count: number) => `${count} ${izdelekForm(count)}`,
} as const;
