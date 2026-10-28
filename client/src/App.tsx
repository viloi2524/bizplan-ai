import { useEffect, useMemo, useRef, useState, type Dispatch, type FormEvent, type ReactNode, type SetStateAction } from 'react';
import {
  AlertCircle, ArrowDownToLine, ArrowLeft, ArrowRight, BarChart3, Boxes, Calculator as CalculatorIcon,
  Check, ChevronDown, CircleHelp, FileBarChart2, FileSpreadsheet, FlaskConical, Gauge,
  LayoutDashboard, Menu, MessageCircle, Package, Plus, Search, Send, Settings2,
  ShoppingBag, Sparkles, Store, Trash2, Truck, Wallet, X,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { calculateEconomics, calculateSupplierLandedCost } from './lib/calculator';
import { apiUrl } from './lib/api';
import { calculateProductScore } from './lib/scoring';
import { DEFAULT_COST_INPUTS, DEFAULT_DATA, formatRupiah, isAppData, loadData, saveData } from './lib/storage';
import type { AppData, Competitor, CostInputs, Product, Supplier } from './types';

type PageKey = 'dashboard' | 'research' | 'competitors' | 'suppliers' | 'calculator' | 'simulation' | 'saved' | 'reports' | 'settings' | 'chat';
type Notice = { kind: 'success' | 'error' | 'info'; text: string };
interface ChatMessage { role: 'assistant' | 'user'; text: string }
interface ChatFailure { question: string; message: string }

const navItems: Array<{ id: PageKey; label: string; icon: typeof LayoutDashboard; group: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, group: 'Workspace' },
  { id: 'research', label: 'AI Product Research', icon: Sparkles, group: 'Workspace' },
  { id: 'competitors', label: 'Analisis kompetitor', icon: BarChart3, group: 'Data pasar' },
  { id: 'suppliers', label: 'Analisis supplier', icon: Truck, group: 'Data pasar' },
  { id: 'calculator', label: 'Kalkulator keuntungan', icon: Gauge, group: 'Perencanaan' },
  { id: 'simulation', label: 'Simulasi modal', icon: Wallet, group: 'Perencanaan' },
  { id: 'saved', label: 'Produk tersimpan', icon: Package, group: 'Library' },
  { id: 'reports', label: 'Laporan AI', icon: FileBarChart2, group: 'Library' },
  { id: 'chat', label: 'Asisten AI', icon: MessageCircle, group: 'Lainnya' },
  { id: 'settings', label: 'Pengaturan', icon: Settings2, group: 'Lainnya' },
];

const id = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toISOString().slice(0, 10);
const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

function Button({
  children, onClick, variant = 'primary', type = 'button', disabled = false, className = '',
}: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit'; disabled?: boolean; className?: string;
}) {
  return <button type={type} onClick={onClick} disabled={disabled}
    className={`button button-${variant} ${className}`}>{children}</button>;
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function PageHeading({ eyebrow, title, subtitle, action }: {
  eyebrow: string; title: string; subtitle: string; action?: ReactNode;
}) {
  return <div className="page-heading">
    <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div>
    {action && <div className="heading-action">{action}</div>}
  </div>;
}

function Field({ label, value, onChange, type = 'text', min, max, step, suffix, placeholder, required = false }: {
  label: string; value: string | number; onChange: (value: string) => void; type?: string;
  min?: number; max?: number; step?: number; suffix?: string; placeholder?: string; required?: boolean;
}) {
  return <label className="field"><span>{label}</span><div className="input-wrap">
    <input type={type} value={value} onChange={(event) => onChange(event.target.value)}
      min={min} max={max} step={step} placeholder={placeholder} required={required} />
    {suffix && <small>{suffix}</small>}
  </div></label>;
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void; options: string[];
}) {
  return <label className="field"><span>{label}</span><div className="select-wrap">
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option}>{option}</option>)}
    </select><ChevronDown size={16} />
  </div></label>;
}

function MetricCard({ title, value, detail, icon: Icon, tone = 'green' }: {
  title: string; value: string; detail: string; icon: typeof Package; tone?: string;
}) {
  return <Card className="metric-card"><div className={`metric-icon tone-${tone}`}><Icon size={19} /></div>
    <p className="metric-label">{title}</p><strong className="metric-value">{value}</strong>
    <p className="metric-detail">{detail}</p>
  </Card>;
}

function EmptyState({ icon: Icon, title, detail, action }: {
  icon: typeof Package; title: string; detail: string; action?: ReactNode;
}) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={24} /></div>
    <h3>{title}</h3><p>{detail}</p>{action}</div>;
}

function makeCandidateNames(category: string) {
  const clean = category.trim();
  return [
    `Paket kebutuhan dasar ${clean}`,
    `Versi ringkas/hemat ruang ${clean}`,
    `Bundel pelengkap ${clean}`,
  ];
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (quoted) throw new Error('Format CSV tidak valid: ada tanda kutip yang belum ditutup.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function downloadFile(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [data, setData] = useState<AppData>(() => loadData());
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    text: 'Hai! Saya BizPlan AI. Saya bisa membantu mengevaluasi ide usaha, menghitung rencana, dan menyusun langkah eksekusi. Saya akan memakai data yang kamu berikan, menandai asumsi, dan bertanya bertahap jika ada informasi penting yang belum tersedia.',
  }]);
  const [page, setPage] = useState<PageKey>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');

  useEffect(() => {
    setStorageError(!saveData(data));
  }, [data]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const activeProduct = data.products.find((product) => product.id === selectedProduct);
  const navigate = (destination: PageKey) => {
    setPage(destination);
    setMobileMenuOpen(false);
  };
  const update = (patch: Partial<AppData>) => setData((current) => ({ ...current, ...patch }));
  const updateCosts = (patch: Partial<CostInputs>) => setData((current) => ({
    ...current, costInputs: { ...current.costInputs, ...patch },
  }));
  const setProduct = (product: Product) => {
    update({ products: [product, ...data.products] });
    setSelectedProduct(product.id);
    setNotice({ kind: 'success', text: 'Produk berhasil disimpan di perangkat ini.' });
  };
  const selectProduct = (product: Product, destination: PageKey) => {
    setSelectedProduct(product.id);
    const stockPurchased = product.stockQty > 0 ? product.stockQty : data.costInputs.stockPurchased;
    updateCosts({
      purchasePrice: product.purchasePrice,
      sellingPrice: product.sellingPrice,
      stockPurchased,
      quantity: Math.min(data.costInputs.quantity, stockPurchased),
    });
    navigate(destination);
  };

  const filteredProducts = data.products.filter((product) =>
    `${product.name} ${product.category} ${product.marketplace}`.toLowerCase().includes(globalSearch.toLowerCase()));
  const title = navItems.find((item) => item.id === page)?.label ?? 'Dashboard';

  return <div className="app-shell">
    {mobileMenuOpen && <button className="mobile-scrim" aria-label="Tutup menu" onClick={() => setMobileMenuOpen(false)} />}
    <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup"><div className="brand-mark"><ShoppingBag size={21} /></div>
        <div><strong>Produk<span>Laku</span> AI</strong><small>Riset lebih cerdas</small></div>
        <button className="icon-button mobile-close" onClick={() => setMobileMenuOpen(false)} aria-label="Tutup menu"><X size={19} /></button>
      </div>
      <div className="workspace-switch"><div className="workspace-avatar">PL</div><div><b>Workspace saya</b><small>Ruang kerja pribadi</small></div><ChevronDown size={15} /></div>
      <nav className="side-nav" aria-label="Navigasi utama">
        {['Workspace', 'Data pasar', 'Perencanaan', 'Library', 'Lainnya'].map((group) => <div className="nav-group" key={group}>
          <p className="nav-group-title">{group}</p>
          {navItems.filter((item) => item.group === group).map(({ id: key, label, icon: Icon }) =>
            <button key={key} onClick={() => navigate(key)} className={`nav-link ${page === key ? 'nav-active' : ''}`}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
              {key === 'saved' && data.products.length > 0 && <span className="nav-count">{data.products.length}</span>}
            </button>)}
        </div>)}
      </nav>
      <div className="sidebar-bottom"><div className="local-note"><div><span className="live-dot" />Penyimpanan lokal</div>
        <p>Data hanya ada di browser ini. Belum tersambung ke database akun.</p></div>
        <button className="profile-button" onClick={() => navigate('settings')}><div className="profile-avatar">U</div>
          <div><b>Pengguna</b><small>Mode pribadi</small></div><Settings2 size={17} /></button>
      </div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="topbar-left">
        <button className="icon-button mobile-menu-button" aria-label="Buka menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
        <span className="breadcrumb">Workspace</span><span className="breadcrumb-separator">/</span><b>{title}</b>
      </div><div className="topbar-right">
        <label className="global-search"><Search size={16} /><input aria-label="Cari produk" placeholder="Cari produk..." value={globalSearch} onChange={(event) => {
          setGlobalSearch(event.target.value);
          if (event.target.value) setPage('saved');
        }} />
          {globalSearch && <button aria-label="Hapus pencarian" onClick={() => setGlobalSearch('')}><X size={14} /></button>}
        </label>
        <span className="mode-chip"><span />Mode demo</span>
      </div></header>
      <div className="content-area">
        {storageError && <div className="alert alert-error"><AlertCircle size={17} />Penyimpanan browser penuh atau tidak tersedia. Perubahan terbaru belum tersimpan.</div>}
        {globalSearch && page === 'dashboard' && <p className="search-hint">{filteredProducts.length} produk cocok dengan “{globalSearch}”.</p>}
        {page === 'dashboard' && globalSearch ? <SavedProducts products={filteredProducts} weights={data.weights} costs={data.costInputs}
          onSelect={(product) => selectProduct(product, 'calculator')}
          onDelete={(product) => {
            if (window.confirm(`Hapus "${product.name}" dari produk tersimpan?`)) {
              update({ products: data.products.filter((item) => item.id !== product.id) });
            }
          }}
          onSave={(product) => {
            const exists = data.products.some((item) => item.id === product.id);
            update({ products: exists ? data.products.map((item) => item.id === product.id ? product : item) : [product, ...data.products] });
          }}
          setNotice={setNotice} /> : page === 'dashboard' && <Dashboard data={data} navigate={navigate} onSelect={(product) => selectProduct(product, 'calculator')} />}
        {page === 'research' && <Research onAdd={setProduct} onSaved={() => update({ researchHistory: data.researchHistory + 1 })} setNotice={setNotice} />}
        {page === 'competitors' && <Competitors data={data} update={update} setNotice={setNotice} />}
        {page === 'suppliers' && <Suppliers data={data} update={update} setNotice={setNotice} />}
        {page === 'calculator' && <Calculator data={data} updateCosts={updateCosts} product={activeProduct} />}
        {page === 'simulation' && <Simulation data={data} updateCosts={updateCosts} product={activeProduct} />}
        {page === 'saved' && <SavedProducts products={filteredProducts} weights={data.weights} costs={data.costInputs} onSelect={(product) => selectProduct(product, 'calculator')} onDelete={(product) => {
          if (window.confirm(`Hapus "${product.name}" dari produk tersimpan?`)) {
            update({ products: data.products.filter((item) => item.id !== product.id) });
            setNotice({ kind: 'success', text: 'Produk dihapus.' });
          }
        }} onSave={(product) => {
          const exists = data.products.some((item) => item.id === product.id);
          update({ products: exists ? data.products.map((item) => item.id === product.id ? product : item) : [product, ...data.products] });
          setNotice({ kind: 'success', text: exists ? 'Data produk diperbarui.' : 'Produk baru berhasil ditambahkan.' });
        }} setNotice={setNotice} />}
        {page === 'reports' && <Reports data={data} update={update} setNotice={setNotice} />}
        {page === 'settings' && <Settings data={data} update={update} setNotice={setNotice} />}
        {page === 'chat' && <Chat
          product={activeProduct}
          data={data}
          messages={chatMessages}
          setMessages={setChatMessages}
        />}
      </div>
      <footer className="app-footer"><span>© 2026 ProdukLaku AI</span><span>Rupiah · Indonesia · Tidak ada scraping marketplace</span></footer>
    </main>
    {notice && <div className={`toast toast-${notice.kind}`} role="status">
      {notice.kind === 'success' ? <Check size={17} /> : notice.kind === 'error' ? <AlertCircle size={17} /> : <CircleHelp size={17} />}
      {notice.text}<button aria-label="Tutup notifikasi" onClick={() => setNotice(null)}><X size={15} /></button>
    </div>}
  </div>;
}

