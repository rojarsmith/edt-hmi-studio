const pptxgen = require("pptxgenjs");
const path = require("path");

const A = (f) => path.join(__dirname, f);
const LOGO = path.join(__dirname, "..", "..", "..", "src", "assets", "edt-logo.png");

// vivid palette (no # in pptxgenjs)
const INK = "1F2937";
const SLATE = "64748B";
const LIGHTGREY = "94A3B8";
const CORAL = "F4633A";
const per = {
  design:  { title: "1E40AF", bg: "EAF1FE", icon: "icon-vivid-design.png" },
  logic:   { title: "5B21B6", bg: "F1EBFC", icon: "icon-vivid-logic.png" },
  protocol:{ title: "0F766E", bg: "E4F4F1", icon: "icon-vivid-protocol.png" },
  preview: { title: "B45309", bg: "FBF1DE", icon: "icon-vivid-preview.png" },
  deploy:  { title: "1F4A2C", bg: "E9F2EA", icon: "icon-vivid-deploy.png" },
};

const pres = new pptxgen();
pres.defineLayout({ name: "A4L", width: 11.69, height: 8.27 });
pres.layout = "A4L";

// ============================= SLIDE 1 : teaser =============================
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };

  // wordmark
  s.addImage({ path: LOGO, x: 0.55, y: 0.5, w: 0.55, h: 0.34 });
  s.addText("EDT HMI STUDIO", {
    x: 1.2, y: 0.5, w: 3.6, h: 0.34, margin: 0,
    fontFace: "Calibri", fontSize: 12, bold: true, color: SLATE, charSpacing: 4, valign: "middle",
  });

  // headline stack
  s.addText("Build the screen", {
    x: 0.5, y: 1.05, w: 5.9, h: 0.62, margin: 0,
    fontFace: "Calibri Light", fontSize: 30, color: INK, valign: "middle",
  });
  s.addText("that runs your machine.", {
    x: 0.5, y: 1.62, w: 5.9, h: 0.62, margin: 0,
    fontFace: "Calibri Light", fontSize: 30, color: INK, valign: "middle",
  });
  s.addText("No code.", {
    x: 0.5, y: 2.42, w: 5.9, h: 0.85, margin: 0,
    fontFace: "Calibri", fontSize: 46, bold: true, color: CORAL, valign: "middle",
  });
  s.addText("Not one line.", {
    x: 0.5, y: 3.22, w: 5.9, h: 0.85, margin: 0,
    fontFace: "Calibri Light", fontSize: 46, color: LIGHTGREY, valign: "middle",
  });
  s.addText("The next-generation no-code HMI studio \u2014 point, click, and your touchscreen comes to life.", {
    x: 0.5, y: 4.2, w: 5.5, h: 0.75, margin: 0,
    fontFace: "Calibri", fontSize: 13, color: SLATE, valign: "top",
  });

  // date chip + OS pills
  s.addText("COMING NOVEMBER 2026", {
    x: 0.5, y: 4.95, w: 2.95, h: 0.5,
    shape: pres.ShapeType.roundRect, rectRadius: 0.08, fill: { color: CORAL },
    fontFace: "Calibri", fontSize: 12.5, bold: true, color: "FFFFFF", charSpacing: 2,
    align: "center", valign: "middle",
  });
  const oses = ["WIN", "OSX", "LINUX"];
  oses.forEach((os, i) => {
    s.addText(os, {
      x: 3.65 + i * 0.95, y: 4.98, w: 0.85, h: 0.44,
      shape: pres.ShapeType.roundRect, rectRadius: 0.22,
      fill: { color: "FFFFFF" }, line: { color: SLATE, width: 1 },
      fontFace: "Calibri", fontSize: 10.5, bold: true, color: SLATE, charSpacing: 1,
      align: "center", valign: "middle",
    });
  });

  // hero illustration
  s.addImage({ path: A("hero-vivid.png"), x: 6.45, y: 0.75, w: 4.7, h: 3.96 });

  // pillar cards
  const cards = [
    ["design", "GUI Design", "Drag buttons, dials and lights onto your screen. As easy as arranging photos."],
    ["logic", "Logic Graph", "Draw lines between boxes to say what happens. \u201CWhen this is pressed, do that.\u201D"],
    ["protocol", "Protocol", "It talks to your machine all by itself. Modbus, serial and more \u2014 built in."],
    ["preview", "Preview", "Watch it work on your computer first. Try every button before it\u2019s real."],
    ["deploy", "Deploy", "One click sends it to your device. That\u2019s it. You\u2019re done."],
  ];
  const cw = 2.04, gap = 0.16, cy = 5.75, ch = 1.85;
  cards.forEach(([key, title, desc], i) => {
    const cx = 0.55 + i * (cw + gap);
    const p = per[key];
    s.addShape(pres.ShapeType.roundRect, {
      x: cx, y: cy, w: cw, h: ch, rectRadius: 0.09, fill: { color: p.bg },
    });
    s.addImage({ path: A(p.icon), x: cx + 0.16, y: cy + 0.16, w: 0.34, h: 0.34 });
    s.addText(title, {
      x: cx + 0.16, y: cy + 0.56, w: cw - 0.3, h: 0.3, margin: 0,
      fontFace: "Calibri", fontSize: 13, bold: true, color: p.title, valign: "middle",
    });
    s.addText(desc, {
      x: cx + 0.16, y: cy + 0.88, w: cw - 0.3, h: ch - 1.0, margin: 0,
      fontFace: "Calibri", fontSize: 9.5, color: INK, valign: "top",
    });
  });

  // footer
  s.addText("EDT HMI Studio \u00B7 v1.0  \u2014  from idea to a running touchscreen, without writing a single line of code.", {
    x: 0.55, y: 7.82, w: 8.4, h: 0.3, margin: 0,
    fontFace: "Calibri", fontSize: 9.5, color: SLATE, valign: "middle",
  });
  s.addImage({ path: A("shapes-vivid.png"), x: 10.05, y: 7.86, w: 1.1, h: 0.2 });
}

