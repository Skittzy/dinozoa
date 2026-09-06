#!/usr/bin/env python3
"""
Generates dinosaur-database.json: a taxonomic tree of prehistoric animals.

Design:
- INTERNAL nodes (kingdom..family) form the skeleton; each knows its parent.
- LEAF genera are attached to a family/clade. Each leaf has `answer` = True if it
  is a "popular / semi-popular" animal eligible to be the daily answer.
- Niche animals (answer=False) are still guessable and help narrow the search.
Output shape matches the existing DinoNode interface: {id, scientific, common, rank, children, answer}
"""
import json
import os, collections

# ---------------------------------------------------------------------------
# 1. INTERNAL SKELETON  (name, common, rank, parent)
# ---------------------------------------------------------------------------
INTERNAL = [
    ("Animalia", "animals", "kingdom", None),

    # ---- non-chordate flavour branches (very "cold" guesses) ----
    ("Arthropoda", "arthropods", "phylum", "Animalia"),
    ("Trilobita", "trilobites", "class", "Arthropoda"),
    ("Eurypterida", "sea scorpions", "order", "Arthropoda"),
    ("Myriapoda", "myriapods", "class", "Arthropoda"),
    ("Insecta", "insects", "class", "Arthropoda"),
    ("Radiodonta", "radiodonts", "order", "Arthropoda"),
    ("Mollusca", "molluscs", "phylum", "Animalia"),
    ("Ammonoidea", "ammonites", "class", "Mollusca"),
    ("Cephalopoda", "cephalopods", "class", "Mollusca"),

    ("Chordata", "chordates", "phylum", "Animalia"),

    # ---- fish grades ----
    ("Placodermi", "armoured fish", "class", "Chordata"),
    ("Chondrichthyes", "cartilaginous fish", "class", "Chordata"),
    ("Actinopterygii", "ray-finned fish", "class", "Chordata"),
    ("Sarcopterygii", "lobe-finned fish", "class", "Chordata"),

    # ---- tetrapod backbone ----
    ("Tetrapoda", "tetrapods", "clade", "Chordata"),
    ("Amphibia", "amphibians", "class", "Tetrapoda"),
    ("Amniota", "amniotes", "clade", "Tetrapoda"),

    # ===== SAUROPSIDS / REPTILES =====
    ("Reptilia", "reptiles", "class", "Amniota"),
    ("Parareptilia", "parareptiles", "clade", "Reptilia"),

    ("Ichthyosauria", "ichthyosaurs", "clade", "Reptilia"),
    ("Sauropterygia", "sauropterygians", "clade", "Reptilia"),
    ("Plesiosauria", "plesiosaurs", "order", "Sauropterygia"),
    ("Plesiosauroidea", "long-necked plesiosaurs", "superfamily", "Plesiosauria"),
    ("Pliosauridae", "pliosaurs", "family", "Plesiosauria"),
    ("Nothosauria", "nothosaurs", "order", "Sauropterygia"),
    ("Placodontia", "placodonts", "order", "Sauropterygia"),

    ("Lepidosauria", "lepidosaurs", "clade", "Reptilia"),
    ("Squamata", "squamates", "order", "Lepidosauria"),
    ("Serpentes", "snakes", "suborder", "Squamata"),
    ("Mosasauridae", "mosasaurs", "family", "Squamata"),

    ("Archosauromorpha", "archosauromorphs", "clade", "Reptilia"),
    ("Phytosauria", "phytosaurs", "order", "Archosauromorpha"),
    ("Archosauria", "archosaurs", "clade", "Archosauromorpha"),

    # croc-line
    ("Pseudosuchia", "croc-line archosaurs", "clade", "Archosauria"),
    ("Aetosauria", "aetosaurs", "order", "Pseudosuchia"),
    ("Rauisuchia", "rauisuchians", "order", "Pseudosuchia"),
    ("Crocodylomorpha", "croc relatives", "clade", "Pseudosuchia"),
    ("Metriorhynchidae", "marine crocs", "family", "Crocodylomorpha"),

    # bird-line
    ("Ornithodira", "bird-line archosaurs", "clade", "Archosauria"),

    # pterosaurs
    ("Pterosauria", "pterosaurs", "clade", "Ornithodira"),
    ("Rhamphorhynchidae", "rhamphorhynchids", "family", "Pterosauria"),
    ("Dimorphodontidae", "dimorphodontids", "family", "Pterosauria"),
    ("Anurognathidae", "anurognathids", "family", "Pterosauria"),
    ("Wukongopteridae", "wukongopterids", "family", "Pterosauria"),
    ("Pterodactyloidea", "pterodactyloids", "clade", "Pterosauria"),
    ("Ctenochasmatidae", "ctenochasmatids", "family", "Pterodactyloidea"),
    ("Pterodactylidae", "pterodactylids", "family", "Pterodactyloidea"),
    ("Ornithocheiridae", "ornithocheirids", "family", "Pterodactyloidea"),
    ("Istiodactylidae", "istiodactylids", "family", "Pterodactyloidea"),
    ("Pteranodontidae", "pteranodontids", "family", "Pterodactyloidea"),
    ("Nyctosauridae", "nyctosaurids", "family", "Pterodactyloidea"),
    ("Tapejaridae", "tapejarids", "family", "Pterodactyloidea"),
    ("Azhdarchidae", "azhdarchids", "family", "Pterodactyloidea"),

    # ===== DINOSAURS =====
    ("Dinosauria", "dinosaurs", "clade", "Ornithodira"),

    ("Saurischia", "lizard-hipped dinosaurs", "clade", "Dinosauria"),

    ("Theropoda", "theropods", "clade", "Saurischia"),
    ("Coelophysidae", "coelophysids", "family", "Theropoda"),
    ("Dilophosauridae", "dilophosaurids", "family", "Theropoda"),
    ("Ceratosauria", "ceratosaurs", "clade", "Theropoda"),
    ("Ceratosauridae", "ceratosaurids", "family", "Ceratosauria"),
    ("Abelisauridae", "abelisaurids", "family", "Ceratosauria"),
    ("Noasauridae", "noasaurids", "family", "Ceratosauria"),
    ("Tetanurae", "tetanurans", "clade", "Theropoda"),
    ("Megalosauridae", "megalosaurids", "family", "Tetanurae"),
    ("Piatnitzkysauridae", "piatnitzkysaurids", "family", "Tetanurae"),
    ("Spinosauridae", "spinosaurids", "family", "Tetanurae"),
    ("Avetheropoda", "avetheropods", "clade", "Tetanurae"),
    ("Allosauroidea", "allosauroids", "superfamily", "Avetheropoda"),
    ("Allosauridae", "allosaurids", "family", "Allosauroidea"),
    ("Metriacanthosauridae", "metriacanthosaurids", "family", "Allosauroidea"),
    ("Carcharodontosauridae", "carcharodontosaurids", "family", "Allosauroidea"),
    ("Coelurosauria", "coelurosaurs", "clade", "Avetheropoda"),
    ("Compsognathidae", "compsognathids", "family", "Coelurosauria"),
    ("Tyrannosauroidea", "tyrannosauroids", "superfamily", "Coelurosauria"),
    ("Tyrannosauridae", "tyrannosaurids", "family", "Tyrannosauroidea"),
    ("Ornithomimosauria", "ornithomimosaurs", "clade", "Coelurosauria"),
    ("Ornithomimidae", "ornithomimids", "family", "Ornithomimosauria"),
    ("Deinocheiridae", "deinocheirids", "family", "Ornithomimosauria"),
    ("Maniraptora", "maniraptorans", "clade", "Coelurosauria"),
    ("Alvarezsauridae", "alvarezsaurids", "family", "Maniraptora"),
    ("Therizinosauridae", "therizinosaurs", "family", "Maniraptora"),
    ("Oviraptorosauria", "oviraptorosaurs", "clade", "Maniraptora"),
    ("Oviraptoridae", "oviraptorids", "family", "Oviraptorosauria"),
    ("Caenagnathidae", "caenagnathids", "family", "Oviraptorosauria"),
    ("Paraves", "paravians", "clade", "Maniraptora"),
    ("Dromaeosauridae", "dromaeosaurs (raptors)", "family", "Paraves"),
    ("Troodontidae", "troodontids", "family", "Paraves"),
    ("Avialae", "birds & kin", "clade", "Paraves"),
    ("Aves", "modern birds", "clade", "Avialae"),
    ("Phorusrhacidae", "terror birds", "family", "Aves"),

    ("Sauropodomorpha", "sauropodomorphs", "clade", "Saurischia"),
    ("Plateosauridae", "plateosaurids", "family", "Sauropodomorpha"),
    ("Massospondylidae", "massospondylids", "family", "Sauropodomorpha"),
    ("Riojasauridae", "riojasaurids", "family", "Sauropodomorpha"),
    ("Sauropoda", "sauropods", "clade", "Sauropodomorpha"),
    ("Cetiosauridae", "cetiosaurids", "family", "Sauropoda"),
    ("Mamenchisauridae", "mamenchisaurids", "family", "Sauropoda"),
    ("Turiasauria", "turiasaurs", "clade", "Sauropoda"),
    ("Neosauropoda", "neosauropods", "clade", "Sauropoda"),
    ("Diplodocoidea", "diplodocoids", "superfamily", "Neosauropoda"),
    ("Diplodocidae", "diplodocids", "family", "Diplodocoidea"),
    ("Dicraeosauridae", "dicraeosaurids", "family", "Diplodocoidea"),
    ("Rebbachisauridae", "rebbachisaurids", "family", "Diplodocoidea"),
    ("Macronaria", "macronarians", "clade", "Neosauropoda"),
    ("Camarasauridae", "camarasaurids", "family", "Macronaria"),
    ("Brachiosauridae", "brachiosaurids", "family", "Macronaria"),
    ("Titanosauria", "titanosaurs", "clade", "Macronaria"),

    ("Ornithischia", "bird-hipped dinosaurs", "clade", "Dinosauria"),
    ("Heterodontosauridae", "heterodontosaurids", "family", "Ornithischia"),
    ("Thyreophora", "armoured dinosaurs", "clade", "Ornithischia"),
    ("Stegosauria", "stegosaurs", "clade", "Thyreophora"),
    ("Huayangosauridae", "huayangosaurids", "family", "Stegosauria"),
    ("Stegosauridae", "stegosaurids", "family", "Stegosauria"),
    ("Ankylosauria", "ankylosaurs", "clade", "Thyreophora"),
    ("Nodosauridae", "nodosaurids", "family", "Ankylosauria"),
    ("Ankylosauridae", "ankylosaurids", "family", "Ankylosauria"),
    ("Neornithischia", "neornithischians", "clade", "Ornithischia"),
    ("Thescelosauridae", "thescelosaurids", "family", "Neornithischia"),
    ("Ornithopoda", "ornithopods", "clade", "Neornithischia"),
    ("Hypsilophodontidae", "hypsilophodonts", "family", "Ornithopoda"),
    ("Iguanodontia", "iguanodonts", "clade", "Ornithopoda"),
    ("Hadrosauridae", "hadrosaurs (duckbills)", "family", "Iguanodontia"),
    ("Marginocephalia", "marginocephalians", "clade", "Neornithischia"),
    ("Pachycephalosauridae", "pachycephalosaurs", "family", "Marginocephalia"),
    ("Ceratopsia", "ceratopsians", "clade", "Marginocephalia"),
    ("Psittacosauridae", "psittacosaurids", "family", "Ceratopsia"),
    ("Protoceratopsidae", "protoceratopsids", "family", "Ceratopsia"),
    ("Ceratopsidae", "horned dinosaurs", "family", "Ceratopsia"),

    # ===== SYNAPSIDS / MAMMALS =====
    ("Synapsida", "synapsids", "clade", "Amniota"),
    ("Sphenacodontidae", "sphenacodonts", "family", "Synapsida"),
    ("Edaphosauridae", "edaphosaurs", "family", "Synapsida"),
    ("Caseidae", "caseids", "family", "Synapsida"),
    ("Therapsida", "therapsids", "clade", "Synapsida"),
    ("Dinocephalia", "dinocephalians", "order", "Therapsida"),
    ("Gorgonopsia", "gorgonopsians", "order", "Therapsida"),
    ("Dicynodontia", "dicynodonts", "order", "Therapsida"),
    ("Cynodontia", "cynodonts", "clade", "Therapsida"),

    ("Mammalia", "mammals", "class", "Cynodontia"),
    ("Marsupialia", "marsupials", "clade", "Mammalia"),
    ("Xenarthra", "xenarthrans", "clade", "Mammalia"),
    ("Proboscidea", "elephants & kin", "order", "Mammalia"),
    ("Perissodactyla", "odd-toed ungulates", "order", "Mammalia"),
    ("Artiodactyla", "even-toed ungulates", "order", "Mammalia"),
    ("Cetacea", "whales", "clade", "Artiodactyla"),
    ("Carnivora", "carnivorans", "order", "Mammalia"),
    ("Felidae", "cats", "family", "Carnivora"),
    ("Canidae", "dogs", "family", "Carnivora"),
    ("Ursidae", "bears", "family", "Carnivora"),
    ("Rodentia", "rodents", "order", "Mammalia"),
    ("Primates", "primates", "order", "Mammalia"),
    ("Litopterna", "litopterns", "order", "Mammalia"),
    ("Notoungulata", "notoungulates", "order", "Mammalia"),
    ("Dinocerata", "dinoceratans", "order", "Mammalia"),
    ("Embrithopoda", "embrithopods", "order", "Mammalia"),
]

