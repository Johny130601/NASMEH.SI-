/** 404 copy. */
export const notFound = {
  title: "Strani ni mogoče najti",
  body: "Stran, ki jo iščete, ne obstaja ali je bila premaknjena.",
  countdownPrefix: "Preusmeritev na domačo stran čez",
  countdownSuffix: "s",
  /** WCAG 2.2.1: the visitor can stop the automatic redirect. */
  stop: "Ustavi preusmeritev",
  stopped: "Preusmeritev je ustavljena.",
  cta: "Na domačo stran",
} as const;