function Dashboard({ data, navigate, onSelect }: {
  data: AppData; navigate: (page: PageKey) => void; onSelect: (product: Product) => void;
}) {
  const scored = data.products.flatMap((product) => {
    if (!product.sellingPrice || !product.purchasePrice) return [];
    const result = calculateEconomics({
      ...data.costInputs, purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice,
      quantity: 1, stockPurchased: 1, fixedCost: 0,
    });
    return result.marginPercent === null ? [] : [result.marginPercent];
  });
  const avgMargin = scored.length ? scored.reduce((sum, value) => sum + value, 0) / scored.length : null;
  const estimatedCapital = data.products.reduce((sum, product) => sum + product.purchasePrice * product.stockQty, 0);
  const chartData = data.products.filter((product) => product.sellingPrice > 0 && product.purchasePrice > 0 && product.stockQty > 0).slice(0, 6)
    .map((product) => {
      const result = calculateEconomics({
        ...data.costInputs, purchasePrice: product.purchasePrice, sellingPrice: product.sellingPrice,
        quantity: product.stockQty, stockPurchased: product.stockQty, fixedCost: 0,
      });
      return { name: product.name.length > 14 ? `${product.name.slice(0, 13)}…` : product.name,
        revenue: result.revenue, profit: result.totalProfit };
    });
  const recent = [...data.products].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const highMarginCount = scored.filter((margin) => margin >= 30).length;
  const highRiskCount = data.products.filter((product) => product.risk === 'Tinggi').length;
  return <div className="page-stack">
    <PageHeading eyebrow="Senin ruang kerja" title="Selamat datang 👋" subtitle="Pantau peluang, hitung rencana, lalu ambil keputusan dengan data yang kamu miliki."
      action={<Button onClick={() => navigate('research')}><Plus size={17} /> Riset produk</Button>} />
    <div className="demo-banner"><div className="demo-banner-icon"><FlaskConical size={17} /></div>
      <div><b>Workspace lokal aktif</b><p>Dashboard hanya menampilkan data yang kamu simpan. Belum ada data marketplace terverifikasi.</p></div>
      <span className="demo-pill">DATA PRIBADI</span></div>
    <div className="metric-grid">
      <MetricCard title="Produk tersimpan" value={String(data.products.length)} detail="Data di browser ini" icon={Boxes} />
      <MetricCard title="Margin bersih rata-rata" value={avgMargin === null ? '—' : `${avgMargin.toFixed(1)}%`} detail={avgMargin === null ? 'Lengkapi harga beli & jual' : `Estimasi ${scored.length} produk, biaya kalkulator`} icon={BarChart3} tone="blue" />
      <MetricCard title="Margin bersih ≥ 30%" value={String(highMarginCount)} detail="Estimasi, bukan skor keberhasilan" icon={Gauge} tone="purple" />
      <MetricCard title="Estimasi modal stok" value={formatRupiah(estimatedCapital)} detail="HPP × jumlah stok tersimpan" icon={Wallet} tone="orange" />
      <MetricCard title="Produk risiko tinggi" value={String(highRiskCount)} detail="Berdasarkan input risiko pengguna" icon={AlertCircle} tone="orange" />
    </div>
    <div className="dashboard-grid">
      <Card className="chart-card"><div className="section-heading"><div><h2>Ringkasan nilai produk</h2><p>Proyeksi omzet & laba berdasarkan input produk dan kalkulator</p></div>
        <button className="text-link" onClick={() => navigate('saved')}>Lihat produk <ArrowRight size={15} /></button></div>
        {chartData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
            <CartesianGrid stroke="#edf1ee" vertical={false} />
            <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#87918a', fontSize: 11 }} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: '#87918a', fontSize: 10 }} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
            <Tooltip formatter={(value) => formatRupiah(Number(value))} contentStyle={{ border: '1px solid #e7ece8', borderRadius: 12, fontSize: 12 }} />
            <Bar dataKey="revenue" name="Estimasi omzet" fill="#d8e8df" radius={[5, 5, 0, 0]} />
            <Bar dataKey="profit" name="Estimasi laba (biaya kalkulator)" fill="#287654" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></div> : <EmptyState icon={BarChart3} title="Grafik menunggu data produk"
          detail="Tambahkan harga beli dan harga jual untuk melihat perbandingan estimasi di sini."
          action={<Button variant="secondary" onClick={() => navigate('saved')}>Buka produk tersimpan</Button>} />}
        <div className="chart-legend"><span><i className="legend-dot pale" />Estimasi omzet</span><span><i className="legend-dot dark" />Estimasi laba setelah biaya variabel kalkulator (tanpa biaya tetap)</span></div>
      </Card>
      <Card className="quick-card"><div className="section-heading"><div><h2>Mulai dari sini</h2><p>Alur sederhana untuk validasi awal</p></div></div>
        {[
          { icon: Sparkles, label: 'Cari ide produk', detail: 'Rumuskan hipotesis untuk divalidasi', page: 'research' as PageKey },
          { icon: CalculatorIcon, label: 'Hitung keuntungan', detail: 'Masukkan harga dan biaya nyata', page: 'calculator' as PageKey },
          { icon: Truck, label: 'Bandingkan supplier', detail: 'Hitung harga sampai di tangan', page: 'suppliers' as PageKey },
        ].map(({ icon: Icon, label, detail, page: target }, index) => <button className="quick-action" key={label} onClick={() => navigate(target)}>
          <span className="quick-number">0{index + 1}</span><span className="quick-icon"><Icon size={18} /></span>
          <span className="quick-copy"><b>{label}</b><small>{detail}</small></span><ArrowRight size={16} className="quick-arrow" />
        </button>)}
        <div className="mini-notice"><CircleHelp size={16} /><span><b>Catatan penting</b><br />Skor dan proyeksi adalah alat bantu, bukan jaminan hasil bisnis.</span></div>
      </Card>
    </div>
    <Card className="recent-card"><div className="section-heading"><div><h2>Produk terbaru</h2><p>Terakhir ditambahkan ke workspace ini</p></div>
      {recent.length > 0 && <button className="text-link" onClick={() => navigate('saved')}>Semua produk <ArrowRight size={15} /></button>}</div>
      {recent.length === 0 ? <EmptyState icon={Package} title="Belum ada produk tersimpan"
        detail="Simpan kandidat dari riset atau tambahkan data produk di halaman produk tersimpan."
        action={<Button variant="secondary" onClick={() => navigate('research')}><Sparkles size={16} /> Mulai riset</Button>} /> :
        <div className="recent-list">{recent.map((product) => <button className="recent-row" key={product.id} onClick={() => onSelect(product)}>
          <div className="product-avatar"><ShoppingBag size={17} /></div><span className="recent-name"><b>{product.name}</b><small>{product.category} · {product.marketplace}</small></span>
          <span className="recent-price">{product.sellingPrice > 0 ? formatRupiah(product.sellingPrice) : 'Harga belum diisi'}</span>
          <span className="unverified-tag">Belum diverifikasi</span><ArrowRight size={15} className="recent-arrow" />
        </button>)}</div>}
    </Card>
  </div>;
}