# ---------------------------------------------------------------------------
# 2. LEAF GENERA:  family -> [ (scientific, common, popular), ... ]
#    popular=True  => eligible to be the daily answer
# ---------------------------------------------------------------------------
P, N = True, False   # Popular (answer-eligible) / Niche (guess-only)

GENERA = {
 # ---------------- Theropods ----------------
 "Tyrannosauridae": [("Tyrannosaurus","T. rex",P),("Tarbosaurus","Tarbosaurus",P),("Albertosaurus","Albertosaurus",P),
    ("Gorgosaurus","Gorgosaurus",P),("Daspletosaurus","Daspletosaurus",P),("Nanuqsaurus","Nanuqsaurus",N),
    ("Teratophoneus","Teratophoneus",N),("Lythronax","Lythronax",P),("Alioramus","Alioramus",N),("Qianzhousaurus","Pinocchio rex",N)],
 "Tyrannosauroidea": [("Guanlong","Guanlong",P),("Yutyrannus","Yutyrannus",P),("Dilong","Dilong",N),("Proceratosaurus","Proceratosaurus",N),
    ("Eotyrannus","Eotyrannus",N),("Xiongguanlong","Xiongguanlong",N),("Timurlengia","Timurlengia",N)],
 "Dromaeosauridae": [("Velociraptor","Velociraptor",P),("Deinonychus","Deinonychus",P),("Utahraptor","Utahraptor",P),
    ("Dromaeosaurus","Dromaeosaurus",P),("Microraptor","Microraptor",P),("Achillobator","Achillobator",N),
    ("Austroraptor","Austroraptor",N),("Buitreraptor","Buitreraptor",N),("Bambiraptor","Bambiraptor",N),
    ("Saurornitholestes","Saurornitholestes",N),("Dakotaraptor","Dakotaraptor",P),("Zhenyuanlong","Zhenyuanlong",N),("Balaur","Balaur",N)],
 "Troodontidae": [("Troodon","Troodon",P),("Saurornithoides","Saurornithoides",N),("Mei","Mei long",N),
    ("Sinornithoides","Sinornithoides",N),("Byronosaurus","Byronosaurus",N),("Zanabazar","Zanabazar",N),
    ("Latenivenatrix","Latenivenatrix",N),("Anchiornis","Anchiornis",P)],
 "Spinosauridae": [("Spinosaurus","Spinosaurus",P),("Baryonyx","Baryonyx",P),("Suchomimus","Suchomimus",P),
    ("Irritator","Irritator",N),("Ichthyovenator","Ichthyovenator",N),("Oxalaia","Oxalaia",N),("Cristatusaurus","Cristatusaurus",N)],
 "Allosauridae": [("Allosaurus","Allosaurus",P),("Saurophaganax","Saurophaganax",N)],
 "Metriacanthosauridae": [("Sinraptor","Sinraptor",P),("Yangchuanosaurus","Yangchuanosaurus",N),("Metriacanthosaurus","Metriacanthosaurus",N)],
 "Carcharodontosauridae": [("Carcharodontosaurus","Carcharodontosaurus",P),("Giganotosaurus","Giganotosaurus",P),
    ("Mapusaurus","Mapusaurus",P),("Acrocanthosaurus","Acrocanthosaurus",P),("Concavenator","Concavenator",N),
    ("Tyrannotitan","Tyrannotitan",N),("Meraxes","Meraxes",N),("Eocarcharia","Eocarcharia",N)],
 "Abelisauridae": [("Carnotaurus","Carnotaurus",P),("Majungasaurus","Majungasaurus",P),("Abelisaurus","Abelisaurus",N),
    ("Rajasaurus","Rajasaurus",P),("Ekrixinatosaurus","Ekrixinatosaurus",N),("Skorpiovenator","Skorpiovenator",N),
    ("Aucasaurus","Aucasaurus",N),("Rugops","Rugops",N)],
 "Ceratosauridae": [("Ceratosaurus","Ceratosaurus",P),("Genyodectes","Genyodectes",N)],
 "Noasauridae": [("Masiakasaurus","Masiakasaurus",N),("Noasaurus","Noasaurus",N),("Elaphrosaurus","Elaphrosaurus",N)],
 "Coelophysidae": [("Coelophysis","Coelophysis",P),("Megapnosaurus","Megapnosaurus",N),("Camposaurus","Camposaurus",N),
    ("Procompsognathus","Procompsognathus",N)],
 "Dilophosauridae": [("Dilophosaurus","Dilophosaurus",P),("Cryolophosaurus","Cryolophosaurus",P)],
 "Megalosauridae": [("Megalosaurus","Megalosaurus",P),("Torvosaurus","Torvosaurus",P),("Afrovenator","Afrovenator",N),
    ("Eustreptospondylus","Eustreptospondylus",N),("Duriavenator","Duriavenator",N)],
 "Piatnitzkysauridae": [("Piatnitzkysaurus","Piatnitzkysaurus",N),("Marshosaurus","Marshosaurus",N),("Condorraptor","Condorraptor",N)],
 "Compsognathidae": [("Compsognathus","Compsognathus",P),("Sinosauropteryx","Sinosauropteryx",P),("Juravenator","Juravenator",N),
    ("Scipionyx","Scipionyx",N)],
 "Ornithomimidae": [("Ornithomimus","Ornithomimus",P),("Struthiomimus","Struthiomimus",P),("Gallimimus","Gallimimus",P),
    ("Anserimimus","Anserimimus",N),("Archaeornithomimus","Archaeornithomimus",N),("Sinornithomimus","Sinornithomimus",N)],
 "Deinocheiridae": [("Deinocheirus","Deinocheirus",P),("Garudimimus","Garudimimus",N),("Beishanlong","Beishanlong",N)],
 "Alvarezsauridae": [("Mononykus","Mononykus",P),("Shuvuuia","Shuvuuia",N),("Alvarezsaurus","Alvarezsaurus",N),
    ("Patagonykus","Patagonykus",N),("Linhenykus","Linhenykus",N)],
 "Therizinosauridae": [("Therizinosaurus","Therizinosaurus",P),("Nothronychus","Nothronychus",N),("Erlikosaurus","Erlikosaurus",N),
    ("Segnosaurus","Segnosaurus",N),("Alxasaurus","Alxasaurus",N),("Beipiaosaurus","Beipiaosaurus",N)],
 "Oviraptoridae": [("Oviraptor","Oviraptor",P),("Citipati","Citipati",P),("Khaan","Khaan",N),("Conchoraptor","Conchoraptor",N),
    ("Rinchenia","Rinchenia",N),("Nemegtomaia","Nemegtomaia",N)],
 "Caenagnathidae": [("Anzu","Anzu",P),("Gigantoraptor","Gigantoraptor",P),("Chirostenotes","Chirostenotes",N),
    ("Caenagnathus","Caenagnathus",N),("Elmisaurus","Elmisaurus",N)],
 "Avialae": [("Archaeopteryx","Archaeopteryx",P),("Confuciusornis","Confuciusornis",P),("Jeholornis","Jeholornis",N),
    ("Sapeornis","Sapeornis",N),("Ichthyornis","Ichthyornis",P),("Hesperornis","Hesperornis",P)],
 "Phorusrhacidae": [("Phorusrhacos","terror bird",P),("Titanis","Titanis",P),("Kelenken","Kelenken",N),("Gastornis","Gastornis",P)],
 "Aves": [("Aepyornis","elephant bird",P),("Dinornis","giant moa",P),("Argentavis","Argentavis",P),("Pelagornis","Pelagornis",N),
    ("Hieraaetus","Haast's eagle",P),
    ("Raphus","dodo",P)],

 # ---------------- Sauropodomorphs ----------------
 "Plateosauridae": [("Plateosaurus","Plateosaurus",P),("Sellosaurus","Sellosaurus",N)],
 "Massospondylidae": [("Massospondylus","Massospondylus",P),("Lufengosaurus","Lufengosaurus",N),("Coloradisaurus","Coloradisaurus",N)],
 "Riojasauridae": [("Riojasaurus","Riojasaurus",N),("Eucnemesaurus","Eucnemesaurus",N)],
 "Sauropodomorpha": [("Mussaurus","Mussaurus",N),("Thecodontosaurus","Thecodontosaurus",N),("Anchisaurus","Anchisaurus",N),
    ("Melanorosaurus","Melanorosaurus",N),("Saturnalia","Saturnalia",N),("Yunnanosaurus","Yunnanosaurus",N)],
 "Cetiosauridae": [("Cetiosaurus","Cetiosaurus",N),("Shunosaurus","Shunosaurus",P),("Barapasaurus","Barapasaurus",N)],
 "Mamenchisauridae": [("Mamenchisaurus","Mamenchisaurus",P),("Omeisaurus","Omeisaurus",N),("Xinjiangtitan","Xinjiangtitan",N)],
 "Turiasauria": [("Turiasaurus","Turiasaurus",N)],
 "Camarasauridae": [("Camarasaurus","Camarasaurus",P),("Cathetosaurus","Cathetosaurus",N)],
 "Diplodocidae": [("Diplodocus","Diplodocus",P),("Apatosaurus","Apatosaurus",P),("Brontosaurus","Brontosaurus",P),
    ("Barosaurus","Barosaurus",P),("Supersaurus","Supersaurus",P),("Galeamopus","Galeamopus",N),("Tornieria","Tornieria",N),
    ("Kaatedocus","Kaatedocus",N),("Leinkupal","Leinkupal",N)],
 "Dicraeosauridae": [("Amargasaurus","Amargasaurus",P),("Dicraeosaurus","Dicraeosaurus",N),("Brachytrachelopan","Brachytrachelopan",N),
    ("Suuwassea","Suuwassea",N)],
 "Rebbachisauridae": [("Nigersaurus","Nigersaurus",P),("Rebbachisaurus","Rebbachisaurus",N),("Demandasaurus","Demandasaurus",N)],
 "Brachiosauridae": [("Brachiosaurus","Brachiosaurus",P),("Giraffatitan","Giraffatitan",P),("Sauroposeidon","Sauroposeidon",P),
    ("Europasaurus","Europasaurus",N),("Abydosaurus","Abydosaurus",N),("Lusotitan","Lusotitan",N)],
 "Titanosauria": [("Argentinosaurus","Argentinosaurus",P),("Patagotitan","Patagotitan",P),("Dreadnoughtus","Dreadnoughtus",P),
    ("Saltasaurus","Saltasaurus",P),("Alamosaurus","Alamosaurus",P),("Rapetosaurus","Rapetosaurus",N),
    ("Ampelosaurus","Ampelosaurus",N),("Isisaurus","Isisaurus",N),("Notocolossus","Notocolossus",N),
    ("Futalognkosaurus","Futalognkosaurus",N),("Puertasaurus","Puertasaurus",P),("Nemegtosaurus","Nemegtosaurus",N),
    ("Malawisaurus","Malawisaurus",N),("Antarctosaurus","Antarctosaurus",N),("Paralititan","Paralititan",N)],

 # ---------------- Ornithischians ----------------
 "Heterodontosauridae": [("Heterodontosaurus","Heterodontosaurus",P),("Tianyulong","Tianyulong",N),("Fruitadens","Fruitadens",N),
    ("Abrictosaurus","Abrictosaurus",N)],
 "Thyreophora": [("Scutellosaurus","Scutellosaurus",N),("Scelidosaurus","Scelidosaurus",P),("Emausaurus","Emausaurus",N)],
 "Huayangosauridae": [("Huayangosaurus","Huayangosaurus",N)],
 "Stegosauridae": [("Stegosaurus","Stegosaurus",P),("Kentrosaurus","Kentrosaurus",P),("Tuojiangosaurus","Tuojiangosaurus",N),
    ("Hesperosaurus","Hesperosaurus",N),("Dacentrurus","Dacentrurus",N),("Miragaia","Miragaia",N),
    ("Gigantspinosaurus","Gigantspinosaurus",N),("Wuerhosaurus","Wuerhosaurus",N),("Chungkingosaurus","Chungkingosaurus",N),
    ("Loricatosaurus","Loricatosaurus",N)],
 "Nodosauridae": [("Edmontonia","Edmontonia",P),("Sauropelta","Sauropelta",P),("Borealopelta","Borealopelta",P),
    ("Panoplosaurus","Panoplosaurus",N),("Nodosaurus","Nodosaurus",N),("Gastonia","Gastonia",P),("Polacanthus","Polacanthus",N),
    ("Struthiosaurus","Struthiosaurus",N),("Hungarosaurus","Hungarosaurus",N)],
 "Ankylosauridae": [("Ankylosaurus","Ankylosaurus",P),("Euoplocephalus","Euoplocephalus",P),("Pinacosaurus","Pinacosaurus",N),
    ("Saichania","Saichania",N),("Talarurus","Talarurus",N),("Tarchia","Tarchia",N),("Zuul","Zuul",P),
    ("Scolosaurus","Scolosaurus",N),("Ziapelta","Ziapelta",N)],
 "Thescelosauridae": [("Thescelosaurus","Thescelosaurus",N),("Orodromeus","Orodromeus",N),("Oryctodromeus","Oryctodromeus",N),
    ("Leaellynasaura","Leaellynasaura",N)],
 "Hypsilophodontidae": [("Hypsilophodon","Hypsilophodon",P),("Parksosaurus","Parksosaurus",N)],
 "Iguanodontia": [("Iguanodon","Iguanodon",P),("Ouranosaurus","Ouranosaurus",P),("Mantellisaurus","Mantellisaurus",N),
    ("Tenontosaurus","Tenontosaurus",P),("Camptosaurus","Camptosaurus",P),("Dryosaurus","Dryosaurus",N),
    ("Muttaburrasaurus","Muttaburrasaurus",P),("Rhabdodon","Rhabdodon",N),("Altirhinus","Altirhinus",N),
    ("Lurdusaurus","Lurdusaurus",N),("Bactrosaurus","Bactrosaurus",N),("Eolambia","Eolambia",N)],
 "Hadrosauridae": [("Edmontosaurus","Edmontosaurus",P),("Parasaurolophus","Parasaurolophus",P),("Corythosaurus","Corythosaurus",P),
    ("Lambeosaurus","Lambeosaurus",P),("Maiasaura","Maiasaura",P),("Shantungosaurus","Shantungosaurus",P),
    ("Saurolophus","Saurolophus",P),("Brachylophosaurus","Brachylophosaurus",N),("Gryposaurus","Gryposaurus",N),
    ("Hypacrosaurus","Hypacrosaurus",N),("Kritosaurus","Kritosaurus",N),("Prosaurolophus","Prosaurolophus",N),
    ("Olorotitan","Olorotitan",N),("Tsintaosaurus","Tsintaosaurus",N),("Nipponosaurus","Nipponosaurus",N),
    ("Velafrons","Velafrons",N),("Charonosaurus","Charonosaurus",N)],
 "Pachycephalosauridae": [("Pachycephalosaurus","Pachycephalosaurus",P),("Stegoceras","Stegoceras",N),("Stygimoloch","Stygimoloch",P),
    ("Dracorex","Dracorex",P),("Prenocephale","Prenocephale",N),("Homalocephale","Homalocephale",N),
    ("Sphaerotholus","Sphaerotholus",N),("Wannanosaurus","Wannanosaurus",N),("Goyocephale","Goyocephale",N)],
 "Psittacosauridae": [("Psittacosaurus","Psittacosaurus",P)],
 "Protoceratopsidae": [("Protoceratops","Protoceratops",P),("Bagaceratops","Bagaceratops",N),("Leptoceratops","Leptoceratops",N),
    ("Yinlong","Yinlong",N),("Archaeoceratops","Archaeoceratops",N),("Liaoceratops","Liaoceratops",N),("Auroraceratops","Auroraceratops",N)],
 "Ceratopsidae": [("Triceratops","Triceratops",P),("Styracosaurus","Styracosaurus",P),("Centrosaurus","Centrosaurus",P),
    ("Pentaceratops","Pentaceratops",P),("Torosaurus","Torosaurus",P),("Chasmosaurus","Chasmosaurus",P),
    ("Anchiceratops","Anchiceratops",N),("Nasutoceratops","Nasutoceratops",P),("Kosmoceratops","Kosmoceratops",P),
    ("Utahceratops","Utahceratops",N),("Einiosaurus","Einiosaurus",N),("Achelousaurus","Achelousaurus",N),
    ("Pachyrhinosaurus","Pachyrhinosaurus",P),("Diabloceratops","Diabloceratops",N),("Regaliceratops","Regaliceratops",P),
    ("Medusaceratops","Medusaceratops",N),("Wendiceratops","Wendiceratops",N),("Arrhinoceratops","Arrhinoceratops",N),
    ("Spinops","Spinops",N),("Coronosaurus","Coronosaurus",N)],

 # ---------------- Pterosaurs ----------------
 "Rhamphorhynchidae": [("Rhamphorhynchus","Rhamphorhynchus",P),("Dorygnathus","Dorygnathus",N)],
 "Dimorphodontidae": [("Dimorphodon","Dimorphodon",P)],
 "Anurognathidae": [("Anurognathus","Anurognathus",N)],
 "Wukongopteridae": [("Darwinopterus","Darwinopterus",N)],
 "Ctenochasmatidae": [("Ctenochasma","Ctenochasma",N),("Pterodaustro","Pterodaustro",N)],
 "Pterodactylidae": [("Pterodactylus","Pterodactylus",P),("Germanodactylus","Germanodactylus",N)],
 "Ornithocheiridae": [("Ornithocheirus","Ornithocheirus",P),("Anhanguera","Anhanguera",N),("Tropeognathus","Tropeognathus",N),
    ("Coloborhynchus","Coloborhynchus",N)],
 "Istiodactylidae": [("Istiodactylus","Istiodactylus",N)],
 "Pteranodontidae": [("Pteranodon","Pteranodon",P),("Geosternbergia","Geosternbergia",N)],
 "Nyctosauridae": [("Nyctosaurus","Nyctosaurus",N)],
 "Tapejaridae": [("Tapejara","Tapejara",P),("Tupandactylus","Tupandactylus",P),("Thalassodromeus","Thalassodromeus",N)],
 "Azhdarchidae": [("Quetzalcoatlus","Quetzalcoatlus",P),("Hatzegopteryx","Hatzegopteryx",P),("Arambourgiania","Arambourgiania",N),
    ("Zhejiangopterus","Zhejiangopterus",N)],

 # ---------------- Marine reptiles ----------------
 "Mosasauridae": [("Mosasaurus","Mosasaurus",P),("Tylosaurus","Tylosaurus",P),("Platecarpus","Platecarpus",N),
    ("Clidastes","Clidastes",N),("Prognathodon","Prognathodon",N),("Globidens","Globidens",N),("Halisaurus","Halisaurus",N)],
 "Plesiosauroidea": [("Plesiosaurus","Plesiosaurus",P),("Elasmosaurus","Elasmosaurus",P),("Cryptoclidus","Cryptoclidus",N),
    ("Styxosaurus","Styxosaurus",N),("Albertonectes","Albertonectes",N),("Thalassomedon","Thalassomedon",N)],
 "Pliosauridae": [("Pliosaurus","Pliosaurus",P),("Liopleurodon","Liopleurodon",P),("Kronosaurus","Kronosaurus",P),
    ("Rhomaleosaurus","Rhomaleosaurus",N),("Brachauchenius","Brachauchenius",N)],
 "Nothosauria": [("Nothosaurus","Nothosaurus",N)],
 "Placodontia": [("Placodus","Placodus",N),("Henodus","Henodus",N)],
 "Ichthyosauria": [("Ichthyosaurus","Ichthyosaurus",P),("Ophthalmosaurus","Ophthalmosaurus",P),("Stenopterygius","Stenopterygius",N),
    ("Shonisaurus","Shonisaurus",P),("Temnodontosaurus","Temnodontosaurus",N),("Mixosaurus","Mixosaurus",N),
    ("Cymbospondylus","Cymbospondylus",N),("Excalibosaurus","Excalibosaurus",N)],

 # ---------------- Other reptiles / archosaurs ----------------
 "Serpentes": [("Titanoboa","Titanoboa",P),("Gigantophis","Gigantophis",N)],
 "Parareptilia": [("Scutosaurus","Scutosaurus",P),("Pareiasaurus","Pareiasaurus",N),("Mesosaurus","Mesosaurus",N)],
 "Phytosauria": [("Rutiodon","Rutiodon",N),("Smilosuchus","Smilosuchus",N)],
 "Aetosauria": [("Desmatosuchus","Desmatosuchus",N),("Stagonolepis","Stagonolepis",N)],
 "Rauisuchia": [("Postosuchus","Postosuchus",P),("Saurosuchus","Saurosuchus",N),("Prestosuchus","Prestosuchus",N),
    ("Fasolasuchus","Fasolasuchus",N)],
 "Crocodylomorpha": [("Sarcosuchus","Sarcosuchus",P),("Deinosuchus","Deinosuchus",P),("Kaprosuchus","Kaprosuchus",P),
    ("Simosuchus","Simosuchus",N),("Pristichampsus","Pristichampsus",N),("Purussaurus","Purussaurus",P)],
 "Metriorhynchidae": [("Metriorhynchus","Metriorhynchus",N),("Dakosaurus","Dakosaurus",N)],

 # ---------------- Synapsids (non-mammal) ----------------
 "Sphenacodontidae": [("Dimetrodon","Dimetrodon",P),("Sphenacodon","Sphenacodon",N),("Secodontosaurus","Secodontosaurus",N)],
 "Edaphosauridae": [("Edaphosaurus","Edaphosaurus",P)],
 "Caseidae": [("Cotylorhynchus","Cotylorhynchus",N)],
 "Dinocephalia": [("Moschops","Moschops",P),("Estemmenosuchus","Estemmenosuchus",N)],
 "Gorgonopsia": [("Gorgonops","Gorgonops",P),("Inostrancevia","Inostrancevia",P)],
 "Dicynodontia": [("Lystrosaurus","Lystrosaurus",P),("Dicynodon","Dicynodon",N),("Placerias","Placerias",N),("Cistecephalus","Cistecephalus",N)],
 "Cynodontia": [("Cynognathus","Cynognathus",P),("Thrinaxodon","Thrinaxodon",N)],

 # ---------------- Mammals ----------------
 "Proboscidea": [("Mammuthus","woolly mammoth",P),("Mammut","mastodon",P),("Palaeoloxodon","straight-tusked elephant",P),
    ("Deinotherium","Deinotherium",P),("Gomphotherium","Gomphotherium",N),("Moeritherium","Moeritherium",N)],
 "Felidae": [("Smilodon","saber-toothed cat",P),("Homotherium","scimitar cat",P),("Machairodus","Machairodus",N),
    ("Xenosmilus","Xenosmilus",N)],
 "Canidae": [("Aenocyon","dire wolf",P),("Epicyon","Epicyon",N)],
 "Ursidae": [("Arctodus","short-faced bear",P),("Ursus","cave bear",N)],
 "Xenarthra": [("Megatherium","giant ground sloth",P),("Eremotherium","Eremotherium",N),("Megalonyx","Megalonyx",N),
    ("Glyptodon","Glyptodon",P),("Doedicurus","Doedicurus",P)],
 "Perissodactyla": [("Coelodonta","woolly rhino",P),("Elasmotherium","Elasmotherium",P),("Paraceratherium","Paraceratherium",P),
    ("Chalicotherium","Chalicotherium",N),("Hyracotherium","Eohippus",P),("Megacerops","Megacerops",N)],
 "Artiodactyla": [("Daeodon","Daeodon",P),("Sivatherium","Sivatherium",N),("Megaloceros","Irish elk",P),("Bison","giant bison",N)],
 "Cetacea": [("Basilosaurus","Basilosaurus",P),("Dorudon","Dorudon",N),("Ambulocetus","walking whale",P),
    ("Pakicetus","Pakicetus",N),("Livyatan","Livyatan",P)],
 "Rodentia": [("Castoroides","giant beaver",P),("Josephoartigasia","Josephoartigasia",N)],
 "Primates": [("Gigantopithecus","Gigantopithecus",P),("Australopithecus","Australopithecus",P),("Paranthropus","Paranthropus",N)],
 "Litopterna": [("Macrauchenia","Macrauchenia",P)],
 "Notoungulata": [("Toxodon","Toxodon",N)],
 "Dinocerata": [("Uintatherium","Uintatherium",P)],
 "Embrithopoda": [("Arsinoitherium","Arsinoitherium",N)],
 "Marsupialia": [("Thylacosmilus","Thylacosmilus",P),("Thylacoleo","marsupial lion",P),("Diprotodon","Diprotodon",P),
    ("Procoptodon","giant short-faced kangaroo",N),("Thylacinus","thylacine",P)],

 # ---------------- Fish / amphibians ----------------
 "Placodermi": [("Dunkleosteus","Dunkleosteus",P),("Bothriolepis","Bothriolepis",N),("Titanichthys","Titanichthys",N)],
 "Chondrichthyes": [("Otodus","megalodon",P),("Cladoselache","Cladoselache",N),("Helicoprion","Helicoprion",P),
    ("Xenacanthus","Xenacanthus",N),("Stethacanthus","Stethacanthus",N),("Edestus","Edestus",N)],
 "Actinopterygii": [("Xiphactinus","Xiphactinus",P),("Leedsichthys","Leedsichthys",P)],
 "Sarcopterygii": [("Tiktaalik","Tiktaalik",P),("Eusthenopteron","Eusthenopteron",N)],
 "Amphibia": [("Eryops","Eryops",P),("Mastodonsaurus","Mastodonsaurus",N),("Diplocaulus","Diplocaulus",P),
    ("Prionosuchus","Prionosuchus",N),("Koolasuchus","Koolasuchus",N),("Ichthyostega","Ichthyostega",P),
    ("Acanthostega","Acanthostega",P),("Gerrothorax","Gerrothorax",N)],

 # ---------------- Invertebrates ----------------
 "Trilobita": [("Isotelus","trilobite",N),("Redlichia","Redlichia",N)],
 "Eurypterida": [("Jaekelopterus","giant sea scorpion",P),("Pterygotus","Pterygotus",N)],
 "Myriapoda": [("Arthropleura","Arthropleura",P)],
 "Insecta": [("Meganeura","giant dragonfly",P)],
 "Radiodonta": [("Anomalocaris","Anomalocaris",P),("Aegirocassis","Aegirocassis",N)],
 "Ammonoidea": [("Parapuzosia","giant ammonite",N)],
 "Cephalopoda": [("Cameroceras","Cameroceras",N),("Orthoceras","Orthoceras",N)],
}

