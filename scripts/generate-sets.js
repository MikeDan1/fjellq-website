#!/usr/bin/env node
'use strict';

// Erzeugt SET_COUNT Sets aus Höhenlinien-Grafiken, je in drei Formaten
// (Desktop/Tablet/Mobile), als assets/contours/set-<NN>-<format>.svg.
//
// Nutzung: node scripts/generate-sets.js [anzahl]

const fs = require('fs');
const path = require('path');
const { generateContourSVG } = require('./lib/contour-gen');

const SET_COUNT = parseInt(process.argv[2], 10) || 20;
const OUT_DIR = path.join(__dirname, '..', 'assets', 'contours');

const FORMATS = [
  { name: 'desktop', width: 1600, height: 900 },
  { name: 'tablet', width: 1200, height: 1500 },
  { name: 'mobile', width: 900, height: 1600 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

let totalBytes = 0;
let totalFiles = 0;

for (let i = 1; i <= SET_COUNT; i++) {
  const id = String(i).padStart(2, '0');
  FORMATS.forEach((format) => {
    const { svg } = generateContourSVG({ seed: i, width: format.width, height: format.height });
    const outPath = path.join(OUT_DIR, `set-${id}-${format.name}.svg`);
    fs.writeFileSync(outPath, svg, 'utf8');
    totalBytes += Buffer.byteLength(svg, 'utf8');
    totalFiles++;
  });
}

console.log(`fertig: ${totalFiles} Dateien in ${OUT_DIR}`);
console.log(`gesamt: ${(totalBytes / 1024).toFixed(0)} KB, im Schnitt ${(totalBytes / totalFiles / 1024).toFixed(1)} KB/Datei`);
