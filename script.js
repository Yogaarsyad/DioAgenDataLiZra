/* ===== Dio si Agen Data (purwarupa skripsi - LiZra) ===== */
const SUPABASE_URL = 'https://qxlhlwarmfgvkzibebcp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_E0CVVaHU7KRffuseLtQ-lg_rSPpFUMj';
const STORAGE_KEY = 'dio_lizra_session_state_v1';

let sb = null, sbMsg = '';
if (!window.supabase) sbMsg = 'pustaka Supabase gagal dimuat';
else {
    try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
    catch (e) { sbMsg = 'URL atau key tidak valid'; }
}

function $(id) { return document.getElementById(id); }

/* ---------- Cek Sesi Tersimpan Langsung Agar Tidak Berkedip Saat Refresh ---------- */
function bacaStateLokal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

const savedInitialState = bacaStateLokal();
if (savedInitialState && savedInitialState.session && savedInitialState.namaAnak) {
    $('layar-intro').classList.add('sembunyi');
    $('layar-pengantar').classList.add('sembunyi');
    $('layar-masuk').classList.add('sembunyi');
}

/* ---------- Membuat Opsi Akun Pra-Dibuat (P01 sampai P20) ---------- */
const selectAkun = $('select-akun');
for (let i = 1; i <= 20; i++) {
    const kode = 'P' + (i < 10 ? '0' : '') + i;
    const opt = document.createElement('option');
    opt.value = kode;
    opt.textContent = 'Akun Peserta ' + kode;
    selectAkun.appendChild(opt);
}

/* ---------- Variabel State Utama ---------- */
let namaAnak = '';
var session = ''; // var global agar terbaca oleh pengantar.js
let t0 = Date.now();
let LOG = [];
const EV = ['create', 'move', 'delete', 'change'];
let sent = 0, flushing = false, cur = 0, loading = false, busy = false;
let timers = [], mStart = 0, mStartTime = 0, mOpen = false, solved = false, ws = null;
let hasilMisi = {};
let lastSyncedSnapshot = '';

const now = () => Math.round((Date.now() - t0) / 100) / 10;

