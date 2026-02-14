import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '..', 'public', 'icons', 'icon.svg');
const outputDir = join(__dirname, '..', 'public', 'icons');

async function generateIcons() {
  try {
    // Read the SVG file
    const svgBuffer = readFileSync(svgPath);

    // Generate 192x192 PNG
    await sharp(svgBuffer)
      .resize(192, 192)
      .png()
      .toFile(join(outputDir, 'icon-192x192.png'));
    console.log('Generated icon-192x192.png');

    // Generate 512x512 PNG
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(join(outputDir, 'icon-512x512.png'));
    console.log('Generated icon-512x512.png');

    console.log('Icon generation complete!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons().catch(console.error);