function Research({ onAdd, onSaved, setNotice }: {
  onAdd: (product: Product) => void; onSaved: () => void; setNotice: (notice: Notice) => void;
}) {
  const [form, setForm] = useState({ category: '', marketplace: 'Shopee', budget: 5000000, targetPrice: 50000, targetMargin: 25, weightGrams: 300, risk: 'Sedang' });
  const [ideas, setIdeas] = useState<Array<{ name: string; category: string; reason: string; riskNotes: string; missingData: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [isDemo, setIsDemo] = useState(true);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  const runResearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.category.trim()) {
      setNotice({ kind: 'error', text: 'Isi kategori atau jenis produk terlebih dahulu.' });
      return;
    }
    if ([form.budget, form.targetPrice, form.targetMargin, form.weightGrams].some((value) => !Number.isFinite(value) || value < 0)
      || form.targetPrice <= 0 || form.targetMargin > 100) {
      setNotice({ kind: 'error', text: 'Modal dan berat tidak boleh negatif. Harga harus di atas nol dan target margin maksimal 100%.' });
      return;
    }
    setLoading(true);
    setIdeas([]);
    try {
      const response = await fetch(apiUrl('ai/research'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        const error = new Error(payload.error || 'Layanan AI belum tersedia.');
        Object.assign(error, { code: payload.code });
        throw error;
      }
      setIdeas(payload.ideas);
      setIsDemo(Boolean(payload.isDemo));
      onSaved();
      setNotice({ kind: 'success', text: 'Arah riset siap ditinjau. Harga dan data pasar tetap perlu diverifikasi.' });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'AI_NOT_CONFIGURED') {
        const names = makeCandidateNames(form.category);
        setIdeas(names.map((name, index) => ({
          name,
          category: form.category,
          reason: [
            'Hipotesis awal yang bisa diuji melalui wawancara calon pembeli dan pengamatan katalog yang kamu akses secara sah.',
            'Arah diferensiasi ukuran atau penyimpanan untuk dibandingkan dengan kebutuhan target pembeli.',
            'Bundel komplementer untuk diuji; cek kecocokan dan nilai tambah melalui riset manual.',
          ][index],
          riskNotes: 'Belum ada bukti permintaan, harga, atau tingkat persaingan yang terverifikasi.',
          missingData: 'Harga supplier, biaya kirim, harga kompetitor dari sumber yang diizinkan, dan validasi calon pembeli.',
        })));
        setIsDemo(true);
        onSaved();
        setNotice({ kind: 'info', text: 'Gemini belum dikonfigurasi. Ditampilkan hipotesis demo; bukan data pasar atau tren.' });
      } else {
        setNotice({ kind: 'error', text: error instanceof TypeError
          ? 'Backend API tidak dapat dihubungi. Periksa VITE_API_URL dan pastikan backend berjalan.'
          : error instanceof Error ? error.message : 'Riset gagal diproses.' });
      }
    } finally {
      setLoading(false);
    }
  };

  return <div className="page-stack">
    <PageHeading eyebrow="Temukan peluang, bukan janji" title="AI Product Research" subtitle="Gunakan ide sebagai titik awal. Verifikasi harga, minat pembeli, dan risiko sebelum mengeluarkan modal." />
    <div className="research-layout">
      <Card className="research-form-card"><div className="form-card-heading"><div className="form-icon"><Sparkles size={19} /></div>
        <div><h2>Atur riset produk</h2><p>Sesuaikan dengan rencana dan batas modalmu</p></div></div>
        <form className="form-grid" onSubmit={runResearch}>
          <Field label="Kategori / kata kunci produk" value={form.category} placeholder="Contoh: perlengkapan dapur" required onChange={(value) => setForm({ ...form, category: value })} />
          <SelectField label="Marketplace tujuan" value={form.marketplace} options={['Shopee', 'TikTok Shop', 'Tokopedia', 'Lainnya']}
            onChange={(value) => setForm({ ...form, marketplace: value })} />
          <Field label="Modal yang tersedia" type="number" min={0} step={1} suffix="Rp" value={form.budget} onChange={(value) => setForm({ ...form, budget: Number(value) })} />
          <Field label="Target harga jual" type="number" min={0} step={1} suffix="Rp" value={form.targetPrice} onChange={(value) => setForm({ ...form, targetPrice: Number(value) })} />
          <Field label="Target margin" type="number" min={0} max={100} step={1} suffix="%" value={form.targetMargin} onChange={(value) => setForm({ ...form, targetMargin: Number(value) })} />
          <Field label="Berat produk" type="number" min={0} step={50} suffix="gram" value={form.weightGrams} onChange={(value) => setForm({ ...form, weightGrams: Number(value) })} />
          <SelectField label="Risiko yang dapat diterima" value={form.risk} options={['Rendah', 'Sedang', 'Tinggi']}
            onChange={(value) => setForm({ ...form, risk: value })} />
          <div className="form-actions"><Button type="submit" disabled={loading}><Sparkles size={16} />{loading ? 'Menyusun arah riset…' : 'Buat arah riset'}</Button>
            <span>Tanpa scraping marketplace</span></div>
        </form>
      </Card>
      <Card className="research-tip-card"><div className="research-tip-top"><span className="tip-orbit"><Sparkles size={20} /></span><span className="demo-pill">PANDUAN</span></div>
        <h2>AI sebagai partner berpikir</h2><p>Hasil riset adalah hipotesis, bukan rekomendasi jual atau bukti produk akan laku.</p>
        <div className="tip-divider" /><ul className="tip-list">
          <li><Check size={15} />Masukkan biaya nyata dari supplier.</li>
          <li><Check size={15} />Catat sumber dan tanggal harga kompetitor.</li>
          <li><Check size={15} />Uji permintaan lewat sampel kecil.</li>
        </ul><span className="tip-footnote"><AlertCircle size={14} />Angka dari inputmu tetap perlu diverifikasi.</span>
      </Card>
    </div>
    {ideas.length > 0 && <section className="result-section">
      <div className="section-heading"><div><h2>Arah riset untuk “{form.category}”</h2><p>{ideas.length} ide untuk diselidiki lebih lanjut · {isDemo ? 'panduan demo' : 'respons AI'}</p></div>
        <span className="unverified-tag"><AlertCircle size={13} />Belum terverifikasi</span></div>
      <div className="idea-grid">{ideas.map((idea, index) => {
        const saved = savedIds.includes(`${index}:${idea.name}`);
        return <Card className="idea-card" key={`${idea.name}-${index}`}>
          <div className="idea-number">ARAH {String(index + 1).padStart(2, '0')} <span>Hipotesis</span></div>
          <h3>{idea.name}</h3><p className="idea-category">{idea.category} · {form.marketplace}</p>
          <div className="idea-detail"><b>Alasan untuk diuji</b><p>{idea.reason}</p></div>
          <div className="idea-warning"><b>Risiko & data yang belum ada</b><p>{idea.riskNotes}</p><p>{idea.missingData}</p></div>
          <div className="idea-prices"><span>Harga supplier <b>Belum ada data</b></span><span>Estimasi margin <b>Belum dapat dihitung</b></span></div>
          <Button variant={saved ? 'secondary' : 'primary'} disabled={saved} onClick={() => {
            const product: Product = {
              id: id(), name: idea.name, category: idea.category, marketplace: form.marketplace,
              purchasePrice: 0, sellingPrice: 0, weightGrams: form.weightGrams, stockQty: 0,
              risk: form.risk as Product['risk'], notes: idea.missingData, verified: false, createdAt: new Date().toISOString(),
            };
            onAdd(product);
            setSavedIds((current) => [...current, `${index}:${idea.name}`]);
          }}>{saved ? <><Check size={15} />Tersimpan</> : <><Plus size={15} />Simpan untuk diteliti</>}</Button>
        </Card>;
      })}</div>
    </section>}
  </div>;
}

const emptyCompetitor = (): Omit<Competitor, 'id'> => ({
  name: '', price: 0, shipping: 0, strength: '', weakness: '', observedAt: today(), source: '',
});