function simpanStateLokal() {
    if (!session || !namaAnak) return;
    try {
        let wsState = null;
        if (ws && !loading) {
            wsState = Blockly.serialization.workspaces.save(ws);
        }
        const payload = {
            namaAnak,
            session,
            t0,
            cur,
            selesai,
            hasilMisi,
            mStart,
            mStartTime,
            mOpen,
            solved,
            sent,
            LOG: LOG.slice(-400),
            wsState
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
}

function hapusStateLokal() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

function tampilkanBadgeHeader() {
    $('nama-agen').textContent = '🕵️ Akun: ' + namaAnak;
    $('nama-agen').classList.remove('sembunyi');
    $('btnResume').classList.remove('sembunyi');
    $('btnLogout').classList.remove('sembunyi');
}

/* ---------- Logika Pemilihan Akun ---------- */
$('btn-mulai-main').onclick = () => {
    const selectedAccount = selectAkun.value;
    if (!selectedAccount) {
        alert('Silakan pilih Kode Akun Peserta terlebih dahulu ya!');
        return;
    }

    namaAnak = selectedAccount;
    session = namaAnak + '_' + Math.random().toString(16).slice(2, 6);
    t0 = Date.now();
    LOG = [];
    sent = 0;
    selesai = LV.map(() => false);
    hasilMisi = {};
    lastSyncedSnapshot = '';

    tampilkanBadgeHeader();
    $('layar-masuk').classList.add('sembunyi');
    $('layar-resume').classList.add('sembunyi');

    status();
    loadLevel(0);
    log({ event_type: 'game_started', execution_result: { participant_id: namaAnak } });
    simpanStateLokal();
    sinkronResumeOtomatis(false);
    nyalakanSuara();
};

/* ---------- Misi ---------- */
const dok = (j, r) => ({ j, r: !!r }),
      tugas = () => dok('tugas'),
      foto = () => dok('foto'),
      rahasia = () => dok('tugas', true);

const START = { blocks: { languageVersion: 0, blocks: [{ type: 'mulai', deletable: false, movable: false, x: 20, y: 20 }] } };

const LV = [
  { id: 'L1', nama: '1 Urutan 🚶', items: [tugas()], tools: ['ambil', 'kirim'] },
  { id: 'L2', nama: '2 Ulangi 🔁', items: [tugas(), tugas(), tugas(), tugas(), tugas()], max: 3, tools: ['ambil', 'kirim', 'ulangi'] },
  { id: 'L3', nama: '3 Jika 🤔', items: [foto(), tugas(), foto(), tugas(), tugas()], tools: ['ambil', 'simpan_album', 'simpan_tugas', 'ulangi', 'jika_jenis'] },
  { id: 'L4', nama: '4 Gembok 🔒', items: [tugas(), rahasia(), tugas(), rahasia()], tools: ['ambil', 'kirim', 'beri_sandi', 'ulangi', 'jika_rahasia'] },
  {
    id: 'L5', nama: '5 Perbaiki 🔧', items: [foto(), tugas(), tugas(), foto()], tools: ['ambil', 'simpan_album', 'simpan_tugas', 'ulangi', 'jika_jenis'],
    awal: {
      blocks: {
        languageVersion: 0,
        blocks: [{
          type: 'mulai', deletable: false, movable: false, x: 20, y: 20,
          next: {
            block: {
              type: 'ulangi', fields: { N: 4 },
              inputs: {
                DO: {
                  block: {
                    type: 'ambil',
                    next: {
                      block: {
                        type: 'jika_jenis', fields: { J: 'foto' },
                        inputs: { THEN: { block: { type: 'simpan_album' } } }
                      }
                    }
                  }
                }
              }
            }
          }
        }]
      }
    }
  }
];

/* ---------- Interpreter Murni ---------- */
function simulate(L, first) {
  const q = L.items.map(o => ({ ...o })), st = { hand: null, album: 0, tugas: 0, kirim: 0 }, steps = [];
  let fail = null, n = 0;
  const snap = (b) => steps.push({ q: q.map(o => ({ ...o })), hand: st.hand && { ...st.hand }, album: st.album, tugas: st.tugas, kirim: st.kirim, id: b.id, t: b.type });
  const bad = (msg, b) => { fail = { msg, type: b.type, id: b.id }; };
  function run(b) {
    while (b && !fail) {
      if (++n > 300) { fail = { msg: 'Dio kelelahan, baloknya terlalu banyak 😴', type: 'loop' }; return; }
      const t = b.type;
      if (t === 'ulangi') {
        for (let i = 0; i < b.getFieldValue('N') && !fail; i++) run(b.getInputTargetBlock('DO'));
      } else if (t === 'jika_jenis' || t === 'jika_rahasia') {
        if (!st.hand) bad('Apakah kamu lupa? Dio belum memegang apa-apa, jadi ia tidak tahu jenis berkasnya! 🧐', b);
        else {
          const yes = t === 'jika_jenis' ? st.hand.j === b.getFieldValue('J') : st.hand.r;
          run(b.getInputTargetBlock(yes ? 'THEN' : 'ELSE'));
        }
      } else {
        if (t === 'ambil') {
          if (st.hand) bad('Aduh, tangan Dio masih memegang berkas! Jangan ambil lagi ya 🙈', b);
          else if (!q.length) bad('Berkasnya sudah habis, Dio tidak bisa mengambil lagi 😅', b);
          else st.hand = q.shift();
        }
        else if (!st.hand) bad('Tangan Dio masih kosong 😅 Bantu Dio ambil berkasnya dulu yuk!', b);
        else if (t === 'simpan_album') {
          if (st.hand.j !== 'foto') bad('Ups, itu bukan foto! Kamu salah memilah tempat berkas tugas 😵', b);
          else { st.album++; st.hand = null; }
        }
        else if (t === 'simpan_tugas') {
          if (st.hand.j !== 'tugas') bad('Ups, itu bukan tugas! Kamu salah memilah tempat berkas foto 😵', b);
          else { st.tugas++; st.hand = null; }
        }
        else if (t === 'beri_sandi') st.hand.s = true;
        else if (t === 'kirim') {
          if (st.hand.r && !st.hand.s) bad('Waduh! Dokumen rahasianya belum kamu gembok 😱 Nanti bisa dibaca orang jahat!', b);
          else { st.kirim++; st.hand = null; }
        }
        snap(b);
      }
      b = b.getNextBlock();
    }
  }
  run(first);
  return { steps, fail, ok: !fail && !q.length && !st.hand, left: q.length + (st.hand ? 1 : 0) };
}

let selesai = LV.map(() => false);
function terbukaMaks() { let i = 0; while (i < LV.length - 1 && selesai[i]) i++; return i; }

const sq = { previousStatement: null, nextStatement: null };
Blockly.defineBlocksWithJsonArray([
  { type: 'mulai', message0: '▶ Mulai', nextStatement: null, colour: '#7BCB5A' },
  { type: 'ambil', message0: '📥 ambil dokumen', ...sq, colour: '#FF7EB6' },
  { type: 'kirim', message0: '✉️ kirim dokumen', ...sq, colour: '#FFA94D' },
  { type: 'simpan_album', message0: '📷 simpan ke Album', ...sq, colour: '#4FC38A' },
  { type: 'simpan_tugas', message0: '📄 simpan ke folder Tugas', ...sq, colour: '#5AA9FF' },
  { type: 'beri_sandi', message0: '🔒 beri sandi (gembok)', ...sq, colour: '#A98BFF' },
  {
    type: 'ulangi', message0: '🔁 ulangi %1 kali', args0: [{ type: 'field_number', name: 'N', value: 2, min: 1, max: 20, precision: 1 }],
    message1: '%1', args1: [{ type: 'input_statement', name: 'DO' }], ...sq, colour: '#F2A516'
  },
  {
    type: 'jika_jenis', message0: '🤔 jika ini %1', args0: [{ type: 'field_dropdown', name: 'J', options: [['foto 📷', 'foto'], ['tugas 📄', 'tugas']] }],
    message1: 'maka %1', args1: [{ type: 'input_statement', name: 'THEN' }],
    message2: 'kalau bukan %1', args2: [{ type: 'input_statement', name: 'ELSE' }], ...sq, colour: '#26B8CC'
  },
  {
    type: 'jika_rahasia', message0: '🤔 jika dokumen RAHASIA 📕',
    message1: 'maka %1', args1: [{ type: 'input_statement', name: 'THEN' }], ...sq, colour: '#26B8CC'
  }
]);

function status() {
  $('info').textContent = 'Sesi ' + (session || 'Menunggu') + ' | ☁️ ' + sent + '/' + LOG.length;
}

function log(o) {
  if (!session) return;
  LOG.push({ session_id: session, mission_id: LV[cur].id, timestamp_rel: now(), ...o });
  status();
  simpanStateLokal();
  if (LOG.length - sent >= 20) flush();
}

async function flush() {
  if (!sb || flushing || sent >= LOG.length || !session) return;
  flushing = true;
  const upto = LOG.length;
  try {
    const { error } = await sb.from('interaction_logs').insert(LOG.slice(sent, upto));
    if (!error) {
      sent = upto;
      simpanStateLokal();
    }
  } catch (e) {}
  flushing = false;
  status();
}

function summary(reason) {
  const ev = LOG.slice(mStart);
  const validRuns = ev.filter(e => e.event_type === 'run' && e.execution_result && e.execution_result.reason !== 'over_limit');
  const allRuns = ev.filter(e => e.event_type === 'run');
  const last = validRuns.length ? validRuns[validRuns.length - 1].program_snapshot : '';
  const startRel = ev[0]?.timestamp_rel ?? mStartTime;
  const duration = Math.max(0.1, Math.round((now() - startRel) * 10) / 10);

  return {
    reason,
    runs: validRuns.length,
    total_run_clicks: allRuns.length,
    failed_runs: validRuns.filter(e => !e.execution_result.ok).length,
    first_attempt_success: validRuns.length > 0 && validRuns[0].execution_result.ok,
    over_limit: ev.filter(e => e.execution_result && e.execution_result.reason === 'over_limit').length,
    hints: ev.filter(e => e.event_type === 'use_hint').length,
    edits: ev.filter(e => EV.includes(e.event_type)).length,
    creates: ev.filter(e => e.event_type === 'create').length,
    moves: ev.filter(e => e.event_type === 'move').length,
    deletes: ev.filter(e => e.event_type === 'delete').length,
    changes: ev.filter(e => e.event_type === 'change').length,
    resets: ev.filter(e => e.event_type === 'reset').length,
    duration,
    used_repeat: last.includes('ulangi'),
    used_condition: last.includes('jika_'),
    final_program: last
  };
}

function simpanRekapMisi(missionId, dataRingkas, statusSelesai) {
  const sebelumnya = hasilMisi[missionId];
  if (sebelumnya && sebelumnya.selesai && !statusSelesai) return;

  hasilMisi[missionId] = {
    mission_id: missionId,
    judul: CERITA[missionId].judul,
    konsep: CERITA[missionId].belajar,
    selesai: statusSelesai,
    ...dataRingkas
  };
  simpanStateLokal();
}

function endMission(reason) {
  const s = summary(reason);
  const isSolved = reason === 'solved';
  simpanRekapMisi(LV[cur].id, s, isSolved);
  log({ event_type: 'mission_end', execution_result: s });
  mOpen = false;
  flush();
  sinkronResumeOtomatis(false);
}

/* ---------- Narasi Keterlibatan Anak & Petunjuk 5 Detik ---------- */
let hintTimer = null;
const CERITA = {
  L1: {
    w: '#ff8fc0', ikon: '📚', judul: 'Urutan',
    cerita: 'Bu Guru menitipkan <span class="hl-aksi">1 tugas</span> untuk dikirim ke Rani. Apakah kamu siap memandu Dio hari ini? 💪',
    bantuan: 'Susun balokmu: Suruh Dio <span class="hl-benda">📥 ambil</span> dulu tugasnya, setelah itu baru kamu <span class="hl-tempat">✉️ kirim</span>.',
    belajar: 'urutan langkah'
  },
  L2: {
    w: '#ffb347', ikon: '📦', judul: 'Ulangi',
    cerita: 'Wah, Bu Guru menitipkan <span class="hl-aksi">5 tugas</span> sekaligus! Maukah kamu membantu Dio agar tidak perlu menyusun balok yang sama berkali-kali? 😮',
    bantuan: 'Kirim semua tugas dengan kekuatan balok <span class="hl-tempat">🔁 ulangi</span>. Tapi ingat, jumlah balokmu <span class="hl-aksi">maksimal 3</span> ya!',
    belajar: 'pengulangan'
  },
  L3: {
    w: '#4fc3f7', ikon: '🗂️', judul: 'Jika',
    cerita: 'Ban berjalan membawa berkas campur aduk: ada <span class="hl-aksi">foto liburan 📷</span> dan <span class="hl-aksi">tugas 📄</span>. Yuk, bantu Dio merapikannya!',
    bantuan: '<span class="hl-benda">📷 foto</span> harus kamu masukkan ke Album, dan <span class="hl-benda">📄 tugas</span> ke folder Tugas. Pakai balok <span class="hl-tempat">🤔 jika</span> untuk mengintip jenis berkasnya.',
    belajar: 'memilih dengan syarat'
  },
  L4: {
    w: '#a98bff', ikon: '🔒', judul: 'Gembok',
    cerita: 'Peringatan merah! Ada <span class="hl-bahaya">nilai ujian 📕</span> rahasia yang tercampur. Apakah kamu bisa mengamankannya? 😱',
    bantuan: 'Amankan dokumen <span class="hl-bahaya">📕 rahasia</span> dengan memberikan <span class="hl-tempat">🔒 sandi</span> (gembok) sebelum kamu mengirimkannya.',
    belajar: 'menjaga data rahasia'
  },
  L5: {
    w: '#47c97a', ikon: '🔧', judul: 'Perbaiki',
    cerita: 'Program buatan teman agen kita <span class="hl-aksi">macet</span> di tengah jalan! 😵 Jadilah detektif dan bantu Dio mencari kode bagian mana yang kurang.',
    bantuan: 'Tekan tombol <span class="hl-aksi">▶ Jalankan</span> untuk melihat balok yang <span class="hl-tempat">menyala ✨</span>, temukan yang hilang lalu <span class="hl-aksi">perbaiki</span> urutannya.',
    belajar: 'mencari dan memperbaiki kesalahan'
  }
};

function bukaBantuan() {
  $('teks-hint').innerHTML = '💡 ' + CERITA[LV[cur].id].bantuan;
  $('teks-hint').classList.remove('sembunyi');
  log({ event_type: 'use_hint' });

  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    $('teks-hint').classList.add('sembunyi');
  }, 5000);
}

