const puppeteer = require("puppeteer-core");

const BASE = "http://localhost:5173";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function clickByText(page, text, { optional = false } = {}) {
  const ok = await page.evaluate((t) => {
    const els = [...document.querySelectorAll("button")];
    const el = els.find(
      (b) => (b.textContent || "").includes(t) || (b.title || "").includes(t) || (b.getAttribute("aria-label") || "").includes(t)
    );
    if (el) { el.click(); return true; }
    return false;
  }, text);
  if (!ok && !optional) throw new Error("button not found: " + text);
  return ok;
}

async function dismissToast(page) {
  await page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) {
      const t = (b.textContent || "").trim();
      if (t === "\u00D7" || t === "\u2715" || t === "\u2716") b.click();
    }
  });
  await sleep(300);
}

// map nodes by their title text
const getNodesByLabel = (page) =>
  page.evaluate(() => {
    const out = {};
    for (const n of document.querySelectorAll(".react-flow__node")) {
      const label = n.textContent || "";
      const grab = (sel) => [...n.querySelectorAll(sel)].map((h) => {
        const hr = h.getBoundingClientRect();
        return { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2 };
      });
      const rec = { srcs: grab(".react-flow__handle.source"), tgts: grab(".react-flow__handle.target") };
      if (label.includes("Event Trigger")) out.trigger = rec;
      else if (label.includes("If/Else")) out.ifelse = rec;
      else if (label.includes("Set Property")) out.setprop = rec;
      else if (label.includes("Write Tag")) out.writetag = rec;
    }
    return out;
  });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-first-run", "--disable-extensions", "--hide-scrollbars"],
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.5 },
  });
  const page = await browser.newPage();

  await page.goto(BASE, { waitUntil: "networkidle2" });
  await sleep(800);
  await clickByText(page, "Demos");
  await sleep(600);
  await clickByText(page, "Use Demo");
  await sleep(600);
  await clickByText(page, "OK");
  await sleep(2500);
  await dismissToast(page);

  await clickByText(page, "Wire up no-code logic graphs");
  await sleep(1200);
  if (await clickByText(page, "Create Logic Graph", { optional: true })) {
    await sleep(700);
    await clickByText(page, "OK", { optional: true });
    await sleep(1200);
  }
  await dismissToast(page);

  // zoom out so the spread fits: wheel-scroll over the canvas
  await page.mouse.move(660, 450);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel({ deltaY: 240 }); await sleep(200); }
  await sleep(500);

  const dropNode = (def, x, y) =>
    page.evaluate(({ def, x, y }) => {
      const pane = document.querySelector(".react-flow__pane") || document.querySelector(".react-flow");
      const dt = new DataTransfer();
      dt.setData("application/json", JSON.stringify(def));
      pane.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
    }, { def, x, y });

  await dropNode({ type: "trigger", subType: "event_trigger" }, 300, 320);
  await sleep(400);
  await dropNode({ type: "flow", subType: "if_else" }, 620, 460);
  await sleep(400);
  await dropNode({ type: "action", subType: "set_property" }, 940, 230);
  await sleep(400);
  await dropNode({ type: "data", subType: "tag_write" }, 940, 640);
  await sleep(800);

  async function connect(fromKey, fromIdx, toKey, toIdx) {
    const nodes = await getNodesByLabel(page);
    const from = nodes[fromKey] && nodes[fromKey].srcs[fromIdx];
    const to = nodes[toKey] && nodes[toKey].tgts[toIdx];
    if (!from || !to) { console.log(`skip ${fromKey}->${toKey}`); return; }
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await sleep(25);
    }
    await page.mouse.up();
    await sleep(500);
  }

  await connect("trigger", 0, "ifelse", 0);
  await connect("ifelse", 0, "setprop", 0);
  await connect("ifelse", 1, "writetag", 0);

  const fit = await page.evaluate(() => {
    const b =
      document.querySelector("button.react-flow__controls-fitview") ||
      [...document.querySelectorAll("button")].find((x) => ((x.getAttribute("title") || "") + (x.getAttribute("aria-label") || "")).toLowerCase().includes("fit"));
    if (b) { b.click(); return true; }
    return false;
  });
  console.log("fitview:", fit);
  await sleep(800);
  await dismissToast(page);
  await page.screenshot({ path: "shot-logic.png" });
  console.log("logic ok");

  await browser.close();
})().catch((e) => { console.error(e.message); process.exit(1); });