function Competitors({ data, update, setNotice }: {
  data: AppData; update: (patch: Partial<AppData>) => void; setNotice: (notice: Notice) => void;
}) {
  const [form, setForm] = useState<Omit<Competitor, 'id'>>(emptyCompetitor());
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [fileKey, setFileKey] = useState(0);
  const visible = data.competitors.filter((item) => `${item.name} ${item.source}`.toLowerCase().includes(query.toLowerCase()));
  const saveCompetitor = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.source.trim() || form.price <= 0 || form.shipping < 0 || !isValidDate(form.observedAt)) {
      setNotice({ kind: 'error', text: 'Nama, harga, sumber, dan tanggal wajib diisi. Ongkir tidak boleh negatif.' });
      return;
    }
    if ((form.rating !== undefined && (form.rating < 0 || form.rating > 5))
      || (form.sales !== undefined && (!Number.isInteger(form.sales) || form.sales < 0))
      || (form.reviews !== undefined && (!Number.isInteger(form.reviews) || form.reviews < 0))) {
      setNotice({ kind: 'error', text: 'Rating harus 0–5; penjualan dan ulasan harus berupa bilangan bulat nol atau lebih.' });
      return;
    }
    const item: Competitor = { ...form, name: form.name.trim(), id: editing ?? id() };
    update({ competitors: editing ? data.competitors.map((current) => current.id === editing ? item : current) : [item, ...data.competitors] });
    setForm(emptyCompetitor()); setEditing(null);
    setNotice({ kind: 'success', text: editing ? 'Data kompetitor diperbarui.' : 'Data kompetitor ditambahkan.' });
  };
  const importCsv = async (file?: File) => {
    if (!file) return;
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('CSV harus berisi header dan minimal satu baris data.');
      const headers = rows[0].map((value) => value.trim().toLowerCase());
      if (new Set(headers).size !== headers.length || headers.some((header) => !header)) {
        throw new Error('Header CSV tidak boleh kosong atau duplikat.');
      }
      const nameColumn = headers.indexOf('name');
      const priceColumn = headers.indexOf('price');
      const dateColumn = headers.indexOf('observedat');
      const sourceColumn = headers.indexOf('source');
      if (nameColumn < 0 || priceColumn < 0 || dateColumn < 0 || sourceColumn < 0) {
        throw new Error('Kolom wajib: name, price, observedAt, source. Opsional: shipping, sales, rating, reviews, strength, weakness.');
      }
      const indexOf = (key: string) => headers.indexOf(key);
      const imported: Competitor[] = rows.slice(1).map((row, rowIndex) => {
        if (row.length > headers.length) throw new Error(`Baris ${rowIndex + 2}: jumlah kolom melebihi header CSV.`);
        const value = (key: string) => row[indexOf(key)] ?? '';
        const price = Number(value('price'));
        const shipping = value('shipping') ? Number(value('shipping')) : 0;
        if (!value('name').trim() || !Number.isFinite(price) || price <= 0 || !Number.isFinite(shipping) || shipping < 0
          || !value('source').trim() || !isValidDate(value('observedat'))) {
          throw new Error(`Baris ${rowIndex + 2}: nama, harga, sumber, dan tanggal observasi wajib valid; ongkir harus nol atau lebih.`);
        }
        const optionalNumber = (key: string) => {
          const raw = value(key);
          if (!raw) return undefined;
          const number = Number(raw);
          if (!Number.isFinite(number) || number < 0 || (key === 'rating' && number > 5)
            || (['sales', 'reviews'].includes(key) && !Number.isInteger(number))) {
            throw new Error(`Baris ${rowIndex + 2}: nilai ${key} tidak valid.`);
          }
          return number;
        };
        return {
          id: id(), name: value('name').trim(), price, shipping, sales: optionalNumber('sales'),
          rating: optionalNumber('rating'), reviews: optionalNumber('reviews'),
          strength: value('strength'), weakness: value('weakness'),
          observedAt: value('observedat'), source: value('source').trim(),
        };
      });
      update({ competitors: [...imported, ...data.competitors] });
      setNotice({ kind: 'success', text: `${imported.length} baris kompetitor berhasil diimpor.` });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Gagal membaca file CSV.' });
    } finally {
      setFileKey((current) => current + 1);
    }
  };
  const prices = visible.map((item) => ({ name: item.name, price: item.price + item.shipping }));
  return <div className="page-stack"><PageHeading eyebrow="Data yang kamu kumpulkan" title="Analisis kompetitor" subtitle="Bandingkan harga total produk dan ongkir berdasarkan catatan yang kamu masukkan sendiri." action={
    <label className="button button-secondary upload-button"><FileSpreadsheet size={16} />Impor CSV<input key={fileKey} type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0])} /></label>} />
    <div className="source-banner"><AlertCircle size={17} /><span><b>Masukkan data yang bersumber jelas.</b> Tidak ada pengambilan data otomatis. Simpan sumber dan tanggal observasi untuk setiap catatan.</span></div>
    <Card className="data-form-card"><div className="section-heading"><div><h2>{editing ? 'Edit kompetitor' : 'Tambah kompetitor'}</h2><p>Harga per unit dan ongkir akan dibandingkan sebagai total biaya pembeli.</p></div></div>
      <form className="form-grid form-grid-4" onSubmit={saveCompetitor}>
        <Field label="Nama produk / toko" value={form.name} placeholder="Nama yang terlihat" onChange={(value) => setForm({ ...form, name: value })} required />
        <Field label="Harga produk" type="number" min={0} step={1} suffix="Rp" value={form.price || ''} onChange={(value) => setForm({ ...form, price: Number(value) })} required />
        <Field label="Ongkir" type="number" min={0} step={1} suffix="Rp" value={form.shipping} onChange={(value) => setForm({ ...form, shipping: Number(value) })} />
        <Field label="Sumber data" value={form.source} placeholder="URL / catatan manual" onChange={(value) => setForm({ ...form, source: value })} required />
        <Field label="Tanggal observasi" type="date" value={form.observedAt} onChange={(value) => setForm({ ...form, observedAt: value })} required />
        <Field label="Penjualan (opsional)" type="number" min={0} value={form.sales ?? ''} onChange={(value) => setForm({ ...form, sales: value ? Number(value) : undefined })} />
        <Field label="Rating 0–5 (opsional)" type="number" min={0} max={5} step={0.1} value={form.rating ?? ''} onChange={(value) => setForm({ ...form, rating: value ? Number(value) : undefined })} />
        <Field label="Jumlah ulasan (opsional)" type="number" min={0} value={form.reviews ?? ''} onChange={(value) => setForm({ ...form, reviews: value ? Number(value) : undefined })} />
        <Field label="Keunggulan (opsional)" value={form.strength} onChange={(value) => setForm({ ...form, strength: value })} />
        <Field label="Kekurangan (opsional)" value={form.weakness} onChange={(value) => setForm({ ...form, weakness: value })} />
        <div className="form-actions form-span-all"><Button type="submit"><Plus size={16} />{editing ? 'Simpan perubahan' : 'Tambah kompetitor'}</Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(emptyCompetitor()); }}>Batal</Button>}</div>
      </form>
    </Card>
    <Card className="table-card"><div className="section-heading"><div><h2>Catatan kompetitor</h2><p>{visible.length} data · total harga sudah termasuk ongkir</p></div>
      <label className="table-search"><Search size={15} /><input aria-label="Cari kompetitor" placeholder="Cari..." value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      {prices.length > 0 && <div className="competitor-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={prices.slice(0, 8)} layout="vertical" margin={{ left: 12, right: 25 }}>
        <CartesianGrid stroke="#edf1ee" horizontal={false} /><XAxis type="number" hide />
        <YAxis type="category" dataKey="name" width={125} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#66736b' }} />
        <Tooltip formatter={(value) => formatRupiah(Number(value))} />
        <Bar dataKey="price" name="Harga + ongkir" fill="#287654" radius={[0, 5, 5, 0]} barSize={18} />
      </BarChart></ResponsiveContainer></div>}
      {visible.length === 0 ? <EmptyState icon={BarChart3} title={query ? 'Kompetitor tidak ditemukan' : 'Belum ada data kompetitor'}
        detail={query ? 'Coba kata kunci lain.' : 'Tambahkan catatan atau impor CSV untuk membandingkan harga dari data yang kamu miliki.'} /> :
        <div className="table-scroll"><table><thead><tr><th>Produk / sumber</th><th>Harga produk</th><th>Ongkir</th><th>Total</th><th>Rating</th><th>Observasi</th><th>Aksi</th></tr></thead>
          <tbody>{visible.map((item) => <tr key={item.id}><td><b>{item.name}</b><small>{item.source}</small></td>
            <td>{formatRupiah(item.price)}</td><td>{formatRupiah(item.shipping)}</td><td><b>{formatRupiah(item.price + item.shipping)}</b></td>
            <td>{item.rating === undefined ? '—' : `${item.rating.toFixed(1)}${item.reviews === undefined ? '' : ` · ${item.reviews} ulasan`}`}</td><td>{item.observedAt}</td>
            <td><div className="table-actions"><button aria-label={`Edit ${item.name}`} onClick={() => { setEditing(item.id); setForm({ ...item }); }}><Settings2 size={15} /></button>
              <button aria-label={`Hapus ${item.name}`} onClick={() => { if (window.confirm(`Hapus catatan "${item.name}"?`)) update({ competitors: data.competitors.filter((current) => current.id !== item.id) }); }}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table></div>}
      <p className="table-footnote">Grafik hanya merangkum input manual/CSV, bukan cakupan seluruh pasar. Periksa kembali sumber dan tanggal.</p>
    </Card>
  </div>;
}

const emptySupplier = (): Omit<Supplier, 'id'> => ({
  name: '', product: '', unitPrice: 0, moq: 1, shipping: 0, leadDays: 0,
  location: '', terms: '', quality: '', updatedAt: today(),
});

function Suppliers({ data, update, setNotice }: {
  data: AppData; update: (patch: Partial<AppData>) => void; setNotice: (notice: Notice) => void;
}) {
  const [form, setForm] = useState<Omit<Supplier, 'id'>>(emptySupplier());
  const [editing, setEditing] = useState<string | null>(null);
  const [planned, setPlanned] = useState(50);
  const [query, setQuery] = useState('');
  const filtered = data.suppliers.filter((item) => `${item.name} ${item.product} ${item.location}`.toLowerCase().includes(query.toLowerCase()));
  const ranked = filtered.flatMap((supplier) => {
    try {
      return [{ supplier, ...calculateSupplierLandedCost(supplier, planned) }];
    } catch {
      return [];
    }
  }).sort((a, b) => a.unitLandedCost - b.unitLandedCost);
  const saveSupplier = (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.product.trim() || form.unitPrice <= 0 || form.moq < 1 || !Number.isInteger(form.moq)
      || form.shipping < 0 || form.leadDays < 0 || !Number.isInteger(form.leadDays) || !isValidDate(form.updatedAt)) {
      setNotice({ kind: 'error', text: 'Lengkapi supplier, produk, harga, MOQ, dan waktu kirim dengan angka valid.' });
      return;
    }
    const supplier: Supplier = { ...form, id: editing ?? id(), name: form.name.trim(), product: form.product.trim() };
    update({ suppliers: editing ? data.suppliers.map((item) => item.id === editing ? supplier : item) : [supplier, ...data.suppliers] });
    setEditing(null); setForm(emptySupplier());
    setNotice({ kind: 'success', text: editing ? 'Data supplier diperbarui.' : 'Supplier berhasil ditambahkan.' });
  };
  return <div className="page-stack"><PageHeading eyebrow="Biaya sampai di tangan" title="Analisis supplier" subtitle="Bandingkan total pembelian berdasarkan harga, MOQ, dan ongkir untuk jumlah yang direncanakan." />
    <div className="supplier-planned"><div><div className="planned-icon"><Truck size={18} /></div><div><b>Rencana pembelian</b><small>Perbandingan memakai MOQ minimum dan total ongkir per pesanan.</small></div></div>
      <Field label="Unit direncanakan" type="number" min={1} step={1} value={planned} onChange={(value) => setPlanned(Math.max(1, Math.trunc(Number(value) || 1)))} /></div>
    <Card className="data-form-card"><div className="section-heading"><div><h2>{editing ? 'Edit supplier' : 'Tambah supplier'}</h2><p>Catat harga terbaru dan syarat pemesanan yang kamu konfirmasi.</p></div></div>
      <form className="form-grid form-grid-4" onSubmit={saveSupplier}>
        <Field label="Nama supplier" value={form.name} onChange={(value) => setForm({ ...form, name: value })} required />
        <Field label="Nama produk" value={form.product} onChange={(value) => setForm({ ...form, product: value })} required />
        <Field label="Harga beli per unit" type="number" min={0} step={1} suffix="Rp" value={form.unitPrice || ''} onChange={(value) => setForm({ ...form, unitPrice: Number(value) })} required />
        <Field label="MOQ" type="number" min={1} step={1} suffix="unit" value={form.moq} onChange={(value) => setForm({ ...form, moq: Number(value) })} required />
        <Field label="Ongkir per pesanan" type="number" min={0} step={1} suffix="Rp" value={form.shipping} onChange={(value) => setForm({ ...form, shipping: Number(value) })} />
        <Field label="Estimasi pengiriman" type="number" min={0} step={1} suffix="hari" value={form.leadDays} onChange={(value) => setForm({ ...form, leadDays: Number(value) })} />
        <Field label="Lokasi supplier" value={form.location} onChange={(value) => setForm({ ...form, location: value })} />
        <Field label="Syarat pembayaran" value={form.terms} onChange={(value) => setForm({ ...form, terms: value })} />
        <Field label="Catatan kualitas" value={form.quality} onChange={(value) => setForm({ ...form, quality: value })} />
        <Field label="Tanggal update harga" type="date" value={form.updatedAt} onChange={(value) => setForm({ ...form, updatedAt: value })} />
        <div className="form-actions form-span-all"><Button type="submit"><Plus size={16} />{editing ? 'Simpan perubahan' : 'Tambah supplier'}</Button>
          {editing && <Button variant="ghost" onClick={() => { setEditing(null); setForm(emptySupplier()); }}>Batal</Button>}</div>
      </form>
    </Card>
    <Card className="table-card"><div className="section-heading"><div><h2>Perbandingan biaya total</h2><p>Biaya unit-terkirim = (harga × kuantitas + ongkir) ÷ kuantitas</p></div>
      <label className="table-search"><Search size={15} /><input aria-label="Cari supplier" placeholder="Cari supplier..." value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
      {ranked.length === 0 ? <EmptyState icon={Store} title={query ? 'Supplier tidak ditemukan' : 'Belum ada supplier'}
        detail="Tambahkan informasi supplier untuk menghitung total biaya pembelian, bukan hanya harga satuan." /> :
        <div className="table-scroll"><table><thead><tr><th>Supplier / produk</th><th>Qty dibeli</th><th>Harga + ongkir</th><th>Biaya / unit</th><th>Pengiriman</th><th>Lokasi · Update</th><th>Aksi</th></tr></thead>
          <tbody>{ranked.map(({ supplier, quantity, totalCost, unitLandedCost }, index) => <tr key={supplier.id}>
            <td><b>{supplier.name}</b><small>{supplier.product}{index === 0 && <span className="best-tag">Biaya terendah</span>}</small></td>
            <td>{quantity} unit <small>MOQ {supplier.moq}</small></td><td>{formatRupiah(totalCost)}<small>Termasuk ongkir {formatRupiah(supplier.shipping)}</small></td>
            <td><b>{formatRupiah(unitLandedCost)}</b></td><td>{supplier.leadDays} hari</td><td>{supplier.location || '—'}<small>{supplier.updatedAt}</small></td>
            <td><div className="table-actions"><button aria-label={`Edit ${supplier.name}`} onClick={() => { setEditing(supplier.id); setForm({ ...supplier }); }}><Settings2 size={15} /></button>
              <button aria-label={`Hapus ${supplier.name}`} onClick={() => { if (window.confirm(`Hapus supplier "${supplier.name}"?`)) update({ suppliers: data.suppliers.filter((item) => item.id !== supplier.id) }); }}><Trash2 size={15} /></button></div></td>
          </tr>)}</tbody></table></div>}
      {ranked.length > 0 && <p className="table-footnote">Peringkat hanya berdasarkan biaya unit termasuk ongkir. Kualitas, tempo, dan keandalan belum dinilai secara otomatis.</p>}
    </Card>
  </div>;
}