# ---------------------------------------------------------------------------
# 2b. FAMOUS (answer-eligible). INVERTED from the old rule.
#
#     The old rule was "everything except a curated NICHE set is answer-eligible",
#     which was written to guarantee 365+ unique answers so no answer ever repeated
#     inside a year. That worked arithmetically and failed as a game: with 372
#     answers over 365 days, essentially every non-niche genus became an answer once
#     a year, so most days landed on something like Secodontosaurus or Nyctosaurus
#     and casual players lost repeatedly.
#
#     The pool is now an explicit allow-list of recognisable taxa, and answers are
#     allowed to REPEAT across cycles (see dailyAnimal.ts). Dropping the
#     no-repeats-in-a-year constraint is what makes a recognisable-only pool possible.
#
#     SELECTION CRITERION — a taxon is answer-eligible if it clears at least one of
#     three public-recognition gates:
#       1. SCREEN CANON  — named on screen in Jurassic Park/World, Walking with
#                          Dinosaurs, Prehistoric Planet, or Ice Age.
#       2. MUSEUM CANON  — a famous mounted specimen or permanent fixture at a major
#                          natural history museum (AMNH, NHM London, Smithsonian,
#                          Field Museum, Senckenberg).
#       3. TOY / BOOK    — standard in mainstream dinosaur toy lines (Schleich, Papo,
#                          LEGO, Safari Ltd) and general-audience dinosaur books.
#       4. VIDEO GAME    — a named playable / tameable / buildable species in a major
#                          dinosaur game: ARK: Survival Evolved & Ascended, Jurassic
#                          World Evolution 1-2, Path of Titans, The Isle, Saurian,
#                          Primal Carnage, Dino Crisis. See VIDEO_GAME below.
#
#     IMPORTANT, PLEASE READ: these gates were applied from the author's own
#     knowledge, NOT from measured data. That makes this list defensible but not
#     objective. `tools/rank_notability.py` replaces it with real English Wikipedia
#     pageview counts, which is the measurement this list is only a stand-in for.
#     Run that script and regenerate before treating the pool as evidence-based.
#
#     Every leaf NOT in this set is still fully guessable — the guess pool is
#     unchanged at 471, so experts keep their obscure taxa to triangulate with.
FAMOUS = {
    "Acanthostega", "Acrocanthosaurus", "Aenocyon", "Alamosaurus", "Albertosaurus", "Allosaurus",
    "Amargasaurus", "Ambulocetus", "Anchiornis", "Ankylosaurus", "Anomalocaris", "Anurognathus",
    "Anzu", "Apatosaurus", "Archaeopteryx", "Arctodus", "Argentinosaurus", "Arthropleura",
    "Barosaurus", "Baryonyx", "Basilosaurus", "Bison", "Borealopelta", "Brachiosaurus",
    "Brontosaurus", "Camarasaurus", "Camptosaurus", "Carcharodontosaurus", "Carnotaurus", "Castoroides",
    "Centrosaurus", "Ceratosaurus", "Chalicotherium", "Chasmosaurus", "Citipati", "Cladoselache",
    "Coelodonta", "Coelophysis", "Compsognathus", "Corythosaurus", "Cryolophosaurus", "Cryptoclidus",
    "Dacentrurus", "Daeodon", "Daspletosaurus", "Deinocheirus", "Deinonychus", "Deinosuchus",
    "Deinotherium", "Dilophosaurus", "Dimetrodon", "Dimorphodon", "Diplocaulus", "Diplodocus",
    "Diprotodon", "Doedicurus", "Dorudon", "Dracorex", "Dreadnoughtus", "Dromaeosaurus",
    "Dryosaurus", "Dunkleosteus", "Edaphosaurus", "Edmontonia", "Edmontosaurus", "Einiosaurus",
    "Elasmosaurus", "Elasmotherium", "Eryops", "Euoplocephalus", "Eusthenopteron", "Gallimimus",
    "Gastonia", "Gastornis", "Giganotosaurus", "Gigantopithecus", "Gigantoraptor", "Giraffatitan",
    "Glyptodon", "Gorgonops", "Gorgosaurus", "Gryposaurus", "Guanlong", "Hatzegopteryx",
    "Helicoprion", "Hesperornis", "Homotherium", "Huayangosaurus", "Hypacrosaurus", "Hypsilophodon",
    "Ichthyornis", "Ichthyosaurus", "Ichthyostega", "Iguanodon", "Inostrancevia", "Jaekelopterus",
    "Kaprosuchus", "Kentrosaurus", "Koolasuchus", "Kosmoceratops", "Kronosaurus", "Lambeosaurus",
    "Leaellynasaura", "Leedsichthys", "Liopleurodon", "Livyatan", "Lystrosaurus", "Macrauchenia",
    "Maiasaura", "Majungasaurus", "Mamenchisaurus", "Mammut", "Mammuthus", "Mapusaurus",
    "Massospondylus", "Mastodonsaurus", "Megacerops", "Megaloceros", "Megalosaurus", "Meganeura",
    "Megatherium", "Metriorhynchus", "Microraptor", "Miragaia", "Mononykus", "Mosasaurus",
    "Moschops", "Muttaburrasaurus", "Nasutoceratops", "Nigersaurus", "Nodosaurus", "Nothosaurus",
    "Ophthalmosaurus", "Ornithocheirus", "Ornithomimus", "Otodus", "Ouranosaurus", "Oviraptor",
    "Pachycephalosaurus", "Pachyrhinosaurus", "Palaeoloxodon", "Paraceratherium", "Parasaurolophus", "Patagotitan",
    "Pentaceratops", "Phorusrhacos", "Pinacosaurus", "Placerias", "Plateosaurus", "Plesiosaurus",
    "Pliosaurus", "Polacanthus", "Postosuchus", "Prionosuchus", "Procoptodon", "Protoceratops",
    "Psittacosaurus", "Pteranodon", "Pterodactylus", "Pterygotus", "Purussaurus", "Quetzalcoatlus",
    "Rhamphorhynchus", "Saichania", "Saltasaurus", "Sarcosuchus", "Saurolophus", "Sauropelta",
    "Sauroposeidon", "Scelidosaurus", "Scutosaurus", "Shantungosaurus", "Shonisaurus", "Shunosaurus",
    "Sinosauropteryx", "Smilodon", "Spinosaurus", "Stegoceras", "Stegosaurus", "Struthiomimus",
    "Stygimoloch", "Styracosaurus", "Suchomimus", "Supersaurus", "Tapejara", "Tarbosaurus",
    "Temnodontosaurus", "Tenontosaurus", "Therizinosaurus", "Thescelosaurus", "Thrinaxodon", "Thylacinus",
    "Thylacoleo", "Thylacosmilus", "Tiktaalik", "Titanichthys", "Titanoboa", "Torosaurus",
    "Torvosaurus", "Toxodon", "Triceratops", "Troodon", "Tuojiangosaurus", "Tupandactylus",
    "Tylosaurus", "Tyrannosaurus", "Uintatherium", "Utahraptor", "Velafrons", "Velociraptor",
    "Xiphactinus", "Yutyrannus", "Zuul",
}
# ---------------------------------------------------------------------------
# 3. BUILD THE TREE
# ---------------------------------------------------------------------------
nodes = {}          # name -> node dict
children_of = collections.defaultdict(list)
next_id = [1]

