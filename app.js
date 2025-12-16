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
    // Senin sheet görüntüsüne göre: A=PUAN, D=MIN, E=MAX gibi durumlar var.
    // CSV üretiminde genelde 3 kolon olur; ama 4-5 kolon olursa:
    // 1) ilk kolon puan
    // 2) son iki kolon min/max
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
/* =====================================================
   YKS MAKSİMUM NET SINIRI (SADECE INPUT CLAMP)
   - Mevcut hesap akışına dokunmaz
   - Negatif ve üst limit girişini anında düzeltir
===================================================== */
(function(){
  const LIMITS = {
    // TYT
    tyt_tr: 40,
    tyt_sos: 20,
    tyt_mat: 40,
    tyt_fen: 20,

    // AYT SAY
    ayt_mat: 40,
    ayt_fiz: 14,
    ayt_kim: 13,
    ayt_bio: 13,

    // AYT EA
    ayt_mat_ea: 40,
    ayt_edeb: 24,
    ayt_tar1: 10,
    ayt_cog1: 6,

    // AYT SÖZ
    ayt_edeb_soz: 24,
    ayt_tar1_soz: 10,
    ayt_cog1_soz: 6,
    ayt_tar2: 11,
    ayt_cog2: 11,
    ayt_fels: 12,
    ayt_dkab: 6,

    // YDT
    ydt: 80,
  };

  function clampField(el, max){
    if (!el) return;
    const raw = (el.value ?? "").toString().trim();
    if (!raw) return;

    // TR virgül toleransı
    const normalized = raw.replace(",", ".");
    let n = Number(normalized);
    if (!Number.isFinite(n)) return;

    if (n < 0) n = 0;
    if (n > max) n = max;

    // kullanıcı yazımını bozmayacak şekilde set et
    el.value = String(n);
  }

  function bind(){
    for (const [id, max] of Object.entries(LIMITS)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener("input", () => clampField(el, max));
      el.addEventListener("blur",  () => clampField(el, max));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
