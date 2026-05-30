# [1.4.0](https://github.com/HamonUdvari/io-bio/compare/v1.3.5...v1.4.0) (2026-05-30)


### Bug Fixes

* **name+preview:** hide née & redundant known-as; preview shows separated body ([](https://github.com/HamonUdvari/io-bio/commit/cd234d5f8f642787855522aeadcfd034c0c7a4e1))


### Website Features

* **entries:** Download (PDF) links to rendered PDF; print=desktop sizing; grid 4-col tablet ([](https://github.com/HamonUdvari/io-bio/commit/0c404b6a9cfebd53b24bd7fbdcb429a91cdd4f76))

## [1.3.5](https://github.com/HamonUdvari/io-bio/compare/v1.3.4...v1.3.5) (2026-05-30)


### Bug Fixes

* **cite:** don't show the whole-dictionary DOI as the entry's citation ([](https://github.com/HamonUdvari/io-bio/commit/325142beb06c56c30419ed8632f5c5d254ef4329)), closes [#2](https://github.com/HamonUdvari/io-bio/issues/2) [#2](https://github.com/HamonUdvari/io-bio/issues/2)
* **zenodo-pdf:** per-page footer (project ref + page number) via CDP printToPDF ([](https://github.com/HamonUdvari/io-bio/commit/c602188b1432cd374319347e071704d2cec8a804)), closes [#8](https://github.com/HamonUdvari/io-bio/issues/8) [#8](https://github.com/HamonUdvari/io-bio/issues/8)

## [1.3.4](https://github.com/HamonUdvari/io-bio/compare/v1.3.3...v1.3.4) (2026-05-30)


### Biography Updates

* **author-instructions:** add a paragraph linking to the preview tool ([](https://github.com/HamonUdvari/io-bio/commit/c803a29458ce5564b2cbcd973da313985671b7b8)), closes [#6](https://github.com/HamonUdvari/io-bio/issues/6)


### Bug Fixes

* **author-instructions:** use a down-arrow glyph for the downloads list ([](https://github.com/HamonUdvari/io-bio/commit/1e1c4d2132c7e42825441a941d0761df11ef9b91)), closes [#7](https://github.com/HamonUdvari/io-bio/issues/7)
* **entries:** floor listing to 100svh so the footer can't jump on empty results ([](https://github.com/HamonUdvari/io-bio/commit/5001a6b5574773289da9fb2586372918e28b1711)), closes [#3](https://github.com/HamonUdvari/io-bio/issues/3)
* **preview:** show née + biography body, always-render known-as (field parity) ([](https://github.com/HamonUdvari/io-bio/commit/8211ec9caf6b62b610b0b9940d715f1a32678dbd)), closes [#5](https://github.com/HamonUdvari/io-bio/issues/5)
* **print:** adapt gutter, spacing and page breaks for print ([](https://github.com/HamonUdvari/io-bio/commit/ffbc65b38f0d18330a9ad9369df1dcb9b3647c6b)), closes [#8](https://github.com/HamonUdvari/io-bio/issues/8)

## [1.3.3](https://github.com/HamonUdvari/io-bio/compare/v1.3.2...v1.3.3) (2026-05-30)


### Bug Fixes

* **fonts:** force font-display:block on all webfonts (not swap) ([](https://github.com/HamonUdvari/io-bio/commit/6a5df3baf886e13281d62593d53a4b06d91b3577))

## [1.3.2](https://github.com/HamonUdvari/io-bio/compare/v1.3.1...v1.3.2) (2026-05-30)


### Bug Fixes

* **entries:** keep rotated figure source credit within the image ([](https://github.com/HamonUdvari/io-bio/commit/a4eb3eca962af40d53fcbb2d66005ab98ea20517))

## [1.3.1](https://github.com/HamonUdvari/io-bio/compare/v1.3.0...v1.3.1) (2026-05-30)


### Bug Fixes

* **ci:** drop packageManager field; pin pnpm 11 in workflows ([](https://github.com/HamonUdvari/io-bio/commit/11a3e56dd05cc78b57c5f84a3d54934270266873))

# [1.3.0](https://github.com/HamonUdvari/io-bio/compare/v1.2.1...v1.3.0) (2026-05-30)


### Website Features

* **entries:** show "known as" / née alias after the name ([](https://github.com/HamonUdvari/io-bio/commit/a55393cb7091c122c74f2b05eed5e9c0ba6dd23a))

## [1.2.1](https://github.com/HamonUdvari/io-bio/compare/v1.2.0...v1.2.1) (2026-05-30)


### Bug Fixes

* **entries:** grid empty-space gap on Safari iOS (drop align-items: baseline) ([](https://github.com/HamonUdvari/io-bio/commit/98dc3c58e1fca9bce9691854e3a22a92c6799984))

# [1.2.0](https://github.com/HamonUdvari/io-bio/compare/v1.1.2...v1.2.0) (2026-05-30)


### Website Features

* **entries:** "How to cite" as a bullet list + real Zenodo concept DOI ([](https://github.com/HamonUdvari/io-bio/commit/a261bcf7bc062594c1f4019f4a134e5425399399))
* **zenodo:** per-entry DOI minting pipeline (sandbox-validated) ([](https://github.com/HamonUdvari/io-bio/commit/6b179bdc51e013ebe38edd7ebd30dc75df099020))

## [1.1.2](https://github.com/HamonUdvari/io-bio/compare/v1.1.1...v1.1.2) (2026-05-29)


### Bug Fixes

* entry mobile layout, downloads-as-links, grid CLS, icon font-display ([](https://github.com/HamonUdvari/io-bio/commit/51385094f59206c2e4b4b5693e46c340b1ded545))

## [1.1.1](https://github.com/HamonUdvari/io-bio/compare/v1.1.0...v1.1.1) (2026-05-29)


### Bug Fixes

* footer→h2, linkify long image source, crisp download icon ([](https://github.com/HamonUdvari/io-bio/commit/ae1a741142f14fcdd3f068f6f666826e04358684))

# [1.1.0](https://github.com/HamonUdvari/io-bio/compare/v1.0.0...v1.1.0) (2026-05-29)


### Bug Fixes

* **bios:** extract Saouma's role via cosmetic transform, not regex ([](https://github.com/HamonUdvari/io-bio/commit/4da37fad5fa2ce6ac9ffe7b861cf69a811293f02))
* conditionally rendering sections in entry pages ([](https://github.com/HamonUdvari/io-bio/commit/3107032b9d722752f852dcd4988ae04406318688))
* hero layout used in main entries ([](https://github.com/HamonUdvari/io-bio/commit/bc20f1ebd04ec3969e6e51bb9063726e9ca2690f))
* **images:** preserve portrait sharpness — never upscale crops, raise webp quality ([](https://github.com/HamonUdvari/io-bio/commit/48ce7a9c5d1d596c0b3936cdacec137b9dd61014))
* style changes ([](https://github.com/HamonUdvari/io-bio/commit/94f5750a2e7e21a7237a5961223f2c88b345db14))


### Website Features

* **bios:** cosmetic fixes for 8 more entries; add CHANGELOG.md ([](https://github.com/HamonUdvari/io-bio/commit/114720e0f9281314cc7078cd5ad714963f193da5))
* **bios:** source/processed/diffs pipeline with applied fixes ([](https://github.com/HamonUdvari/io-bio/commit/6ef91ac4608ad2974da7d736903ae124d8ec4e7a))
* bump astro ([](https://github.com/HamonUdvari/io-bio/commit/dd5aa6588723cfedd6c5114d3b21ffc7fe4d039c))
* bump astro to v 6.2 ([](https://github.com/HamonUdvari/io-bio/commit/a77ceb29ea8892911bbe92e91e46acb8d92e13e8))
* extracting base64 images ([](https://github.com/HamonUdvari/io-bio/commit/5ce7ff48b6705cbee96a5bd740a958b19784a856))
* HCR-as-institution alias, separator tolerance, image-format conversion ([](https://github.com/HamonUdvari/io-bio/commit/20f843b3609d93164e340883a9e51fc1b006ce93))
* image override pipeline + 30 same-image high-res overrides ([](https://github.com/HamonUdvari/io-bio/commit/5bf3b743e1f71edf17b984fb6e5b169209d5c2bf)), closes [hi#res](https://github.com/hi/issues/res)
* **images:** 7 more same-image overrides + manual-fetch CSV + journal ([](https://github.com/HamonUdvari/io-bio/commit/772a0b9ac8cd60dc236fb287e30aeba2df71a191))
* **images:** final 3 overrides + complete TODO classification ([](https://github.com/HamonUdvari/io-bio/commit/70d67d1c216a6d1d70a742732ce4d77522cfd65e))
* **images:** integrate 52 AI-upscaled overrides + working folders ([](https://github.com/HamonUdvari/io-bio/commit/fca032cb721c28e176c7227c179546ccf42e17ea))
* mirror Figma design to code + review fixes ([](https://github.com/HamonUdvari/io-bio/commit/1f330c633c99c2d76110cd50937084893fa982c6))
* **parser:** multi-role schema, APL as Citation arrays, list rendering ([](https://github.com/HamonUdvari/io-bio/commit/7240356712c5db052d5e284b42dcf76e741308b7))
* POC website ([](https://github.com/HamonUdvari/io-bio/commit/23a79df0083bb98a84ddd05f99b5527ac7ef6a30))
* **preview:** add /preview page for client-side docx parsing ([](https://github.com/HamonUdvari/io-bio/commit/ecf0cdf2364522dd9d025d1166ed86d7c4404bf9))
* promote entries page to landing page ([](https://github.com/HamonUdvari/io-bio/commit/770baff6807ec99670bd0c21b20f84ae3d075e43))
* sync entries list state to URL and prevent flash on restore ([](https://github.com/HamonUdvari/io-bio/commit/a1d1748499b98afffb89f2270ae5797185e4399a))

# 1.0.0 (2026-02-15)


### Website Features

* init ([](https://github.com/HamonUdvari/io-bio/commit/4b16c3a89a69c0f372ef380a2c6f76422cb9f86c))
