// Konfigurasi Supabase ada di config.js

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = s => document.querySelector(s);
const rp = n => 'Rp' + Math.round(n || 0).toLocaleString('id-ID');
const iso = d => d.toLocaleDateString('sv-SE'); // YYYY-MM-DD (waktu lokal)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const METODE = ['cash', 'qris', 'transfer'];
const HIJAU = ['#3D5C42', '#6F9276', '#D2DCC4'];
let me = null, tokoFilter = 'all', charts = [];

function show(id) { $('#login').hidden = id !== 'login'; $('#app').hidden = id !== 'app'; }

$('#f').onsubmit = async e => {
  e.preventDefault();
  $('#err').textContent = '';
  const { error } = await db.auth.signInWithPassword({ email: $('#em').value, password: $('#pw').value });
  if (error) $('#err').textContent = 'Email atau password salah';
  else enter();
};
$('#keluar').onclick = async () => { await db.auth.signOut(); $('#sheet').hidden = true; show('login'); };

async function enter() {
  const { data: { user } } = await db.auth.getUser();
  const { data } = await db.from('profiles').select('*').eq('id', user.id).single();
  if (!data) { $('#err').textContent = 'Profil akun belum siap, hubungi admin'; return show('login'); }
  me = data; me.email = user.email;
  $('#toko').textContent = me.nama_toko;
  tampilAvatar();
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
const HALAMAN = { home, beli, produksi, jual, stok };
const buka = (p, label) => { cur = p; (HALAMAN[p] || (() => soon(label)))(); };
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button').forEach(x => x.classList.toggle('on', x === b));
  buka(b.dataset.p, b.textContent);
});

