// ===== ISI DUA BARIS INI (Supabase > Project Settings > API) =====
const SUPABASE_URL = 'https://rmzpsfpsgdobnfazzqun.supabase.co';
const SUPABASE_KEY = 'sb_publishable_w8xCMLvk85S1pBZ_qmXU_g_jzSNrJZU'; // kunci anon/publik, BUKAN service_role
// ==================================================================

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const rp = n => 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
const iso = d => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD (waktu lokal)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const METODE = ['cash', 'qris', 'transfer'];
const HIJAU = ['#0b6b3a', '#22a55a', '#3ecf8e'];
let me = null, tokoFilter = 'all', charts = [];

function show(id) { $('#login').hidden = id !== 'login'; $('#app').hidden = id !== 'app'; }

$('#f').onsubmit = async e => {
  e.preventDefault();
  $('#err').textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: $('#em').value, password: $('#pw').value });
  if (error) $('#err').textContent = 'Email atau password salah';
  else enter();
};
$('#out').onclick = async () => { await db.auth.signOut(); show('login'); };

async function enter() {
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (!data) { $('#err').textContent = 'Profil akun belum siap, hubungi admin'; return show('login'); }
  me = data;
  $('#toko').textContent = me.nama_toko;
  show('app');
  if (me.role === 'admin') {
    const { data: t } = await db.from('profiles').select('id,nama_toko').eq('role', 'toko').order('nama_toko');
    $('#pilih').innerHTML = '<option value="all">Semua Toko</option>' + (t || []).map(x => `<option value="${x.id}">${esc(x.nama_toko)}</option>`).join('');
    $('#pilih').hidden = false;
    $('#pilih').onchange = e => { tokoFilter = e.target.value; buka(cur); };
  }
  home();
}

let cur = 'home';
const HALAMAN = { home, beli };
const buka = (p, label) => { cur = p; (HALAMAN[p] || (() => soon(label)))(); };
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  buka(b.dataset.p, b.textContent);
});

function soon(nama) {
  charts.forEach(c => c.destroy()); charts = [];
  $('#view').innerHTML = `<div class="soon"><b>${esc(nama)}</b><br>Halaman ini dibangun di tahap berikutnya.</div>`;
}

async function home() {
  const hari = iso(new Date());
  const awal = iso(new Date(Date.now() - 6 * 864e5));
  const q = (t, kolom, tgl) => {
    let x = db.from(t).select(kolom);
    if (tgl) x = x.gte('tanggal', awal);
    return tokoFilter !== 'all' ? x.eq('toko_id', tokoFilter) : x;
  };
  const [j, b, p] = await Promise.all([
    q('penjualan', 'tanggal,qty,harga_satuan,hpp_satuan,metode', true),
    q('pembelian', 'tanggal,total_harga,metode', true),
    q('produk', 'nama,stok')
  ]);
  const jual = j.data || [], beli = b.data || [], produk = p.data || [];
  const jH = jual.filter(r => r.tanggal === hari), bH = beli.filter(r => r.tanggal === hari);
  const sum = (a, f) => a.reduce((s, r) => s + f(r), 0);
  const masuk = sum(jH, r => r.qty * r.harga_satuan);
  const keluar = sum(bH, r => r.total_harga);
  const laba = sum(jH, r => r.qty * (r.harga_satuan - r.hpp_satuan));
  const perMetode = METODE.map(m => ({
    m,
    masuk: sum(jH.filter(r => r.metode === m), r => r.qty * r.harga_satuan),
    keluar: sum(bH.filter(r => r.metode === m), r => r.total_harga)
  }));
  const hari7 = [...Array(7)].map((_, i) => iso(new Date(Date.now() - (6 - i) * 864e5)));

  $('#view').innerHTML = `
    <p class="tgl">${new Date().toLocaleDateString('id-ID', { dateStyle: 'full' })}</p>
    <div class="grid">
      <div class="card"><small>Pemasukan hari ini</small><b>${rp(masuk)}</b></div>
      <div class="card"><small>Pengeluaran hari ini</small><b>${rp(keluar)}</b></div>
      <div class="card hi"><small>Selisih</small><b>${rp(masuk - keluar)}</b></div>
      <div class="card hi"><small>Laba penjualan</small><b>${rp(laba)}</b></div>
    </div>
    <div class="box"><h3>Per metode pembayaran (hari ini)</h3>
      <canvas id="c1" height="170"></canvas>
      ${perMetode.map(x => `<div class="row"><span>${x.m.toUpperCase()}</span><span>+${rp(x.masuk)} / -${rp(x.keluar)}</span></div>`).join('')}
    </div>
    <div class="box"><h3>7 hari terakhir</h3><canvas id="c2" height="200"></canvas></div>
    <div class="box"><h3>Sisa produk belum terjual</h3>
      ${produk.length ? produk.map(x => `<div class="row"><span>${esc(x.nama)}</span><b>${x.stok}</b></div>`).join('') : '<div class="kosong">Belum ada produk.</div>'}
    </div>`;

  charts.forEach(c => c.destroy());
  charts = [
    new Chart($('#c1'), {
      type: 'doughnut',
      data: { labels: ['Cash', 'QRIS', 'Transfer'], datasets: [{ data: perMetode.map(x => x.masuk), backgroundColor: HIJAU, borderWidth: 0 }] },
      options: { plugins: { legend: { position: 'bottom' } }, cutout: '62%' }
    }),
    new Chart($('#c2'), {
      type: 'bar',
      data: {
        labels: hari7.map(d => d.slice(8) + '/' + d.slice(5, 7)),
        datasets: [
          { label: 'Pemasukan', backgroundColor: '#22a55a', borderRadius: 6, data: hari7.map(d => sum(jual.filter(r => r.tanggal === d), r => r.qty * r.harga_satuan)) },
          { label: 'Pengeluaran', backgroundColor: '#bbf7d0', borderRadius: 6, data: hari7.map(d => sum(beli.filter(r => r.tanggal === d), r => r.total_harga)) }
        ]
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: v => v >= 1e6 ? v / 1e6 + 'jt' : v >= 1e3 ? v / 1e3 + 'rb' : v } } } }
    })
  ];
}

