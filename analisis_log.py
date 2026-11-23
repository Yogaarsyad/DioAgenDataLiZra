import os
import requests
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from dotenv import load_dotenv

# =============================================================================
# 1. KONFIGURASI
# =============================================================================
load_dotenv()
SUPABASE_URL = "https://qxlhlwarmfgvkzibebcp.supabase.co"
SUPABASE_KEY = "sb_publishable_E0CVVaHU7KRffuseLtQ-lg_rSPpFUMj"
TABEL = "interaction_logs"
MISI = ["L1", "L2", "L3", "L4", "L5"]

if not SUPABASE_URL or not SUPABASE_KEY:
    raise SystemExit("SUPABASE_URL / SUPABASE_KEY belum diisi di file .env")

# =============================================================================
# 2. AMBIL DATA (dengan paginasi, karena Supabase membatasi 1000 baris/permintaan)
# =============================================================================
def ambil_semua_data(tabel, ukuran_halaman=1000):
    headers = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    hasil, offset = [], 0
    while True:
        url = (f"{SUPABASE_URL}/rest/v1/{tabel}"
               f"?select=*&limit={ukuran_halaman}&offset={offset}")
        r = requests.get(url, headers=headers, timeout=30)
        r.raise_for_status()
        halaman = r.json()
        hasil.extend(halaman)
        if len(halaman) < ukuran_halaman:
            break
        offset += ukuran_halaman
    return hasil

print("Mengambil data dari Supabase...")
df = pd.DataFrame(ambil_semua_data(TABEL))
if df.empty:
    raise SystemExit("Tabel interaction_logs masih kosong.")
print(f"Berhasil mengambil {len(df)} baris, {df['session_id'].nunique()} sesi.")

df = df[df["mission_id"].isin(MISI)].copy()

# =============================================================================
# 3. OLAH DATA (satu nilai per sesi per misi)
# =============================================================================
# Hanya sesi yang benar-benar mengerjakan suatu misi yang dihitung untuk misi itu
pasangan = df.groupby(["session_id", "mission_id"]).size().index

def hitung_per_sesi(jenis_event):
    s = (df[df["event_type"] == jenis_event]
         .groupby(["session_id", "mission_id"]).size())
    return s.reindex(pasangan, fill_value=0).rename("nilai").reset_index()

data_hint = hitung_per_sesi("use_hint")
data_run = hitung_per_sesi("run")
data_waktu = (df.groupby(["session_id", "mission_id"])["timestamp_rel"]
                .max().rename("nilai").reset_index())

# =============================================================================
# 4. GRAFIK
# =============================================================================
sns.set_theme(style="whitegrid", font_scale=1.1)
plt.rcParams["font.family"] = "sans-serif"
plt.rcParams["font.sans-serif"] = ["Arial", "DejaVu Sans"]

def gambar_panel(ax, data, judul, ylabel, warna, satuan):
    ringkas = (data.groupby("mission_id")["nilai"]
                   .agg(["mean", "std", "count"]).reindex(MISI))
    rerata = ringkas["mean"].fillna(0)
    sd = ringkas["std"].fillna(0)
    x = np.arange(len(MISI))

    ax.bar(x, rerata, width=0.6, color=warna, edgecolor="black",
           linewidth=0.8, alpha=0.85, zorder=2)
    ax.errorbar(x, rerata, yerr=sd, fmt="none", ecolor="black",
                capsize=4, linewidth=1.2, zorder=3)

    # Titik = nilai tiap sesi (penting karena jumlah peserta sedikit)
    rng = np.random.default_rng(0)
    batas_atas = []
    for i, m in enumerate(MISI):
        v = data.loc[data["mission_id"] == m, "nilai"]
        ax.scatter(i + rng.uniform(-0.12, 0.12, len(v)), v, s=22,
                   color="black", alpha=0.7, zorder=4)
        batas_atas.append(max(rerata.iloc[i] + sd.iloc[i],
                              v.max() if len(v) else 0))

    ymax = max(batas_atas) if max(batas_atas) > 0 else 1
    for i in range(len(MISI)):
        ax.text(i, batas_atas[i] + ymax * 0.03, f"{rerata.iloc[i]:.1f}{satuan}",
                ha="center", va="bottom", fontsize=11, fontweight="bold")

    ax.set_ylim(0, ymax * 1.18)
    ax.set_xticks(x)
    ax.set_xticklabels([f"{m}\n(n={int(ringkas['count'].iloc[i]) if not np.isnan(ringkas['count'].iloc[i]) else 0})"
                        for i, m in enumerate(MISI)])
    ax.set_title(judul, fontsize=13, fontweight="bold", pad=10)
    ax.set_ylabel(ylabel)
    ax.set_xlabel("Kode Misi")
    ax.grid(axis="x", visible=False)

fig, axes = plt.subplots(1, 3, figsize=(16, 5.8))

gambar_panel(axes[0], data_hint, "(A) Penggunaan Bantuan",
             "Jumlah klik bantuan per sesi", "#56B4E9", "x")
gambar_panel(axes[1], data_run, "(B) Percobaan Menjalankan Program",
             "Jumlah percobaan per sesi", "#E69F00", "x")
gambar_panel(axes[2], data_waktu, "(C) Waktu Penyelesaian",
             "Durasi (detik)", "#009E73", " s")

fig.suptitle("Evaluasi Kinerja Peserta pada Modul Gamifikasi Literasi Digital",
             fontsize=16, fontweight="bold", y=1.02)
fig.text(0.5, -0.03,
         f"Batang = rata-rata per misi, garis = standar deviasi, titik = nilai tiap sesi. "
         f"Total {df['session_id'].nunique()} sesi; n = jumlah sesi yang mengerjakan misi tersebut.",
         ha="center", fontsize=10, style="italic")

plt.tight_layout()
plt.savefig("grafik_evaluasi_skripsi.png", dpi=300, bbox_inches="tight")
plt.savefig("grafik_evaluasi_skripsi.pdf", bbox_inches="tight")  # vektor, untuk Word/LaTeX
print("Tersimpan: grafik_evaluasi_skripsi.png dan .pdf")
plt.show()