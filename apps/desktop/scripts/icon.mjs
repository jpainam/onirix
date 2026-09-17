/**
 * Draws the app icon from the product mark.
 *
 * One 1024px PNG is all electron-builder needs; it derives the .icns and .ico
 * from it. The plate follows the macOS icon grid (824px body on a 1024px
 * canvas) so the icon sits at the same optical size as its neighbours in the
 * Dock. Flat ink plate, white mark: the same two colours as the primary button.
 */
import sharp from "sharp";

const MARK =
  "M8.2 1.6h7.6L22.4 8.2v7.6L15.8 22.4H8.2L1.6 15.8V8.2L8.2 1.6Zm3.8 4.1L9.1 12l2.9 6.3 2.9-6.3-2.9-6.3Z";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="100" y="100" width="824" height="824" rx="186" fill="#1c1c1c" />
  <g transform="translate(272 272) scale(20)">
    <path d="${MARK}" fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd" />
  </g>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("resources/icon.png");
console.log("resources/icon.png");
