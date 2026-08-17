const sharp = require("sharp");

const G = "#2D6A3E";      // brand green
const DG = "#1F4A2C";     // dark green
const LG = "#E9F2EA";     // light green wash
const MG = "#CBDECe";     // mid green wash
const INKD = "#1F2E24";   // near-black green (device bezel)
const AMBER = "#E8B84B";  // warm accent

// ---------------- hero illustration (text-free) ----------------
const hero = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 640">
  <defs>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="14"/>
    </filter>
  </defs>

  <!-- organic blob background -->
  <path fill="${LG}" d="M120,300
    C90,180 200,70 360,60 C520,50 700,110 710,260
    C720,410 640,540 460,580 C280,620 150,420 120,300 Z"/>
  <path fill="${MG}" opacity="0.5" d="M560,120
    C640,100 720,160 700,240 C680,320 580,330 530,270 C480,210 480,140 560,120 Z"/>

  <!-- outline shape motifs -->
  <circle cx="656" cy="84" r="24" fill="none" stroke="${G}" stroke-width="3.5" opacity="0.8"/>
  <rect x="52" y="70" width="36" height="36" rx="4" fill="none" stroke="${G}" stroke-width="3.5" opacity="0.7" transform="rotate(14 70 88)"/>
  <path d="M700,560 l20,-36 20,36 Z" fill="none" stroke="${G}" stroke-width="3.5" opacity="0.7"/>
  <path d="M78,520 l13,-7.5 13,7.5 0,15 -13,7.5 -13,-7.5 Z" fill="none" stroke="${G}" stroke-width="3.5" opacity="0.7"/>
  <circle cx="712" cy="380" r="6" fill="${AMBER}"/>
  <circle cx="40" cy="330" r="5" fill="${G}" opacity="0.6"/>

  <!-- soft shadow under device -->
  <ellipse cx="370" cy="428" rx="210" ry="26" fill="${INKD}" opacity="0.16" filter="url(#soft)"/>

  <!-- HMI touch panel, slightly tilted -->
  <g transform="translate(180,110) rotate(-4)">
    <rect x="0" y="0" width="380" height="272" rx="24" fill="${INKD}"/>
    <rect x="16" y="16" width="348" height="240" rx="12" fill="#FBFDFB"/>

    <!-- status bar dots -->
    <circle cx="40" cy="38" r="4.5" fill="${G}"/>
    <circle cx="58" cy="38" r="4.5" fill="${G}" opacity="0.55"/>
    <circle cx="76" cy="38" r="4.5" fill="${G}" opacity="0.3"/>
    <rect x="292" y="32" width="52" height="12" rx="6" fill="${LG}"/>

    <!-- circular gauge -->
    <g transform="translate(96,140)">
      <circle r="47" fill="none" stroke="#E5EEE6" stroke-width="13"/>
      <path d="M -33.2,33.2 A 47,47 0 1 1 33.2,33.2" fill="none" stroke="${G}"
            stroke-width="13" stroke-linecap="round" stroke-dasharray="172 400"/>
      <circle r="6" fill="${AMBER}"/>
      <rect x="-16" y="16" width="32" height="9" rx="4.5" fill="${LG}"/>
    </g>

    <!-- mini bar chart -->
    <g fill="${G}">
      <rect x="180" y="86" width="14" height="40" rx="5" opacity="0.35"/>
      <rect x="202" y="70" width="14" height="56" rx="5" opacity="0.6"/>
      <rect x="224" y="94" width="14" height="32" rx="5" opacity="0.45"/>
      <rect x="246" y="56" width="14" height="70" rx="5"/>
    </g>
    <!-- greeked text lines -->
    <rect x="290" y="70" width="54" height="9" rx="4.5" fill="${LG}"/>
    <rect x="290" y="88" width="40" height="9" rx="4.5" fill="${LG}"/>

    <!-- slider -->
    <line x1="180" y1="164" x2="344" y2="164" stroke="#E5EEE6" stroke-width="10" stroke-linecap="round"/>
    <line x1="180" y1="164" x2="282" y2="164" stroke="${G}" stroke-width="10" stroke-linecap="round"/>
    <circle cx="282" cy="164" r="13" fill="#FFFFFF" stroke="${G}" stroke-width="4"/>

    <!-- buttons + toggle -->
    <rect x="180" y="196" width="76" height="34" rx="17" fill="${G}"/>
    <rect x="219" y="209" width="30" height="8" rx="4" fill="#FFFFFF" opacity="0.85" transform="translate(-16 0)"/>
    <rect x="268" y="196" width="76" height="34" rx="17" fill="none" stroke="${G}" stroke-width="3.5"/>
    <rect x="291" y="209" width="30" height="8" rx="4" fill="${G}" opacity="0.5"/>
    <g transform="translate(40,196)">
      <rect x="0" y="4" width="52" height="26" rx="13" fill="${G}"/>
      <circle cx="39" cy="17" r="10" fill="#FFFFFF"/>
    </g>
  </g>

  <!-- logic graph: nodes wired to the panel -->
  <path d="M150,470 C 96,470 74,430 96,384" fill="none" stroke="${G}" stroke-width="3.5"/>
  <path d="M270,497 C 330,497 350,520 396,520" fill="none" stroke="${G}" stroke-width="3.5"/>
  <path d="M546,520 C 600,520 630,480 616,430" fill="none" stroke="${G}" stroke-width="3.5" stroke-dasharray="9 8"/>

  <!-- node 1: trigger -->
  <g transform="translate(150,442)">
    <rect width="120" height="56" rx="15" fill="#FFFFFF" stroke="${G}" stroke-width="3.5"/>
    <path d="M34,14 L26,32 h10 l-8,16 18,-22 h-10 l8,-12 Z" fill="${AMBER}"/>
    <rect x="58" y="22" width="44" height="10" rx="5" fill="${LG}"/>
    <circle cx="120" cy="28" r="6" fill="#FFFFFF" stroke="${G}" stroke-width="3.5"/>
    <circle cx="0" cy="28" r="6" fill="#FFFFFF" stroke="${G}" stroke-width="3.5"/>
  </g>

  <!-- node 2: condition -->
  <g transform="translate(396,492)">
    <rect width="150" height="56" rx="15" fill="#FFFFFF" stroke="${G}" stroke-width="3.5"/>
    <path d="M30,16 v24 M30,16 l-9,10 M30,16 l9,10" stroke="${G}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="rotate(180 30 28)"/>
    <rect x="56" y="14" width="60" height="10" rx="5" fill="${LG}"/>
    <rect x="56" y="32" width="42" height="10" rx="5" fill="${LG}"/>
    <circle cx="0" cy="28" r="6" fill="#FFFFFF" stroke="${G}" stroke-width="3.5"/>
    <circle cx="150" cy="28" r="6" fill="#FFFFFF" stroke="${G}" stroke-width="3.5"/>
  </g>
