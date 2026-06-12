import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imagesRoot = path.join(root, 'box_emozioni');
const map = {
  amore: 'Amore', ansia: 'Ansia', colpa: 'Colpa', desiderio: 'Desiderio', entusiasmo: 'Entusiasmo',
  fiducia: 'Fiducia', frustrazione: 'Frustrazione', gioia: 'Gioia', gratitudine: 'Gratitudine',
  incertezza: 'Incertezza', malinconia: 'Malinconia', nostalgia: 'Nostalgia', paura: 'Paura',
  rabbia: 'Rabbia', serenita: 'Serenita', solitudine: 'Solitudine', sollievo: 'Sollievo',
  speranza: 'Speranza', stress: 'Stress', tristezza: 'Tristezza', vergogna: 'Vergogna',
  vulnerabilita: 'Vulnerabilita', noia: 'Neutra', sorpresa: 'Neutra', neutra: 'Neutra'
};

const manifest = {};
for (const [id, folder] of Object.entries(map)) {
  const dir = path.join(imagesRoot, folder);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => /\.webp$/i.test(f)).sort();
  manifest[id] = files.map(f => `box_emozioni/${folder}/${f}`);
}

fs.writeFileSync(path.join(root, 'emotion-images.json'), JSON.stringify(manifest, null, 2));
console.log(`Wrote emotion-images.json (${Object.keys(manifest).length} emotions)`);