function tampilMisi(L) {
  const c = CERITA[L.id];
  $('misi').style.setProperty('--w', c.w);
  $('misi').innerHTML =
    '<div class="misi-kepala"><span class="misi-ikon">' + c.ikon + '</span><div><small>MISI ' + L.id.slice(1) + '</small><strong>' + c.judul + '</strong></div></div>' +
    '<div class="cerita-box">' + c.cerita + '</div>' +
    '<div class="tugas-box">' +
       '<span class="tugas-label">🎯 Tugasmu</span>' +
       '<div class="tugas-teks">Susun balok logika untuk menyelesaikannya. Butuh petunjuk? Klik lampu ini: ' +
       '<button id="btn-lampu" class="btn-lampu" title="Lihat Petunjuk (5 Detik)">💡</button></div>' +
       '<div id="teks-hint" class="teks-bantuan sembunyi"></div>' +
    '</div>' +
    '<span class="belajar-label">⭐ Kamu belajar: ' + c.belajar + '</span>';

  $('btn-lampu').onclick = bukaBantuan;
}

let suaraOn = true, AC = null;
function setSuara(v) { suaraOn = v; $('btnSuara').textContent = v ? '🔊' : '🔇'; }
function nyalakanSuara() {
  if (!suaraOn) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {}
}
function nada(f, t, d, tipe, v) {
  if (!suaraOn || !AC) return;
  try {
    const o = AC.createOscillator(), g = AC.createGain(), s0 = AC.currentTime + t;
    o.type = tipe; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, s0);
    g.gain.exponentialRampToValueAtTime(v, s0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, s0 + d);
    o.connect(g); g.connect(AC.destination);
    o.start(s0); o.stop(s0 + d + 0.05);
  } catch (e) {}
}
const bunyi = {
  langkah: () => nada(660, 0, 0.08, 'triangle', 0.05),
  sukses: () => [523, 659, 784, 1047].forEach((f, i) => nada(f, i * 0.12, 0.25, 'triangle', 0.13)),
  salah: () => { nada(300, 0, 0.18, 'sawtooth', 0.05); nada(220, 0.15, 0.25, 'sawtooth', 0.05); }
};