function soon(nama) {
  charts.forEach(c => c.destroy()); charts = [];
  $('#view').innerHTML = `<div class="soon"><b>${esc(nama)}</b><br>Halaman ini dibangun di tahap berikutnya.</div>`;
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
  let qp = db.from('pembelian').select('id,tanggal,qty,total_harga,metode,bahan(nama,satuan)').order('created_at', { ascending: false }).limit(15);
  if (tokoFilter !== 'all') { qb = qb.eq('toko_id', tokoFilter); qp = qp.eq('toko_id', tokoFilter); }
  const [b, p] = await Promise.all([qb, qp]);
  const bahan = b.data || [], riwayat = p.data || [];

  const form = admin
    ? '<div class="note">Akun admin hanya untuk melihat. Untuk input, masuk dengan akun toko.</div>'
    : `${tabBar(['Beli bahan', 'Bahan baru'])}<div class="box pane c1" data-t="0"><h3>Beli bahan</h3>
        <label>Pilih bahan</label><select id="bb">${bahan.length ? bahan.map(x => `<option value="${x.id}">${esc(x.nama)} (${esc(x.satuan)})</option>`).join('') : '<option value="">Tambah bahan dulu di bawah</option>'}</select>
        <label>Jumlah dibeli</label><input id="bq" type="number" inputmode="decimal" step="any" min="0" placeholder="Jumlah">
        <label>Total harga (Rp)</label><input id="bt" type="number" inputmode="numeric" min="0" placeholder="Total harga (Rp)">
        <label>Metode pembayaran</label><select id="bm"><option value="cash">Cash</option><option value="qris">QRIS</option><option value="transfer">Transfer</option></select>
        <label>Tanggal</label><input id="bd" type="date" value="${iso(new Date())}">
        <button class="btn" id="sB">Simpan pembelian</button></div>
      <div class="box pane c2" data-t="1"><h3>Tambah bahan baru</h3>
        <label>Nama bahan</label><input id="nn" placeholder="Nama bahan">
        <label>Satuan</label><input id="ns" placeholder="Satuan (kg, liter, pcs)">
        <label>Tipe bahan</label><select id="nt"><option value="otomatis">Otomatis (berkurang saat produksi)</option><option value="manual">Manual (dikurangi lewat penyesuaian)</option></select>
        <button class="btn" id="sN">Tambah bahan</button></div>`;

  $('#view').innerHTML = form + `
    <div class="box"><h3>Stok bahan</h3>
      ${bahan.length ? bahan.map(x => `<div class="row"${ed('bahan', x.id)}><span>${esc(x.nama)}<br><small>${x.tipe} · ${rp(x.harga_rata)}/${esc(x.satuan)}</small></span><b class="${x.stok <= 0 ? 'neg' : ''}">${+x.stok.toFixed(2)} ${esc(x.satuan)}</b></div>`).join('') : '<div class="kosong">Belum ada bahan.</div>'}
    </div>
    <div class="box"><h3>Pembelian terakhir</h3>
      ${riwayat.length ? riwayat.map(x => `<div class="row"${bt('pembelian', x.id)}><span>${esc(x.bahan?.nama)}<br><small>${x.tanggal} · ${x.metode.toUpperCase()} · ${x.qty} ${esc(x.bahan?.satuan)}</small></span><b>${rp(x.total_harga)}</b></div>`).join('') : '<div class="kosong">Belum ada pembelian.</div>'}
    </div>`;
  initTabs('beli');
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

// ===== Halaman PRODUKSI (produk, resep, catat produksi) =====
async function produksi() {
  charts.forEach(c => c.destroy()); charts = [];
  const admin = me.role === 'admin';
  const f = (t, k, ord, extra) => {
    let x = db.from(t).select(k);
    if (tokoFilter !== 'all') x = x.eq('toko_id', tokoFilter);
    if (extra) x = x.eq(extra[0], extra[1]);
    return x.order(ord.c, ord.opt || {});
  };
  const [pr, bh, rs, hs] = await Promise.all([
    f('produk', 'id,nama,harga_jual,stok,hpp_rata', { c: 'nama' }),
    f('bahan', 'id,nama,satuan', { c: 'nama' }, ['tipe', 'otomatis']),
    f('resep', 'produk_id,takaran,bahan(nama,satuan)', { c: 'produk_id' }),
    f('produksi', 'id,tanggal,qty,hpp_satuan,produk(nama)', { c: 'created_at', opt: { ascending: false } }).limit(10)
  ]);
  const produk = pr.data || [], bahan = bh.data || [], resep = rs.data || [], riwayat = hs.data || [];
  const optP = produk.length ? produk.map(x => `<option value="${x.id}">${esc(x.nama)}</option>`).join('') : '<option value="">Tambah produk dulu</option>';
  const optB = bahan.length ? bahan.map(x => `<option value="${x.id}">${esc(x.nama)} (${esc(x.satuan)})</option>`).join('') : '<option value="">Belum ada bahan tipe Otomatis</option>';

  const forms = admin
    ? '<div class="note">Akun admin hanya untuk melihat. Untuk input, masuk dengan akun toko.</div>'
    : `${tabBar(['Catat produksi', 'Produk baru', 'Resep'])}<div class="box pane c1" data-t="0"><h3>Catat produksi</h3>
        <label>Pilih produk</label><select id="pp">${optP}</select>
        <label>Jumlah diproduksi</label><input id="pq" type="number" inputmode="decimal" step="any" min="0" placeholder="Jumlah diproduksi">
        <label>Tanggal</label><input id="pd" type="date" value="${iso(new Date())}">
        <button class="btn" id="sP">Simpan produksi</button></div>
      <div class="box pane c2" data-t="1"><h3>Tambah produk</h3>
        <label>Nama produk</label><input id="np" placeholder="Nama produk">
        <label>Harga jual (Rp)</label><input id="nh" type="number" inputmode="numeric" min="0" placeholder="Harga jual (Rp)">
        <button class="btn" id="sNP">Tambah produk</button></div>
      <div class="box pane c3" data-t="2"><h3>Isi resep (per 1 produk)</h3>
        <label>Pilih produk</label><select id="rp">${optP}</select>
        <label>Pilih bahan</label><select id="rb">${optB}</select>
        <label>Takaran bahan per 1 produk</label><input id="rt" type="number" inputmode="decimal" step="any" min="0" placeholder="Takaran bahan">
        <button class="btn" id="sR">Simpan resep</button></div>`;

  $('#view').innerHTML = forms + `
    <div class="box"><h3>Produk dan resep</h3>
      ${produk.length ? produk.map(x => {
        const r = resep.filter(y => y.produk_id === x.id).map(y => `${y.takaran} ${esc(y.bahan?.satuan)} ${esc(y.bahan?.nama)}`).join(', ');
        return `<div class="row"${ed('produk', x.id)}><span>${esc(x.nama)}${tagMargin(x)}<br><small>Jual ${rp(x.harga_jual)} · Modal ${rp(x.hpp_rata)}<br>Resep: ${r || 'belum diisi'}</small></span><b>${+x.stok.toFixed(2)}</b></div>`;
      }).join('') : '<div class="kosong">Belum ada produk.</div>'}
    </div>
    <div class="box"><h3>Produksi terakhir</h3>
      ${riwayat.length ? riwayat.map(x => `<div class="row"${bt('produksi', x.id)}><span>${esc(x.produk?.nama)}<br><small>${x.tanggal} · modal ${rp(x.hpp_satuan)}/pcs</small></span><b>${x.qty}</b></div>`).join('') : '<div class="kosong">Belum ada produksi.</div>'}
    </div>`;
  initTabs('produksi');
  if (admin) return;

  $('#sP').onclick = async () => {
    const qty = +$('#pq').value;
    if (!$('#pp').value || qty <= 0) return toast('Pilih produk dan isi jumlah');
    const { error } = await db.rpc('catat_produksi', { p_produk: $('#pp').value, p_qty: qty, p_tanggal: $('#pd').value });
    if (error) return toast(error.message);
    toast('Produksi tersimpan'); produksi();
  };
  $('#sNP').onclick = async () => {
    const nama = $('#np').value.trim();
    if (!nama || $('#nh').value === '') return toast('Isi nama dan harga jual');
    const { error } = await db.from('produk').insert({ nama, harga_jual: +$('#nh').value });
    if (error) return toast(error.message);
    toast('Produk ditambahkan'); produksi();
  };
  $('#sR').onclick = async () => {
    const t = +$('#rt').value;
    if (!$('#rp').value || !$('#rb').value || t <= 0) return toast('Pilih produk, bahan, dan isi takaran');
    const { error } = await db.from('resep').upsert({ produk_id: $('#rp').value, bahan_id: $('#rb').value, takaran: t }, { onConflict: 'produk_id,bahan_id' });
    if (error) return toast(error.message);
    toast('Resep tersimpan'); produksi();
  };
}

// ===== Tab di dalam halaman (satu tugas per layar) =====
const tabAktif = {};
const tabBar = n => `<div class="tabs">${n.map((x, i) => `<button data-i="${i}">${x}</button>`).join('')}</div>`;
function initTabs(key) {
  const bs = document.querySelectorAll('.tabs button'), ps = document.querySelectorAll('.pane');
  if (!bs.length) return;
  const go = i => {
    tabAktif[key] = i;
    bs.forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    ps.forEach(p => p.hidden = +p.dataset.t !== i);
  };
  bs.forEach(b => b.onclick = () => go(+b.dataset.i));
  go(tabAktif[key] || 0);
}

// ===== Halaman JUAL (catat penjualan) =====
async function jual() {
  charts.forEach(c => c.destroy()); charts = [];
  const admin = me.role === 'admin';
  const f = (t, k, c, opt) => {
    let x = db.from(t).select(k);
    if (tokoFilter !== 'all') x = x.eq('toko_id', tokoFilter);
    return x.order(c, opt || {});
  };
  const [pr, hs] = await Promise.all([
    f('produk', 'id,nama,harga_jual,stok', 'nama'),
    f('penjualan', 'id,tanggal,qty,harga_satuan,hpp_satuan,metode,produk(nama)', 'created_at', { ascending: false }).limit(15)
  ]);
  const produk = pr.data || [], riwayat = hs.data || [];

  const form = admin
    ? '<div class="note">Akun admin hanya untuk melihat. Untuk input, masuk dengan akun toko.</div>'
    : `<div class="box pane c1"><h3>Catat penjualan</h3>
        <label>Pilih produk</label>
        <select id="jp">${produk.length ? produk.map(x => `<option value="${x.id}">${esc(x.nama)} (stok ${+x.stok.toFixed(2)})</option>`).join('') : '<option value="">Belum ada produk</option>'}</select>
        <label>Jumlah terjual</label>
        <input id="jq" type="number" inputmode="decimal" step="any" min="0" placeholder="Contoh: 3">
        <label>Harga satuan (Rp)</label>
        <input id="jh" type="number" inputmode="numeric" min="0">
        <label>Metode pembayaran</label>
        <select id="jm"><option value="cash">Cash</option><option value="qris">QRIS</option><option value="transfer">Transfer</option></select>
        <label>Tanggal</label>
        <input id="jd" type="date" value="${iso(new Date())}">
        <div class="total" id="jt">Total: Rp0</div>
        <button class="btn" id="sJ">Simpan penjualan</button></div>`;

  $('#view').innerHTML = form + `
    <div class="box"><h3>Penjualan terakhir</h3>
      ${riwayat.length ? riwayat.map(x => `<div class="row"${bt('penjualan', x.id)}><span>${esc(x.produk?.nama)}<br><small>${x.tanggal} · ${x.metode.toUpperCase()} · ${x.qty} × ${rp(x.harga_satuan)}<br><span class="${x.harga_satuan < x.hpp_satuan ? 'neg' : ''}">Laba ${rp(x.qty * (x.harga_satuan - x.hpp_satuan))}</span></small></span><b>${rp(x.qty * x.harga_satuan)}</b></div>`).join('') : '<div class="kosong">Belum ada penjualan.</div>'}
    </div>`;
  if (admin) return;

  const hitung = () => { $('#jt').textContent = 'Total: ' + rp((+$('#jq').value || 0) * (+$('#jh').value || 0)); };
  const pilih = () => { const x = produk.find(y => y.id === $('#jp').value); $('#jh').value = x ? x.harga_jual : ''; hitung(); };
  $('#jp').onchange = pilih; $('#jq').oninput = hitung; $('#jh').oninput = hitung; pilih();

  $('#sJ').onclick = async () => {
    const qty = +$('#jq').value;
    if (!$('#jp').value || qty <= 0 || $('#jh').value === '') return toast('Pilih produk, isi jumlah dan harga');
    const { error } = await db.rpc('catat_penjualan', { p_produk: $('#jp').value, p_qty: qty, p_metode: $('#jm').value, p_harga: +$('#jh').value, p_tanggal: $('#jd').value });
    if (error) return toast(error.message);
    toast('Penjualan tersimpan'); jual();
  };
}

// Peringatan modal: rugi jika modal >= harga jual, margin tipis jika modal > 70% harga jual
const tagMargin = x => (x.hpp_rata <= 0 || x.harga_jual <= 0) ? ''
  : x.hpp_rata >= x.harga_jual ? '<span class="tag bad">Rugi</span>'
  : x.hpp_rata > x.harga_jual * 0.7 ? '<span class="tag warn">Margin tipis</span>' : '';

// ===== Halaman STOK (stok bahan, stok produk, penyesuaian) =====
async function stok() {
  charts.forEach(c => c.destroy()); charts = [];
  const admin = me.role === 'admin';
  const f = (t, k, c, opt) => {
    let x = db.from(t).select(k);
    if (tokoFilter !== 'all') x = x.eq('toko_id', tokoFilter);
    return x.order(c, opt || {});
  };
  const [b, p, h] = await Promise.all([
    f('bahan', 'id,nama,satuan,tipe,stok,harga_rata', 'nama'),
    f('produk', 'id,nama,harga_jual,stok,hpp_rata', 'nama'),
    f('penyesuaian', 'id,tanggal,qty,nilai,alasan,bahan(nama,satuan),produk(nama)', 'created_at', { ascending: false }).limit(10)
  ]);
  const bahan = b.data || [], produk = p.data || [], riwayat = h.data || [];
  const sum = (a, fn) => a.reduce((s, r) => s + fn(r), 0);
  const habis = x => x.stok <= 0 ? '<span class="tag warn">Habis</span>' : '';

  const paneBahan = `<div class="box pane c1" data-t="0"><h3>Stok bahan</h3>
    <div class="total">Nilai persediaan: ${rp(sum(bahan, x => x.stok * x.harga_rata))}</div>
    ${bahan.length ? bahan.map(x => `<div class="row"${ed('bahan', x.id)}><span>${esc(x.nama)}${habis(x)}<br><small>${x.tipe} · ${rp(x.harga_rata)}/${esc(x.satuan)}</small></span><b class="${x.stok <= 0 ? 'neg' : ''}">${+x.stok.toFixed(2)} ${esc(x.satuan)}</b></div>`).join('') : '<div class="kosong">Belum ada bahan.</div>'}</div>`;
  const paneProduk = `<div class="box pane c2" data-t="1"><h3>Stok produk (belum terjual)</h3>
    <div class="total">Modal tertahan: ${rp(sum(produk, x => x.stok * x.hpp_rata))}</div>
    ${produk.length ? produk.map(x => `<div class="row"${ed('produk', x.id)}><span>${esc(x.nama)}${habis(x)}${tagMargin(x)}<br><small>Jual ${rp(x.harga_jual)} · Modal ${rp(x.hpp_rata)}</small></span><b class="${x.stok <= 0 ? 'neg' : ''}">${+x.stok.toFixed(2)}</b></div>`).join('') : '<div class="kosong">Belum ada produk.</div>'}</div>`;
  const paneAdj = admin ? '' : `
    <div class="box pane c3" data-t="2"><h3>Catat penyesuaian</h3>
      <div class="note">Untuk bahan manual yang terpakai, atau bahan/produk yang rusak, basi, dan dibuang. Stok berkurang dan nilai modalnya tercatat sebagai kerugian.</div>
      <label>Jenis</label>
      <select id="sj"><option value="bahan">Bahan baku</option><option value="produk">Produk jadi</option></select>
      <label>Pilih item</label><select id="si"></select>
      <label>Jumlah yang berkurang</label>
      <input id="sq" type="number" inputmode="decimal" step="any" min="0" placeholder="Contoh: 2">
      <label>Alasan</label>
      <input id="sa" placeholder="Contoh: tumpah, basi, terpakai">
      <label>Tanggal</label>
      <input id="sd" type="date" value="${iso(new Date())}">
      <button class="btn" id="sS">Simpan penyesuaian</button></div>
    <div class="box pane c3" data-t="2"><h3>Penyesuaian terakhir</h3>
      ${riwayat.length ? riwayat.map(x => { const n = x.bahan || x.produk; return `<div class="row"${bt('penyesuaian', x.id)}><span>${esc(n?.nama)}<br><small>${x.tanggal} · -${x.qty}${x.bahan ? ' ' + esc(x.bahan.satuan) : ''} · ${esc(x.alasan)}</small></span><b class="neg">${rp(x.nilai)}</b></div>`; }).join('') : '<div class="kosong">Belum ada penyesuaian.</div>'}</div>`;

  $('#view').innerHTML = tabBar(admin ? ['Stok bahan', 'Stok produk'] : ['Stok bahan', 'Stok produk', 'Penyesuaian']) + paneBahan + paneProduk + paneAdj;
  initTabs('stok');
  if (admin) return;

  const isi = () => {
    const j = $('#sj').value, arr = j === 'bahan' ? bahan : produk;
    $('#si').innerHTML = arr.length
      ? arr.map(x => `<option value="${x.id}">${esc(x.nama)} (stok ${+x.stok.toFixed(2)}${j === 'bahan' ? ' ' + esc(x.satuan) : ''})</option>`).join('')
      : '<option value="">Belum ada data</option>';
  };
  $('#sj').onchange = isi; isi();

  $('#sS').onclick = async () => {
    const qty = +$('#sq').value, j = $('#sj').value, id = $('#si').value, alasan = $('#sa').value.trim();
    if (!id || qty <= 0) return toast('Pilih item dan isi jumlah');
    if (!alasan) return toast('Isi alasan penyesuaian');
    const { error } = await db.rpc('catat_penyesuaian', { p_qty: qty, p_alasan: alasan, p_bahan: j === 'bahan' ? id : null, p_produk: j === 'produk' ? id : null, p_tanggal: $('#sd').value });
    if (error) return toast(error.message);
    toast('Penyesuaian tersimpan'); stok();
  };
}

// ===== PROFIL (nama toko, foto, keluar) =====
function tampilAvatar() {
  ['#av', '#avb'].forEach(q => {
    const e = $(q);
    e.style.backgroundImage = me.avatar ? `url(${me.avatar})` : '';
    e.textContent = me.avatar ? '' : (me.nama_toko || 'A')[0].toUpperCase();
  });
}
function kecil(file) { // potong persegi 160px agar ringan disimpan
  return new Promise((ok, gagal) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 160;
      const s = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 160, 160);
      URL.revokeObjectURL(img.src); ok(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = gagal; img.src = URL.createObjectURL(file);
  });
}
$('#prof').onclick = () => {
  $('#pn').value = me.nama_toko;
  $('#pi').textContent = me.role === 'admin' ? 'Akun admin' : 'Akun toko';
  $('#sheet').hidden = false;
};
$('#tutup').onclick = () => { $('#sheet').hidden = true; };
$('#sheet').onclick = e => { if (e.target.id === 'sheet') e.target.hidden = true; };
$('#spn').onclick = async () => {
  const nama = $('#pn').value.trim();
  if (!nama) return toast('Nama toko tidak boleh kosong');
  const { error } = await db.from('profiles').update({ nama_toko: nama }).eq('id', me.id);
  if (error) return toast(error.message);
  me.nama_toko = nama; $('#toko').textContent = nama; tampilAvatar();
  $('#sheet').hidden = true; toast('Profil disimpan');
};
$('#fto').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const url = await kecil(f);
    const { error } = await db.from('profiles').update({ avatar: url }).eq('id', me.id);
    if (error) return toast(error.message);
    me.avatar = url; tampilAvatar(); toast('Foto diperbarui');
  } catch { toast('Foto tidak bisa dibaca'); }
  e.target.value = '';
};