# GATE 4 — VIDEO GAME CANON.
#
# Only taxa that gates 1-3 missed are listed here, so this set shows exactly what
# adding video games bought us. Every name below was checked against the actual
# leaf list before being added — nothing here is aspirational.
#
# SCOPE BOUNDARY, and it matters: this counts major titles where a creature is a
# named species you play, tame, or build — ARK, Jurassic World Evolution 1-2, Path
# of Titans, The Isle, Saurian, Primal Carnage, Dino Crisis.
#
# Deep-roster mobile collection games are DELIBERATELY EXCLUDED. Jurassic World
# Alive alone carries 300+ creatures; admitting it would readmit most of the
# database and undo the entire point of having an answer pool. A gate that lets
# everything through is not a gate.
VIDEO_GAME = {
    # ARK: Survival Evolved / Ascended
    "Argentavis", "Pelagornis", "Raphus",
    # Jurassic World Evolution 1 & 2
    "Archaeornithomimus", "Chungkingosaurus", "Homalocephale", "Metriacanthosaurus",
    "Olorotitan", "Proceratosaurus", "Tsintaosaurus", "Wuerhosaurus",
    "Geosternbergia", "Thalassodromeus", "Tropeognathus",
    # Path of Titans
    "Achillobator", "Concavenator", "Diabloceratops", "Latenivenatrix",
    # The Isle
    "Austroraptor", "Beipiaosaurus",
    # Saurian
    "Dakotaraptor",
}