function animasiAvatar(kelas) {
  const av = document.querySelector('.avatar');
  if (!av) return;
  av.classList.remove('loncat', 'goyang');
  void av.offsetWidth;
  if (kelas) av.classList.add(kelas);
}

/* ---------- Sorotan Balok Menyala & Bintik-Bintik Cahaya ---------- */
let sparkInterval = null;
let activeHighlight = null; // { blockId, mode, labelTeks }

function pastikanOverlayBalok() {
  const host = $('blocklyDiv');
  if (!host) return null;
  let ov = $('efek-balok-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'efek-balok-overlay';
    host.appendChild(ov);
  }
  return ov;
}

function ukurKotakBalok(blockId) {
  const host = $('blocklyDiv');
  const target = ws && ws.getBlockById(blockId);
  const svgRoot = target && target.getSvgRoot && target.getSvgRoot();
  if (!host || !svgRoot) return null;

  const pathEl = svgRoot.querySelector('.blocklyPath') || svgRoot;
  const hostRect = host.getBoundingClientRect();
  const rect = pathEl.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  return {
    left: rect.left - hostRect.left,
    top: rect.top - hostRect.top,
    width: rect.width,
    height: rect.height
  };
}

function ledakkanBintikCahaya(ov, box, jumlah = 14, mode = 'salah') {
  if (!ov || !box) return;
  const warnaSalah = ['#FF1744', '#FF9100', '#FFD600', '#FFFFFF', '#FF5252'];
  const warnaJalan = ['#FFD600', '#00E5FF', '#FFFFFF', '#76FF03'];
  const palet = mode === 'salah' ? warnaSalah : warnaJalan;

  for (let i = 0; i < jumlah; i++) {
    const dot = document.createElement('span');
    dot.className = 'bintik-cahaya';
    const ukuran = (mode === 'salah' ? 5 : 4) + Math.random() * 6;
    const startX = box.left + Math.random() * box.width;
    const startY = box.top + Math.random() * box.height;
    const sudut = Math.random() * Math.PI * 2;
    const jarak = (mode === 'salah' ? 28 : 18) + Math.random() * 44;
    const dx = Math.cos(sudut) * jarak;
    const dy = Math.sin(sudut) * jarak - 10;
    const warna = palet[Math.floor(Math.random() * palet.length)];

    dot.style.width = ukuran + 'px';
    dot.style.height = ukuran + 'px';
    dot.style.left = startX + 'px';
    dot.style.top = startY + 'px';
    dot.style.backgroundColor = warna;
    dot.style.boxShadow = `0 0 8px ${warna}, 0 0 14px ${warna}`;
    dot.style.setProperty('--dx', dx.toFixed(1) + 'px');
    dot.style.setProperty('--dy', dy.toFixed(1) + 'px');
    dot.style.setProperty('--dur', (0.65 + Math.random() * 0.55).toFixed(2) + 's');

    ov.appendChild(dot);
    setTimeout(() => dot.remove(), 1250);
  }
}

function gambarOverlaySorotan() {
  const ov = pastikanOverlayBalok();
  if (!ov) return;
  ov.innerHTML = '';

  if (!activeHighlight || activeHighlight.mode !== 'salah') return;
  const box = ukurKotakBalok(activeHighlight.blockId);
  if (!box) return;

  // 1. Kotak bingkai merah menyala di sekeliling balok
  const frame = document.createElement('div');
  frame.className = 'kotak-fokus-salah';
  frame.style.left = (box.left - 5) + 'px';
  frame.style.top = (box.top - 5) + 'px';
  frame.style.width = (box.width + 10) + 'px';
  frame.style.height = (box.height + 10) + 'px';
  ov.appendChild(frame);

  // 2. Ikon tanda seru / ledakan melayang di atas balok
  const ikonKiri = document.createElement('div');
  ikonKiri.className = 'ikon-peringatan-balok';
  ikonKiri.textContent = '⚠️';
  ikonKiri.style.left = Math.max(6, box.left + 8) + 'px';
  ikonKiri.style.top = Math.max(4, box.top - 26) + 'px';
  ov.appendChild(ikonKiri);

  const ikonKanan = document.createElement('div');
  ikonKanan.className = 'ikon-peringatan-balok kanan';
  ikonKanan.textContent = '💥';
  ikonKanan.style.left = (box.left + box.width - 10) + 'px';
  ikonKanan.style.top = Math.max(4, box.top - 22) + 'px';
  ov.appendChild(ikonKanan);

  // 3. Gelembung komentar "Oops! Salah di sini!" di samping kanan balok
  const host = $('blocklyDiv');
  const label = document.createElement('div');
  label.className = 'label-salah-balok';
  label.textContent = activeHighlight.labelTeks || '⚠️ Oops! Salah di sini!';

  const posisiKanan = box.left + box.width + 18;
  if (host && posisiKanan + 185 < host.clientWidth) {
    label.classList.add('panah-kiri');
    label.style.left = posisiKanan + 'px';
    label.style.top = (box.top + box.height / 2 - 17) + 'px';
  } else {
    label.style.left = Math.max(10, box.left) + 'px';
    label.style.top = (box.top + box.height + 10) + 'px';
  }
  ov.appendChild(label);
}

