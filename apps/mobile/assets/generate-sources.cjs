// Rasterizes the web app's SVG logo into the source PNGs @capacitor/assets expects.
// `npm run assets` runs this, then regenerates every native icon and splash size.
const path = require("node:path");
const sharp = require("sharp");

const glyph = `
  <path d="M116 352V160h90c74 0 116 34 116 94s-42 98-116 98h-90Zm62-54h30c31 0 51-15 51-44s-20-41-51-41h-30v85Z" fill="#f5f7f2"/>
  <path d="M302 352c0-52 42-94 94-94v62c-18 0-32 14-32 32h-62Z" fill="#79f2b0"/>
  <circle cx="396" cy="164" r="36" fill="#79f2b0"/>`;
const bg = "#07100d";
const out = (name) => path.join(__dirname, name);

// Full-bleed square icon (iOS applies its own mask).
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${bg}"/>${glyph}</svg>`;
// Android adaptive foreground: glyph scaled into the 66% safe zone on transparent.
const foreground = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(96 96) scale(0.625)">${glyph}</g></svg>`;
const background = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${bg}"/></svg>`;
// Splash: small centred logo on the brand background.
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732"><rect width="2732" height="2732" fill="${bg}"/><g transform="translate(1110 1110) scale(1)">${glyph}</g></svg>`;

const render = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(out(file));

Promise.all([
  render(icon, 1024, "icon-only.png"),
  render(foreground, 1024, "icon-foreground.png"),
  render(background, 1024, "icon-background.png"),
  render(splash, 2732, "splash.png"),
  render(splash, 2732, "splash-dark.png"),
]).then(() => console.log("Source assets written to", __dirname));
