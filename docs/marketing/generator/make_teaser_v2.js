const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ShadingType, PageOrientation, VerticalAlign, LineRuleType,
} = require("docx");

const logoBuf = fs.readFileSync(path.join(__dirname, "..", "..", "..", "src", "assets", "edt-logo.png"));
const heroBuf = fs.readFileSync(path.join(__dirname, "hero.png"));
const shapesBuf = fs.readFileSync(path.join(__dirname, "shapes.png"));
const iconBuf = (n) => fs.readFileSync(path.join(__dirname, `icon-${n}.png`));

const GREEN = "2D6A3E";
const DARKGREEN = "1F4A2C";
const INK = "2B2B2B";
const GREY = "6E7A70";
const LIGHT = "F2F6F2";

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };

// content width: 16838 - 2*600 = 15638 -> use 15480
const HERO_L = 8480, HERO_R = 7000;
const CARD = 2952, GAP = 180; // 5*2952 + 4*180 = 15480

function spacerCell() {
  return new TableCell({
    width: { size: GAP, type: WidthType.DXA },
    borders: noBorders,
    children: [new Paragraph({ children: [] })],
  });
}

function card(iconName, title, desc) {
  return new TableCell({
    width: { size: CARD, type: WidthType.DXA },
    verticalAlign: VerticalAlign.TOP,
    margins: { top: 220, bottom: 240, left: 240, right: 220 },
    shading: { type: ShadingType.CLEAR, fill: LIGHT },
    borders: noBorders,
    children: [
      new Paragraph({
        spacing: { after: 120 },
        children: [new ImageRun({ type: "png", data: iconBuf(iconName), transformation: { width: 30, height: 30 } })],
      }),
      new Paragraph({
        spacing: { after: 90 },
        children: [new TextRun({ text: title, font: "Segoe UI Semibold", size: 26, bold: true, color: DARKGREEN })],
      }),
      new Paragraph({
        children: [new TextRun({ text: desc, font: "Segoe UI", size: 19, color: INK })],
      }),
    ],
  });
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Segoe UI", color: INK } } } },
  sections: [
    {
      properties: {
        page: {
          size: { orientation: PageOrientation.LANDSCAPE },
          margin: { top: 480, bottom: 380, left: 679, right: 679 },
        },
      },
      children: [
        // ================= hero: text left, illustration right =================
        new Table({
          alignment: AlignmentType.CENTER,
          width: { size: HERO_L + HERO_R, type: WidthType.DXA },
          columnWidths: [HERO_L, HERO_R],
          borders: noBorders,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: HERO_L, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 0, bottom: 0, left: 0, right: 400 },
                  borders: noBorders,
                  children: [
                    // wordmark
                    new Paragraph({
                      spacing: { after: 300 },
                      children: [
                        new ImageRun({ type: "png", data: logoBuf, transformation: { width: 58, height: 36 } }),
                        new TextRun({ text: "   EDT HMI STUDIO", font: "Segoe UI Semibold", size: 21, bold: true, color: GREY, characterSpacing: 50 }),
                      ],
                    }),
                    // headline stack
                    new Paragraph({
                      spacing: { after: 40 },
                      children: [new TextRun({ text: "Build the screen", font: "Segoe UI Light", size: 72, color: INK })],
                    }),
                    new Paragraph({
                      spacing: { after: 160 },
                      children: [new TextRun({ text: "that runs your machine.", font: "Segoe UI Light", size: 72, color: INK })],
                    }),
                    new Paragraph({
                      spacing: { after: 60 },
                      children: [new TextRun({ text: "No code.", font: "Segoe UI", size: 108, bold: true, color: GREEN })],
                    }),
                    new Paragraph({
                      spacing: { after: 180 },
                      children: [new TextRun({ text: "Not one line.", font: "Segoe UI Light", size: 108, color: GREY })],
                    }),
                    // sub
                    new Paragraph({
                      spacing: { after: 220 },
                      children: [
                        new TextRun({
                          text: "The next-generation no-code HMI studio \u2014 point, click, and your touchscreen comes to life.",
                          font: "Segoe UI", size: 26, color: GREY,
                        }),
                      ],
                    }),
                    // date chip (nested table)
                    new Table({
                      width: { size: 4700, type: WidthType.DXA },
                      columnWidths: [4700],
                      borders: noBorders,
                      rows: [
                        new TableRow({
                          children: [
                            new TableCell({
                              width: { size: 4700, type: WidthType.DXA },
                              shading: { type: ShadingType.CLEAR, fill: GREEN },
                              margins: { top: 140, bottom: 140, left: 240, right: 240 },
                              borders: noBorders,
                              children: [
                                new Paragraph({
                                  alignment: AlignmentType.CENTER,
                                  children: [
                                    new TextRun({ text: "COMING NOVEMBER 2026", font: "Segoe UI Semibold", size: 24, bold: true, color: "FFFFFF", characterSpacing: 50 }),
                                  ],
                                }),
                              ],
                            }),
                          ],
                        }),
                      ],
                    }),
                    new Paragraph({ children: [] }), // keep-after for nested table
                  ],
                }),
                new TableCell({
                  width: { size: HERO_R, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 0, bottom: 0, left: 0, right: 0 },
                  borders: noBorders,
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new ImageRun({ type: "png", data: heroBuf, transformation: { width: 452, height: 381 } })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        // ================= kicker =================
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 160 },
          children: [
            new TextRun({ text: "FIVE STEPS FROM IDEA TO MACHINE  \u00B7  ZERO CODE", font: "Segoe UI Semibold", size: 20, bold: true, color: GREY, characterSpacing: 60 }),
          ],
        }),

        // ================= pillar cards =================
        new Table({
          alignment: AlignmentType.CENTER,
          width: { size: 15480, type: WidthType.DXA },
          columnWidths: [CARD, GAP, CARD, GAP, CARD, GAP, CARD, GAP, CARD],
          borders: noBorders,
          rows: [
            new TableRow({
              children: [
                card("design", "GUI Design", "Drag buttons, dials and lights onto your screen. As easy as arranging photos."),
                spacerCell(),
                card("logic", "Logic Graph", "Draw lines between boxes to say what happens. \u201CWhen this is pressed, do that.\u201D"),
                spacerCell(),
                card("protocol", "Protocol", "It talks to your machine all by itself. Modbus, serial and more \u2014 built in."),
                spacerCell(),
                card("preview", "Preview", "Watch it work on your computer first. Try every button before it\u2019s real."),
                spacerCell(),
                card("deploy", "Deploy", "One click sends it to your device. That\u2019s it. You\u2019re done."),
              ],
            }),
          ],
        }),

        // ================= footer =================
        new Table({
          alignment: AlignmentType.CENTER,
          width: { size: 15480, type: WidthType.DXA },
          columnWidths: [10480, 5000],
          borders: noBorders,
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 10480, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 140, bottom: 0, left: 0, right: 0 },
                  borders: noBorders,
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: "EDT HMI Studio \u00B7 v1.0  \u2014  from idea to a running touchscreen, without writing a single line of code.", font: "Segoe UI", size: 19, color: GREY }),
                      ],
                    }),
                  ],
                }),
                new TableCell({
                  width: { size: 5000, type: WidthType.DXA },
                  verticalAlign: VerticalAlign.CENTER,
                  margins: { top: 140, bottom: 0, left: 0, right: 0 },
                  borders: noBorders,
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [new ImageRun({ type: "png", data: shapesBuf, transformation: { width: 102, height: 19 } })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),

        // tiny terminator so the implicit paragraph after the last table stays on page 1
        new Paragraph({
          spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
          children: [new TextRun({ text: "", size: 2 })],
        }),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, "..", "edt-hmi-studio-teaser-a4.docx");
  fs.writeFileSync(out, buf);
  console.log("written", out, buf.length, "bytes");
});