function sorotBalok(blockId, mode = 'jalan', labelTeks = '⚠️ Oops! Salah di sini!') {
  if (!ws) return;
  ws.highlightBlock(null);

  if (sparkInterval) {
    clearInterval(sparkInterval);
    sparkInterval = null;
  }

  const divBlockly = $('blocklyDiv');
  if (divBlockly) divBlockly.classList.remove('ada-balok-salah');

  ws.getAllBlocks(false).forEach(b => {
    const root = b.getSvgRoot && b.getSvgRoot();
    if (root) root.classList.remove('balok-sorot-jalan', 'balok-sorot-salah');
  });

  const ov = pastikanOverlayBalok();
  if (ov) ov.innerHTML = '';

  if (!blockId) {
    activeHighlight = null;
    return;
  }

  const target = ws.getBlockById(blockId);
  const svgRoot = target && target.getSvgRoot && target.getSvgRoot();
  if (!svgRoot) {
    activeHighlight = null;
    return;
  }

  // Bawa balok ke lapisan terdepan agar cahayanya tidak tertutup balok lain
  if (svgRoot.parentNode) {
    svgRoot.parentNode.appendChild(svgRoot);
  }

  activeHighlight = { blockId, mode, labelTeks };
  const box = ukurKotakBalok(blockId);

  if (mode === 'salah') {
    svgRoot.classList.add('balok-sorot-salah');
    if (divBlockly) divBlockly.classList.add('ada-balok-salah');
    gambarOverlaySorotan();
    ledakkanBintikCahaya(ov, box, 22, 'salah');
    sparkInterval = setInterval(() => {
      const terkini = ukurKotakBalok(blockId);
      ledakkanBintikCahaya(ov, terkini, 10, 'salah');
    }, 650);
  } else {
    svgRoot.classList.add('balok-sorot-jalan');
    ledakkanBintikCahaya(ov, box, 8, 'jalan');
  }
}

function balokTerakhirRantai() {
  let b = startBlock();
  while (b && b.getNextBlock()) b = b.getNextBlock();
  return b;
}

const KELOMPOK = [
  ['✋ Aksi', '#FF7EB6', ['ambil', 'kirim', 'simpan_album', 'simpan_tugas', 'beri_sandi']],
  ['🔄 Ulangi', '#F2A516', ['ulangi']],
  ['❓ Jika', '#26B8CC', ['jika_jenis', 'jika_rahasia']]
];
const toolbox = L => ({
  kind: 'categoryToolbox',
  contents: KELOMPOK.map(([name, colour, ts]) => ({
    kind: 'category', name, colour,
    contents: ts.filter(t => L.tools.includes(t)).map(type => ({ kind: 'block', type }))
  })).filter(c => c.contents.length)
});
const BICARA = { ambil: 'Hup! Kuambil 📥', kirim: 'Wussh! Terkirim ✉️', simpan_album: 'Masuk Album 📷', simpan_tugas: 'Masuk Tugas 📄', beri_sandi: 'Digembok 🔒' };
const em = o => o.r ? (o.s ? '📕🔒' : '📕') : (o.j === 'foto' ? '📷' : '📄');
const bicara = m => { $('bicara').textContent = m; };

function ser(b) {
  const o = [];
  while (b) {
    const t = b.type;
    if (t === 'ulangi') o.push('ulangi(' + b.getFieldValue('N') + '){' + ser(b.getInputTargetBlock('DO')) + '}');
    else if (t === 'jika_jenis') o.push('jika_jenis(' + b.getFieldValue('J') + '){' + ser(b.getInputTargetBlock('THEN')) + '}else{' + ser(b.getInputTargetBlock('ELSE')) + '}');
    else if (t === 'jika_rahasia') o.push('jika_rahasia{' + ser(b.getInputTargetBlock('THEN')) + '}');
    else o.push(t);
    b = b.getNextBlock();
  }
  return o.join(';');
}
const startBlock = () => ws.getTopBlocks(false).find(b => b.type === 'mulai');

function draw(st) {
  $('stage').innerHTML =
    '<div class="rak"><span class="label">Ban berjalan</span><div class="ban">' + (st.q.length ? st.q.map((o, i) => '<span class="chip' + (i === 0 ? ' depan' : '') + '">' + em(o) + '</span>').join('') : '<span class="kosong">kosong</span>') + '</div></div>' +
    '<div class="rak"><span class="label">Tangan Dio 🤖</span><div class="tangan">' + (st.hand ? '<span class="chip pop">' + em(st.hand) + '</span>' : '<span class="kosong">kosong</span>') + '</div></div>';
}

function pesanPendek(teks, tampilkan) {
  if (tampilkan) { $('pesan-singkat').textContent = teks; $('pesan-singkat').classList.remove('sembunyi'); }
  else { $('pesan-singkat').classList.add('sembunyi'); }
}
function pesan(html, kelas) { const p = $('pesan'); p.className = 'pesan ' + (kelas || ''); p.innerHTML = html; }

function segarkanTab(baruIdx) {
  const maks = terbukaMaks();
  document.querySelectorAll('.lv').forEach((b, k) => {
    const kunci = k > maks;
    b.className = 'lv' + (k === cur ? ' on' : '') + (kunci ? ' terkunci' : '') + (selesai[k] ? ' selesai' : '') + (k === baruIdx ? ' baru' : '');
    b.textContent = (kunci ? '🔒 ' : selesai[k] ? '✅ ' : '') + LV[k].nama;
  });
  $('bintang').textContent = selesai.map(x => x ? '⭐' : '☆').join('');
}

function klikTab(i) {
  if (i > terbukaMaks()) {
    nyalakanSuara();
    bicara('Eits, misi itu masih dikunci 🔒');
    $('pesan').classList.remove('sembunyi');
    pesan('Selesaikan dulu <b>Misi ' + LV[terbukaMaks()].nama + '</b> ya! 🔓', 'gagal');
    return;
  }
  loadLevel(i);
}

function setup(customWsState = null) {
  const L = LV[cur];
  loading = true;
  ws.clear();
  Blockly.serialization.workspaces.load(customWsState || L.awal || START, ws);
  ws.updateToolbox(toolbox(L));
  loading = false;
  sorotBalok(null);
  animasiAvatar('');
  tampilMisi(L);
  segarkanTab(-1);
  draw({ q: L.items, hand: null, album: 0, tugas: 0, kirim: 0 });

  pesanPendek('', false);
  $('pesan').classList.add('sembunyi');
  pesan('', '');

  bicara('Ayo susun balok-balokku, lalu tekan Jalankan! 🚀');
}

