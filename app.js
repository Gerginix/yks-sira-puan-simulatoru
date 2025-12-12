function readNumber(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = (el.value ?? "").toString().trim();
  const normalized = raw.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
function round3(x) { return Math.round(x * 1000) / 1000; }

// Excel: Katsayılar_2025 tablosu
const COEF = {
  EA:  { intercept:128.028, obp:0.60285, TR:1.16424, SB:1.33609, TM:1.44715, FB:1.02141,
         AYT_MAT:2.88393, FIZ:0, KIM:0, BIO:0, EDEB:2.97424, TAR1:2.39932, COG1:2.85842,
         TAR2:0, COG2:0, FELS:0, DKAB:0, YDIL:0 },
  SAY: { intercept:131.024, obp:0.62029, TR:1.18697, SB:1.30313, TM:1.40198, FB:1.05742,
         AYT_MAT:2.87473, FIZ:2.4126, KIM:2.57134, BIO:2.60486, EDEB:0, TAR1:0, COG1:0,
         TAR2:0, COG2:0, FELS:0, DKAB:0, YDIL:0 },
  SOZ: { intercept:127.213, obp:0.60938, TR:1.09611, SB:1.14037, TM:1.32458, FB:0.98354,
         AYT_MAT:0, FIZ:0, KIM:0, BIO:0, EDEB:2.86968, TAR1:2.49727, COG1:2.70539,
         TAR2:3.74723, COG2:2.53476, FELS:3.70284, DKAB:2.55278, YDIL:0 },
  DIL: { intercept:106.259, obp:0.57305, TR:1.42611, SB:1.86721, TM:1.92707, FB:1.33508,
         AYT_MAT:0, FIZ:0, KIM:0, BIO:0, EDEB:0, TAR1:0, COG1:0,
         TAR2:0, COG2:0, FELS:0, DKAB:0, YDIL:2.60491 },
};

function calcScore(tur, x) {
  const c = COEF[tur];
  const p =
    c.intercept +
    c.obp * x.obp +
    c.TR * x.tyt_tr +
    c.SB * x.tyt_sos +
    c.TM * x.tyt_mat +
    c.FB * x.tyt_fen +
    c.AYT_MAT * x.ayt_mat +
    c.FIZ * x.ayt_fiz +
    c.KIM * x.ayt_kim +
    c.BIO * x.ayt_bio +
    c.EDEB * x.ayt_edeb +
    c.TAR1 * x.ayt_tar1 +
    c.COG1 * x.ayt_cog1 +
    c.TAR2 * x.ayt_tar2 +
    c.COG2 * x.ayt_cog2 +
    c.FELS * x.ayt_fels +
    c.DKAB * x.ayt_dkab +
    c.YDIL * x.ydt;
  return round3(p);
}

function showOnlyGroup(tur) {
  const gSay = document.getElementById("grp_say");
  const gEa  = document.getElementById("grp_ea");
  const gSoz = document.getElementById("grp_soz");
  const gDil = document.getElementById("grp_dil");
  if (gSay) gSay.style.display = (tur === "SAY") ? "" : "none";
  if (gEa)  gEa.style.display  = (tur === "EA")  ? "" : "none";
  if (gSoz) gSoz.style.display = (tur === "SOZ") ? "" : "none";
  if (gDil) gDil.style.display = (tur === "DIL") ? "" : "none";
}

/* =========================
   SIRALAMA (CSV) KISMI
   ========================= */
const CSV_FILES = {
  SAY: "./say.csv",
  EA:  "./ea.csv",
  SOZ: "./soz.csv",
  DIL: "./dil.csv",
};

const rankCache = {
  SAY: null,
  EA: null,
  SOZ: null,
  DIL: null,
};

function parseCSVToMap(text) {
  const lines = text.replace(/\r/g, "").split("\n").map(x => x.trim()).filter(Boolean);
  if (lines.length < 2) return new Map();

  // başlık satırı var: puan,min,max
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 3) continue;
    const puan = Number(parts[0]);
    const min = parts[1]?.trim();
    const max = parts[2]?.trim();
    if (Number.isFinite(puan)) {
      map.set(puan, { min, max });
    }
  }
  return map;
}