// ===== BERANDA (dashboard) =====
const WARNA_M = ['#3D5C42', '#8DBF9A', '#E8B64A'], NAMA_M = ['Cash', 'QRIS', 'Transfer'];
let periodeGrafik = 'hari', tglDash = iso(new Date());
function rentangDash(p) {
  const t = new Date(), e = iso(t);
  if (p === 'hari') return [tglDash, tglDash];
  if (p === 'minggu') return [iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - (t.getDay() + 6) % 7)), e];
  return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), e];
}
async function home() {
  const hari = tglDash, suf = hari === iso(new Date()) ? 'hari ini' : fmt(hari);
  const awal = [rentangDash('bulan')[0], rentangDash('minggu')[0], hari].sort()[0];
  const q = (t, k) => { const x = db.from(t).select(k).gte('tanggal', awal); return tokoFilter !== 'all' ? x.eq('toko_id', tokoFilter) : x; };
  let qp = db.from('produk').select('nama,stok'); if (tokoFilter !== 'all') qp = qp.eq('toko_id', tokoFilter);
  let qm = db.from('modal').select('id,tanggal,jumlah,catatan').gte('tanggal', rentangDash('bulan')[0]); if (tokoFilter !== 'all') qm = qm.eq('toko_id', tokoFilter);
  const [j, b, p, m] = await Promise.all([q('penjualan', 'tanggal,qty,harga_satuan,hpp_satuan,metode'), q('pembelian', 'tanggal,total_harga,metode'), qp, qm]);
  const jual = j.data || [], beli = b.data || [], produk = p.data || [];
  const sum = (a, f) => a.reduce((s, r) => s + f(r), 0), masukR = r => r.qty * r.harga_satuan;
  const jH = jual.filter(r => r.tanggal === hari), bH = beli.filter(r => r.tanggal === hari);
  const masuk = sum(jH, masukR), keluar = sum(bH, r => r.total_harga), laba = sum(jH, r => r.qty * (r.harga_satuan - r.hpp_satuan));
  const terjual = sum(jH, r => +r.qty), sisa = sum(produk, r => +r.stok);
  const kartu = (c, l, v, fl) => `<div class="card ${c}"><small>${l}</small><b>${v}</b>${fl ? `<span class="flag">${fl}</span>` : ''}</div>`;
  const habis = produk.length && sisa <= 0;
  const modalList = m.data || [], budget = sum(modalList, r => +r.jumlah), pakai = sum(beli.filter(r => r.tanggal >= rentangDash('bulan')[0]), r => r.total_harga);
  const pct = budget > 0 ? pakai / budget * 100 : 0, sisaB = budget - pakai, wb = pct > 100 ? 'bad' : pct >= 80 ? 'warn' : '';
  const ket0 = !budget ? 'Belum ada budget bulan ini' : pct > 100 ? 'Budget terlampaui' : pct >= 80 ? 'Mendekati batas budget' : '';

  $('#view').innerHTML = `
    <div class="bar"><div class="tgw"><button class="tgb" type="button">${new Date(hari + 'T00:00').toLocaleDateString('id-ID', { dateStyle: 'full' })} &#9662;</button><input type="date" id="tgl" value="${hari}" max="${iso(new Date())}"></div><button class="lapbtn" id="bl">Laporan</button></div>
    <div class="grid">
      ${kartu('in', `Pemasukan ${suf}`, rp(masuk))}
      ${kartu(keluar > masuk ? 'warn' : 'out', `Pengeluaran ${suf}`, rp(keluar), keluar > masuk ? 'Lebih besar dari pemasukan' : '')}
      ${kartu(masuk - keluar < 0 ? 'bad' : 'hi', 'Selisih', rp(masuk - keluar), masuk - keluar < 0 ? 'Defisit' : '')}
      ${kartu(laba < 0 ? 'bad' : 'hi', 'Laba penjualan', rp(laba), laba < 0 ? 'Penjualan di bawah modal' : '')}
      ${kartu('', `Produk terjual ${suf}`, +terjual.toFixed(2))}
      ${kartu(habis ? 'warn' : '', 'Produk tersisa', +sisa.toFixed(2), habis ? 'Stok produk habis' : '')}
    </div>
    <div class="box"><div class="hd"><h3>Budget bahan baku bulan ini</h3>${me.role === 'admin' ? '' : '<button class="lapbtn" id="bb">+ Tambah</button>'}</div>
      <div class="prog"><i class="${wb}" style="width:${Math.min(100, pct)}%"></i></div>
      <div class="row"><span>Terpakai</span><b>${rp(pakai)}</b></div>
      <div class="row"><span>Budget</span><b>${rp(budget)}</b></div>
      <div class="row"><span>Sisa budget</span><b class="${sisaB < 0 ? 'neg' : ''}">${rp(sisaB)}</b></div>
      ${ket0 ? `<span class="flag ${wb}">${ket0}</span>` : ''}</div>
    <div class="box"><div class="hd"><h3>Metode pembayaran</h3>
      <div class="seg" id="seg">${[['hari', hari === iso(new Date()) ? 'Hari ini' : fmt(hari)], ['minggu', 'Minggu ini'], ['bulan', 'Bulan ini']].map(([k, l]) => `<button data-k="${k}">${l}</button>`).join('')}</div></div>
      <div id="gr"></div></div>
    <div class="box"><h3>Sisa produk belum terjual</h3>
      ${produk.length ? produk.map(x => `<div class="row"><span>${esc(x.nama)}${x.stok <= 0 ? '<span class="tag warn">Habis</span>' : ''}</span><b>${x.stok}</b></div>`).join('') : '<div class="kosong">Belum ada produk.</div>'}
    </div>`;

  const gambar = () => {
    document.querySelectorAll('#seg button').forEach(x => { x.classList.toggle('on', x.dataset.k === periodeGrafik); x.onclick = () => { periodeGrafik = x.dataset.k; gambar(); }; });
    const [a, z] = rentangDash(periodeGrafik), ada = r => r.tanggal >= a && r.tanggal <= z;
    const js = jual.filter(ada), bs = beli.filter(ada);
    const pm = METODE.map(m => ({ masuk: sum(js.filter(r => r.metode === m), masukR), keluar: sum(bs.filter(r => r.metode === m), r => r.total_harga) }));
    const tot = sum(pm, x => x.masuk);
    $('#gr').innerHTML = `<div class="dn"><div class="dc"><canvas id="c1"></canvas></div>
      <div class="lg">${pm.map((x, i) => `<div><i style="background:${WARNA_M[i]}"></i><span>${NAMA_M[i]}<small>${tot ? Math.round(x.masuk / tot * 100) : 0}%</small></span><b>${rp(x.masuk)}</b></div>`).join('')}</div></div>
      <h4>Pemasukan vs pengeluaran${periodeGrafik === 'hari' ? ' per metode' : ' per hari'}</h4><canvas id="c2" height="190"></canvas>`;
    let lb, dm, dk;
    if (periodeGrafik === 'hari') { lb = NAMA_M; dm = pm.map(x => x.masuk); dk = pm.map(x => x.keluar); }
    else {
      const hr = []; for (let d = new Date(a + 'T00:00'); iso(d) <= z; d.setDate(d.getDate() + 1)) hr.push(iso(d));
      lb = hr.map(d => d.slice(8) + '/' + d.slice(5, 7));
      dm = hr.map(d => sum(js.filter(r => r.tanggal === d), masukR)); dk = hr.map(d => sum(bs.filter(r => r.tanggal === d), r => r.total_harga));
    }
    charts.forEach(c => c.destroy());
    charts = [
      new Chart($('#c1'), { type: 'doughnut', data: { labels: NAMA_M, datasets: [{ data: tot ? pm.map(x => x.masuk) : [1], backgroundColor: tot ? WARNA_M : ['#EEEDE9'], borderWidth: 2, borderColor: '#fff' }] }, options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { enabled: !!tot } } } }),
      new Chart($('#c2'), { type: 'bar', data: { labels: lb, datasets: [{ label: 'Pemasukan', backgroundColor: '#3D5C42', borderRadius: 5, data: dm }, { label: 'Pengeluaran', backgroundColor: '#E8B64A', borderRadius: 5, data: dk }] }, options: { plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 13 } } } }, scales: { y: { ticks: { callback: v => v >= 1e6 ? v / 1e6 + 'jt' : v >= 1e3 ? v / 1e3 + 'rb' : v } } } } })
    ];
  };
  gambar();
  $('#tgl').onchange = e => { tglDash = e.target.value || iso(new Date()); home(); };
  if ($('#bb')) $('#bb').onclick = () => modalSheet(modalList);
}

