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
    $('#pilih').onchange = e => { tokoFilter = e.target.value; home(); };
  }
  home();
}

document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  b.dataset.p === 'home' ? home() : soon(b.textContent);
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
