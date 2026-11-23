import os
import json
import requests
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
from fpdf import FPDF

# =============================================================================
# 1. KONFIGURASI SUPABASE & LOGO
# =============================================================================
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://qxlhlwarmfgvkzibebcp.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "sb_publishable_E0CVVaHU7KRffuseLtQ-lg_rSPpFUMj")
TABEL_LOGS = "interaction_logs"
TABEL_RESUMES = "game_resumes"
BUCKET_RAPOR = "rapor-anak"

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH = os.path.join(BASE_DIR, "foto.jpg")

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}

# =============================================================================
# 2. AMBIL DATA & UNGGAH PDF KE SUPABASE STORAGE
# =============================================================================
def ambil_resume_terbaru(id_peserta):
    url = (
        f"{SUPABASE_URL}/rest/v1/{TABEL_RESUMES}"
        f"?select=*&participant_id=eq.{id_peserta}&order=updated_at.desc&limit=1"
    )
    r = requests.get(url, headers=HEADERS, timeout=25)
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None

def ambil_logs_sesi(session_id, id_peserta):
    if session_id:
        url = (
            f"{SUPABASE_URL}/rest/v1/{TABEL_LOGS}"
            f"?select=*&session_id=eq.{session_id}&order=id.asc"
        )
    else:
        url = (
            f"{SUPABASE_URL}/rest/v1/{TABEL_LOGS}"
            f"?select=*&session_id=ilike.{id_peserta}_%&order=id.asc"
        )
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return pd.DataFrame(r.json())

def unggah_pdf_ke_storage(path_file, nama_objek, session_id=None):
    url_upload = f"{SUPABASE_URL}/storage/v1/object/{BUCKET_RAPOR}/{nama_objek}"
    upload_headers = {
        **HEADERS,
        "Content-Type": "application/pdf",
        "x-upsert": "true"
    }
    with open(path_file, "rb") as f:
        r = requests.post(url_upload, headers=upload_headers, data=f, timeout=30)
    r.raise_for_status()

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET_RAPOR}/{nama_objek}"

    if session_id and session_id != "-":
        url_patch = f"{SUPABASE_URL}/rest/v1/{TABEL_RESUMES}?session_id=eq.{session_id}"
        patch_headers = {
            **HEADERS,
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        requests.patch(
            url_patch,
            headers=patch_headers,
            json={"report_url": public_url},
            timeout=20
        )

    return public_url

def parse_json_aman(val):
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str) and val.strip():
        try:
            return json.loads(val)
        except Exception:
            return {}
    return {}