// ===== KATA SANDI =====
$('#spw').onclick = async () => {
  const a = $('#pw0').value, b = $('#pw1').value, c = $('#pw2').value;
  if (!a || !b) return toast('Isi kata sandi lama dan baru');
  if (b.length < 8) return toast('Kata sandi baru minimal 8 karakter');
  if (b !== c) return toast('Ulangi kata sandi baru dengan sama persis');
  const { error: e1 } = await db.auth.signInWithPassword({ email: me.email, password: a });
  if (e1) return toast('Kata sandi lama salah');
  const { error } = await db.auth.updateUser({ password: b });
  if (error) return toast(error.message);
  ['#pw0', '#pw1', '#pw2'].forEach(k => { $(k).value = ''; });
  toast('Kata sandi berhasil diubah');
};

// ===== LAPORAN (PDF, Excel, WhatsApp) =====
const LIB = { pdf: ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'], xls: ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'] };
const muat = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
const fmt = d => new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const sumA = (a, f) => a.reduce((s, r) => s + f(r), 0);

$('#view').addEventListener('click', e => { if (e.target.closest('#bl')) { $('#lp').options[0].textContent = tglDash === iso(new Date()) ? 'Hari ini' : fmt(tglDash); $('#lap').hidden = false; } });
$('#lap .x').onclick = () => { $('#lap').hidden = true; };
$('#lap').onclick = e => { if (e.target.id === 'lap') e.target.hidden = true; };
$('#lp').onchange = () => { $('#lrg').hidden = $('#lp').value !== 'kustom'; };
$('#lj').onchange = () => { $('#lper').hidden = $('#lj').value === 'stok'; };
$('#bpdf').onclick = () => aksi('pdf'); $('#bxls').onclick = () => aksi('xls'); $('#bwa').onclick = () => aksi('wa');