function loadLevel(i, restoreInfo = null) {
  if (!restoreInfo && i > terbukaMaks()) return;
  if (!restoreInfo && mOpen && !solved && LOG.length - mStart > 1) {
    endMission('abandoned');
  }
  timers.forEach(clearTimeout);
  timers = [];
  busy = false;
  $('btnRun').disabled = false;
  cur = i;
  solved = restoreInfo ? restoreInfo.solved : selesai[i];
  setup(restoreInfo ? restoreInfo.wsState : null);

  if (restoreInfo) {
    mStart = restoreInfo.mStart;
    mStartTime = restoreInfo.mStartTime;
    mOpen = restoreInfo.mOpen;
  } else {
    mStart = LOG.length;
    mStartTime = now();
    mOpen = true;
    log({ event_type: 'mission_start' });
  }
  simpanStateLokal();
}

/* ---------- Penyusunan & Penyimpanan Resume (Baik Tuntas 5 Misi Maupun Sebagian) ---------- */
function buatObjekResume(sertakanMisiBerjalan = true) {
  const snapshotRekap = { ...hasilMisi };
  if (sertakanMisiBerjalan && mOpen && !solved) {
    const curId = LV[cur].id;
    const ringkasBerjalan = summary('in_progress');
    if (ringkasBerjalan.runs > 0 || ringkasBerjalan.edits > 0 || ringkasBerjalan.hints > 0) {
      snapshotRekap[curId] = {
        mission_id: curId,
        judul: CERITA[curId].judul,
        konsep: CERITA[curId].belajar,
        selesai: false,
        ...ringkasBerjalan
      };
    }
  }

  const detail = LV.map((l, idx) => {
    const d = snapshotRekap[l.id];
    const c = CERITA[l.id];
    const sudahTuntas = !!selesai[idx];
    if (!d) {
      return {
        mission_id: l.id,
        judul: c.judul,
        konsep: c.belajar,
        selesai: sudahTuntas,
        dicoba: false,
        duration: 0,
        runs: 0,
        failed_runs: 0,
        hints: 0,
        edits: 0
      };
    }
    return {
      mission_id: l.id,
      judul: c.judul,
      konsep: c.belajar,
      selesai: sudahTuntas || !!d.selesai,
      dicoba: true,
      duration: d.duration || 0,
      runs: d.runs || 0,
      failed_runs: d.failed_runs || 0,
      hints: d.hints || 0,
      edits: d.edits || 0,
      creates: d.creates || 0,
      moves: d.moves || 0,
      deletes: d.deletes || 0,
      changes: d.changes || 0,
      resets: d.resets || 0,
      used_repeat: !!d.used_repeat,
      used_condition: !!d.used_condition,
      final_program: d.final_program || ''
    };
  });

  const jumlahTuntas = detail.filter(x => x.selesai).length;
  const jumlahDicoba = detail.filter(x => x.dicoba).length;
  const totalDurasi = Math.round(detail.reduce((a, b) => a + b.duration, 0) * 10) / 10;
  const totalRun = detail.reduce((a, b) => a + b.runs, 0);
  const totalGagal = detail.reduce((a, b) => a + (b.failed_runs || 0), 0);
  const totalHint = detail.reduce((a, b) => a + b.hints, 0);
  const totalEdit = detail.reduce((a, b) => a + b.edits, 0);
  const statusTuntas = jumlahTuntas === LV.length ? 'tuntas' : 'sebagian';

  let predikat = 'Agen Data Pemula';
  let catatan = 'Terima kasih sudah berpetualang bersama Dio! Setiap langkah menyusun balok membantumu mengenal cara berpikir runut dan logis.';

  if (jumlahTuntas === LV.length) {
    if (totalHint <= 2 && totalRun <= 7) {
      predikat = 'Master Logika & Keamanan Data';
      catatan = 'Luar biasa! Kamu menuntaskan semua 5 misi dengan sangat mandiri, teliti, dan mampu mengamankan dokumen rahasia dengan tepat.';
    } else if (totalHint > 3 && totalRun <= 8) {
      predikat = 'Agen Data Teliti & Strategis';
      catatan = 'Bagus sekali! Kamu cermat membaca petunjuk sebelum melangkah sehingga semua 5 tantangan logika berhasil diselesaikan.';
    } else {
      predikat = 'Agen Data Pemecah Masalah Tangguh';
      catatan = 'Hebat sekali! Kamu pantang menyerah mencoba dan memperbaiki susunan balok hingga kelima misi tuntas semuanya.';
    }
  } else if (jumlahTuntas >= 3) {
    predikat = 'Agen Data Penjelajah Logika (' + jumlahTuntas + '/5 Misi)';
    catatan = 'Bagus! Kamu sudah berhasil menuntaskan ' + jumlahTuntas + ' dari 5 misi dan mulai terbiasa menyusun urutan langkah serta logika percabangan bersama Dio.';
  } else if (jumlahTuntas >= 1) {
    predikat = 'Agen Data Perintis (' + jumlahTuntas + '/5 Misi)';
    catatan = 'Awal yang baik! Kamu sudah berhasil menyelesaikan ' + jumlahTuntas + ' misi pertama dan mengenal cara menyusun perintah balok untuk Dio.';
  } else if (jumlahDicoba >= 1) {
    predikat = 'Agen Data Eksplorator Awal';
    catatan = 'Kamu sudah mulai berkenalan dengan ruang balok Dio dan berani mencoba menyusun perintah pertamamu.';
  }

  return {
    participant_id: namaAnak || 'Anonim',
    session_id: session,
    completion_status: statusTuntas,
    completed_missions: jumlahTuntas,
    total_missions: LV.length,
    total_duration_sec: totalDurasi,
    total_runs: totalRun,
    total_failed_runs: totalGagal,
    total_hints: totalHint,
    total_block_edits: totalEdit,
    predicate: predikat,
    parent_summary: catatan,
    mission_details: detail
  };
}

async function sinkronResumeOtomatis(updateUi = false) {
  if (!session || !namaAnak) return;
  const payload = buatObjekResume(true);
  const serialized = JSON.stringify(payload);
  if (!updateUi && serialized === lastSyncedSnapshot) return;

  const elStatus = $('res-status-db');
  if (!sb) {
    if (updateUi && elStatus) elStatus.textContent = '⚠️ Offline — sambungan Supabase tidak tersedia.';
    return;
  }

  if (updateUi && elStatus) elStatus.textContent = '☁️ Menyimpan resume ke Supabase...';
  try {
    const dbRow = { ...payload, updated_at: new Date().toISOString() };
    const { error } = await sb.from('game_resumes').upsert([dbRow], { onConflict: 'session_id' });
    if (!error) {
      lastSyncedSnapshot = serialized;
      if (updateUi && elStatus) elStatus.textContent = '✅ Resume berhasil tersimpan di database Supabase!';
    } else if (updateUi && elStatus) {
      elStatus.textContent = '⚠️ Gagal simpan ke Supabase: ' + error.message;
    }
  } catch (e) {
    if (updateUi && elStatus) elStatus.textContent = '⚠️ Koneksi bermasalah saat menyimpan resume.';
  }
}