def format_durasi(detik):
    detik = float(detik or 0)
    if detik < 60:
        return f"{detik:.1f} detik"
    menit = int(detik // 60)
    sisa = int(round(detik % 60))
    if sisa == 0:
        return f"{menit} menit"
    return f"{menit} menit {sisa} detik"

# =============================================================================
# 3. KELAS PDF HASIL EKSPLORASI ANAK (BERSIH, PROFESIONAL & MULTI-HALAMAN)
# =============================================================================
class PDFHasilAnak(FPDF):
    def header(self):
        # Garis aksen atas khas LiZra
        self.set_fill_color(91, 44, 111)
        self.rect(0, 0, 210, 3.5, 'F')
        self.set_fill_color(243, 156, 18)
        self.rect(0, 3.5, 210, 1.3, 'F')

        if self.page_no() == 1:
            ada_logo = os.path.exists(LOGO_PATH)
            if ada_logo:
                # Logo langsung menyatu bersih tanpa kotak bingkai
                self.image(LOGO_PATH, x=13, y=7.5, h=20)
                x_teks = 37
                align_teks = 'L'
            else:
                x_teks = 13
                align_teks = 'C'

            self.set_xy(x_teks, 8.5)
            self.set_text_color(91, 44, 111)
            self.set_font('Arial', 'B', 13.5)
            self.cell(0, 6.5, 'RINGKASAN HASIL EKSPLORASI & BELAJAR ANAK', 0, 1, align_teks)

            self.set_x(x_teks)
            self.set_text_color(230, 81, 0)
            self.set_font('Arial', 'B', 9.5)
            self.cell(0, 5, 'Permainan Edukasi "Dio si Agen Data"  |  Program Literasi Digital LiZra', 0, 1, align_teks)

            self.set_x(x_teks)
            self.set_text_color(115, 115, 115)
            self.set_font('Arial', '', 8.5)
            self.cell(0, 4.5, 'Catatan Perkembangan Logika Berpikir & Keamanan Data untuk Orang Tua / Pendamping', 0, 1, align_teks)

            self.set_draw_color(220, 204, 234)
            self.set_line_width(0.4)
            self.line(13, 30.5, 197, 30.5)
            self.set_y(34)
        else:
            # Header ringkas & profesional jika dokumen berlanjut ke halaman 2+
            self.set_xy(13, 7.5)
            self.set_text_color(91, 44, 111)
            self.set_font('Arial', 'B', 9)
            self.cell(125, 5, 'RINGKASAN HASIL EKSPLORASI & BELAJAR ANAK  |  Program Literasi Digital LiZra', 0, 0, 'L')
            self.set_text_color(120, 120, 120)
            self.set_font('Arial', '', 8.5)
            self.cell(0, 5, f'Lanjutan (Halaman {self.page_no()})', 0, 1, 'R')

            self.set_draw_color(220, 204, 234)
            self.set_line_width(0.35)
            self.line(13, 14, 197, 14)
            self.set_y(17.5)

        self.set_text_color(40, 40, 40)

    def footer(self):
        self.set_y(-12)
        self.set_draw_color(235, 228, 242)
        self.set_line_width(0.25)
        self.line(13, self.get_y() - 1, 197, self.get_y() - 1)
        self.set_font('Arial', 'I', 8)
        self.set_text_color(130, 130, 130)
        self.cell(
            0, 6,
            f'Dokumen Hasil Aktivitas Belajar LiZra  |  Dicetak pada {datetime.now().strftime("%d-%m-%Y %H:%M")}  |  Halaman {self.page_no()}',
            0, 0, 'C'
        )

    def cek_pindah_halaman(self, tinggi_butuh):
        if self.get_y() + tinggi_butuh > self.page_break_trigger:
            self.add_page()

    def judul_bagian(self, teks, tinggi_konten_berikut=22):
        self.cek_pindah_halaman(9 + tinggi_konten_berikut)
        self.set_fill_color(244, 232, 251)
        self.set_text_color(91, 44, 111)
        self.set_font('Arial', 'B', 10)
        self.cell(0, 7, f'  {teks}', 0, 1, 'L', True)
        self.set_text_color(40, 40, 40)
        self.ln(2)

# =============================================================================
# 4. PENGOLAHAN NARASI ORANG TUA & CETAK PDF
# =============================================================================
INFO_MISI = [
    ("L1", "Misi 1: Menyusun Urutan Langkah",
     "Memahami bahwa perintah dijalankan berurutan dari awal sampai akhir, yaitu mengambil tugas dulu lalu mengirimkannya."),
    ("L2", "Misi 2: Menyederhanakan Langkah Berulang",
     "Mengenali pekerjaan yang berulang dan meringkas perintah memakai balok ulangi maksimal 3 balok."),
    ("L3", "Misi 3: Memilah Data dengan Syarat Logika",
     "Mengambil keputusan otomatis menggunakan aturan jika foto masuk ke album dan kalau bukan masuk ke folder tugas."),
    ("L4", "Misi 4: Menjaga Keamanan & Privasi Data",
     "Menanamkan kesadaran keamanan digital agar dokumen rahasia berupa nilai ujian dikunci dengan sandi sebelum dikirim."),
    ("L5", "Misi 5: Menemukan & Memperbaiki Kesalahan",
     "Melatih ketelitian memeriksa alur program yang macet, menemukan bagian yang kurang, lalu memperbaikinya.")
]

def ringkasan_aktivitas_misi(m):
    selesai = bool(m.get("selesai"))
    durasi = format_durasi(m.get("duration", 0))
    run = int(m.get("runs", 0))
    hint = int(m.get("hints", 0))

    if selesai:
        if run <= 1 and hint == 0:
            return f"Tuntas dalam {durasi} pada percobaan pertama secara mandiri."
        if run > 1 and hint == 0:
            return f"Tuntas dalam {durasi} setelah {run} kali percobaan mandiri."
        return f"Tuntas dalam {durasi} melalui {run} kali percobaan dan {hint} kali melihat petunjuk."
    else:
        if hint > 0:
            return f"Bereksplorasi selama {durasi} melalui {run} kali percobaan dan {hint} kali melihat petunjuk."
        if run > 0:
            return f"Bereksplorasi selama {durasi} dengan {run} kali percobaan menyusun urutan balok."
        return f"Mulai mengamati tantangan selama {durasi}."

def rincian_aksi_balok(m):
    create = int(m.get("creates", 0))
    move = int(m.get("moves", 0))
    change = int(m.get("changes", 0))
    delete = int(m.get("deletes", 0))
    bagian = []
    if create > 0:
        bagian.append(f"memasang {create} balok baru")
    if move > 0:
        bagian.append(f"mengatur ulang {move} sambungan")
    if change > 0:
        bagian.append(f"mengubah {change} pilihan aturan")
    if delete > 0:
        bagian.append(f"melepas atau mengoreksi {delete} balok")
    if not bagian:
        return ""
    if len(bagian) == 1:
        return "Selama prosesnya, anak aktif " + bagian[0] + "."
    return "Selama prosesnya, anak aktif " + ", ".join(bagian[:-1]) + ", serta " + bagian[-1] + "."

def narasi_pergerakan_misi(kode_misi, m, panggilan):
    selesai = bool(m.get("selesai"))
    run = int(m.get("runs", 0))
    hint = int(m.get("hints", 0))

    if selesai:
        if run <= 1 and hint == 0:
            pembuka = f"{panggilan} menunjukkan pemahaman logika yang runut dan langsung berhasil menyusun perintah tanpa membuka bantuan."
        elif hint >= 1 and run <= 1:
            pembuka = f"{panggilan} tampak berhati-hati dan strategis dengan membaca petunjuk lebih dulu sebelum menjalankan program sehingga langsung berhasil."
        elif run > 1 and hint == 0:
            pembuka = f"{panggilan} belajar secara mandiri melalui {run} kali uji coba dan memperbaiki susunan baloknya sendiri hingga tuntas."
        else:
            pembuka = f"{panggilan} gigih mencoba beberapa kali dan memanfaatkan petunjuk dengan baik hingga menemukan susunan yang tepat."
    else:
        pembuka = (
            f"{panggilan} sudah mencoba tantangan ini sebanyak {run} kali uji coba untuk mencari urutan yang pas, "
            f"namun sesi berakhir sebelum susunan balok sepenuhnya tuntas."
        )

    detail_gerak = rincian_aksi_balok(m)
    if detail_gerak:
        pembuka += " " + detail_gerak

    if kode_misi == "L2" and selesai:
        pembuka += " Kemampuan meringkas 5 tugas ke dalam batas maksimal 3 balok sudah tercapai."
    elif kode_misi == "L4" and selesai:
        pembuka += " Kesadaran mengunci berkas rahasia sebelum pengiriman sudah diterapkan dengan baik."
    elif kode_misi == "L5" and selesai:
        pembuka += " Ketelitian melacak bagian perintah yang kosong dan melengkapinya terlihat menonjol."

    return pembuka

def susun_narasi_profil_ortu(panggilan, misi_tuntas, total_run, total_hint, total_gerak, total_delete):
    if misi_tuntas == 5:
        if total_hint <= 2 and total_run <= 7:
            gaya = (
                f"{panggilan} menunjukkan pola berpikir logis yang terstruktur dan mandiri. Selama bermain, {panggilan} "
                f"mampu merencanakan urutan perintah dengan cermat, minim bergantung pada bantuan, serta cepat memahami "
                f"efisiensi langkah dan perlindungan data rahasia."
            )
        elif total_hint > 3 and total_run <= 8:
            gaya = (
                f"{panggilan} memiliki gaya belajar yang teliti dan terencana. Sebelum menjalankan perintah, {panggilan} "
                f"memanfaatkan petunjuk yang tersedia untuk memastikan langkahnya tepat sehingga seluruh 5 misi selesai dengan baik."
            )
        else:
            gaya = (
                f"{panggilan} merupakan pembelajar yang aktif bereksplorasi dan pantang menyerah. Ketika susunan balok belum tepat, "
                f"{panggilan} mengamati tanda peringatan pada balok dan terus memperbaikinya hingga kelima misi tuntas."
            )
    elif misi_tuntas >= 1:
        gaya = (
            f"{panggilan} sudah berhasil menuntaskan {misi_tuntas} dari 5 tantangan dan mulai terbiasa menerjemahkan "
            f"instruksi menjadi susunan balok logika secara bertahap bersama Dio."
        )
    else:
        gaya = (
            f"{panggilan} berada pada tahap pengenalan awal ruang kerja balok Dio, mencoba menyusun perintah dasar "
            f"dan mengamati cara kerja robot saat menjalankan instruksi."
        )

    motorik = (
        f" Secara keseluruhan tercatat {total_gerak} kali interaksi penyusunan balok di layar"
        + (
            f", termasuk {total_delete} kali melepas atau mengoreksi balok untuk memperbaiki susunan, "
            f"yang mencerminkan proses evaluasi diri saat memecahkan masalah."
            if total_delete > 0 else "."
        )
    )
    return gaya + motorik

def buat_dokumen_hasil_pdf(id_peserta, nama_anak="", resume_row=None, df_logs=None):
    sesi_id = resume_row["session_id"] if resume_row else (df_logs["session_id"].iloc[-1] if df_logs is not None and not df_logs.empty else "-")
    misi_tuntas = int(resume_row["completed_missions"]) if resume_row else 0
    total_durasi = float(resume_row["total_duration_sec"]) if resume_row else 0.0
    total_run = int(resume_row["total_runs"]) if resume_row else 0
    total_hint = int(resume_row["total_hints"]) if resume_row else 0
    total_gerak = int(resume_row["total_block_edits"]) if resume_row else 0
    predikat = resume_row["predicate"] if resume_row else "Agen Data Pemula"
    detail_list = parse_json_aman(resume_row["mission_details"]) if resume_row else []
    detail_map = {item["mission_id"]: item for item in detail_list if isinstance(item, dict)}

    if not resume_row and df_logs is not None and not df_logs.empty:
        for kode, _, _ in INFO_MISI:
            sub = df_logs[df_logs["mission_id"] == kode]
            if sub.empty:
                continue
            end_rows = sub[sub["event_type"] == "mission_end"]
            selesai_m = False
            dur = round(float(sub["timestamp_rel"].max() - sub["timestamp_rel"].min()), 1)
            if not end_rows.empty:
                er = parse_json_aman(end_rows.iloc[-1].get("execution_result"))
                selesai_m = er.get("reason") == "solved"
                dur = float(er.get("duration", dur))
            runs_m = len(sub[sub["event_type"] == "run"])
            hints_m = len(sub[sub["event_type"] == "use_hint"])
            creates_m = len(sub[sub["event_type"] == "create"])
            moves_m = len(sub[sub["event_type"] == "move"])
            deletes_m = len(sub[sub["event_type"] == "delete"])
            changes_m = len(sub[sub["event_type"] == "change"])
            edits_m = creates_m + moves_m + deletes_m + changes_m

            detail_map[kode] = {
                "mission_id": kode,
                "selesai": selesai_m,
                "dicoba": True,
                "duration": dur,
                "runs": runs_m,
                "hints": hints_m,
                "creates": creates_m,
                "moves": moves_m,
                "deletes": deletes_m,
                "changes": changes_m,
                "edits": edits_m
            }
            if selesai_m:
                misi_tuntas += 1
            total_durasi += dur
            total_run += runs_m
            total_hint += hints_m
            total_gerak += edits_m

    total_delete = sum(int(v.get("deletes", 0)) for v in detail_map.values())
    panggilan = f"Ananda {nama_anak}" if nama_anak else f"Ananda (Peserta {id_peserta})"
    ringkasan_ortu = susun_narasi_profil_ortu(
        panggilan, misi_tuntas, total_run, total_hint, total_gerak, total_delete
    )

    pdf = PDFHasilAnak()
    pdf.set_margins(13, 10, 13)
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.add_page()

    # 1. IDENTITAS PESERTA & RINGKASAN HASIL
    pdf.judul_bagian("1. IDENTITAS PESERTA & RINGKASAN HASIL", 34)
    y_id = pdf.get_y()
    pdf.set_fill_color(250, 247, 253)
    pdf.set_draw_color(232, 218, 239)
    pdf.rect(13, y_id, 184, 14.5, 'DF')

    pdf.set_xy(16, y_id + 1.8)
    pdf.set_font('Arial', '', 9.2)
    label_nama = nama_anak if nama_anak else f"Peserta {id_peserta}"
    pdf.cell(28, 5.2, "Nama Anak", 0, 0)
    pdf.set_font('Arial', 'B', 9.2)
    pdf.cell(64, 5.2, f": {label_nama}", 0, 0)

    pdf.set_font('Arial', '', 9.2)
    pdf.cell(27, 5.2, "Kode Akun", 0, 0)
    pdf.set_font('Arial', 'B', 9.2)
    pdf.cell(0, 5.2, f": {id_peserta} (Sesi {sesi_id})", 0, 1)

    pdf.set_x(16)
    pdf.set_font('Arial', '', 9.2)
    status_ringkas = "Tuntas Semua" if misi_tuntas == 5 else "Tahap Awal"
    pdf.cell(28, 5.2, "Capaian Misi", 0, 0)
    pdf.set_font('Arial', 'B', 9.2)
    pdf.cell(64, 5.2, f": {misi_tuntas} dari 5 Misi ({status_ringkas})", 0, 0)

    pdf.set_font('Arial', '', 9.2)
    pdf.cell(27, 5.2, "Julukan Agen", 0, 0)
    pdf.set_font('Arial', 'B', 9.2)
    pdf.set_text_color(91, 44, 111)
    pdf.cell(0, 5.2, f": {predikat}", 0, 1)
    pdf.set_text_color(40, 40, 40)

    pdf.set_y(y_id + 17.5)

    # 4 Kotak Metrik Utama
    metrik = [
        ("Durasi Eksplorasi", format_durasi(total_durasi)),
        ("Percobaan Program", f"{total_run} kali"),
        ("Bantuan Petunjuk", f"{total_hint} kali"),
        ("Interaksi Balok", f"{total_gerak} kali")
    ]
    w_box = 43.5
    x_start = 13
    y_box = pdf.get_y()
    for idx, (judul_m, nilai_m) in enumerate(metrik):
        x = x_start + idx * (w_box + 3.33)
        pdf.set_fill_color(255, 249, 242)
        pdf.set_draw_color(243, 156, 18)
        pdf.rect(x, y_box, w_box, 14.5, 'DF')
        pdf.set_xy(x, y_box + 1.8)
        pdf.set_font('Arial', '', 7.8)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(w_box, 4.5, judul_m, 0, 2, 'C')
        pdf.set_font('Arial', 'B', 10)
        pdf.set_text_color(91, 44, 111)
        pdf.cell(w_box, 6.2, nilai_m, 0, 0, 'C')
    pdf.set_text_color(40, 40, 40)
    pdf.set_y(y_box + 18)

    # 2. GAMBARAN POLA BELAJAR ANAK
    pdf.judul_bagian("2. GAMBARAN POLA BELAJAR & PENYUSUNAN LOGIKA", 24)
    pdf.set_font('Arial', '', 9.5)
    pdf.multi_cell(0, 5, ringkasan_ortu)
    pdf.ln(3)

    # 3. CATATAN PERKEMBANGAN TIAP MISI (1 - 5)
    pdf.judul_bagian("3. CATATAN PERKEMBANGAN TIAP MISI (MISI 1 - 5)", 26)
    for kode, judul_misi, kompetensi in INFO_MISI:
        m = detail_map.get(kode)
        sudah_main = bool(m and (m.get("selesai") or m.get("dicoba")))

        # Pastikan tiap item misi pindah halaman secara utuh jika ruang di bawah tinggal sedikit
        pdf.cek_pindah_halaman(30 if sudah_main else 17)

        pdf.set_font('Arial', 'B', 9.5)
        pdf.set_text_color(91, 44, 111)

        if m and m.get("selesai"):
            status_txt = "TUNTAS"
            warna_status = (46, 125, 50)
        elif m and m.get("dicoba"):
            status_txt = "DICOBA (BELUM TUNTAS)"
            warna_status = (230, 81, 0)
        else:
            status_txt = "BELUM DIMAINKAN"
            warna_status = (150, 150, 150)

        pdf.cell(132, 5.2, judul_misi, 0, 0, 'L')
        pdf.set_text_color(*warna_status)
        pdf.cell(0, 5.2, f"[{status_txt}]", 0, 1, 'R')
        pdf.set_text_color(40, 40, 40)

        pdf.set_font('Arial', 'I', 8.5)
        pdf.set_text_color(95, 95, 95)
        pdf.multi_cell(0, 4.3, f"Fokus belajar: {kompetensi}")
        pdf.set_text_color(40, 40, 40)

        if not sudah_main:
            pdf.set_font('Arial', '', 9)
            pdf.set_text_color(120, 120, 120)
            pdf.cell(0, 4.8, "  Misi ini belum sempat dimainkan pada sesi ini.", 0, 1)
            pdf.set_text_color(40, 40, 40)
            pdf.ln(1.8)
            continue

        pdf.set_font('Arial', 'B', 8.8)
        pdf.set_text_color(70, 70, 70)
        pdf.multi_cell(0, 4.6, f"  Ringkasan sesi: {ringkasan_aktivitas_misi(m)}")
        pdf.set_text_color(40, 40, 40)

        pdf.set_font('Arial', '', 9)
        pdf.multi_cell(0, 4.7, f"  Hasil pengamatan: {narasi_pergerakan_misi(kode, m, panggilan)}")
        pdf.ln(2)

    # 4. SARAN PENDAMPINGAN ORANG TUA DI RUMAH (Pindah halaman utuh jika tidak muat)
    pdf.judul_bagian("4. SARAN OBROLAN & PENDAMPINGAN DI RUMAH", 36)
    pdf.set_font('Arial', '', 9.2)
    if misi_tuntas < 5:
        rekomendasi = (
            f"1. Berikan apresiasi atas keberanian {panggilan} mencoba tantangan logika hingga misi ke-{max(1, misi_tuntas)} tanpa harus terburu-buru menamatkan semuanya sekaligus.\n"
            f"2. Ajak {panggilan} bercerita bagian mana yang paling seru atau menantang saat memandu Dio menyusun balok perintah.\n"
            f"3. Latih kebiasaan berpikir runut di rumah melalui kegiatan sederhana, seperti menyusun urutan persiapan sekolah."
        )
    else:
        rekomendasi = (
            f"1. Apresiasi ketekunan {panggilan} karena berhasil menuntaskan seluruh 5 misi logika dan keamanan data bersama Dio.\n"
            f"2. Hubungkan pengalaman Misi 4 (mengunci dokumen rahasia) dengan kebiasaan menjaga PIN, kata sandi, dan data pribadi keluarga.\n"
            f"3. Dukung minat {panggilan} dalam memecahkan teka-teki logika maupun aktivitas pemrograman visual yang aman dan kreatif."
        )
    pdf.multi_cell(0, 4.9, rekomendasi)

    nama_file = f"Hasil_Aktivitas_Anak_{id_peserta}.pdf"
    path_output = os.path.join(BASE_DIR, nama_file)
    pdf.output(path_output)
    print(f"\nFile lokal tersimpan: {path_output}")

    try:
        link_publik = unggah_pdf_ke_storage(path_output, nama_file, sesi_id)
        print("Berhasil diunggah ke Supabase Storage!")
        print(f"Link Hasil Aktivitas Anak: {link_publik}")
    except Exception as e:
        print(f"File lokal aman, tapi gagal unggah ke Storage Supabase: {e}")

# =============================================================================
# 5. PROGRAM UTAMA
# =============================================================================
if __name__ == "__main__":
    target_id = input("Masukkan Kode Akun Peserta (Contoh: P01): ").strip().upper()
    nama_opsional = input("Masukkan Nama Anak dari Sheet (Tekan Enter jika dikosongkan): ").strip()

    print(f"\nMengambil data aktivitas untuk {target_id} dari Supabase...")
    try:
        resume_data = ambil_resume_terbaru(target_id)
        sesi_target = resume_data["session_id"] if resume_data else None
        df_logs = ambil_logs_sesi(sesi_target, target_id)

        if not resume_data and df_logs.empty:
            print(f"Data untuk '{target_id}' belum ditemukan di Supabase.")
        else:
            buat_dokumen_hasil_pdf(target_id, nama_opsional, resume_data, df_logs)
    except Exception as e:
        print(f"Terjadi kesalahan saat mengambil atau mengolah data: {e}")