function rentang() {
  const v = $('#lp').value, h = new Date(), t = iso(h);
  if (v === 'hari') { const a = tglDash; return [a, a, (a === t ? 'Hari ini, ' : '') + new Date(a + 'T00:00').toLocaleDateString('id-ID', { dateStyle: 'long' })]; }
  if (v === '7') { const a = iso(new Date(Date.now() - 6 * 864e5)); return [a, t, fmt(a) + ' - ' + fmt(t)]; }
  if (v === 'bulan') return [iso(new Date(h.getFullYear(), h.getMonth(), 1)), t, h.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })];
  const a = $('#ld1').value || t, b = $('#ld2').value || t; return [a, b, fmt(a) + ' - ' + fmt(b)];
}

async function dataLaporan() {
  const [dari, sampai, label] = rentang(), jenis = $('#lj').value, st = jenis === 'stok';
  const flt = x => tokoFilter !== 'all' ? x.eq('toko_id', tokoFilter) : x;
  const per = (t, k) => flt(db.from(t).select(k).gte('tanggal', dari).lte('tanggal', sampai)).order('tanggal');
  const sk = (t, k) => flt(db.from(t).select(k)).order('nama');
  const g = async q => (await q).data || [];
  const [jual, beli, bahan, produk] = await Promise.all([
    st ? [] : g(per('penjualan', 'id,tanggal,qty,harga_satuan,hpp_satuan,metode,produk(nama)')),
    st ? [] : g(per('pembelian', 'id,tanggal,qty,total_harga,metode,bahan(nama,satuan)')),
    st ? g(sk('bahan', 'nama,satuan,tipe,stok,harga_rata')) : [],
    st ? g(sk('produk', 'nama,stok,hpp_rata,harga_jual')) : []
  ]);
  const toko = me.role === 'admin' ? $('#pilih').selectedOptions[0].textContent : me.nama_toko;
  return { jual, beli, bahan, produk, jenis, label, toko };
}