</svg>`;

// ---------------- pillar icons ----------------
const icon = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" fill="none" stroke="${G}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const icons = {
  design: icon(`
    <rect x="7" y="9" width="42" height="30" rx="5"/>
    <line x1="7" y1="19" x2="49" y2="19"/>
    <circle cx="13.5" cy="14" r="1.6" fill="${G}" stroke="none"/>
    <path d="M28 26 l16 7 -7 2.5 -2.5 7 Z" fill="${G}" stroke="none"/>
  `),
  logic: icon(`
    <circle cx="15" cy="16" r="8"/>
    <rect x="33" y="32" width="16" height="16" rx="4"/>
    <path d="M23 18 C 36 22, 26 38, 33 40"/>
    <circle cx="15" cy="16" r="2.6" fill="${G}" stroke="none"/>
  `),
  protocol: icon(`
    <path d="M10 19 H42 M42 19 l-7 -7 M42 19 l-7 7"/>
    <path d="M46 37 H14 M14 37 l7 -7 M14 37 l7 7"/>
  `),
  preview: icon(`
    <path d="M7 28 C 17 13, 39 13, 49 28 C 39 43, 17 43, 7 28 Z"/>
    <circle cx="28" cy="28" r="7.5" fill="${G}" stroke="none"/>
  `),
  deploy: icon(`
    <path d="M28 36 V9 M17 20 L28 9 39 20"/>
    <path d="M11 38 v9 h34 v-9"/>
  `),
};

// ---------------- footer shapes strip ----------------
const shapes = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 236 44" fill="none" stroke="${G}" stroke-width="3">
  <circle cx="24" cy="22" r="13"/>
  <rect x="64" y="9" width="26" height="26"/>
  <path d="M112,35 l14,-26 14,26 Z"/>
  <path d="M186,9 l13,7.5 0,15 -13,7.5 -13,-7.5 0,-15 Z"/>
</svg>`;

(async () => {
  await sharp(Buffer.from(hero), { density: 216 }).png().toFile("hero.png");
  for (const [name, svg] of Object.entries(icons)) {
    await sharp(Buffer.from(svg), { density: 300 }).png().toFile(`icon-${name}.png`);
  }
  await sharp(Buffer.from(shapes), { density: 300 }).png().toFile("shapes.png");
  console.log("art done");
})();
