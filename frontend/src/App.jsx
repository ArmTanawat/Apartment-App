import ModalHost from './components/modals/ModalHost.jsx';
import BillPage from './pages/BillPage.jsx';
import BillsPage from './pages/BillsPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import MeterPage from './pages/MeterPage.jsx';
import PrintAllPage from './pages/PrintAllPage.jsx';
import PrintAllReceiptsPage from './pages/PrintAllReceiptsPage.jsx';
import ReceiptPage from './pages/ReceiptPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';
import RoomPage from './pages/RoomPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import TenantPage from './pages/TenantPage.jsx';
import TenantsPage from './pages/TenantsPage.jsx';
import { DataProvider, useData } from './state/DataContext.jsx';
import { UiProvider, useUi } from './state/UiContext.jsx';

const NAV = [
  {k:"board",    l:"ห้องพัก"},
  {k:"meter",    l:"บันทึกมิเตอร์"},
  {k:"bills",    l:"บิล"},
  {k:"tenants",  l:"ผู้เช่า"},
  {k:"reports",  l:"รายงาน"},
  {k:"settings", l:"ตั้งค่า"},
];

// A detail page is reached by id, and its record can be gone by the time it
// renders — deleted from another window, or a database restored underneath.
// Both pages read fields off the record straight away, so this is checked here
// rather than in each of them, the same way ModalHost checks its dialogs.
const PAGE_SUBJECT = {
  room:   ['units',   'ห้องนี้ไม่มีอยู่แล้ว',       'board',   '← ห้องพัก'],
  tenant: ['tenants', 'ผู้เช่ารายนี้ไม่มีอยู่แล้ว', 'tenants', '← ผู้เช่า'],
};

function Shell(){
  const { units, tenants, settings, down, reload } = useData();
  const { view, go } = useUi();

  // Detail pages are reached from their list, so they keep the list highlighted.
  const active = view.name === "meter" ? "meter"
    : (view.name === "tenants" || view.name === "tenant") ? "tenants"
    : view.name === "settings" ? "settings"
    : view.name === "reports" ? "reports"
    : ["bills","bill","printall","receipt","printallreceipts"].includes(view.name) ? "bills"
    : "board";

  const subject = PAGE_SUBJECT[view.name];
  const gone = subject && !{ units, tenants }[subject[0]].some(x => x.id === view.id);

  const page = gone ? <Gone subject={subject} onBack={() => go({name: subject[2]})} />
    : view.name === "meter"    ? <MeterPage />
    : view.name === "room"     ? <RoomPage id={view.id} />
    : view.name === "tenants"  ? <TenantsPage />
    : view.name === "tenant"   ? <TenantPage id={view.id} />
    : view.name === "settings" ? <SettingsPage />
    : view.name === "bills"    ? <BillsPage />
    : view.name === "bill"     ? <BillPage id={view.id} />
    : view.name === "printall" ? <PrintAllPage />
    : view.name === "receipt"  ? <ReceiptPage id={view.id} />
    : view.name === "printallreceipts" ? <PrintAllReceiptsPage />
    : view.name === "reports"  ? <ReportsPage />
    : <BoardPage />;

  return <>
    <div className="app">
      <aside className="rail">
        <div className="brand"><span>{settings.building_name.trim() || "—"}</span>
          <small><span className="num">{units.length}</span> ห้อง</small></div>
        <nav className="nav">
          {NAV.map(n => (
            <a key={n.k} href="#" className={n.k === active ? "on" : ""}
              onClick={e => { e.preventDefault(); go({name:n.k}); }}>
              <span className="dotnav" />{n.l}</a>
          ))}
        </nav>
      </aside>
      <main className="main">
        {/* The server not being there affects everything on the screen, so it
            is said once at the top with a way to retry — not repeated beside
            every field, which is how a user learns to ignore it. */}
        {down && (
          <div className="err noprint" style={{maxWidth:"640px",display:"flex",
            alignItems:"center",justifyContent:"space-between",gap:"12px"}}>
            <span>ติดต่อเซิร์ฟเวอร์ไม่ได้ ตัวเลขที่เห็นอาจไม่ใช่ล่าสุด และยังบันทึกอะไรไม่ได้</span>
            <button className="btn quiet" style={{padding:"5px 12px",fontSize:"13px"}}
              onClick={reload}>ลองใหม่</button>
          </div>
        )}
        {page}
      </main>
    </div>
    <ModalHost />
  </>;
}

function Gone({ subject, onBack }){
  const [, title, , backLabel] = subject;
  return <>
    <button className="back" onClick={onBack}>{backLabel}</button>
    <div className="head"><h1>{title}</h1></div>
    <p className="sub">มีการเปลี่ยนแปลงจากที่อื่นหลังจากเปิดหน้านี้
      หน้าจอดึงข้อมูลล่าสุดมาให้แล้ว</p>
  </>;
}

export default function App(){
  return (
    <UiProvider>
      <DataProvider>
        <Shell />
      </DataProvider>
    </UiProvider>
  );
}