function susun(d) {
  const { jual, beli, bahan, produk, jenis } = d;
  const masuk = sumA(jual, r => r.qty * r.harga_satuan), keluar = sumA(beli, r => r.total_harga), laba = sumA(jual, r => r.qty * (r.harga_satuan - r.hpp_satuan));
  const rpk = (l, v, bad) => ({ l, v, t: 'rp', bad }), txt = (l, v) => ({ l, v, t: 'txt' });
  const sp = { toko: d.toko, label: d.label, kartu: [], tabel: [] };
  if (jenis === 'ringkasan') {
    sp.judul = 'Laporan Ringkasan';
    sp.kartu = [rpk('Pemasukan', masuk), rpk('Pengeluaran', keluar), rpk('Selisih', masuk - keluar, masuk - keluar < 0), rpk('Laba penjualan', laba, laba < 0)];
    sp.tabel.push({ judul: 'Per metode pembayaran', head: ['Metode', 'Pemasukan', 'Pengeluaran'], tipe: ['txt', 'rp', 'rp'],
      body: METODE.map(m => [m.toUpperCase(), sumA(jual.filter(r => r.metode === m), r => r.qty * r.harga_satuan), sumA(beli.filter(r => r.metode === m), r => r.total_harga)]) });
    const hr = [...new Set([...jual, ...beli].map(r => r.tanggal))].sort();
    sp.tabel.push({ judul: 'Rekap harian', head: ['Tanggal', 'Pemasukan', 'Pengeluaran', 'Selisih', 'Laba'], tipe: ['tgl', 'rp', 'rp', 'rp', 'rp'],
      body: hr.map(t => { const js = jual.filter(r => r.tanggal === t), a = sumA(js, r => r.qty * r.harga_satuan), b = sumA(beli.filter(r => r.tanggal === t), r => r.total_harga); return [t, a, b, a - b, sumA(js, r => r.qty * (r.harga_satuan - r.hpp_satuan))]; }) });
  } else if (jenis === 'penjualan') {
    sp.judul = 'Laporan Penjualan';
    sp.kartu = [rpk('Total penjualan', masuk), txt('Produk terjual', +sumA(jual, r => +r.qty).toFixed(2)), rpk('Laba penjualan', laba, laba < 0)];
    sp.tabel.push({ judul: 'Daftar penjualan', head: ['Tanggal', 'Produk', 'Jml', 'Harga', 'Total', 'Metode', 'Laba'], tipe: ['tgl', 'txt', 'txt', 'rp', 'rp', 'txt', 'rp'],
      body: jual.map(r => [r.tanggal, r.produk?.nama, r.qty, r.harga_satuan, r.qty * r.harga_satuan, r.metode.toUpperCase(), r.qty * (r.harga_satuan - r.hpp_satuan)]) });
  } else if (jenis === 'pembelian') {
    sp.judul = 'Laporan Pembelian Bahan';
    sp.kartu = [rpk('Total pengeluaran', keluar), txt('Jumlah transaksi', beli.length)];
    sp.tabel.push({ judul: 'Daftar pembelian', head: ['Tanggal', 'Bahan', 'Jumlah', 'Total', 'Metode'], tipe: ['tgl', 'txt', 'txt', 'rp', 'txt'],
      body: beli.map(r => [r.tanggal, r.bahan?.nama, `${r.qty} ${r.bahan?.satuan || ''}`, r.total_harga, r.metode.toUpperCase()]) });
  } else {
    sp.judul = 'Laporan Stok'; sp.label = 'Per ' + fmt(iso(new Date()));
    sp.kartu = [rpk('Nilai stok bahan', sumA(bahan, r => r.stok * r.harga_rata)), rpk('Modal tertahan di produk', sumA(produk, r => r.stok * r.hpp_rata))];
    sp.tabel.push({ judul: 'Stok bahan', head: ['Bahan', 'Tipe', 'Stok', 'Harga rata-rata', 'Nilai'], tipe: ['txt', 'txt', 'txt', 'rp', 'rp'],
      body: bahan.map(r => [r.nama, r.tipe, `${+r.stok.toFixed(2)} ${r.satuan}`, r.harga_rata, r.stok * r.harga_rata]) });
    sp.tabel.push({ judul: 'Stok produk', head: ['Produk', 'Stok', 'Modal', 'Harga jual', 'Nilai modal'], tipe: ['txt', 'txt', 'rp', 'rp', 'rp'],
      body: produk.map(r => [r.nama, +r.stok.toFixed(2), r.hpp_rata, r.harga_jual, r.stok * r.hpp_rata]) });
  }
  return sp;
}