function Calculator({ data, updateCosts, product }: {
  data: AppData; updateCosts: (patch: Partial<CostInputs>) => void; product?: Product;
}) {
  const input = data.costInputs;
  const productPricesMissing = Boolean(product && (!product.purchasePrice || !product.sellingPrice));
  const result = useMemo(() => {
    if (productPricesMissing) return null;
    try { return calculateEconomics(input); } catch { return null; }
  }, [input, productPricesMissing]);
  const numberField = (label: string, key: keyof CostInputs, suffix?: string, step = 500) =>
    <Field key={key} label={label} type="number" min={0} step={step} suffix={suffix}
      value={input[key]} onChange={(value) => updateCosts({ [key]: Math.max(0, Number(value) || 0) })} />;
  return <div className="page-stack"><PageHeading eyebrow="Hitung sebelum menentukan harga" title="Kalkulator keuntungan" subtitle="Rincikan biaya variabel, biaya tetap, dan stok. Hasil berubah langsung saat input diperbarui."
    action={product && <span className="selected-product"><Package size={15} />{product.name}</span>} />
    <div className="source-banner"><CircleHelp size={17} /><span>Nilai awal kalkulator adalah <b>asumsi contoh yang dapat diedit</b>. Laba belum mencakup biaya yang tidak dimasukkan; pajak bawaan 0%.</span></div>
    <div className="calculator-layout"><Card className="calculator-form"><div className="section-heading"><div><h2>Rincian biaya</h2><p>Masukkan nominal Rupiah per pesanan kecuali dinyatakan lain.</p></div></div>
      <div className="form-grid form-grid-2">
        {numberField('Harga beli / HPP per unit', 'purchasePrice', 'Rp')}
        {numberField('Harga jual per unit', 'sellingPrice', 'Rp')}
        {numberField('Biaya admin marketplace', 'marketplaceFeePercent', '%', 0.1)}
        {numberField('Biaya layanan & pembayaran', 'serviceFee', 'Rp')}
        {numberField('Kemasan per unit', 'packaging', 'Rp')}
        {numberField('Subsidi ongkir penjual', 'shippingSubsidy', 'Rp')}
        {numberField('Iklan per pesanan', 'advertising', 'Rp')}
        {numberField('Operasional per unit', 'operations', 'Rp')}
        {numberField('Alokasi retur / kerusakan', 'returnRatePercent', '%', 0.1)}
        {numberField('Pajak (bila relevan)', 'taxPercent', '%', 0.1)}
        {numberField('Jumlah terjual', 'quantity', 'unit', 1)}
        {numberField('Stok yang dibeli', 'stockPurchased', 'unit', 1)}
        {numberField('Biaya tetap periode', 'fixedCost', 'Rp')}
      </div>
      {!result && <div className="alert alert-error"><AlertCircle size={16} />{productPricesMissing
        ? 'Harga beli dan harga jual produk ini belum tersedia. Isi kedua nilai sebelum menghitung keuntungan.'
        : 'Periksa angka: persentase maksimal 100%, jumlah unit bilangan bulat, dan jumlah terjual tidak boleh melebihi stok.'}</div>}
    </Card>
    <div className="calculator-results"><Card className="profit-highlight"><span className="result-overline">LABA BERSIH ESTIMASI · PERIODE</span>
      <strong>{result ? formatRupiah(result.totalProfit) : 'Input belum valid'}</strong>
      <p>{result ? `${input.quantity} unit terjual · setelah biaya variabel dan biaya tetap` : 'Periksa jumlah terjual dan stok.'}</p>
      {result && result.totalProfit < 0 && <span className="loss-pill">Proyeksi rugi</span>}
      {result && result.totalProfit >= 0 && <span className="positive-pill"><Check size={13} />Proyeksi positif, bukan jaminan</span>}
    </Card>
      <Card className="breakdown-card"><div className="section-heading"><div><h2>Rangkuman unit economics</h2><p>Komponen biaya tidak dihitung ganda.</p></div></div>
        <div className="breakdown-list">{[
          ['Omzet', result ? formatRupiah(result.revenue) : '—'],
          ['Biaya variabel per unit', result ? formatRupiah(result.totalCostPerUnit) : '—'],
          ['Laba per unit', result ? formatRupiah(result.profitPerUnit) : '—'],
          ['Margin bersih periode', result?.marginPercent === null || !result ? 'Tidak dapat dihitung' : `${result.marginPercent.toFixed(1)}%`],
          ['Modal digunakan (model)', result ? formatRupiah(result.investedCapital) : '—'],
          ['ROI atas modal digunakan', result?.roiPercent === null || !result ? 'Tidak dapat dihitung' : `${result.roiPercent.toFixed(1)}%`],
          ['Break-even (unit terjual)', result?.breakEvenUnits === null ? 'Tidak tercapai pada margin ini' : String(result?.breakEvenUnits ?? '—')],
        ].map(([label, value], index) => <div className={`breakdown-row ${index === 0 ? 'breakdown-total' : ''}`} key={label}><span>{label}</span><b>{value}</b></div>)}</div>
        <p className="break-even-note">BEP = biaya tetap ÷ margin kontribusi per unit. Modal model = HPP seluruh stok + biaya variabel penjualan + biaya tetap.</p>
      </Card>
    </div>
    </div>
    <Card className="formula-card"><div className="formula-symbol"><FlaskConical size={19} /></div><div><b>Rumus yang digunakan</b>
      <p>Laba periode = omzet − (HPP + biaya variabel lain) × unit terjual − biaya tetap. Margin = laba ÷ omzet. ROI = laba ÷ modal yang dimodelkan.</p></div></Card>
  </div>;
}