function tampilkanResume(modeLogout = false) {
  const data = buatObjekResume(true);

  $('res-ikon-utama').textContent = data.completed_missions === LV.length ? '🏆' : '🌟';
  $('res-kode').textContent = '🕵️ Akun: ' + data.participant_id;
  $('res-judul').textContent = modeLogout ? 'Sesi Selesai — Resume Hasil Bermain' : 'Resume Misi Agen Data';
  $('res-gelar').textContent = data.predicate;
  $('res-bintang').textContent = selesai.map(x => x ? '⭐' : '☆').join('');
  $('res-stat-misi').textContent = data.completed_missions + ' / ' + LV.length;
  $('res-stat-waktu').textContent = data.total_duration_sec + ' dtk';
  $('res-stat-run').textContent = data.total_runs + 'x';
  $('res-stat-hint').textContent = data.total_hints + 'x';

  $('res-daftar-misi').innerHTML = data.mission_details.map((m, idx) => {
    const ikon = CERITA[m.mission_id].ikon;
    let statusBadge = 'Belum dicoba';
    let subInfo = 'Belajar: ' + m.konsep;

    if (m.selesai) {
      statusBadge = (m.hints <= 1 && m.runs <= 2) ? '⭐⭐⭐' : '⭐⭐';
      subInfo = 'Tuntas • ' + m.duration + ' dtk • ' + m.runs + 'x coba • ' + m.hints + 'x lampu';
    } else if (m.dicoba) {
      statusBadge = '⏳ Dicoba';
      subInfo = 'Belum tuntas • ' + m.duration + ' dtk • ' + m.runs + 'x coba • ' + m.hints + 'x lampu';
    }

    return (
      '<div class="resume-misi-item' + (m.selesai ? ' tuntas' : '') + '">' +
        '<div class="rm-kiri">' +
          '<span class="rm-ikon">' + ikon + '</span>' +
          '<div>' +
            '<strong>Misi ' + (idx + 1) + ': ' + m.judul + '</strong>' +
            '<small>' + subInfo + '</small>' +
          '</div>' +
        '</div>' +
        '<span class="rm-skor">' + statusBadge + '</span>' +
      '</div>'
    );
  }).join('');

  $('res-catatan').innerHTML = '<strong>💬 Catatan untuk Kamu & Orang Tua:</strong><br>' + data.parent_summary;
  $('layar-resume').classList.remove('sembunyi');

  sinkronResumeOtomatis(true);
}

function jalankan() {
  if (busy) return;
  nyalakanSuara();
  sorotBalok(null);
  const L = LV[cur];
  const jumlah = ws.getAllBlocks(false).filter(b => b.type !== 'mulai').length;
  const prog = ser(startBlock().getNextBlock());
  pesanPendek('', false);
  $('pesan').classList.add('sembunyi');

  if (L.max && jumlah > L.max) {
    bunyi.salah();
    animasiAvatar('goyang');
    bicara('Wah, baloknya kebanyakan nih!');
    pesanPendek('Maksimal ' + L.max + ' balok saja! 🧩', true);
    $('pesan').classList.remove('sembunyi');
    pesan('Wah, balokmu ada <b>' + jumlah + '</b>, padahal batasnya maksimal <b>' + L.max + ' balok</b>. Gunakan balok <b>🔁 ulangi</b> supaya ringkas ya! 💡', 'gagal');
    const terakhir = balokTerakhirRantai();
    if (terakhir) sorotBalok(terakhir.id, 'salah', '⚠️ Kebanyakan balok!');
    log({ event_type: 'run', program_snapshot: prog, execution_result: { ok: false, reason: 'over_limit', block_count: jumlah } });
    return;
  }

  const r = simulate(L, startBlock().getNextBlock());
  log({ event_type: 'run', program_snapshot: prog, execution_result: { ok: r.ok, stopped_at: r.fail ? r.fail.type : null, left: r.left } });
  busy = true;
  $('btnRun').disabled = true;
  $('pesan').classList.remove('sembunyi');
  pesan('Dio sedang bekerja... ⚙️', '');

  r.steps.forEach((st, i) => timers.push(setTimeout(() => {
    draw(st);
    sorotBalok(st.id, 'jalan');
    bicara(BICARA[st.t] || '...');
    bunyi.langkah();
  }, i * 450)));

  timers.push(setTimeout(() => {
    sorotBalok(null);
    busy = false;
    $('btnRun').disabled = false;

    if (r.ok) {
      const baru = !selesai[cur];
      selesai[cur] = true;
      const ada = cur < LV.length - 1;
      bicara('Yeay! Semua beres! 🎉');
      bunyi.sukses();
      animasiAvatar('loncat');
      $('pesan').classList.remove('sembunyi');

      if (!solved) {
        solved = true;
        endMission('solved');
      } else {
        simpanStateLokal();
        sinkronResumeOtomatis(false);
      }

      if (ada) {
        pesan('🎉 Hore, berhasil! Semua tugas telah beres.<br><br><button class="lanjut" id="btnLanjut">Lanjut misi berikutnya ➡️</button>', 'sukses');
        const n = cur + 1;
        $('btnLanjut').onclick = () => loadLevel(n);
      } else {
        log({ event_type: 'game_completed', execution_result: { participant_id: namaAnak } });
        flush();
        pesan(
          '🏆 Luar biasa! Kamu sudah menamatkan seluruh misi Dio!<br><br>' +
          '<button class="lanjut" id="btnLihatResume">📊 Lihat Resume Hasil Bermainku! 🏆</button>',
          'sukses'
        );
        $('btnLihatResume').onclick = () => tampilkanResume(false);
        timers.push(setTimeout(() => tampilkanResume(false), 1200));
      }
      segarkanTab(baru && ada ? cur + 1 : -1);
    } else if (r.fail) {
      bicara('Hmm, ada yang belum pas!');
      bunyi.salah();
      animasiAvatar('goyang');
      pesanPendek('Oops! Ada masalah 💥', true);
      $('pesan').classList.remove('sembunyi');
      pesan(r.fail.msg + ' Lihat balok yang menyala ✨ lalu coba kamu ubah.', 'gagal');
      if (r.fail.id) sorotBalok(r.fail.id, 'salah', '⚠️ Oops! Salah di sini!');
    } else {
      bicara('Masih ada yang tersisa nih.');
      bunyi.salah();
      animasiAvatar('goyang');
      pesanPendek('Masih ada dokumen sisa! 📄', true);
      $('pesan').classList.remove('sembunyi');
      pesan('Masih ada ' + r.left + ' dokumen yang belum beres. Yuk, susun baloknya lagi! 💪', 'gagal');
      const terakhir = balokTerakhirRantai();
      if (terakhir) sorotBalok(terakhir.id, 'salah', '⚠️ Kurang balok di sini!');
    }
  }, (r.steps.length + 1) * 450));
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && session) {
    simpanStateLokal();
    flush();
    sinkronResumeOtomatis(false);
  }
});

