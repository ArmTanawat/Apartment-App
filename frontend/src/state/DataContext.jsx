/* DataContext — everything the prototype kept in module-level arrays.
 *
 * The prototype held `units`, `tenants`, `leases`, `readings`, `bills`,
 * `leaseFees`, `charges`, `feeTypes`, `settings`, `periodSettings` and
 * `backups` as module-level `let` bindings and called render() after mutating
 * them. Once a save is in flight while the user changes month, deciding which
 * response still matters becomes manual — so the data lives here instead, and
 * every change goes through a named action.
 *
 * Phase 2 replaces the bodies of those actions with fetch calls and the
 * initial state with the endpoints that already return these shapes. The
 * screens do not change.
 */

import { createContext, useContext, useMemo, useRef, useState } from 'react';
import * as mock from '../data/mockData.js';
import { buildBill } from '../lib/buildBill.js';
import {
  activeLease, appliesMinimum, billed, floors, leaseOn, leasesInPeriod,
  leavingOn, metered, overlapping, previousReading, roomsOf, tenantOf,
} from '../lib/helpers.js';

const DataContext = createContext(null);

// Two bills already issued, so the list and the staleness check have something
// to show without generating first. The prototype did this at the bottom of
// its script; here it is the starting value of `bills`.
function seedBills(){
  const stamp = () => {
    const now = new Date();
    const p2 = n => String(n).padStart(2,"0");
    return `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
  };
  const period = mock.thisMonth();
  const out = [];
  [1, 5].forEach((lid, i) => {
    const built = buildBill(mock, lid, period);
    if(!built.error) out.push({ id: mock.nextId.bill + 1 + i, created_at: stamp(), ...built });
  });
  return out;
}

export const TODAY = mock.TODAY;
export const thisMonth = mock.thisMonth;
export const BACKUP_KEEP = mock.BACKUP_KEEP;

export function DataProvider({ children }){
  const [units, setUnits] = useState(mock.units);
  const [tenants, setTenants] = useState(mock.tenants);
  const [leases, setLeases] = useState(mock.leases);
  const [readings, setReadings] = useState(mock.readings);
  const [bills, setBills] = useState(seedBills);
  const [leaseFees, setLeaseFees] = useState(mock.leaseFees);
  const [charges, setCharges] = useState(mock.charges);
  const [feeTypes, setFeeTypes] = useState(mock.feeTypes);
  const [settings, setSettings] = useState(mock.settings);
  const [periodSettings, setPeriodSettings] = useState(mock.periodSettings);
  const [backups, setBackups] = useState(mock.backups);

  // Ids only have to be unique. A ref rather than state because bumping the
  // counter is not something the screen should re-render for.
  const nextId = useRef({ ...mock.nextId, bill: mock.nextId.bill + 2, reading: 1000 });
  const newId = kind => ++nextId.current[kind];

  const value = useMemo(() => {
    const data = { units, tenants, leases, readings, bills, leaseFees, charges,
                   feeTypes, settings, periodSettings, backups };

    // ---- rooms ----
    const addUnit = u => setUnits(us => [...us, { id: newId('unit'), ...u }]);
    const updateUnit = (id, patch) =>
      setUnits(us => us.map(u => u.id === id ? { ...u, ...patch } : u));
    const deleteUnit = id => setUnits(us => us.filter(u => u.id !== id));

    // ---- tenants ----
    // Returns the new id so ย้ายเข้า can create a tenant and a lease in one go.
    const addTenant = t => { const id = newId('tenant');
      setTenants(ts => [...ts, { id, ...t }]); return id; };
    const updateTenant = (id, patch) =>
      setTenants(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    const deleteTenant = id => setTenants(ts => ts.filter(t => t.id !== id));

    // ---- leases ----
    const addLease = l => setLeases(ls => [...ls, { id: newId('lease'), ...l }]);
    // end_date is passed explicitly, including as null to cancel a scheduled
    // move-out. Anywhere that merges a patch has to keep null meaning "clear".
    const updateLease = (id, patch) =>
      setLeases(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));

    // ---- meter readings ----
    // One action covers every way a reading changes: typing a number, a
    // rollover, a replaced meter, a corrected previous figure. `compute` is
    // handed the existing row or null and returns the fields to write.
    const upsertReading = (unitId, period, compute) => setReadings(rs => {
      const i = rs.findIndex(r => r.unit_id === unitId && r.period === period);
      const existing = i >= 0 ? rs[i] : null;
      const next = compute(existing);
      if(!next) return rs;
      if(i >= 0){ const copy = rs.slice(); copy[i] = { ...existing, ...next }; return copy; }
      return [...rs, { id: newId('reading'), unit_id: unitId, period, ...next }];
    });

    // ---- recurring fees ----
    const addLeaseFee = f => setLeaseFees(fs => [...fs, { id: newId('fee'), ...f }]);
    const updateLeaseFee = (id, patch) =>
      setLeaseFees(fs => fs.map(f => f.id === id ? { ...f, ...patch } : f));
    const deleteLeaseFee = id => setLeaseFees(fs => fs.filter(f => f.id !== id));

    // ---- one-time charges ----
    const addCharge = c => setCharges(cs => [...cs, { id: newId('charge'), ...c }]);
    const deleteCharge = id => setCharges(cs => cs.filter(c => c.id !== id));

    // ---- fee types ----
    const addFeeType = f => setFeeTypes(fs => [...fs, { id: newId('fee'), is_active: 1, ...f }]);
    const updateFeeType = (id, patch) =>
      setFeeTypes(fs => fs.map(f => f.id === id ? { ...f, ...patch } : f));
    const deleteFeeType = id => setFeeTypes(fs => fs.filter(f => f.id !== id));

    // ---- bills ----
    const saveBill = built => {
      const now = new Date();
      const p2 = n => String(n).padStart(2,"0");
      const stamp = `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
      const bill = { id: newId('bill'), created_at: stamp, ...built };
      setBills(bs => [...bs, bill]);
      return bill;
    };
    const deleteBill = id => setBills(bs => bs.filter(b => b.id !== id));

    // ---- settings ----
    const patchSettings = patch => setSettings(s => ({ ...s, ...patch }));
    const setApplyMinimum = (period, on) =>
      setPeriodSettings(ps => ({ ...ps, [period]: on }));

    const addBackup = () => {
      const now = new Date();
      const p2 = n => String(n).padStart(2,"0");
      const stamp = `${now.getFullYear()}-${p2(now.getMonth()+1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`;
      setBackups(bs => [{ filename:`apartment-${stamp.replace(/[ :]/g,"-")}.db`, size_kb:96, created_at:stamp },
        ...bs].slice(0, BACKUP_KEEP));
    };

    // Helpers bound to the current data, so a screen reads
    // `h.activeLease(unitId)` the way the prototype did.
    const h = {
      floors: () => floors(units),
      leaseOn: (unitId, date) => leaseOn(leases, unitId, date),
      activeLease: unitId => activeLease(leases, unitId, TODAY),
      leavingOn: unitId => leavingOn(leases, unitId, TODAY),
      tenantOf: leaseId => tenantOf(tenants, leases, leaseId),
      overlapping: (unitId, start, end) => overlapping(leases, unitId, start, end),
      previousReading: (unitId, period) => previousReading(readings, unitId, period),
      leasesInPeriod: (unitId, period) => leasesInPeriod(leases, unitId, period),
      metered: (unitId, period) => metered(readings, unitId, period),
      billed: (unitId, period) => billed(bills, leases, unitId, period, TODAY),
      appliesMinimum: period => appliesMinimum(periodSettings, period),
      roomsOf: tenantId => roomsOf(leases, units, tenantId, TODAY),
    };

    return { ...data, data, h,
      addUnit, updateUnit, deleteUnit,
      addTenant, updateTenant, deleteTenant,
      addLease, updateLease,
      upsertReading,
      addLeaseFee, updateLeaseFee, deleteLeaseFee,
      addCharge, deleteCharge,
      addFeeType, updateFeeType, deleteFeeType,
      saveBill, deleteBill,
      patchSettings, setApplyMinimum, addBackup };
  }, [units, tenants, leases, readings, bills, leaseFees, charges,
      feeTypes, settings, periodSettings, backups]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(){
  const v = useContext(DataContext);
  if(!v) throw new Error('useData outside DataProvider');
  return v;
}
