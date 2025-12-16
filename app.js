// =======================
// FREYA - app.js (PUAN + SIRALAMA)
// CSV mantığı: floor(puan) -> exact yoksa en yakın ALT puan
// Gerekli dosyalar repo root'ta: say.csv, ea.csv, soz.csv, dil.csv
// =======================

function readNumber(id) {
  const el = document.getElementById(id);
  if (!el) return 0;
  const raw = (el.value ?? "").toString().trim();
  if (!raw) return 0;
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

// -----------------------
// SIRALAMA (CSV) YÜKLEME
// -----------------------
const CSV_URL = {
  SAY: "say.csv",
  EA:  "ea.csv",
  SOZ: "soz.csv",
  DIL: "dil.csv",
};

// cache: tur -> {scores:int[], map: Map<int, {min,max}>}
const RANK_CACHE = new Map();

function parseCSV(text) {
  // Basit CSV (virgül/ noktalı virgül toleranslı, TR binlik nokta toleranslı)
  // Header varsa yakalar; yoksa kolon pozisyonundan gider.
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  // delimiter tahmini
  const delim = (lines[0].includes(";") && !lines[0].includes(",")) ? ";" : ",";

  const toNum = (v) => {
    if (v == null) return NaN;
    const s = String(v).trim().replaceAll(".", "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  };

  const headerParts = lines[0].split(delim).map(s => s.trim().toLowerCase());
  const hasHeader = headerParts.some(h => ["puan","score","min","max","min_sira","max_sira","minsira","maxsira"].includes(h));

  let start = 0;
  let idxP = 0, idxMin = 1, idxMax = 2;

  if (hasHeader) {
    start = 1;
    const findAny = (arr) => headerParts.findIndex(h => arr.includes(h));
    idxP   = findAny(["puan","score"]);
    idxMin = findAny(["min","min_sira","minsira","min sıra","min_sıra"]);
    idxMax = findAny(["max","max_sira","maxsira","max sıra","max_sıra"]);
    // Fallback: bulamazsa pozisyonel
    if (idxP < 0) idxP = 0;
    if (idxMin < 0) idxMin = 1;
    if (idxMax < 0) idxMax = 2;
  } else {
    start = 0;
  }

  const rows = [];
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(delim).map(s => s.trim());
    if (parts.length < 3) continue;

    let puan = NaN, min = NaN, max = NaN;

    if (hasHeader) {
      puan = toNum(parts[idxP]);
      min  = toNum(parts[idxMin]);
      max  = toNum(parts[idxMax]);
    } else {
      puan = toNum(parts[0]);
      // son iki kolon min/max varsay
      min = toNum(parts[parts.length - 2]);
      max = toNum(parts[parts.length - 1]);
      // Eğer bu da NaN ise D/E (3/4) dene
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        if (parts.length >= 5) {
          min = toNum(parts[3]);
          max = toNum(parts[4]);
        }
      }
    }

    if (!Number.isFinite(puan) || !Number.isFinite(min) || !Number.isFinite(max)) continue;
    rows.push({ puan: Math.trunc(puan), min: Math.trunc(min), max: Math.trunc(max) });
  }
  return rows;
}

async function loadRanks(tur) {
  if (RANK_CACHE.has(tur)) return RANK_CACHE.get(tur);

  const url = CSV_URL[tur];
  if (!url) return null;

  // Cache-bust: commit sonrası bazen eski dosyayı tutuyor
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${tur} CSV yüklenemedi: ${res.status}`);
  const text = await res.text();
  const rows = parseCSV(text);

  const map = new Map();
  for (const r of rows) map.set(r.puan, { min: r.min, max: r.max });

  const scores = Array.from(map.keys()).sort((a,b) => a-b);
  const data = { scores, map };
  RANK_CACHE.set(tur, data);
  return data;
}

function findFloorKey(sortedArr, key) {
  // sortedArr: ascending int[]
  // return greatest value <= key, or null
  let lo = 0, hi = sortedArr.length - 1;
  if (hi < 0) return null;
  if (key < sortedArr[0]) return null;
  if (key >= sortedArr[hi]) return sortedArr[hi];

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = sortedArr[mid];
    if (v === key) return v;
    if (v < key) lo = mid + 1;
    else hi = mid - 1;
  }
  // hi son <= key
  return hi >= 0 ? sortedArr[hi] : null;
}

async function getMinMaxSira(tur, puanFloat) {
  const data = await loadRanks(tur);
  if (!data) return null;

  const key = Math.floor(puanFloat); // Excel: AŞAĞIYUVARLA
  const exact = data.map.get(key);
  if (exact) return exact;

  // Excel'deki "en yakın alt puan" davranışı (senin istediğin)
  const floorKey = findFloorKey(data.scores, key);
  if (floorKey == null) return null;
  return data.map.get(floorKey) ?? null;
}

// -----------------------
// UI
// -----------------------
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

    // 1) PUAN (bunu ASLA bozmayacağız)
    const puan = calcScore(tur, x);
    sonuc.textContent = `${tur} Puan: ${puan.toFixed(3)}`;

    // 2) SIRALAMA
    try {
      const mm = await getMinMaxSira(tur, puan);
      if (!mm) {
        siraEl.textContent = `Min Sıra: — | Max Sıra: —`;
      } else {
        siraEl.textContent = `Min Sıra: ${mm.min.toLocaleString("tr-TR")} | Max Sıra: ${mm.max.toLocaleString("tr-TR")}`;
      }
    } catch (e) {
      // CSV yolu / isim / format hatası olursa burada görünür
      console.error(e);
      siraEl.textContent = `Min Sıra: — | Max Sıra: —`;
    }
  });
});

/* =========================================================
   LGS MODÜLÜ (YKS'YE KİLİTLİ — ASLA DOKUNMAZ)
   - Bu blok sadece LGS elementleri varsa çalışır
   - YKS id'lerine erişmez, YKS state'ini değiştirmez
   ========================================================= */
(function LGS_MODULE_LOCKED() {
  const LGS_MAX = { TR: 20, MAT: 20, FEN: 20, INK: 10, DIN: 10, DIL: 10 };

  const LGS_JSON_CANDIDATES = [
    "./lgsjson.json",
    "./lgs.json",
    "./data/lgsjson.json",
    "./data/lgs.json",
    "./assets/lgsjson.json",
    "./assets/lgs.json",
    "./docs/lgsjson.json",
    "./docs/lgs.json",
    "../lgsjson.json",
    "../lgs.json",
  ];

  const num = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const raw = (el.value ?? "").toString().trim();
    if (!raw) return null;
    const n = Number(raw.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  const netFromDY = (d, y) => (d || 0) - (y || 0) / 3;

  const resolve = ({ dogru, yanlis, net, max }) => {
    const hasDY =
      (Number.isFinite(dogru) && dogru !== null && dogru !== 0) ||
      (Number.isFinite(yanlis) && yanlis !== null && yanlis !== 0);

    const d = Number.isFinite(dogru) ? dogru : 0;
    const y = Number.isFinite(yanlis) ? yanlis : 0;

    if (hasDY) {
      if (d < 0 || y < 0) return { ok: false, msg: "Doğru/yanlış negatif olamaz." };
      if (d + y > max) return { ok: false, msg: `Doğru+Yanlış (${d + y}) max soru (${max}) aşıyor.` };
      return { ok: true, dogru: d, yanlis: y, net: netFromDY(d, y) };
    }

    const n = Number.isFinite(net) ? net : 0;
    if (n < 0) return { ok: false, msg: "Net negatif olamaz." };
    if (n > max) return { ok: false, msg: `Net (${n}) max soru (${max}) aşıyor.` };
    return { ok: true, dogru: 0, yanlis: 0, net: n };
  };

  async function loadLgsJson() {
    for (const rel of LGS_JSON_CANDIDATES) {
      try {
        const url = new URL(rel, window.location.href);
        url.searchParams.set("v", String(Date.now()));
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) continue;
        const txt = await res.text();
        const data = JSON.parse(txt);
        return { ok: true, path: rel, data };
      } catch (_) {}
    }
    return { ok: false, path: null, data: null };
  }

  function bindWhenReady() {
    const btn = document.getElementById("lgsHesaplaBtn");
    const out = document.getElementById("lgsSonuc");
    if (!btn || !out) return; // LGS yoksa YKS'yi asla etkileme

    // Birden fazla kez bağlanmasın
    if (btn.__lgsBound) return;
    btn.__lgsBound = true;

    btn.addEventListener("click", async (ev) => {
      // Form içindeyse sayfayı yenilemesin, başka click'lere karışmasın
      try { ev.preventDefault(); } catch (_) {}
      try { ev.stopPropagation(); } catch (_) {}

      const tr  = resolve({ dogru: num("lgs_tr_d"),  yanlis: num("lgs_tr_y"),  net: num("lgs_tr_n"),  max: LGS_MAX.TR });
      const mat = resolve({ dogru: num("lgs_mat_d"), yanlis: num("lgs_mat_y"), net: num("lgs_mat_n"), max: LGS_MAX.MAT });
      const fen = resolve({ dogru: num("lgs_fen_d"), yanlis: num("lgs_fen_y"), net: num("lgs_fen_n"), max: LGS_MAX.FEN });
      const ink = resolve({ dogru: num("lgs_ink_d"), yanlis: num("lgs_ink_y"), net: num("lgs_ink_n"), max: LGS_MAX.INK });
      const din = resolve({ dogru: num("lgs_din_d"), yanlis: num("lgs_din_y"), net: num("lgs_din_n"), max: LGS_MAX.DIN });
      const dil = resolve({ dogru: num("lgs_dil_d"), yanlis: num("lgs_dil_y"), net: num("lgs_dil_n"), max: LGS_MAX.DIL });

      const firstBad =
        (!tr.ok && { k: "TR",  m: tr.msg })  ||
        (!mat.ok && { k: "MAT", m: mat.msg }) ||
        (!fen.ok && { k: "FEN", m: fen.msg }) ||
        (!ink.ok && { k: "İNK", m: ink.msg }) ||
        (!din.ok && { k: "DİN", m: din.msg }) ||
        (!dil.ok && { k: "DİL", m: dil.msg }) ||
        null;

      if (firstBad) {
        out.textContent = `❌ ${firstBad.k}: ${firstBad.m}`;
        return;
      }

      const total = tr.net + mat.net + fen.net + ink.net + din.net + dil.net;

      // JSON yüklemesi (varsa)
      const j = await loadLgsJson();

      // YKS'ye dokunmadan sadece LGS alanına yaz
      out.textContent =
        `TR: ${tr.net.toFixed(3)} | MAT: ${mat.net.toFixed(3)} | FEN: ${fen.net.toFixed(3)} | ` +
        `İNK: ${ink.net.toFixed(3)} | DİN: ${din.net.toFixed(3)} | DİL: ${dil.net.toFixed(3)}\n` +
        `TOPLAM NET: ${total.toFixed(3)}` +
        (j.ok ? `\n✅ JSON: ${j.path}` : `\n⚠️ JSON bulunamadı`);

      // İleride lazım olursa (YKS’ye dokunmaz)
      window.__LGS_DATA__ = j.data;
      window.__LGS_INPUTS__ = { tr, mat, fen, ink, din, dil, totalNet: total };
    });
  }

  // DOM hazır olunca bağla
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindWhenReady);
  } else {
    bindWhenReady();
  }
})();