function Simulation({ data, updateCosts, product }: {
  data: AppData; updateCosts: (patch: Partial<CostInputs>) => void; product?: Product;
}) {
  const [startingCapital, setStartingCapital] = useState(10000000);
  const input = data.costInputs;
  const scenarios = useMemo(() => {
    const definitions = [
      { name: 'Pesimistis', portion: 0.4, extraReturn: 3, costFactor: 1.2, color: '#c97965' },
      { name: 'Normal', portion: Math.min(1, input.quantity / Math.max(1, input.stockPurchased)), extraReturn: 0, costFactor: 1, color: '#d49b3d' },
      { name: 'Optimistis', portion: 0.9, extraReturn: 0, costFactor: 0.9, color: '#287654' },
    ];
    return definitions.map((scenario) => {
      const sold = Math.min(input.stockPurchased, Math.floor(input.stockPurchased * scenario.portion));
      const returns = Math.min(100, input.returnRatePercent + scenario.extraReturn);
      const variablePerUnit = input.purchasePrice + input.sellingPrice * input.marketplaceFeePercent / 100 + input.serviceFee
        + input.packaging + input.shippingSubsidy + input.advertising * scenario.costFactor
        + input.operations * scenario.costFactor + (input.purchasePrice + input.packaging) * returns / 100
        + input.sellingPrice * input.taxPercent / 100;
      const revenue = sold * input.sellingPrice;
      const profit = revenue - sold * variablePerUnit - input.fixedCost;
      const cashFlow = revenue - input.purchasePrice * input.stockPurchased
        - sold * (variablePerUnit - input.purchasePrice) - input.fixedCost;
      const unsoldCapital = (input.stockPurchased - sold) * input.purchasePrice;
      const breakEven = input.sellingPrice > variablePerUnit ? Math.ceil(input.fixedCost / (input.sellingPrice - variablePerUnit)) : null;
      return { ...scenario, sold, revenue, profit, cashFlow, unsoldCapital, breakEven, stockLeft: input.stockPurchased - sold };
    });
  }, [input]);
  const capitalUsed = input.purchasePrice * input.stockPurchased + input.quantity * (
    input.sellingPrice * input.marketplaceFeePercent / 100 + input.serviceFee + input.packaging
    + input.shippingSubsidy + input.advertising + input.operations
    + (input.purchasePrice + input.packaging) * input.returnRatePercent / 100
    + input.sellingPrice * input.taxPercent / 100
  ) + input.fixedCost;
  const sensitivity = scenarios.map((scenario) => {
    const profitAt = (priceFactor: number, otherCostFactor: number) => {
      const price = input.sellingPrice * priceFactor;
      const variablePerUnit = input.purchasePrice + price * input.marketplaceFeePercent / 100 + input.serviceFee
        + input.packaging + input.shippingSubsidy + input.advertising * scenario.costFactor
        + input.operations * scenario.costFactor
        + (input.purchasePrice + input.packaging) * Math.min(100, input.returnRatePercent + scenario.extraReturn) / 100
        + price * input.taxPercent / 100;
      const nonCogsCosts = variablePerUnit - input.purchasePrice;
      return Math.round(scenario.sold * (price - input.purchasePrice - nonCogsCosts * otherCostFactor) - input.fixedCost);
    };
    return {
      name: scenario.name,
      base: scenario.profit,
      priceUp: profitAt(1.1, 1),
      costsUp: profitAt(1, 1.1),
    };
  });
  return <div className="page-stack"><PageHeading eyebrow="Uji skenario sebelum belanja stok" title="Simulasi modal & risiko" subtitle="Ubah asumsi penjualan dan biaya. Hasil adalah simulasi internal, bukan prediksi permintaan." action={
    product && <span className="selected-product"><Package size={15} />{product.name}</span>} />
    <div className="source-banner"><AlertCircle size={17} /><span>Asumsi skenario: pesimistis menjual 40% stok dengan biaya iklan/operasional +20%; normal memakai unit terjual kalkulator; optimistis menjual 90% dengan biaya −10%. Ubah angka input agar sesuai rencana.</span></div>
    <Card className="simulation-inputs"><div className="section-heading"><div><h2>Asumsi simulasi</h2><p>Nilai biaya lain menggunakan input di kalkulator keuntungan.</p></div><button className="text-link" onClick={() => {
      updateCosts({ purchasePrice: DEFAULT_COST_INPUTS.purchasePrice, sellingPrice: DEFAULT_COST_INPUTS.sellingPrice,
        quantity: DEFAULT_COST_INPUTS.quantity, stockPurchased: DEFAULT_COST_INPUTS.stockPurchased,
        returnRatePercent: DEFAULT_COST_INPUTS.returnRatePercent, advertising: DEFAULT_COST_INPUTS.advertising,
        operations: DEFAULT_COST_INPUTS.operations, fixedCost: DEFAULT_COST_INPUTS.fixedCost });
      setStartingCapital(10000000);
    }}><ArrowLeft size={14} />Reset asumsi</button></div>
      <div className="form-grid form-grid-4">
        <Field label="Modal awal" type="number" min={0} step={100000} suffix="Rp" value={startingCapital} onChange={(value) => setStartingCapital(Math.max(0, Number(value) || 0))} />
        <Field label="Jumlah stok dibeli" type="number" min={0} step={1} suffix="unit" value={input.stockPurchased} onChange={(value) => {
          const stockPurchased = Math.max(0, Math.trunc(Number(value) || 0));
          updateCosts({ stockPurchased, quantity: Math.min(input.quantity, stockPurchased) });
        }} />
        <Field label="Harga beli per unit" type="number" min={0} step={500} suffix="Rp" value={input.purchasePrice} onChange={(value) => updateCosts({ purchasePrice: Math.max(0, Number(value) || 0) })} />
        <Field label="Harga jual per unit" type="number" min={0} step={500} suffix="Rp" value={input.sellingPrice} onChange={(value) => updateCosts({ sellingPrice: Math.max(0, Number(value) || 0) })} />
        <Field label="Unit terjual (normal)" type="number" min={0} max={input.stockPurchased} step={1} value={input.quantity} onChange={(value) => updateCosts({ quantity: Math.min(input.stockPurchased, Math.max(0, Math.trunc(Number(value) || 0))) })} />
        <Field label="Persentase retur" type="number" min={0} max={100} step={0.5} suffix="%" value={input.returnRatePercent} onChange={(value) => updateCosts({ returnRatePercent: Math.min(100, Math.max(0, Number(value) || 0)) })} />
        <Field label="Biaya iklan / pesanan" type="number" min={0} suffix="Rp" value={input.advertising} onChange={(value) => updateCosts({ advertising: Math.max(0, Number(value) || 0) })} />
        <Field label="Biaya operasional / unit" type="number" min={0} suffix="Rp" value={input.operations} onChange={(value) => updateCosts({ operations: Math.max(0, Number(value) || 0) })} />
      </div>
      <div className={`capital-use ${capitalUsed > startingCapital ? 'capital-over' : ''}`}><Wallet size={18} /><span>Modal stok + biaya penjualan pada skenario normal</span><b>{formatRupiah(capitalUsed)}</b><small>{startingCapital > 0 ? `${(capitalUsed / startingCapital * 100).toFixed(0)}% dari modal awal` : 'Modal awal belum diisi'}</small></div>
      {capitalUsed > startingCapital && <p className="field-warning"><AlertCircle size={14} />Rencana menggunakan modal lebih besar dari modal awal yang tersedia.</p>}
    </Card>
    <div className="scenario-grid">{scenarios.map((scenario) => <Card className="scenario-card" key={scenario.name}>
      <div className="scenario-heading"><span className="scenario-dot" style={{ background: scenario.color }} /><h3>{scenario.name}</h3>
        <span className={`scenario-tag scenario-${scenario.name.toLowerCase()}`}>{scenario.sold} unit terjual</span></div>
      <strong className={scenario.profit < 0 ? 'negative-value' : ''}>{formatRupiah(scenario.profit)}</strong><small>Estimasi laba / rugi</small>
      <div className="scenario-details"><span>Omzet <b>{formatRupiah(scenario.revenue)}</b></span>
        <span>Arus kas bersih <b className={scenario.cashFlow < 0 ? 'negative-value' : ''}>{formatRupiah(scenario.cashFlow)}</b></span>
        <span>Stok tersisa <b>{scenario.stockLeft} unit</b></span>
        <span>Modal tertahan <b>{formatRupiah(scenario.unsoldCapital)}</b></span>
        <span>Titik impas <b>{scenario.breakEven === null ? 'Tidak tercapai' : `${scenario.breakEven} unit`}</b></span></div>
    </Card>)}</div>
    <Card className="chart-card simulation-chart"><div className="section-heading"><div><h2>Perbandingan hasil simulasi</h2><p>Hasil rumus deterministik dari input dan skenario yang dijelaskan di atas.</p></div></div>
      <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={scenarios} margin={{ left: 6, right: 10, bottom: 2 }}>
        <CartesianGrid stroke="#edf1ee" vertical={false} /><XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(value: number) => `${Math.round(value / 1000)}k`} />
        <Tooltip formatter={(value) => formatRupiah(Number(value))} /><Bar dataKey="revenue" name="Omzet" fill="#cddfd3" radius={[5, 5, 0, 0]} />
        <Bar dataKey="profit" name="Laba / rugi" radius={[5, 5, 0, 0]}>{scenarios.map((scenario) => <Cell key={scenario.name} fill={scenario.color} />)}</Bar>
      </BarChart></ResponsiveContainer></div>
    </Card>
    <Card className="table-card"><div className="section-heading"><div><h2>Sensitivitas terhadap perubahan asumsi</h2><p>Dampak perubahan harga jual +10% atau seluruh biaya non-HPP +10% pada laba skenario.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Skenario</th><th>Laba dasar</th><th>Harga jual +10%</th><th>Biaya non-HPP +10%</th></tr></thead>
        <tbody>{sensitivity.map((scenario) => <tr key={scenario.name}><td><b>{scenario.name}</b></td>
          <td>{formatRupiah(scenario.base)}</td><td>{formatRupiah(scenario.priceUp)}</td><td>{formatRupiah(scenario.costsUp)}</td></tr>)}</tbody>
      </table></div>
      <p className="table-footnote">Analisis sensitivitas menahan volume penjualan tetap pada tiap skenario. Perubahan harga tidak mengubah asumsi unit terjual.</p>
    </Card>
    <p className="table-footnote">Arus kas mengurangi pembelian seluruh stok di awal. Laba memperlakukan stok yang belum terjual sebagai persediaan, bukan biaya terjual. ROI modal detail tersedia di kalkulator.</p>
  </div>;
}