async function loadRankMap(tur) {
  if (rankCache[tur]) return rankCache[tur];
  const url = CSV_FILES[tur];
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`CSV okunamadı: ${tur} (${res.status})`);
  const text = await res.text();
  const map = parseCSVToMap(text);
  rankCache[tur] = map;
  return map;
}

async function getRankMinMax(tur, puan) {
  const puanInt = Math.floor(puan); // Excel: AŞAĞIYUVARLA(puan;0)
  const map = await loadRankMap(tur);
  const row = map.get(puanInt);
  if (!row) return { min: "#YOK", max: "#YOK", puanInt };
  return { min: row.min ?? "#YOK", max: row.max ?? "#YOK", puanInt };
}

function writeRank(min, max) {
  // Eğer HTML’de ayrı alanlar varsa onları da doldurur:
  const minEl = document.getElementById("minSira");
  const maxEl = document.getElementById("maxSira");
  const siraEl = document.getElementById("sira");

  if (minEl) minEl.textContent = min;
  if (maxEl) maxEl.textContent = max;

  // Senin sayfanda genelde tek "sira" alanı var, ona da yazalım:
  if (siraEl) siraEl.textContent = `MIN SIRA: ${min}  |  MAX SIRA: ${max}`;
}

document.addEventListener("DOMContentLoaded", () => {
  const turSelect = document.getElementById("puanTuru");
  const btn = document.getElementById("hesaplaBtn");
  const sonuc = document.getElementById("sonuc");
  const siraEl = document.getElementById("sira");

  if (!turSelect || !btn || !sonuc || !siraEl) return;

  showOnlyGroup(turSelect.value);

  turSelect.addEventListener("change", () => {
    showOnlyGroup(turSelect.value);
    sonuc.textContent = "—";
    siraEl.textContent = "—";
    const minEl = document.getElementById("minSira");
    const maxEl = document.getElementById("maxSira");
    if (minEl) minEl.textContent = "—";
    if (maxEl) maxEl.textContent = "—";
  });

  btn.addEventListener("click", async () => {
    const tur = turSelect.value;

    // Ortak
    const x = {
      obp: readNumber("obp"),
      tyt_tr: readNumber("tyt_tr"),
      tyt_sos: readNumber("tyt_sos"),
      tyt_mat: readNumber("tyt_mat"),
      tyt_fen: readNumber("tyt_fen"),
      ayt_mat: 0, ayt_fiz: 0, ayt_kim: 0, ayt_bio: 0,
      ayt_edeb: 0, ayt_tar1: 0, ayt_cog1: 0,
      ayt_tar2: 0, ayt_cog2: 0, ayt_fels: 0, ayt_dkab: 0,
      ydt: 0,
    };

    // Türe göre doğru inputları oku
    if (tur === "SAY") {
      x.ayt_mat = readNumber("ayt_mat");
      x.ayt_fiz = readNumber("ayt_fiz");
      x.ayt_kim = readNumber("ayt_kim");
      x.ayt_bio = readNumber("ayt_bio");
    } else if (tur === "EA") {
      x.ayt_mat  = readNumber("ayt_mat_ea");
      x.ayt_edeb = readNumber("ayt_edeb");
      x.ayt_tar1 = readNumber("ayt_tar1");
      x.ayt_cog1 = readNumber("ayt_cog1");
    } else if (tur === "SOZ") {
      x.ayt_edeb = readNumber("ayt_edeb_soz");
      x.ayt_tar1 = readNumber("ayt_tar1_soz");
      x.ayt_cog1 = readNumber("ayt_cog1_soz");
      x.ayt_tar2 = readNumber("ayt_tar2");
      x.ayt_cog2 = readNumber("ayt_cog2");
      x.ayt_fels = readNumber("ayt_fels");
      x.ayt_dkab = readNumber("ayt_dkab");
    } else if (tur === "DIL") {
      x.ydt = readNumber("ydt");
    }

    // 1) PUAN
    const puan = calcScore(tur, x);
    sonuc.textContent = `${tur} Puan: ${puan.toFixed(3)}`;

    // 2) SIRALAMA (CSV’den)
    try {
      const { min, max } = await getRankMinMax(tur, puan);
      writeRank(min, max);
    } catch (e) {
      // CSV bulunamazsa ya da okunamazsa:
      writeRank("#YOK", "#YOK");
      console.error(e);
    }
  });
});
