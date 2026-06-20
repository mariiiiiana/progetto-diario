# everything i can't say out loud
![demo](landing.gif)
### Architecture of Memory & Emotion (Jan 2024 – May 2026)

Questo progetto è un archivio digitale interattivo e immersivo sviluppato per esplorare, navigare e visualizzare una collezione di oltre 800 annotazioni personali. Trasforma un flusso disordinato di coscienza e frammenti di ricordi in un panorama tridimensionale navigabile, analizzando il testo in locale e mappando i metadati delle immagini in base alle emozioni.

---

## Funzionalità Principali (Features)

* **Main Stage Isometrico:** Una mappa interattiva su Canvas HTML5 che renderizza 26 stanze (box aperti) in assonometria isometrica, ognuna legata a una specifica emozione.
* **Effetto Parallasse Fluido:** I blocchi e i ricordi si muovono nello spazio bidimensionale seguendo gli spostamenti del mouse con calcoli di profondità (`parallaxDepth`) differenziati.
* **Pareti Dinamiche:** Le pareti delle stanze isometriche mostrano immagini frammentate e pixelate che scorrono e si sostituiscono continuamente.
* **Interazione con i Temi (Scrubbing):** All'interno delle stanze o nella pagina *About*, i concetti chiave e le parole frequenti sono nascosti o codificati, rivelandosi dinamicamente solo al passaggio del mouse.
* **Pipeline 100% Locale:** Elaborazione dei dati cifrata e privata: nessun dato viene inviato ad API esterne o intelligenze artificiali commerciali.

---

## Stack Tecnologico (Tech Stack)

* **Front-End:** HTML5 semantico, CSS3 Custom (con layout flessibili e tipografia fluida gestita tramite variabili e `clamp()`).
* **Grafica & Animazioni:** JavaScript Vanilla con rendering nativo su elemento `<canvas>` (nessuna libreria pesante come Three.js o Pixi.js per garantire massima leggerezza).
* **Data Pipeline (Backend Locale):** Script in Python personalizzati per il parsing dei file sorgente HTML in JSON e per l'elaborazione/pixelizzazione automatica delle immagini in formato `.webp`.

---

## Struttura delle Cartelle (Project Structure)

```text
├── index.html                  # Pagina principale con la landing e la mappa isometrica
├── about.html                  # Pagina di approfondimento sul progetto (centrata e leggibile)
├── style.css                   # Foglio di stile master (contiene palette colori, font e reset)
├── script.js                   # Motore logico del Canvas, loop di rendering e calcolo parallasse
├── landing-photos.js           # Manifest degli asset e array per il caricamento automatico delle foto
└── theme-semantic-labels.js    # Database JSON locale contenente le parole chiave e i testi criptati
```

## Installazione e Avvio (Getting Started)
Poiché il progetto utilizza JavaScript moderno con richieste asincrone di moduli e asset locali, è necessario avviare un server locale.

## Note di Design e Tipografia
Il design unisce l'estetica di un archivio cartaceo analogico ad elementi digitali minimalisti.
Colori: Sfondo carta caldo (var(--paper) / #fbf7f6) contrastato da un inchiostro scuro profondo (var(--ink) / #281726) e tonalità attenuate per i dettagli secondari (var(--muted)).
Font: Georgia e Times New Roman per i titoli organici e serif; Helvetica e Arial per le istruzioni, i dati numerici e i blocchi di testo descrittivi in esecuzione.