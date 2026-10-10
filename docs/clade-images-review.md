# Temporary clade image review

Added 10 October 2026 to restore the 63 missing clade images found in the audit.

## Implementation

- 23 scientific names now explicitly map to the existing common-name Wikipedia articles, following the Animalia fix.
- 13 entries use the previously cached redirected article image. These are temporary: some montages contain animals outside the displayed clade. The caption names the source article, and its introduction is still rejected as a description of the narrower clade.
- 27 entries use sourced representative members for the 25 clades with article lookup disabled and the two clades whose summaries provide no image.
- Each of the 40 provisional images has a `Temporary fix — review later` note in `public/data/clade-images.json`, plus creator, file and licence links. Image lookup is independent of article suitability.
- Original local descriptions, taxonomy, answer pool, daily selection and individual-animal image choices are unchanged.

## Source checks

Wikimedia Commons file descriptions, imageinfo licence metadata and category warnings were checked for each selected file. Representatives were checked against descendants in the current Dinozoa tree. An obsolete Tsintaosaurus candidate was rejected. The final Tsintaosaurus selection is Connor Ashbridge’s 2023 restoration; Heyuanninae uses Nemegtomaia and Giganotosaurini uses Mapusaurus.

For two files without a machine-readable artist, the original Commons page supplied attribution: Dornicke for the Tropeognathus photograph and Michelle Pemberton / The Children’s Museum of Indianapolis for the Psittacosaurus cast photograph.

These checks confirm source identity and credit, not specialist approval of every reconstruction. Images remain remote Wikimedia files. No artwork is edited. The fallback uses another size of the same original file.

## Review checklist

Replace a selection by updating the image, fallback, title, creator, file link, licence and caption together. Keep representative animals inside the clade. Do not broaden accepted description articles just to obtain an image.

### Redirected article images — review group coverage first