FAMOUS = FAMOUS | VIDEO_GAME

# ---------------------------------------------------------------------------
# SURVEY POOL — this is the list that actually ships.
#
# The four gates above and the pageview script below were both proxies for one
# question: would a player recognise this animal? In September 2026 that question
# was finally asked directly. 80 people rated their own dinosaur interest and then
# ticked every name they had never heard of.
#
# The result killed the gates. Among the respondents in the target audience
# — "had a dinosaur phase as a kid" plus "reads about them for fun as an adult" —
# the median person recognised only 102 of the 233 animals then in the pool. Not
# 90%. Under half. The gates had been one person's guesswork and it showed.
#
# TARGET AUDIENCE: someone who had a dinosaur phase and never fully lost it.
# Not the person who couldn't name five (median 17 recognised — they were never
# going to play a dinosaur game), and not the specialist (too small an audience,
# and the survey showed even enthusiasts found the old pool hard).
#
# INCLUSION RULE: recognised by at least 45% of that target segment, i.e. 10 or
# more of the 22. That produced 110. A manual review pass then dropped 4 and
# rescued 27 that sat just under the line, and 5 animals were promoted from
# guess-only on the strength of write-in requests (moa, trilobite, Eohippus,
# Utahraptor, plus Haast's eagle which had to be added to the tree outright).
#
# EXCLUDED ON PRINCIPLE, not on recognition:
#   Thylacinus — died out in 1936. A survey respondent asked, fairly, "since when
#                is a thylacine a dinosaur?"
#   Ursus      — cave bears are Ursus spelaeus, but Ursus is a LIVING genus;
#                brown, black and polar bears are all Ursus today.
#   Bison      — same problem and worse: bison never went extinct at all. It
#                scored 73% precisely because people know the living animal.
# All three stay fully guessable. They are just not answers.
#
# Isotelus ships with the common name "trilobite" rather than the genus. This is
# the Otodus/megalodon pattern already in the pool: nobody knows "Otodus", but
# it scores 73% because the game shows and accepts "megalodon". A player types
# "trilobite", wins, and learns the genus from the reveal.
SURVEY_POOL = {
    "Majungasaurus",   # added back to keep the dinosaur share up
 "Hieraaetus", # Haast's eagle, added to the tree for this build
 "Aenocyon", "Albertosaurus", "Allosaurus", "Ambulocetus", "Ankylosaurus",
 "Anomalocaris", "Apatosaurus", "Archaeopteryx", "Arctodus", "Argentavis",
 "Argentinosaurus", "Arthropleura", "Austroraptor", "Baryonyx", "Basilosaurus",
 "Brachiosaurus", "Brontosaurus", "Camarasaurus", "Carcharodontosaurus", "Carnotaurus",
 "Castoroides", "Ceratosaurus", "Chalicotherium", "Coelodonta", "Coelophysis",
 "Compsognathus", "Concavenator", "Corythosaurus", "Cryolophosaurus", "Daeodon",
 "Dakotaraptor", "Deinonychus", "Deinosuchus", "Deinotherium", "Dilophosaurus",
 "Dimetrodon", "Dimorphodon", "Dinornis", "Diplocaulus", "Diplodocus",
 "Diprotodon", "Doedicurus", "Dracorex", "Dreadnoughtus", "Dromaeosaurus",
 "Dunkleosteus", "Edmontosaurus", "Elasmosaurus", "Gallimimus",
 "Giganotosaurus", "Gigantopithecus", "Gigantoraptor", "Giraffatitan", "Glyptodon",
 "Gorgonops", "Helicoprion", "Hesperornis", "Hyracotherium", "Ichthyornis",
 "Ichthyosaurus", "Iguanodon", "Isotelus", "Jaekelopterus", "Kaprosuchus",
 "Kentrosaurus", "Kronosaurus", "Liopleurodon", "Lystrosaurus",
 "Maiasaura", "Mammut", "Mammuthus", "Megaloceros",
 "Megalosaurus", "Meganeura", "Megatherium", "Microraptor", "Mosasaurus",
 "Moschops", "Muttaburrasaurus", "Nigersaurus", "Ornithocheirus", "Otodus",
 "Ouranosaurus", "Oviraptor", "Pachycephalosaurus", "Pachyrhinosaurus", "Paraceratherium",
 "Parasaurolophus", "Patagotitan", "Pelagornis", "Pentaceratops", "Phorusrhacos",
 "Plateosaurus", "Plesiosaurus", "Pliosaurus", "Postosuchus", "Proceratosaurus",
 "Procoptodon", "Protoceratops", "Psittacosaurus", "Pteranodon", "Pterodactylus",
 "Pterygotus", "Quetzalcoatlus", "Raphus", "Rhamphorhynchus", "Sarcosuchus",
 "Saurolophus", "Smilodon", "Spinosaurus", "Stegosaurus", "Struthiomimus",
 "Styracosaurus", "Suchomimus", "Tarbosaurus", "Therizinosaurus", "Thylacoleo",
 "Tiktaalik", "Titanoboa", "Torosaurus", "Triceratops",
 "Troodon", "Tylosaurus", "Tyrannosaurus", "Utahraptor", "Velociraptor",
 "Yutyrannus",
}

