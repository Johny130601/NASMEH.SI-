/**
 * The mega-menu and the drawer lay out two featured product cards (AGENTS §5.11); the menu
 * editor's hint and its schema say the same (QA T7-F4). A module of its own so the storefront
 * chrome can import the number without pulling the CMS schemas (and zod) into its bundle.
 */
export const MAX_FEATURED_CARDS = 2;
