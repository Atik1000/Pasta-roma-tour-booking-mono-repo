# GT Walsheim webfonts go here

GT Walsheim is a commercial typeface from [Grilli Type](https://www.grillitype.com/typeface/gt-walsheim).
It is not redistributable, so the files are deliberately absent from this
repository — buy a webfont licence and drop the woff2 files in beside this
README, under exactly these names:

    gt-walsheim-regular.woff2   →  weight 400  (body, UI)
    gt-walsheim-medium.woff2    →  weight 500  (buttons, labels)
    gt-walsheim-bold.woff2      →  weight 700  (headings)

No code change is needed. The `@font-face` rules in
`packages/config/tailwind/theme.css` already point at these paths, and every
heading and paragraph switches over as soon as the files are served.

Until then the browser skips the missing faces and falls through to **Outfit**
(loaded from Google Fonts in `src/app/layout.tsx`), the closest geometric sans
we can ship legally. The layout and weights are identical either way — only the
letterforms differ.

The same three files are needed in `apps/admin/public/fonts/` for the admin
panel, which shares the theme.