# ---------------------------------------------------------------------------
# WHICH LIST ACTUALLY WINS.
#
# Two possible sources, checked in this order:
#
#   1. notability.csv, if it exists next to this script. That file is written by
#      tools/rank_notability.py from real English Wikipedia pageviews. If it is
#      present, the top POOL_SIZE rows become the answer pool and the four hand
#      gates above are IGNORED entirely.
#
#   2. Otherwise, the four gates (screen / museum / toy / video game). These are
#      one person's judgement about what a general audience recognises, and that
#      judgement is the reason the pool still contains taxa most players have
#      never met.
#
# So: nothing is measured until YOU run the script. There is no network call in
# this build. Do this once and the pool stops being an opinion:
#
#     python3 tools/rank_notability.py      # writes notability.csv
#     python3 build_db.py                   # picks it up automatically
#
# Lower POOL_SIZE for a tighter, more famous pool; raise it for more variety.
# Below ~120 the repeats get noticeable (see dailyAnimal.ts).
POOL_SIZE = 180

import csv as _csv

_csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "notability.csv")
if SURVEY_POOL:
    # Measured human recognition outranks both fallbacks. Empty this set to fall
    # back to notability.csv, or to the four gates if that file is absent too.
    ANSWER_SET = SURVEY_POOL
    ANSWER_SOURCE = f"SURVEY_POOL ({len(SURVEY_POOL)} animals, 45% recognition bar + manual review)"