- [ ] **Allosauroidea** — Carnosauria article; [original image and licence](https://commons.wikimedia.org/wiki/File:Carnosauria_(sensu_stricto)_Infobox_Panoply.png).
- [ ] **Avetheropoda** — Tetanurae article; [original image and licence](https://commons.wikimedia.org/wiki/File:Tetanuran_Infobox_Panoply.png).
- [ ] **Ceratosauridae** — Ceratosauria article; [original image and licence](https://commons.wikimedia.org/wiki/File:Ceratosauria_Infobox_Panoply.png).
- [ ] **Coelophysidae** — Coelophysoidea article; [original image and licence](https://commons.wikimedia.org/wiki/File:Coelophysis_bauri_mount.jpg).
- [ ] **Dilophosauridae** — Dilophosaurus article; [original image and licence](https://commons.wikimedia.org/wiki/File:DilophosaurusROM1.JPG).
- [ ] **Huayangosauridae** — Stegosauria article; [original image and licence](https://commons.wikimedia.org/wiki/File:Zigong_Dinosaur_Museum_Gigantspinosaurus.jpg).
- [ ] **Iguanodontia** — Ornithopoda article; [original image and licence](https://commons.wikimedia.org/wiki/File:Ornithopoda_Infobox_Panoply.png).
- [ ] **Ornithocheiridae** — Anhangueridae article; [original image and licence](https://commons.wikimedia.org/wiki/File:Tropeognathus_mesembrinus_MN_01.jpg).
- [ ] **Ornithodira** — Avemetatarsalia article; [original image and licence](https://commons.wikimedia.org/wiki/File:Avemetatarsalia_Infobox_Panoply.png).
- [ ] **Pachycephalosauridae** — Pachycephalosauria article; [original image and licence](https://commons.wikimedia.org/wiki/File:Pachycephalosauria_Diversity.jpg).
- [ ] **Psittacosauridae** — Psittacosaurus article; [original image and licence](https://commons.wikimedia.org/wiki/File:The_Childrens_Museum_of_Indianapolis_-_Psittacosaurus_skeleton_cast.jpg).
- [ ] **Pterodactylidae** — Pterodactylus article; [original image and licence](https://commons.wikimedia.org/wiki/File:Bsp_as_i_739_modified.png).
- [ ] **Stegosauridae** — Stegosauria article; [original image and licence](https://commons.wikimedia.org/wiki/File:Zigong_Dinosaur_Museum_Gigantspinosaurus.jpg).

### Representative members — review artwork and preferred representative

- [ ] **Abelisaurinae** — Majungasaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Majungasaurus_BW.jpg).
- [ ] **Ankylosaurini** — Ankylosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Ankylosaurus_magniventris_reconstruction_nomargin.png).
- [ ] **Brachylophosaurini** — Brachylophosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Brachylophosaurus_NT.png).
- [ ] **Carcharodontosaurinae** — Carcharodontosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Carcharodontosaurus_BW.jpg).
- [ ] **Dromaeosaurinae** — Dromaeosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Dromaeosaurus_Restoration.png).
- [ ] **Dryomorpha** — Iguanodon; [original image and licence](https://commons.wikimedia.org/wiki/File:Iguanodon_new_NT.jpg).
- [ ] **Edmontosaurini** — Edmontosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Edmontosaurus_reconstruction.jpg).
- [ ] **Gastornithidae** — Gastornis; [original image and licence](https://commons.wikimedia.org/wiki/File:Gastornis.png).
- [ ] **Giganotosaurini** — Mapusaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Mapusaurus_BW.jpg).
- [ ] **Hadrosauriformes** — Edmontosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Edmontosaurus_reconstruction.jpg).
- [ ] **Heyuanninae** — Nemegtomaia; [original image and licence](https://commons.wikimedia.org/wiki/File:Nemegtomaia_Restoration.png).
- [ ] **Kritosaurini** — Gryposaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Gryposaurus_TD.png).
- [ ] **Lambeosaurini** — Corythosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Corythosaurus_TD.png).
- [ ] **Pachyrhinosaurini** — Pachyrhinosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Pachyrhinosaurus_TD.png).
- [ ] **Parasaurolophini** — Parasaurolophus; [original image and licence](https://commons.wikimedia.org/wiki/File:Parasaurolophus_TD.png).
- [ ] **Pelagiceti** — Basilosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Basilosaurus_cetoides.png).
- [ ] **Phytosauria** — Smilosuchus; [original image and licence](https://commons.wikimedia.org/wiki/File:Smilosuchus-reconstructions-Jeff-Martz-600-px-tiny-Oct-2014-Tetrapod-Zoology_adamanensis.png).
- [ ] **Plioplatecarpinae** — Platecarpus; [original image and licence](https://commons.wikimedia.org/wiki/File:Platecarpus_tympaniticus.jpg).
- [ ] **Saurolophini** — Saurolophus; [original image and licence](https://commons.wikimedia.org/wiki/File:Saurolophus_TD.png).
- [ ] **Saurornitholestinae** — Saurornitholestes; [original image and licence](https://commons.wikimedia.org/wiki/File:Saurornitholestes_langstoni.png).
- [ ] **Spinosaurinae** — Spinosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Spinosaurus_aegyptiacus_by_PaleoGeek.png).
- [ ] **Styracosterna** — Iguanodon; [original image and licence](https://commons.wikimedia.org/wiki/File:Iguanodon_new_NT.jpg).
- [ ] **Therizinosauroidea** — Therizinosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:Therizinosaurus_Restoration.png).
- [ ] **Triceratopsini** — Triceratops; [original image and licence](https://commons.wikimedia.org/wiki/File:Triceratops_BW.jpg).
- [ ] **Troodontinae** — Saurornithoides; [original image and licence](https://commons.wikimedia.org/wiki/File:Saurornithoides_restoration.png).
- [ ] **Tsintaosaurini** — Tsintaosaurus; [original image and licence](https://commons.wikimedia.org/wiki/File:A_life_reconstruction_of_Tsintaosaurus_spinorhinus.png).
- [ ] **Velociraptorinae** — Velociraptor; [original image and licence](https://commons.wikimedia.org/wiki/File:Velociraptor_Restoration.png).

## Verification

- [x] All 236 current clades load an image in Chromium and WebKit, with real Wikimedia image requests.
- [x] All 63 repaired clades verified through the actual card renderer at 390px in both engines. Representative desktop cards and contact sheets of all 40 temporary selections inspected; captions and credits fit.
- [x] All seven test suites and the clue audit pass, including clade coverage, descendant membership, attribution and description-isolation checks. Production build passes.