function SavedProducts({ products, weights, costs, onSelect, onDelete, onSave, setNotice }: {
  products: Product[]; weights: AppData['weights']; costs: CostInputs; onSelect: (product: Product) => void; onDelete: (product: Product) => void;
  onSave: (product: Product) => void; setNotice: (notice: Notice) => void;
}) {
  const [filter, setFilter] = useState('Semua');
  const [editor, setEditor] = useState<Product | null>(null);
  const visible = products.filter((product) => filter === 'Semua' || product.risk === filter);
  return <div className="page-stack"><PageHeading eyebrow="Library pribadi" title="Produk tersimpan" subtitle="Simpan kandidat, lengkapi informasi yang terverifikasi, lalu buka kalkulator untuk mengujinya."
    action={<Button onClick={() => setEditor({ id: id(), name: '', category: '', marketplace: 'Shopee', purchasePrice: 0, sellingPrice: 0, weightGrams: 0, stockQty: 0, risk: 'Sedang', notes: '', verified: false, createdAt: new Date().toISOString() })}><Plus size={16} />Tambah produk</Button>} />
    {editor && <Card className="data-form-card"><div className="section-heading"><div><h2>{products.some((product) => product.id === editor.id) ? 'Edit produk' : 'Tambah produk'}</h2>
      <p>Gunakan data yang sudah kamu verifikasi. Kolom harga dapat dikosongkan (Rp 0) jika belum diketahui.</p></div>
      <button className="icon-button" aria-label="Tutup editor produk" onClick={() => setEditor(null)}><X size={16} /></button></div>
      <form className="form-grid form-grid-4" onSubmit={(event) => {
        event.preventDefault();
        if (!editor.name.trim() || !editor.category.trim()
          || [editor.purchasePrice, editor.sellingPrice, editor.weightGrams, editor.stockQty].some((value) => !Number.isFinite(value) || value < 0)
          || !Number.isInteger(editor.stockQty)) {
          setNotice({ kind: 'error', text: 'Nama dan kategori wajib diisi. Harga, berat, serta stok harus valid dan tidak negatif.' });
          return;
        }
        onSave({ ...editor, name: editor.name.trim(), category: editor.category.trim(), verified: false });
        setEditor(null);
      }}>
        <Field label="Nama produk" value={editor.name} onChange={(value) => setEditor({ ...editor, name: value })} required />
        <Field label="Kategori" value={editor.category} onChange={(value) => setEditor({ ...editor, category: value })} required />
        <SelectField label="Marketplace" value={editor.marketplace} options={['Shopee', 'TikTok Shop', 'Tokopedia', 'Lainnya']} onChange={(value) => setEditor({ ...editor, marketplace: value })} />
        <SelectField label="Risiko stok" value={editor.risk} options={['Rendah', 'Sedang', 'Tinggi']} onChange={(value) => setEditor({ ...editor, risk: value as Product['risk'] })} />
        <Field label="Harga beli / HPP" type="number" min={0} suffix="Rp" value={editor.purchasePrice} onChange={(value) => setEditor({ ...editor, purchasePrice: Number(value) || 0 })} />
        <Field label="Harga jual" type="number" min={0} suffix="Rp" value={editor.sellingPrice} onChange={(value) => setEditor({ ...editor, sellingPrice: Number(value) || 0 })} />
        <Field label="Stok" type="number" min={0} step={1} suffix="unit" value={editor.stockQty} onChange={(value) => setEditor({ ...editor, stockQty: Number(value) || 0 })} />
        <Field label="Berat" type="number" min={0} suffix="gram" value={editor.weightGrams} onChange={(value) => setEditor({ ...editor, weightGrams: Number(value) || 0 })} />
        <Field label="Catatan / sumber" value={editor.notes} onChange={(value) => setEditor({ ...editor, notes: value })} />
        <div className="form-actions form-span-all"><Button type="submit"><Check size={15} />Simpan produk</Button><Button variant="ghost" onClick={() => setEditor(null)}>Batal</Button></div>
      </form>
    </Card>}
    <Card className="table-card"><div className="section-heading"><div><h2>{visible.length} produk</h2><p>Data tersimpan lokal di browser ini.</p></div>
      <SelectField label="Filter risiko" value={filter} options={['Semua', 'Rendah', 'Sedang', 'Tinggi']} onChange={setFilter} /></div>
      {visible.length === 0 ? <EmptyState icon={Package} title={products.length === 0 ? 'Belum ada produk tersimpan' : 'Tidak ada produk pada filter ini'}
        detail={products.length === 0 ? 'Simpan arah riset untuk mulai menyusun daftar produk yang ingin divalidasi.' : 'Pilih filter risiko lain untuk melihat produk.'} /> :
        <div className="table-scroll"><table><thead><tr><th>Produk</th><th>Marketplace</th><th>Harga beli</th><th>Harga jual</th><th>Stok</th><th>Risiko</th><th>Skor parsial</th><th>Data</th><th>Aksi</th></tr></thead>
          <tbody>{visible.map((product) => <tr key={product.id} className="clickable-row" onClick={() => onSelect(product)}>
            <td><b>{product.name}</b><small>{product.category}</small></td><td>{product.marketplace}</td>
            <td>{product.purchasePrice ? formatRupiah(product.purchasePrice) : 'Belum ada data'}</td>
            <td>{product.sellingPrice ? formatRupiah(product.sellingPrice) : 'Belum ada data'}</td><td>{product.stockQty || '—'}</td>
            <td><span className={`risk-tag risk-${product.risk.toLowerCase()}`}>{product.risk}</span></td>
            <td>{(() => {
              const result = calculateProductScore(product, weights, costs);
              return result.score === null ? 'Belum dihitung' : <><b>{result.score}/100</b><small>{result.coveragePercent}% cakupan input</small></>;
            })()}</td>
            <td><span className="unverified-tag">Belum diverifikasi</span></td>
            <td><div className="table-actions"><button aria-label={`Hitung ${product.name}`} onClick={(event) => { event.stopPropagation(); onSelect(product); }}><ArrowRight size={15} /></button>
              <button aria-label={`Edit ${product.name}`} onClick={(event) => { event.stopPropagation(); setEditor({ ...product }); }}><Settings2 size={15} /></button>
              <button aria-label={`Hapus ${product.name}`} onClick={(event) => { event.stopPropagation(); onDelete(product); }}><Trash2 size={15} /></button></div></td>
          </tr>)}</tbody></table></div>}
      <p className="table-footnote">Skor adalah indikator parsial berbobot, bukan probabilitas keberhasilan. Persaingan, kecukupan modal, dan keandalan supplier belum dapat dihitung dari data yang tersedia.</p>
    </Card>
  </div>;
}

function Reports({ data, update, setNotice }: {
  data: AppData; update: (patch: Partial<AppData>) => void; setNotice: (notice: Notice) => void;
}) {
  const createReport = () => {
    if (data.products.length === 0) {
      setNotice({ kind: 'error', text: 'Simpan produk terlebih dahulu untuk membuat ringkasan.' });
      return;
    }
    const report = {
      id: id(),
      title: `Ringkasan riset · ${new Date().toLocaleDateString('id-ID')}`,
      createdAt: new Date().toISOString(),
      body: `Produk tersimpan: ${data.products.length}\nKompetitor tercatat: ${data.competitors.length}\nSupplier tercatat: ${data.suppliers.length}\n\nProduk:\n${data.products.map((product) => `- ${product.name} | beli ${product.purchasePrice ? formatRupiah(product.purchasePrice) : 'belum ada data'} | jual ${product.sellingPrice ? formatRupiah(product.sellingPrice) : 'belum ada data'} | risiko ${product.risk} | status data: belum diverifikasi`).join('\n')}\n\nCatatan: ini ringkasan data yang dimasukkan pengguna, bukan verifikasi pasar atau rekomendasi finansial.`,
    };
    update({ savedReports: [report, ...data.savedReports] });
    setNotice({ kind: 'success', text: 'Ringkasan data berhasil disimpan.' });
  };
  return <div className="page-stack"><PageHeading eyebrow="Catatan dan ringkasan" title="Laporan" subtitle="Buat dan unduh ringkasan dari data yang kamu masukkan. Angka tidak diperiksa otomatis oleh pihak ketiga."
    action={<Button onClick={createReport}><Plus size={16} /> Buat ringkasan</Button>} />
    <div className="report-summary"><div><FileBarChart2 size={19} /><b>Sumber ringkasan</b><p>Produk, kompetitor, dan supplier pada browser lokal ini.</p></div>
      <div><span>{data.products.length}</span><small>Produk</small></div><div><span>{data.competitors.length}</span><small>Kompetitor</small></div><div><span>{data.suppliers.length}</span><small>Supplier</small></div></div>
    <Card className="table-card"><div className="section-heading"><div><h2>Ringkasan tersimpan</h2><p>{data.savedReports.length} laporan di perangkat ini</p></div></div>
      {data.savedReports.length === 0 ? <EmptyState icon={FileBarChart2} title="Belum ada ringkasan"
        detail="Simpan produk lalu buat laporan untuk menyimpan cuplikan data workspace." action={<Button variant="secondary" onClick={createReport}>Buat ringkasan</Button>} /> :
        <div className="report-list">{data.savedReports.map((report) => <div className="report-row" key={report.id}>
          <div className="report-icon"><FileBarChart2 size={18} /></div><div className="report-row-copy"><b>{report.title}</b><small>{new Date(report.createdAt).toLocaleString('id-ID')}</small></div>
          <Button variant="secondary" onClick={() => downloadFile(`${report.title.replace(/[^\p{L}\p{N}-]+/gu, '-')}.txt`, report.body, 'text/plain;charset=utf-8')}><ArrowDownToLine size={15} />Unduh</Button>
          <button className="icon-button" aria-label="Hapus laporan" onClick={() => {
            if (window.confirm('Hapus laporan ini?')) update({ savedReports: data.savedReports.filter((item) => item.id !== report.id) });
          }}><Trash2 size={16} /></button>
        </div>)}</div>}
    </Card>
  </div>;
}

function Settings({ data, update, setNotice }: {
  data: AppData; update: (patch: Partial<AppData>) => void; setNotice: (notice: Notice) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiStatus, setGeminiStatus] = useState('');
  const weightEntries = [
    ['margin', 'Margin keuntungan'], ['risk', 'Risiko stok'], ['competition', 'Persaingan'],
    ['capital', 'Kebutuhan modal'], ['supplier', 'Keandalan supplier'],
  ] as const;
  const totalWeight = Object.values(data.weights).reduce((sum, value) => sum + value, 0);
  const exportBackup = () => downloadFile('produklaku-data.json', JSON.stringify(data, null, 2), 'application/json');
  const testGemini = async () => {
    setTestingGemini(true);
    setGeminiStatus('');
    try {
      const response = await fetch(apiUrl('ai/test'), { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Koneksi Gemini gagal.');
      setGeminiStatus(payload.message);
    } catch (error) {
      setGeminiStatus(error instanceof TypeError
        ? 'Backend API tidak dapat dihubungi. Periksa VITE_API_URL dan pastikan backend berjalan.'
        : error instanceof Error ? error.message : 'Koneksi Gemini gagal.');
    } finally {
      setTestingGemini(false);
    }
  };
  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isAppData(parsed)) {
        throw new Error('Berkas tidak sesuai format backup ProdukLaku AI.');
      }
      update({
        products: parsed.products, competitors: parsed.competitors, suppliers: parsed.suppliers,
        savedReports: parsed.savedReports, weights: parsed.weights,
        costInputs: parsed.costInputs, researchHistory: parsed.researchHistory,
      });
      setNotice({ kind: 'success', text: 'Data backup berhasil diimpor ke browser ini.' });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'Gagal membaca file backup.' });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };
  return <div className="page-stack"><PageHeading eyebrow="Workspace dan preferensi" title="Pengaturan" subtitle="Data aplikasi tersimpan di perangkat ini. Kelola cadangan dan bobot skor secara transparan." />
    <Card className="settings-card"><div className="settings-heading"><div className="settings-icon"><Gauge size={18} /></div><div><h2>Bobot skor produk</h2>
      <p>Skor hanya dapat ditafsirkan jika sumber dan komponen datanya cukup.</p></div></div>
      <div className="weight-list">{weightEntries.map(([key, label]) => <label className="weight-row" key={key}>
        <span>{label}</span><input type="range" min={0} max={100} value={data.weights[key]} aria-label={`${label} bobot`}
          onChange={(event) => update({ weights: { ...data.weights, [key]: Number(event.target.value) } })} />
        <b>{data.weights[key]}%</b></label>)}</div>
      <div className="weight-total"><span>Total bobot</span><b className={totalWeight === 100 ? 'weight-valid' : 'weight-invalid'}>{totalWeight}%</b>
        <small>{totalWeight === 100 ? 'Siap digunakan jika semua data tersedia' : 'Bobot akan dinormalisasi saat skor dihitung; idealnya total 100%.'}</small></div>
      <Button variant="secondary" onClick={() => update({ weights: { ...DEFAULT_DATA.weights } })}>Kembalikan bobot awal</Button>
    </Card>
    <Card className="settings-card"><div className="settings-heading"><div className="settings-icon"><FileSpreadsheet size={18} /></div><div><h2>Cadangkan data</h2>
      <p>Ekspor atau pulihkan data workspace lokal dalam format JSON.</p></div></div>
      <div className="settings-action-row"><div><b>Ekspor workspace</b><small>Unduh produk, kompetitor, supplier, dan pengaturan.</small></div><Button variant="secondary" onClick={exportBackup}><ArrowDownToLine size={15} />Ekspor JSON</Button></div>
      <div className="settings-action-row"><div><b>Impor backup</b><small>Data yang diimpor menggantikan data tersimpan saat ini.</small></div>
        <Button variant="secondary" onClick={() => inputRef.current?.click()}><ArrowLeft size={15} />Pilih file</Button>
        <input ref={inputRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(event) => void importBackup(event.target.files?.[0])} /></div>
      <div className="settings-action-row destructive-row"><div><b>Hapus seluruh data lokal</b><small>Tidak dapat dibatalkan. Ekspor backup sebelum melanjutkan.</small></div>
        <Button variant="danger" onClick={() => {
          if (window.confirm('Hapus seluruh data ProdukLaku AI dari browser ini? Tindakan tidak dapat dibatalkan.')) {
            update({ ...DEFAULT_DATA, costInputs: { ...DEFAULT_COST_INPUTS }, weights: { ...DEFAULT_DATA.weights } });
            setNotice({ kind: 'success', text: 'Seluruh data lokal telah dihapus.' });
          }
        }}><Trash2 size={15} />Hapus data</Button></div>
    </Card>
    <Card className="integration-card"><div className="integration-state"><span className="integration-dot" /><div><b>AI generatif</b><small>Respons langsung jika GEMINI_API_KEY terpasang di server. Kunci hanya disimpan di backend.</small></div><span className="integration-label">Opsional</span></div>
      <div className="settings-action-row"><div><b>Uji koneksi Gemini</b><small>Memeriksa konfigurasi dan mengirim permintaan singkat dari backend.</small></div>
        <Button variant="secondary" disabled={testingGemini} onClick={() => void testGemini()}>{testingGemini ? 'Menguji…' : 'Uji koneksi'}</Button></div>
      {geminiStatus && <p className="table-footnote" role="status">{geminiStatus}</p>}
      <div className="integration-state"><span className="integration-dot integration-off" /><div><b>Database & autentikasi cloud</b><small>Belum terhubung. Saat ini tidak ada akun atau sinkronisasi antar perangkat.</small></div><span className="integration-label">Tidak aktif</span></div>
      <div className="integration-state"><span className="integration-dot integration-off" /><div><b>Data marketplace langsung</b><small>Tidak terhubung dan tidak diambil secara otomatis.</small></div><span className="integration-label">Tidak aktif</span></div>
    </Card>
  </div>;
}