elif os.path.exists(_csv_path):
    with open(_csv_path, encoding="utf-8") as _fh:
        _rows = [r for r in _csv.DictReader(_fh)]
    _rows.sort(key=lambda r: -int(r.get("pageviews_12mo") or 0))
    ANSWER_SET = {r["scientific"] for r in _rows[:POOL_SIZE]}
    ANSWER_SOURCE = f"notability.csv (top {POOL_SIZE} by measured pageviews)"
else:
    ANSWER_SET = FAMOUS
    ANSWER_SOURCE = "hand-applied gates (NOT measured — run tools/rank_notability.py)"

# ---------------------------------------------------------------------------
# ALTERNATE NAMES. What people actually type.
#
# Nobody types "Tyrannosaurus" into a game box. They type trex, t-rex, or rex,
# because that's what Jurassic Park and ARK taught them. Every name here maps to
# a genus already in the tree; loadTree.ts indexes them alongside the scientific
# and common names, so all of them resolve to the same guess.
#
# Sources: ARK: Survival Evolved's in-game shorthand (Rex, Trike, Bronto, Ptera,
# Quetz, Argy, Sarco, Kapro, Dilo, Compy, Para, Pachy, Carno, Spino, Giga, Yuty,
# Theri, Doed, Thyla, Paracer), Jurassic Park/World dialogue, and the common
# museum-label names for ice-age mammals.
#
# DELIBERATELY OMITTED: ambiguous stems. "deino" could be Deinonychus,
# Deinosuchus, Deinotherium or Deinocheirus; "ornitho" could be Ornithomimus or
# Ornithocheirus. Resolving those to a coin-flip is worse than not matching, so
# the build asserts that no alias is claimed by two genera.
ALIASES = {
    "Tyrannosaurus": ["t rex", "trex", "t. rex", "rex", "tyrannosaurus rex", "tyrant lizard"],
    "Velociraptor": ["raptor", "veloci"],
    "Dilophosaurus": ["dilo", "spitter"],
    "Compsognathus": ["compy", "compies", "compsognathid"],
    "Triceratops": ["trike"],
    "Brontosaurus": ["bronto"],
    "Apatosaurus": ["apato"],
    "Stegosaurus": ["stego"],
    "Ankylosaurus": ["anky", "ankylo"],
    "Parasaurolophus": ["parasaur", "para"],
    "Pachycephalosaurus": ["pachy", "head butter"],
    "Spinosaurus": ["spino"],
    "Carnotaurus": ["carno", "meat bull"],
    "Quetzalcoatlus": ["quetzal", "quetz"],
    "Pteranodon": ["ptera", "pterandon"],
    "Pterodactylus": ["pterodactyl", "pterodactylus"],
    "Therizinosaurus": ["theri", "therizino", "scythe lizard"],
    "Giganotosaurus": ["giga", "gigano"],
    "Argentavis": ["argy"],
    "Sarcosuchus": ["sarco", "super croc", "supercroc"],
    "Kaprosuchus": ["kapro", "boar croc"],
    "Mosasaurus": ["mosa"],
    "Otodus": ["megalodon", "meg", "megatooth shark"],
    "Doedicurus": ["doed"],
    "Smilodon": ["sabertooth", "saber tooth", "sabre tooth", "saber toothed cat",
                 "saber tooth tiger", "sabretooth"],
    "Mammuthus": ["mammoth", "woolly mammoth", "wooly mammoth"],
    "Coelodonta": ["woolly rhino", "wooly rhino", "woolly rhinoceros"],
    "Aenocyon": ["dire wolf", "direwolf"],
    "Arctodus": ["short faced bear", "dire bear", "giant short faced bear"],
    "Titanoboa": ["titano", "giant snake"],
    "Arthropleura": ["arthro", "giant millipede"],
    "Dunkleosteus": ["dunkle", "dunk"],
    "Gallimimus": ["galli"],
    "Pachyrhinosaurus": ["pachyrhino"],
    "Baryonyx": ["bary"],
    "Utahraptor": ["utah"],
    "Microraptor": ["micro"],
    "Oviraptor": ["ovi", "egg thief"],
    "Diplodocus": ["diplo"],
    "Brachiosaurus": ["brachio", "brach"],
    "Argentinosaurus": ["argentino"],
    "Allosaurus": ["allo"],
    "Carcharodontosaurus": ["carcha", "carcharo"],
    "Majungasaurus": ["majunga"],
    "Suchomimus": ["sucho"],
    "Thylacoleo": ["thyla", "marsupial lion"],
    "Procoptodon": ["procop", "giant kangaroo"],
    "Megaloceros": ["irish elk", "giant deer"],
    "Paraceratherium": ["paracer", "indricothere", "indricotherium"],
    "Basilosaurus": ["basilo"],
    "Dimetrodon": ["dimetro", "sail lizard"],
    "Lystrosaurus": ["lystro"],
    "Gigantopithecus": ["bigfoot", "giant ape"],
    "Castoroides": ["giant beaver"],
    "Diprotodon": ["giant wombat"],
    "Glyptodon": ["glypto"],
    "Elasmotherium": ["siberian unicorn"],
    "Elasmosaurus": ["elasmo"],
    "Plesiosaurus": ["plesiosaur"],
    "Kronosaurus": ["krono"],
    "Liopleurodon": ["lio"],
    "Ichthyosaurus": ["ichthyo", "ichthy"],
    "Raphus": ["dodo", "dodo bird"],
    "Phorusrhacos": ["terror bird"],
    "Gastornis": ["diatryma"],
    "Yutyrannus": ["yuty"],
    "Daeodon": ["hell pig", "entelodont"],
    "Livyatan": ["leviathan"],
    "Chalicotherium": ["chalico"],
    "Megatherium": ["giant ground sloth", "ground sloth"],
    "Pelagornis": ["pela"],
    "Amargasaurus": ["amarga"],
    "Kentrosaurus": ["kentro"],
    "Dimorphodon": ["dimorph"],
    "Tropeognathus": ["trope"],
    "Deinonychus": ["deinon"],
    "Megalosaurus": ["megalo"],
    "Iguanodon": ["iguano"],
    "Mamenchisaurus": ["mamenchi"],
    "Psittacosaurus": ["psittaco", "parrot lizard"],
    "Protoceratops": ["proto"],
    "Archaeopteryx": ["archaeo", "first bird"],
    "Deinocheirus": ["deinocheir"],
    "Struthiomimus": ["struthio"],
    "Ornithomimus": ["ostrich dinosaur"],
    "Thylacinus": ["tasmanian tiger", "tasmanian wolf", "thylacine"],
    "Mammut": ["mastodon", "american mastodon"],
    "Palaeoloxodon": ["straight tusked elephant"],
    "Meganeura": ["giant dragonfly"],
    "Jaekelopterus": ["sea scorpion", "giant sea scorpion", "eurypterid"],
    "Anomalocaris": ["anomalo"],
    "Helicoprion": ["buzzsaw shark"],
    "Xiphactinus": ["xiph", "bulldog fish"],
    "Deinosuchus": ["terror crocodile"],
    "Purussaurus": ["giant caiman"],
    "Stygimoloch": ["stygi"],
    "Torvosaurus": ["torvo"],
    "Acrocanthosaurus": ["acro"],
    "Cryolophosaurus": ["cryo", "elvisaurus"],
    "Concavenator": ["concave"],
    "Tarbosaurus": ["tarbo"],
    "Albertosaurus": ["alberto"],
    "Gorgosaurus": ["gorgo"],
    "Edmontosaurus": ["edmonto"],
    "Corythosaurus": ["corytho"],
    "Maiasaura": ["good mother lizard"],
    "Styracosaurus": ["styraco"],
    "Nigersaurus": ["niger"],
    "Giraffatitan": ["giraffa"],
    "Patagotitan": ["patago", "titanosaur"],
    "Dreadnoughtus": ["dreadnought"],
    "Uintatherium": ["uinta"],
    "Scutosaurus": ["scuto"],
    "Anzu": ["chicken from hell"],
    "Zuul": ["zuul crurivastator"],
}

