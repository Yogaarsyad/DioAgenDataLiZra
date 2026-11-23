/* pengantar.js
   1) Layar pengantar "cara main" sebelum anak memilih akun.
      Alur: Selamat Datang -> Pengantar (6 halaman) -> Pilih Akun -> Main.
      Tombol ❓ di header membuka pengantar yang sama kapan saja saat bermain.
   2) Menu klik kanan balok dibuat sederhana (hanya Gandakan dan Hapus). */
(function () {
  'use strict';
  var g = function (id) { return document.getElementById(id); };

  /* ---------- Menu klik kanan yang sederhana ---------- */
  (function sederhanakanMenu() {
    if (typeof Blockly === 'undefined' || !Blockly.ContextMenuRegistry) return;
    var daftar = Blockly.ContextMenuRegistry.registry;
    // Balok: sembunyikan Komentar, Ciutkan, Nonaktifkan (sisa: Gandakan dan Hapus).
    // Area kosong: sembunyikan Ciutkan semua, Bentangkan semua, Rapikan.
    ['blockComment', 'blockCollapseExpand', 'blockDisable', 'blockInline', 'blockHelp',
     'collapseWorkspace', 'expandWorkspace', 'cleanWorkspace'].forEach(function (id) {
      try { daftar.unregister(id); } catch (e) { /* menu itu memang tidak ada, abaikan */ }
    });
  })();

  /* ---------- Isi pengantar ---------- */
  var HALAMAN = [
    { judul: 'Kenalan sama Dio!',
      teks: 'Halo! Ini Dio, robot penolong. Dio bekerja mengurus tugas sekolah dan foto di komputer. 📄📷',
      adegan: '<div class="adg"><span class="melayang kiri">📄</span><span class="melayang kanan">📷</span><div class="gel">Halo!</div><div class="dio-besar">🤖</div></div>' },

    { judul: 'Kamu jadi bosnya Dio!',
      teks: 'Dio hanya bergerak kalau ada perintah. Perintahnya berbentuk balok, seperti mainan susun. Seret balok dari kotak balok, lalu sambung di bawah balok ▶ Mulai.',
      adegan: '<div class="adg adg-balok"><div class="blk mulai" style="--i:0">▶ Mulai</div><div class="blk ambil" style="--i:1">📥 ambil</div><div class="blk kirim" style="--i:2">✉️ kirim</div></div>' },

    { judul: 'Tekan tombol Jalankan!',
      teks: 'Kalau balokmu sudah tersusun, tekan ▶ Jalankan. Dio akan mengerjakannya satu per satu, dari atas ke bawah. Kalau belum pas, tidak apa-apa! Lihat balok yang menyala ✨, ubah, lalu coba lagi.',
      adegan: '<div class="adg adg-jalan"><div class="tombol-mini">▶ Jalankan!</div><div class="sabuk"></div><span class="barang">📄</span><span class="rob">🤖</span><span class="tujuan">📬</span><span class="eti e1">ban berjalan</span><span class="eti e2">Dio</span><span class="eti e3">tujuan</span></div>' },

    { judul: 'Memindah dan menghapus balok',
      teks: 'Seret satu balok untuk memindahkannya, balok di bawahnya tidak ikut. Mau menghapus? Di komputer, klik kanan balok lalu pilih Hapus Blok, atau seret ke tempat sampah 🗑️. Di HP, tekan balok agak lama lalu pilih Hapus Blok. Pilih Gandakan untuk membuat balok yang sama lagi.',
      adegan: '<div class="adg adg-hapus"><div class="blk-pindah">📥 ambil</div><span class="sampah">🗑️</span><span class="cara c1">🖱️ komputer: klik kanan</span><span class="cara c2">👆 HP: tekan lama</span></div>' },

    { judul: 'Butuh petunjuk? Pakai lampu!',
      teks: 'Kalau bingung, tekan lampu 💡 di kartu misi. Petunjuk muncul selama 5 detik lalu hilang sendiri. Mau melihatnya lagi? Tekan lampunya sekali lagi.',
      adegan: '<div class="adg adg-petunjuk"><span class="lampu-besar">💡</span><div class="gel-petunjuk">Petunjuk hilang dalam <span class="hitung"><b style="--i:0">5</b><b style="--i:1">4</b><b style="--i:2">3</b><b style="--i:3">2</b><b style="--i:4">1</b></span> detik</div></div>' },

    { judul: 'Ada 5 misi seru!',
      teks: 'Misi 1 Urutan, Misi 2 Ulangi, Misi 3 Jika, Misi 4 Gembok, dan Misi 5 Perbaiki. Selesaikan satu misi dulu, baru misi berikutnya terbuka! 🔓',
      adegan: '<div class="adg adg-misi">' +
        '<div class="lencana" style="--i:0">🚶<b>Misi 1</b><small>Urutan</small></div>' +
        '<div class="lencana" style="--i:1">🔁<b>Misi 2</b><small>Ulangi</small></div>' +
        '<div class="lencana" style="--i:2">🤔<b>Misi 3</b><small>Jika</small></div>' +
        '<div class="lencana" style="--i:3">🔒<b>Misi 4</b><small>Gembok</small></div>' +
        '<div class="lencana" style="--i:4">🔧<b>Misi 5</b><small>Perbaiki</small></div></div>' }
  ];

  var idx = 0;

  function sudahMain() { return typeof session !== 'undefined' && !!session; }
  function bukaLayar(idTutup, idBuka) {
    g(idTutup).classList.add('sembunyi');
    g(idBuka).classList.remove('sembunyi');
  }

  function gambar() {
    var h = HALAMAN[idx], titik = '';
    for (var i = 0; i < HALAMAN.length; i++) titik += '<span' + (i === idx ? ' class="on"' : '') + '></span>';
    g('pg-titik').innerHTML = titik;
    g('pg-adegan').innerHTML = h.adegan;
    g('pg-judul').textContent = h.judul;
    g('pg-teks').textContent = h.teks;
    var akhir = idx === HALAMAN.length - 1;
    g('pg-kembali').classList.toggle('sembunyi', idx === 0);
    g('pg-lanjut').textContent = akhir ? (sudahMain() ? 'Mengerti! ✔️' : 'Aku siap! 🚀') : 'Lanjut ▶';
    g('pg-lewati').classList.toggle('sembunyi', akhir);
  }

  // Selesai membaca: kalau belum main, lanjut ke pilih akun; kalau sedang main, kembali ke gim.
  function selesai() {
    if (sudahMain()) { g('layar-pengantar').classList.add('sembunyi'); return; }
    bukaLayar('layar-pengantar', 'layar-masuk');
    var pilih = g('select-akun') || g('input-nama');
    if (pilih) pilih.focus();
  }

  function maju() { if (idx < HALAMAN.length - 1) { idx++; gambar(); } else selesai(); }
  function mundur() { if (idx > 0) { idx--; gambar(); } }

  // "Mulai Main" sekarang membuka pengantar dulu, bukan langsung pilih akun.
  g('btn-lanjut-intro').onclick = function () {
    bukaLayar('layar-intro', 'layar-pengantar');
    idx = 0; gambar();
    if (typeof nyalakanSuara === 'function') nyalakanSuara();
  };
  // Tombol ❓ di header: buka pengantar kapan saja.
  var bantuan = g('btnBantuan');
  if (bantuan) bantuan.onclick = function () {
    g('layar-pengantar').classList.remove('sembunyi');
    idx = 0; gambar();
  };
  g('pg-lanjut').onclick = maju;
  g('pg-kembali').onclick = mundur;
  g('pg-lewati').onclick = selesai;

  document.addEventListener('keydown', function (e) {
    if (g('layar-pengantar').classList.contains('sembunyi')) return;
    if (e.key === 'ArrowRight') maju();
    else if (e.key === 'ArrowLeft') mundur();
    else if (e.key === 'Escape' && sudahMain()) g('layar-pengantar').classList.add('sembunyi');
  });
})();