async function buatPDF(sp) {
  for (const u of LIB.pdf) await muat(u);
  const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210;
  doc.setFillColor(61, 92, 66); doc.rect(0, 0, W, 36, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text(sp.toko, 14, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(210, 220, 198);
  doc.text(sp.judul, 14, 24); doc.text(sp.label, 14, 30);
  let y = 44;
  sp.kartu.forEach((k, i) => {
    const x = 14 + (i % 2) * 94; if (i && i % 2 === 0) y += 25;
    doc.setFillColor(...(k.bad ? [251, 234, 230] : [238, 237, 233])); doc.setDrawColor(...(k.bad ? [191, 82, 64] : [210, 220, 198]));
    doc.roundedRect(x, y, 88, 21, 3, 3, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(93, 107, 95); doc.text(k.l, x + 4, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...(k.bad ? [191, 82, 64] : [61, 92, 66]));
    doc.text(k.t === 'rp' ? rp(k.v) : String(k.v), x + 4, y + 16);
  });
  y += 32;
  sp.tabel.forEach(t => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(61, 92, 66); doc.text(t.judul, 14, y);
    doc.autoTable({
      startY: y + 3, head: [t.head], theme: 'striped', margin: { left: 14, right: 14 },
      body: t.body.map(r => r.map((v, i) => t.tipe[i] === 'rp' ? rp(v) : t.tipe[i] === 'tgl' ? fmt(v) : String(v ?? ''))),
      styles: { fontSize: 10, cellPadding: 2.6, textColor: [31, 45, 34] }, headStyles: { fillColor: [61, 92, 66], textColor: 255 },
      alternateRowStyles: { fillColor: [238, 237, 233] },
      columnStyles: Object.fromEntries(t.tipe.map((x, i) => [i, { halign: x === 'rp' ? 'right' : 'left' }])),
      didParseCell: c => { if (c.section === 'body' && t.tipe[c.column.index] === 'rp' && t.body[c.row.index][c.column.index] < 0) c.cell.styles.textColor = [191, 82, 64]; }
    });
    y = doc.lastAutoTable.finalY + 10;
  });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130); doc.text(`${sp.toko}  |  halaman ${i}/${n}`, 14, 290); }
  return doc.output('blob');
}

async function buatXLSX(sp) {
  for (const u of LIB.xls) await muat(u);
  const wb = XLSX.utils.book_new();
  const ring = [[sp.toko], [sp.judul], [sp.label], [], ...sp.kartu.map(k => [k.l, k.v])];
  const w0 = XLSX.utils.aoa_to_sheet(ring); w0['!cols'] = [{ wch: 28 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, w0, 'Ringkasan');
  sp.tabel.forEach(t => {
    const ws = XLSX.utils.aoa_to_sheet([t.head, ...t.body]); ws['!cols'] = t.head.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws, t.judul.slice(0, 30));
  });
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const namaFile = (sp, ext) => `Laporan-${sp.judul.replace('Laporan ', '')}-${sp.toko}-${iso(new Date())}.${ext}`.replace(/[^\w.-]+/g, '_');
const unduh = (blob, n) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = n; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
async function aksi(mode) {
  toast('Menyiapkan laporan...');
  try {
    const sp = susun(await dataLaporan());
    if (mode === 'xls') return unduh(await buatXLSX(sp), namaFile(sp, 'xlsx'));
    const blob = await buatPDF(sp), n = namaFile(sp, 'pdf');
    if (mode === 'pdf') return unduh(blob, n);
    const file = new File([blob], n, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: sp.judul }); } catch { /* dibatalkan */ } }
    else { unduh(blob, n); toast('Perangkat ini belum mendukung bagikan langsung. PDF diunduh, silakan kirim lewat WhatsApp.'); }
  } catch (e) { toast('Gagal membuat laporan: ' + (e.message || 'periksa koneksi')); }
}

// ===== Splash opening =====
setTimeout(() => { const s = $('#splash'); s.classList.add('off'); setTimeout(() => s.remove(), 600); }, 1700);

// ===== EDIT DATA, BATALKAN TRANSAKSI, BUDGET =====
const ed = (t, id) => me.role === 'admin' ? '' : ` data-ed="${t}" data-id="${id}"`;
const bt = (t, id) => me.role === 'admin' ? '' : ` data-bt="${t}" data-id="${id}"`;
const ket = e => e.code === '23503' ? 'Tidak bisa dihapus karena sudah dipakai transaksi atau resep. Cukup ubah namanya bila perlu.' : e.message;

