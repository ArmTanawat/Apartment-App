import ModalHost from './components/modals/ModalHost.jsx';
import BillPage from './pages/BillPage.jsx';
import BillsPage from './pages/BillsPage.jsx';
import BoardPage from './pages/BoardPage.jsx';
import MeterPage from './pages/MeterPage.jsx';
import PrintAllPage from './pages/PrintAllPage.jsx';
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
  {k:"settings", l:"ตั้งค่า"},
];

function Shell(){
  const { units, settings } = useData();
  const { view, go } = useUi();

  // Detail pages are reached from their list, so they keep the list highlighted.
  const active = view.name === "meter" ? "meter"
    : (view.name === "tenants" || view.name === "tenant") ? "tenants"
    : view.name === "settings" ? "settings"
    : ["bills","bill","printall"].includes(view.name) ? "bills"
    : "board";

  const page =
      view.name === "meter"    ? <MeterPage />
    : view.name === "room"     ? <RoomPage id={view.id} />
    : view.name === "tenants"  ? <TenantsPage />
    : view.name === "tenant"   ? <TenantPage id={view.id} />
    : view.name === "settings" ? <SettingsPage />
    : view.name === "bills"    ? <BillsPage />
    : view.name === "bill"     ? <BillPage id={view.id} />
    : view.name === "printall" ? <PrintAllPage />
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
      <main className="main">{page}</main>
    </div>
    <ModalHost />
  </>;
}

export default function App(){
  return (
    <DataProvider>
      <UiProvider>
        <Shell />
      </UiProvider>
    </DataProvider>
  );
}