window.addEventListener('resize', () => {
  if (activeHighlight && activeHighlight.mode === 'salah') gambarOverlaySorotan();
});

function init() {
  const kecil = window.matchMedia('(max-width:700px)').matches;
  const tema = Blockly.Theme.defineTheme('anak', {
    base: Blockly.Themes.Classic,
    fontStyle: { family: 'Nunito', weight: '800', size: 13 },
    componentStyles: {
      workspaceBackgroundColour: '#ffffff',
      toolboxBackgroundColour: '#ffeef8',
      toolboxForegroundColour: '#5b3b6b',
      flyoutBackgroundColour: '#fff1f8',
      flyoutForegroundColour: '#5b3b6b'
    }
  });

  ws = Blockly.inject('blocklyDiv', {
    toolbox: { kind: 'categoryToolbox', contents: [] },
    media: 'https://cdn.jsdelivr.net/npm/blockly@10.4.3/media/',
    theme: tema,
    trashcan: true,
    scrollbars: true,
    horizontalLayout: kecil,
    toolboxPosition: 'start',
    zoom: { controls: true, startScale: kecil ? 0.9 : 1 }
  });

  ws.addChangeListener(e => {
    if (e.type === 'viewport_change' && activeHighlight && activeHighlight.mode === 'salah') {
      gambarOverlaySorotan();
    }
    if (e.type === 'drag' && e.isStart) {
      sorotBalok(null);
      const block = ws.getBlockById(e.blockId);
      if (block && block.nextConnection && block.nextConnection.targetBlock()) {
        block.nextConnection.disconnect();
      }
    }
    if (loading || e.isUiEvent || !EV.includes(e.type)) return;
    sorotBalok(null);
    const b = e.blockId && ws.getBlockById(e.blockId);
    log({ event_type: e.type, execution_result: { block: (b && b.type) || (e.oldJson && e.oldJson.type) || null } });
  });

  LV.forEach((l, i) => {
    const b = document.createElement('button');
    b.className = 'lv';
    b.textContent = l.nama;
    b.onclick = () => klikTab(i);
    $('tabs').appendChild(b);
  });

  $('btnRun').onclick = jalankan;
  setSuara(suaraOn);
  $('btnSuara').onclick = () => { nyalakanSuara(); setSuara(!suaraOn); };
  $('btnReset').onclick = () => {
    timers.forEach(clearTimeout);
    timers = [];
    busy = false;
    $('btnRun').disabled = false;
    setup();
    log({ event_type: 'reset' });
    simpanStateLokal();
  };
  $('btnLog').onclick = (e) => {
    e.preventDefault();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(LOG, null, 2)], { type: 'application/json' }));
    a.download = 'log_' + (session || 'lokal') + '.json';
    a.click();
  };

  // Tombol Resume & Logout
  $('btnResume').onclick = () => tampilkanResume(false);
  $('btnLogout').onclick = () => {
    if (busy) return;
    tampilkanResume(true);
  };
  $('btn-tutup-resume').onclick = () => $('layar-resume').classList.add('sembunyi');
  $('btn-konfirmasi-logout').onclick = async () => {
    log({ event_type: 'session_logout', execution_result: { completed_missions: selesai.filter(Boolean).length } });
    await flush();
    await sinkronResumeOtomatis(true);

    hapusStateLokal();
    session = '';
    namaAnak = '';
    LOG = [];
    sent = 0;
    selesai = LV.map(() => false);
    hasilMisi = {};
    lastSyncedSnapshot = '';
    selectAkun.value = '';

    $('nama-agen').classList.add('sembunyi');
    $('btnResume').classList.add('sembunyi');
    $('btnLogout').classList.add('sembunyi');
    $('layar-resume').classList.add('sembunyi');
    $('layar-masuk').classList.remove('sembunyi');
    status();
    loadLevel(0);
  };

  // Pulihkan sesi bila halaman di-refresh sebelum anak klik Logout
  const st = bacaStateLokal();
  if (st && st.session && st.namaAnak) {
    namaAnak = st.namaAnak;
    session = st.session;
    t0 = st.t0 || Date.now();
    LOG = Array.isArray(st.LOG) ? st.LOG : [];
    sent = typeof st.sent === 'number' ? st.sent : 0;
    selesai = Array.isArray(st.selesai) && st.selesai.length === LV.length ? st.selesai : LV.map(() => false);
    hasilMisi = st.hasilMisi || {};

    tampilkanBadgeHeader();
    status();
    loadLevel(st.cur || 0, {
      solved: !!st.solved,
      wsState: st.wsState || null,
      mStart: typeof st.mStart === 'number' ? st.mStart : LOG.length,
      mStartTime: typeof st.mStartTime === 'number' ? st.mStartTime : now(),
      mOpen: st.mOpen !== undefined ? st.mOpen : true
    });
    log({ event_type: 'page_reloaded' });
    flush();
  } else {
    status();
    loadLevel(0);
  }
}
(document.fonts ? document.fonts.ready : Promise.resolve()).then(init);