function bukaEdit(o) {
  $('#edj').textContent = o.judul; $('#edf').innerHTML = o.html; $('#ed').hidden = false;
  $('#eds').hidden = !o.simpan; $('#edh').hidden = !o.hapus; $('#edh').textContent = o.lbl || 'Hapus';
  const selesai = async (fn, pesan) => { const err = await fn(); if (err) return toast(err); $('#ed').hidden = true; toast(pesan); buka(cur, ''); };
  $('#eds').onclick = () => selesai(o.simpan, o.ok || 'Tersimpan');
  $('#edh').onclick = () => { if (confirm('Yakin?')) selesai(o.hapus, o.okH || 'Data dihapus'); };
}
$('#ed .x').onclick = () => { $('#ed').hidden = true; buka(cur, ''); };
$('#ed').onclick = e => { if (e.target.id === 'ed') { e.target.hidden = true; buka(cur, ''); } };
$('#edf').addEventListener('click', async e => {
  const b = e.target.closest('[data-mdel],[data-rdel]'); if (!b || !confirm('Hapus baris ini?')) return;
  const [tb, id] = b.dataset.mdel ? ['modal', b.dataset.mdel] : ['resep', b.dataset.rdel];
  const { error } = await db.from(tb).delete().eq('id', id);
  if (error) return toast(ket(error));
  b.closest('.rl').remove(); toast('Terhapus');
});
$('#view').addEventListener('click', e => {
  const r = e.target.closest('[data-ed],[data-bt]'); if (!r || me.role === 'admin') return;
  r.dataset.ed ? editData(r.dataset.ed, r.dataset.id) : batalTrx(r.dataset.bt, r.dataset.id, r.innerText.replace(/\n+/g, ' | '));
});

async function editData(tipe, id) {
  if (tipe === 'bahan') {
    const { data: x } = await db.from('bahan').select('nama,satuan,tipe').eq('id', id).single();
    return bukaEdit({
      judul: 'Ubah bahan', ok: 'Bahan diperbarui', lbl: 'Hapus bahan',
      html: `<label>Nama bahan</label><input id="e1" value="${esc(x.nama)}"><label>Satuan</label><input id="e2" value="${esc(x.satuan)}"><label>Tipe bahan</label><select id="e3"><option value="otomatis"${x.tipe === 'otomatis' ? ' selected' : ''}>Otomatis (berkurang saat produksi)</option><option value="manual"${x.tipe === 'manual' ? ' selected' : ''}>Manual (dikurangi lewat penyesuaian)</option></select>`,
      simpan: async () => { const n = $('#e1').value.trim(), s = $('#e2').value.trim(); if (!n || !s) return 'Isi nama dan satuan'; const { error } = await db.from('bahan').update({ nama: n, satuan: s, tipe: $('#e3').value }).eq('id', id); return error && ket(error); },
      hapus: async () => { const { error } = await db.from('bahan').delete().eq('id', id); return error && ket(error); }
    });
  }
  const [{ data: x }, { data: rs }] = await Promise.all([db.from('produk').select('nama,harga_jual').eq('id', id).single(), db.from('resep').select('id,takaran,bahan(nama,satuan)').eq('produk_id', id)]);
  bukaEdit({
    judul: 'Ubah produk', ok: 'Produk diperbarui', lbl: 'Hapus produk',
    html: `<label>Nama produk</label><input id="e1" value="${esc(x.nama)}"><label>Harga jual (Rp)</label><input id="e2" type="number" inputmode="numeric" min="0" value="${x.harga_jual}">` +
      ((rs || []).length ? '<h4>Resep (takaran per 1 produk)</h4>' + rs.map(r => `<div class="rl"><span>${esc(r.bahan?.nama)} (${esc(r.bahan?.satuan)})</span><input type="number" step="any" min="0" value="${r.takaran}" data-rid="${r.id}"><button data-rdel="${r.id}" aria-label="Hapus">&times;</button></div>`).join('') : ''),
    simpan: async () => {
      const n = $('#e1').value.trim(); if (!n || $('#e2').value === '') return 'Isi nama dan harga jual';
      let { error } = await db.from('produk').update({ nama: n, harga_jual: +$('#e2').value }).eq('id', id); if (error) return ket(error);
      for (const i of document.querySelectorAll('[data-rid]')) { const t = +i.value; if (t > 0) { ({ error } = await db.from('resep').update({ takaran: t }).eq('id', i.dataset.rid)); if (error) return ket(error); } }
      return null;
    },
    hapus: async () => { const { error } = await db.from('produk').delete().eq('id', id); return error && ket(error); }
  });
}

function batalTrx(t, id, ring) {
  bukaEdit({
    judul: 'Batalkan transaksi?', lbl: 'Batalkan transaksi', okH: 'Transaksi dibatalkan',
    html: `<p class="info">${esc(ring)}</p><p class="info">Stok dan uangnya dikembalikan otomatis. Setelah itu kamu bisa mencatat ulang dengan nilai yang benar.</p>`,
    hapus: async () => { const { error } = await db.rpc('batal_' + t, { p_id: id }); return error && error.message; }
  });
}

function modalSheet(list) {
  const baris = list.map(r => `<div class="rl"><span>${fmt(r.tanggal)}${r.catatan ? ' | ' + esc(r.catatan) : ''}</span><b>${rp(r.jumlah)}</b><button data-mdel="${r.id}" aria-label="Hapus">&times;</button></div>`).join('');
  bukaEdit({
    judul: 'Tambah budget atau modal', ok: 'Budget ditambahkan',
    html: `<p class="info">Setiap tambahan akan menambah budget bahan baku bulan ini.</p><label>Jumlah (Rp)</label><input id="e1" type="number" inputmode="numeric" min="0"><label>Catatan (opsional)</label><input id="e2" placeholder="Contoh: modal tambahan"><label>Tanggal</label><input id="e3" type="date" value="${iso(new Date())}">` + (baris ? '<h4>Tambahan bulan ini</h4>' + baris : ''),
    simpan: async () => { const j = +$('#e1').value; if (!(j > 0)) return 'Isi jumlah budget'; const { error } = await db.from('modal').insert({ jumlah: j, catatan: $('#e2').value.trim() || null, tanggal: $('#e3').value }); return error && error.message; }
  });
}
