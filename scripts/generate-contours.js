#!/usr/bin/env node
'use strict';

// Einzel-Prototyp: eine topografische Höhenlinien-Grafik.
// Nutzung: node scripts/generate-contours.js [seed] [width] [height]
// Output:  assets/contours-01.svg (Fragment, erwartet --line/--line-soft/
//          --ink-muted/--bg als CSS-Variablen im umgebenden Dokument)

const fs = require('fs');
const path = require('path');
const { generateContourSVG } = require('./lib/contour-gen');

const seed = parseInt(process.argv[2], 10) || 1;
const width = parseInt(process.argv[3], 10) || 1600;
const height = parseInt(process.argv[4], 10) || 900;
const OUT = path.join(__dirname, '..', 'assets', 'contours-01.svg');

const { svg, stats } = generateContourSVG({ seed, width, height });

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, svg, 'utf8');
console.log('geschrieben:', OUT, '| Seed:', seed, '| Index-Linien:', stats.indexPaths, '| Nebenlinien:', stats.minorPaths, '| Labels:', stats.labels);