# --- second pass: every ANSWER now has at least one alias -------------------
# Sources: ARK: Survival Evolved community shorthand (giga, paracer, doed, anky,
# sarco, kapro, mosa, quetz, argy, dilo, carno, spino, trike, bronto, pachy, ovi
# — all confirmed in circulation on the Steam forums), Jurassic Park/World
# dialogue, Walking with Dinosaurs, and the vernacular museum labels people
# actually read off a plaque.
#
# Two rules held throughout:
#   1. No alias may be claimed by two genera. The build asserts this and dies.
#   2. No ambiguous stems. "deino" alone could be Deinonychus, Deinosuchus,
#      Deinotherium or Deinocheirus, so it is never used bare.
ALIASES.update({
    # --- answers that previously had none ---
    # Both are eurypterids, so the generic terms go to the famous one
    # (Jaekelopterus, the largest) and Pterygotus keeps specific ones.
    "Pterygotus": ["ptery", "pterygotid"],
    "Isotelus": ["trilobite", "trilobites"],
    "Tiktaalik": ["fishapod", "tik"],
    "Pentaceratops": ["penta"],
    "Torosaurus": ["toro"],
    "Dracorex": ["dragon king", "hogwartsia"],
    "Saurolophus": ["sauro"],
    "Muttaburrasaurus": ["mutt", "muttaburra"],
    "Ouranosaurus": ["ourano"],
    "Plateosaurus": ["plateo"],
    "Camarasaurus": ["camara"],
    "Ceratosaurus": ["cerato"],
    "Coelophysis": ["coelo"],
    "Gigantoraptor": ["gigantorap"],
    "Dinornis": ["moa", "giant moa"],
    "Hieraaetus": ["haast eagle", "haasts eagle", "haast's eagle"],
    "Hesperornis": ["hespero", "diving bird"],
    "Ichthyornis": ["ichthyornis bird"],
    "Austroraptor": ["austro"],
    "Dakotaraptor": ["dakota"],
    "Dromaeosaurus": ["dromaeo"],
    "Troodon": ["troodont"],
    "Proceratosaurus": ["procerato"],
    "Ornithocheirus": ["ornithocheirid"],
    "Rhamphorhynchus": ["rhampho", "ramphorhynchus"],
    "Postosuchus": ["posto"],
    "Tylosaurus": ["tylo"],
    "Pliosaurus": ["pliosaur"],
    "Ambulocetus": ["walking whale"],
    "Thylacosmilus": ["thylacosmilid", "pouched sabertooth"],
    "Hyracotherium": ["eohippus", "dawn horse"],
    "Megacerops": ["brontothere", "thunder beast"],
    "Deinotherium": ["hoe tusker"],
    "Moschops": ["moschopid"],
    "Gorgonops": ["gorgonopsid", "gorgonopsian"],
    "Diplocaulus": ["boomerang head"],

    # --- guess-only animals people still reach for by nickname ---
    "Redlichia": ["redlichiid"],
    "Aepyornis": ["elephant bird"],
    "Titanis": ["titanis terror bird"],
    "Kelenken": ["kelenken terror bird"],
    "Ursus": ["cave bear"],
    "Bison": ["giant bison", "steppe bison"],
    "Thylacinus": ["tasmanian tiger", "tasmanian wolf", "thylacine"],
    "Quetzalcoatlus": ["quetzalcoatl"],
    "Deinocheirus": ["terrible hand"],
    "Therizinosaurus": ["scythe lizard", "edward scissorhands"],
    "Nothronychus": ["nothro"],
    "Erlikosaurus": ["erliko"],
    "Segnosaurus": ["segno"],
    "Alioramus": ["alio"],
    "Saurophaganax": ["saurophag"],
    "Sinraptor": ["sinrap"],
    "Yangchuanosaurus": ["yangchuano"],
    "Nanuqsaurus": ["polar tyrannosaur"],
    "Lythronax": ["king of gore"],
    "Teratophoneus": ["terato"],
    "Irritator": ["irrit"],
    "Rugops": ["rugo"],
    "Skorpiovenator": ["skorpio"],
    "Abelisaurus": ["abeli"],
    "Aucasaurus": ["auca"],
    "Rajasaurus": ["raja"],
    "Eotriceratops": ["eotrike"],
    "Anodontosaurus": ["anodonto"],
    "Ampelosaurus": ["ampelo"],
    "Opisthocoelicaudia": ["opistho"],
    "Europasaurus": ["europa"],
    "Isisaurus": ["isi"],
    "Rapetosaurus": ["rapeto"],
    "Bonitasaura": ["bonita"],
    "Antarctosaurus": ["antarcto"],
    "Paralititan": ["parali"],
    "Futalognkosaurus": ["futalog"],
    "Turiasaurus": ["turia"],
    "Cetiosaurus": ["cetio"],
    "Omeisaurus": ["omei"],
    "Dicraeosaurus": ["dicraeo"],
    "Brachytrachelopan": ["brachytrach"],
    "Melanorosaurus": ["melanoro"],
    "Riojasaurus": ["rioja"],
    "Lufengosaurus": ["lufengo"],
    "Anchisaurus": ["anchi"],
    "Coloradisaurus": ["colorad"],
    "Yunnanosaurus": ["yunnano"],
})


def new_node(scientific, common, rank, answer=False):
    nid = next_id[0]; next_id[0] += 1
    return {"id": nid, "scientific": scientific, "common": common, "rank": rank,
            "alt": ALIASES.get(scientific, []),
            "answer": answer, "children": []}

# create internal nodes (respecting parent order so parents exist first is not required; we link after)
for name, common, rank, parent in INTERNAL:
    nodes[name] = new_node(name, common, rank)
    nodes[name]["_parent"] = parent

# attach genera as leaves
for family, genera in GENERA.items():
    if family not in nodes:
        raise SystemExit(f"Unknown parent family: {family}")
    for scientific, common, popular in genera:
        is_answer = scientific in ANSWER_SET
        leaf = new_node(scientific, common, "genus", answer=is_answer)
        leaf["_parent"] = family
        # store leaf under a synthetic unique key
        nodes[f"__leaf_{leaf['id']}"] = leaf

# link children
root = None
for key, node in nodes.items():
    parent = node.pop("_parent")
    if parent is None:
        root = node
    else:
        nodes[parent]["children"].append(node)

# sort children for stable output (internal clades first by id, leaves alpha)
def sort_children(n):
    n["children"].sort(key=lambda c: (len(c["children"]) == 0, c["scientific"]))
    for c in n["children"]:
        sort_children(c)
sort_children(root)

# ---------------------------------------------------------------------------
# 4. VALIDATE + STATS
# ---------------------------------------------------------------------------
leaves, answers, all_nodes = [], [], []
def walk(n):
    all_nodes.append(n)
    if not n["children"]:
        leaves.append(n)
        if n["answer"]:
            answers.append(n)
    for c in n["children"]:
        walk(c)
walk(root)

# duplicate scientific-name check
names = [n["scientific"] for n in all_nodes]
dupes = [x for x, c in collections.Counter(names).items() if c > 1]
if dupes:
    raise SystemExit(f"Duplicate names: {dupes}")

out = {"version": 2,
       "note": "Prehistoric taxonomy for the Dinozoa game. 'answer'=true means the leaf can be the daily answer.",
       "generated_leaves": len(leaves),
       "generated_answers": len(answers)}

def clean(n):
    node = {"id": n["id"], "scientific": n["scientific"], "common": n["common"],
            "rank": n["rank"], "answer": n["answer"], "alt": n.get("alt", []),
            "children": [clean(c) for c in n["children"]]}
    return node
out["root"] = clean(root)

# Write next to this script, not to an absolute path from whatever machine
# last ran it. OUT is resolved from __file__ so `python3 build_db.py` works
# from any working directory.
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                   "public", "data", "dinosaur-database.json")
with open(OUT, "w") as f:
    json.dump(out, f, indent=1)

print(f"Total nodes : {len(all_nodes)}")
print(f"Leaf animals: {len(leaves)}")
print(f"Answer pool : {len(answers)}   (recognisable-only; repeats allowed)")
print(f"Pool source : {ANSWER_SOURCE}")

_seen = {}
for _sci, _alts in ALIASES.items():
    for _a in _alts:
        _norm = _a.lower().replace(".", " ").replace("-", " ")
        _norm = " ".join(_norm.split())
        if _norm in _seen and _seen[_norm] != _sci:
            raise SystemExit(f"ALIAS COLLISION: '{_a}' claimed by both {_seen[_norm]} and {_sci}")
        _seen[_norm] = _sci
print(f"Alt names   : {len(_seen)} across {len(ALIASES)} genera, no collisions")
print("OK" if len(answers) >= 100 else "!!! POOL TOO SMALL — repeats would be obvious !!!")