// ====================== SLIDE 2 : coming soon + shots ======================
{
  const s = pres.addSlide();
  s.background = { color: "FFFFFF" };

  // wordmark
  s.addImage({ path: LOGO, x: 0.55, y: 0.42, w: 0.48, h: 0.3 });
  s.addText("EDT HMI STUDIO", {
    x: 1.12, y: 0.42, w: 3.6, h: 0.3, margin: 0,
    fontFace: "Calibri", fontSize: 11, bold: true, color: SLATE, charSpacing: 4, valign: "middle",
  });

  // splash screenshot (the opening image) with a thin frame
  const spX = 0.55, spY = 0.95, spW = 5.9, spH = 3.69;
  s.addImage({ path: A("shot-splash.png"), x: spX, y: spY, w: spW, h: spH });
  s.addShape(pres.ShapeType.rect, {
    x: spX, y: spY, w: spW, h: spH,
    fill: { color: "FFFFFF", transparency: 100 }, line: { color: "D8DEE9", width: 1 },
  });

  // tilted COMING SOON badge overlapping the splash corner
  s.addText("COMING SOON", {
    x: 4.85, y: 0.72, w: 2.5, h: 0.55,
    shape: pres.ShapeType.roundRect, rectRadius: 0.27, fill: { color: CORAL },
    fontFace: "Calibri", fontSize: 15, bold: true, color: "FFFFFF", charSpacing: 2,
    align: "center", valign: "middle", rotate: -6,
    shadow: { type: "outer", angle: 90, blur: 6, offset: 2, color: "9A3412", opacity: 0.35 },
  });

  // right column copy
  s.addText("November 2026", {
    x: 6.95, y: 1.55, w: 4.2, h: 0.6, margin: 0,
    fontFace: "Calibri Light", fontSize: 30, color: INK, valign: "middle",
  });
  s.addText("One studio for your whole HMI \u2014 design it, wire it, connect it, try it, ship it. No code anywhere.", {
    x: 6.95, y: 2.25, w: 4.2, h: 0.95, margin: 0,
    fontFace: "Calibri", fontSize: 13, color: SLATE, valign: "top",
  });
  const oses2 = ["WIN", "OSX", "LINUX"];
  oses2.forEach((os, i) => {
    s.addText(os, {
      x: 6.95 + i * 0.95, y: 3.3, w: 0.85, h: 0.44,
      shape: pres.ShapeType.roundRect, rectRadius: 0.22,
      fill: { color: "FFFFFF" }, line: { color: SLATE, width: 1 },
      fontFace: "Calibri", fontSize: 10.5, bold: true, color: SLATE, charSpacing: 1,
      align: "center", valign: "middle",
    });
  });
  s.addText("Free to try on all three platforms.", {
    x: 6.95, y: 3.92, w: 4.2, h: 0.35, margin: 0,
    fontFace: "Calibri", fontSize: 11, italic: true, color: LIGHTGREY, valign: "middle",
  });

  // four screenshots row with captions
  const shots = [
    ["shot-design.png", "GUI Design"],
    ["shot-logic.png", "Logic Graph"],
    ["shot-protocol.png", "Protocol"],
    ["shot-preview.png", "Live Preview"],
  ];
  const shW = 2.6, shH = 1.63, shGap = 0.19, shY = 5.15;
  shots.forEach(([file, cap], i) => {
    const x = 0.55 + i * (shW + shGap);
    s.addImage({ path: A(file), x, y: shY, w: shW, h: shH });
    s.addShape(pres.ShapeType.rect, {
      x, y: shY, w: shW, h: shH,
      fill: { color: "FFFFFF", transparency: 100 }, line: { color: "D8DEE9", width: 1 },
    });
    s.addText(cap, {
      x, y: shY + shH + 0.06, w: shW, h: 0.3, margin: 0,
      fontFace: "Calibri", fontSize: 10.5, bold: true, color: INK, align: "center", valign: "top",
    });
  });

  // development-build disclaimer
  s.addText("Screenshots show a development build \u2014 features and appearance may change before release.", {
    x: 0.55, y: 7.85, w: 10.6, h: 0.28, margin: 0,
    fontFace: "Calibri", fontSize: 8.5, italic: true, color: LIGHTGREY, align: "center", valign: "middle",
  });
}

pres.writeFile({ fileName: path.join(__dirname, "..", "edt-hmi-studio-teaser.pptx") }).then((f) => console.log("written", f));