(async () => {
  const { data: { session } } = await db.auth.getSession();
  session ? enter() : show('login');
})();

// ===== Notifikasi singkat =====
function toast(t) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = t;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2800);
}

// ===== Halaman BELI (pembelian bahan baku + master bahan) =====
async function beli() {
  charts.forEach(c => c.destroy()); charts = [];
  const admin = me.role === 'admin';
  let qb = db.from('bahan').select('id,nama,satuan,tipe,stok,harga_rata').order('nama');
  let qp = db.from('pembelian').select('tanggal,qty,total_harga,metode,bahan(nama,satuan)').order('created_at', { ascending: false }).limit(15);
  if (tokoFilter !== 'all') { qb = qb.eq('toko_id', tokoFilter); qp = qp.eq('toko_id', tokoFilter); }
  const [b, p] = await Promise.all([qb, qp]);
  const bahan = b.data || [], riwayat = p.data || [];

  const form = admin
    ? '<div class="note">Akun admin hanya untuk melihat. Untuk input, masuk dengan akun toko.</div>'
    : `<div class="box"><h3>Beli bahan</h3>
        <select id="bb">${bahan.length ? bahan.map(x => `<option value="${x.id}">${esc(x.nama)} (${esc(x.satuan)})</option>`).join('') : '<option value="">Tambah bahan dulu di bawah</option>'}</select>
        <input id="bq" type="number" inputmode="decimal" step="any" min="0" placeholder="Jumlah">
        <input id="bt" type="number" inputmode="numeric" min="0" placeholder="Total harga (Rp)">
        <select id="bm"><option value="cash">Cash</option><option value="qris">QRIS</option><option value="transfer">Transfer</option></select>
        <input id="bd" type="date" value="${iso(new Date())}">
        <button class="btn" id="sB">Simpan pembelian</button></div>
      <div class="box"><h3>Tambah bahan baru</h3>
        <input id="nn" placeholder="Nama bahan">
        <input id="ns" placeholder="Satuan (kg, liter, pcs)">
        <select id="nt"><option value="otomatis">Otomatis (berkurang saat produksi)</option><option value="manual">Manual (dikurangi lewat penyesuaian)</option></select>
        <button class="btn" id="sN">Tambah bahan</button></div>`;

  $('#view').innerHTML = form + `
    <div class="box"><h3>Stok bahan</h3>
      ${bahan.length ? bahan.map(x => `<div class="row"><span>${esc(x.nama)}<small>${x.tipe} · ${rp(x.harga_rata)}/${esc(x.satuan)}</small></span><b>${+x.stok.toFixed(2)} ${esc(x.satuan)}</b></div>`).join('') : '<div class="kosong">Belum ada bahan.</div>'}
    </div>
    <div class="box"><h3>Pembelian terakhir</h3>
      ${riwayat.length ? riwayat.map(x => `<div class="row"><span>${esc(x.bahan?.nama)}<small>${x.tanggal} · ${x.metode.toUpperCase()} · ${x.qty} ${esc(x.bahan?.satuan)}</small></span><b>${rp(x.total_harga)}</b></div>`).join('') : '<div class="kosong">Belum ada pembelian.</div>'}
    </div>`;
  if (admin) return;

  $('#sB').onclick = async () => {
    const qty = +$('#bq').value, total = +$('#bt').value;
    if (!$('#bb').value || qty <= 0 || total < 0 || !$('#bt').value) return toast('Lengkapi bahan, jumlah, dan total harga');
    const { error } = await db.rpc('catat_pembelian', { p_bahan: $('#bb').value, p_qty: qty, p_total: total, p_metode: $('#bm').value, p_tanggal: $('#bd').value });
    if (error) return toast(error.message);
    toast('Pembelian tersimpan'); beli();
  };
  $('#sN').onclick = async () => {
    const nama = $('#nn').value.trim(), satuan = $('#ns').value.trim();
    if (!nama || !satuan) return toast('Isi nama dan satuan bahan');
    const { error } = await db.from('bahan').insert({ nama, satuan, tipe: $('#nt').value });
    if (error) return toast(error.message);
    toast('Bahan ditambahkan'); beli();
  };
}