type ChatConnectionStatus = 'checking' | 'configured' | 'missing' | 'offline';

function Chat({ product, data, messages, setMessages }: {
  product?: Product;
  data: AppData;
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
}) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ChatConnectionStatus>('checking');
  const [failedRequest, setFailedRequest] = useState<ChatFailure | null>(null);
  const loadingRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(apiUrl('health'), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Backend API tidak merespons dengan benar.');
        const payload: unknown = await response.json();
        if (typeof payload !== 'object' || payload === null || !('aiConfigured' in payload)
          || typeof payload.aiConfigured !== 'boolean') {
          throw new Error('Status konfigurasi AI dari backend tidak valid.');
        }
        setConnectionStatus(payload.aiConfigured ? 'configured' : 'missing');
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setConnectionStatus('offline');
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);
  const sendQuestion = async (question: string, isRetry = false) => {
    if (!question || loadingRef.current) return;
    if (question.length > 2000) {
      setMessages((current) => [...current, { role: 'assistant', text: 'Pesan terlalu panjang. Batasi hingga 2.000 karakter.' }]);
      return;
    }
    loadingRef.current = true;
    setFailedRequest(null);
    setInput('');
    if (!isRetry) setMessages((current) => [...current, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const costs = data.costInputs;
      const financialCalculation = costs.purchasePrice > 0 && costs.sellingPrice > 0
        ? calculateEconomics(costs)
        : null;
      const productContext = {
        currency: 'IDR',
        note: 'Data berikut berasal dari input workspace pengguna. Data kompetitor dan supplier dicatat manual; bukan hasil riset atau verifikasi otomatis.',
        selectedProduct: product ? {
          name: product.name.slice(0, 100),
          category: product.category.slice(0, 100),
          marketplace: product.marketplace,
          purchasePriceIDR: product.purchasePrice,
          sellingPriceIDR: product.sellingPrice,
          stockQty: product.stockQty,
          risk: product.risk,
          verificationStatus: product.verified ? 'ditandai terverifikasi' : 'belum diverifikasi',
        } : null,
        savedProducts: data.products.slice(0, 5).map((savedProduct) => ({
          name: savedProduct.name.slice(0, 100),
          category: savedProduct.category.slice(0, 100),
          marketplace: savedProduct.marketplace,
          purchasePriceIDR: savedProduct.purchasePrice,
          sellingPriceIDR: savedProduct.sellingPrice,
          risk: savedProduct.risk,
          stockQty: savedProduct.stockQty,
          verificationStatus: savedProduct.verified ? 'ditandai terverifikasi' : 'belum diverifikasi',
        })),
        costInputs: costs,
        deterministicFinancialCalculation: financialCalculation,
        manuallyRecordedCompetitors: data.competitors.slice(0, 5).map((competitor) => ({
          name: competitor.name.slice(0, 100),
          priceIDR: competitor.price,
          shippingIDR: competitor.shipping,
          rating: competitor.rating,
          reviews: competitor.reviews,
          observedAt: competitor.observedAt,
        })),
        manuallyRecordedSuppliers: data.suppliers.slice(0, 5).map((supplier) => ({
          name: supplier.name.slice(0, 100),
          product: supplier.product.slice(0, 100),
          unitPriceIDR: supplier.unitPrice,
          minimumOrderQuantity: supplier.moq,
          shippingIDR: supplier.shipping,
          leadDays: supplier.leadDays,
          updatedAt: supplier.updatedAt,
        })),
      };
      const historyMessages = isRetry && messages.length > 0
        && messages[messages.length - 1].role === 'user'
        && messages[messages.length - 1].text === question
        ? messages.slice(0, -1)
        : messages;
      const conversationHistory = historyMessages.slice(-8).map(({ role, text }) => ({
        role,
        text: text.slice(-1000),
      }));
      const response = await fetch(apiUrl('ai/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question, productContext, conversationHistory }) });
      const responseText = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(responseText);
      } catch {
        throw new Error(response.ok
          ? 'Backend mengirim respons non-JSON yang tidak valid. Periksa server API dan konfigurasi proxy Vite.'
          : `Backend mengembalikan HTTP ${response.status} tanpa JSON yang valid. Periksa server API dan log backend.`);
      }
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('Respons backend tidak valid. Periksa server lalu coba lagi.');
      }
      const result = payload;
      if (!response.ok) {
        const message = 'error' in result && typeof result.error === 'string' ? result.error : 'AI belum tersedia.';
        const code = 'code' in result ? result.code : undefined;
        const error = new Error(message);
        Object.assign(error, { code });
        throw error;
      }
      if (!('success' in result) || result.success !== true
        || !('reply' in result) || typeof result.reply !== 'string' || !result.reply.trim()) {
        throw new Error('Backend mengirim JSON yang tidak sesuai kontrak chat. Mulai ulang backend agar frontend dan API memakai versi yang sama.');
      }
      const reply = result.reply;
      setMessages((current) => [...current, { role: 'assistant', text: reply }]);
      if (input === question) setInput('');
    } catch (error) {
      let message: string;
      if (error instanceof Error && 'code' in error && error.code === 'AI_NOT_CONFIGURED') {
        setConnectionStatus('missing');
        message = 'Gemini belum dikonfigurasi. Atur GEMINI_API_KEY pada environment variables backend, lalu redeploy.';
      } else {
        message = error instanceof TypeError
          ? 'Backend API tidak dapat dihubungi. Periksa VITE_API_URL dan pastikan backend berjalan.'
          : error instanceof Error ? error.message : 'Permintaan AI gagal. Silakan coba lagi.';
      }
      setFailedRequest({ question, message });
      setInput((current) => current || question);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };
  const send = (event: FormEvent) => {
    event.preventDefault();
    void sendQuestion(input.trim());
  };
  const connectionLabel = {
    checking: 'Memeriksa koneksi Gemini…',
    configured: 'Kunci Gemini ditemukan · koneksi diverifikasi saat mengirim',
    missing: 'Gemini belum dikonfigurasi · atur environment backend',
    offline: 'Backend tidak terjangkau · pastikan server berjalan',
  }[connectionStatus];
  return <div className="page-stack"><PageHeading eyebrow="Partner perencanaan usaha" title="BizPlan AI" subtitle={`${connectionLabel} · Riwayat percakapan disimpan sementara selama aplikasi terbuka.`} />
    <Card className="chat-card"><div className="chat-context"><div className="chat-avatar"><Sparkles size={18} /></div><div><b>BizPlan AI</b><small>{product ? `Konteks produk: ${product.name}` : 'Konteks workspace lokal · Indonesia · IDR'}</small></div>
      <span className="mode-chip"><span />{connectionStatus === 'configured' ? 'Gemini API' : connectionStatus === 'checking' ? 'Memeriksa status' : 'AI belum tersedia'}</span></div>
      <div className="chat-messages" aria-live="polite">{messages.map((message, index) => <div key={`${index}-${message.role}`} className={`chat-message chat-${message.role}`}>
        {message.role === 'assistant' && <div className="message-avatar"><Sparkles size={14} /></div>}
        <div className="message-content"><p>{message.text}</p></div>
      </div>)}{loading && <div className="chat-message chat-assistant"><div className="message-avatar"><Sparkles size={14} /></div><div className="typing-dots"><i /><i /><i /></div></div>}
        {failedRequest && <div className="chat-failure" role="alert"><p>{failedRequest.message}</p>
          <Button variant="secondary" disabled={loading} onClick={() => void sendQuestion(failedRequest.question, true)}><ArrowRight size={14} />Coba lagi</Button>
        </div>}
        <div ref={endRef} /></div>
      <form className="chat-compose" onSubmit={(event) => void send(event)}><input value={input} maxLength={2000} onChange={(event) => setInput(event.target.value)} placeholder="Tanyakan tentang biaya, margin, atau risiko…" aria-label="Pesan untuk asisten" />
        <Button type="submit" disabled={!input.trim() || loading}><Send size={16} />Kirim</Button></form>
      <p className="chat-disclaimer">Jangan masukkan data sensitif. Jawaban AI perlu diperiksa sebelum digunakan untuk keputusan bisnis.</p>
    </Card>
    <div className="prompt-chips"><span>Coba tanyakan:</span>{['Bantu saya menyusun rencana bisnis lengkap.', 'Apa data penting yang masih perlu saya lengkapi?', 'Apa risiko utama dari rencana usaha ini?'].map((suggestion) =>
      <button key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}<ArrowRight size={13} /></button>)}</div>
  </div>;
}

export default App;
