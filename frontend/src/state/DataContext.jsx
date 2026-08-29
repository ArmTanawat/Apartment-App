/* DataContext — everything the screens read, fetched from the API.
 *
 * The prototype held eleven arrays in module scope. Each of them maps to an
 * endpoint that returns the same shape, so the screens are unchanged; only
 * where the data comes from is different.
 *
 * Writes go to the server and then refetch what they affected, rather than
 * patching a local copy. GET /units already works out is_occupied and
 * leaving_on, GET /readings works out is_entered, and GET /leases joins the
 * tenant's name — recomputing any of that on the client would be a second copy
 * of a rule that has to agree with the first. On one machine over localhost a
 * refetch costs nothing.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiDown, del, get, post, put } from '../lib/api.js';
import {
  floors, leaseOn, leasesInPeriod, metered, roomsOf, tenantOf, todayLocal,
} from '../lib/helpers.js';
import { useUi } from './UiContext.jsx';

const DataContext = createContext(null);

const EMPTY = {
  units: [], tenants: [], leases: [], bills: [], readings: [],
  previousReadings: {}, feeTypes: [], settings: null, applyMinimum: true,
};

// GET /readings?period= returns one row per room, with nulls for the rooms not
// yet entered — that is what makes it the checklist. The screens want the rows
// that actually exist, shaped like the meter_readings table.
const toReadingRows = (rows, period) => rows
  .filter(r => r.reading_id !== null)
  .map(r => ({
    id: r.reading_id, unit_id: r.unit_id, period,
    water_prev: r.water_prev, water_curr: r.water_curr, water_rollover: r.water_rollover,
    elec_prev: r.elec_prev, elec_curr: r.elec_curr, elec_rollover: r.elec_rollover,
  }));

export function DataProvider({ children }){
  const { period } = useUi();

  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [down, setDown] = useState(false);

  // Which fetch is the current one. A response from an older period or an
  // older reload is dropped rather than written over newer data.
  const generation = useRef(0);

  const load = useCallback(async (keys = null) => {
    const mine = ++generation.current;
    const want = k => !keys || keys.includes(k);

    try {
      const [units, tenants, leases, bills, readingRows, feeTypes, settings, periodRow] =
        await Promise.all([
          want('units')     ? get('/units')            : null,
          want('tenants')   ? get('/tenants')          : null,
          want('leases')    ? get('/leases')           : null,
          want('bills')     ? get('/bills')            : null,
          want('readings')  ? get(`/readings?period=${period}`) : null,
          want('feeTypes')  ? get('/fees/types?all=true')       : null,
          want('settings')  ? get('/settings')         : null,
          want('period')    ? get(`/settings/period/${period}`) : null,
        ]);

      // The previous figures need the room list, and the rule for finding them
      // — the most recent completed month, not simply last month — lives in
      // the endpoint. One call per room, on localhost.
      let previousReadings = null;
      if(want('prev')){
        const list = units || state.units;
        const rows = await Promise.all(list.map(u =>
          get(`/readings/previous/${u.id}/${period}`).then(r => [u.id, r])));
        previousReadings = Object.fromEntries(rows.map(([id, r]) =>
          [id, { water: r.water_prev, elec: r.elec_prev, from: r.from_period }]));
      }

      if(mine !== generation.current) return;

      setState(s => ({
        ...s,
        ...(units          ? { units } : null),
        ...(tenants        ? { tenants } : null),
        ...(leases         ? { leases } : null),
        ...(bills          ? { bills } : null),
        ...(readingRows    ? { readings: toReadingRows(readingRows, period) } : null),
        ...(previousReadings ? { previousReadings } : null),
        ...(feeTypes       ? { feeTypes } : null),
        ...(settings       ? { settings } : null),
        ...(periodRow      ? { applyMinimum: periodRow.apply_minimum } : null),
      }));
      setDown(false);
    } catch (e) {
      if(mine !== generation.current) return;
      // A read that fails may be retried; only the banner appears, and the
      // last good data stays on screen rather than blanking the page.
      if(e instanceof ApiDown) setDown(true);
      throw e;
    } finally {
      if(mine === generation.current) setLoading(false);
    }
  }, [period, state.units]);

  // Everything, on first mount and whenever the working month changes.
  useEffect(() => {
    setLoading(true);
    load(['units','tenants','leases','bills','readings','feeTypes','settings','period','prev'])
      .catch(() => {});
  // load closes over state.units, which would re-fire this on every load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const value = useMemo(() => {
    const TODAY = todayLocal();
    const { units, tenants, leases, bills, readings, previousReadings, applyMinimum } = state;

    // After a write, refetch what it touched. Anything that throws reaches the
    // caller, which is the screen that has somewhere to show it — a write is
    // never retried on its own, because repeating a POST after a timeout can
    // produce two of something.
    const after = (keys) => load(keys).catch(() => {});

    // A write that fails because the server is not there is not a problem with
    // that one field; nothing on the page can be saved. The banner says so
    // once at the top, and the error still reaches the form that asked.
    const guard = fn => async (...args) => {
      try { return await fn(...args); }
      catch (e) { if(e instanceof ApiDown) setDown(true); throw e; }
    };

    const actions = {
      // ---- rooms ----
      addUnit: async u => { await post('/units', u); await after(['units']); },
      updateUnit: async (id, patch) => { await put(`/units/${id}`, patch); await after(['units','leases']); },
      deleteUnit: async id => { await del(`/units/${id}`); await after(['units']); },

      // ---- tenants ----
      addTenant: async t => { const made = await post('/tenants', t); await after(['tenants']); return made; },
      updateTenant: async (id, patch) => { await put(`/tenants/${id}`, patch); await after(['tenants','leases','bills']); },
      deleteTenant: async id => { await del(`/tenants/${id}`); await after(['tenants']); },

      // ---- leases ----
      addLease: async l => { await post('/leases', l); await after(['units','leases']); },
      // end_date is sent explicitly, including as null to cancel a scheduled
      // move-out: PUT /leases/:id tests for the key with `in`, so a null
      // clears it and an omitted key keeps the date.
      updateLease: async (id, patch) => { await put(`/leases/${id}`, patch); await after(['units','leases']); },
      endLease: async (id, end_date) => { await put(`/leases/${id}/end`, { end_date }); await after(['units','leases']); },

      // ---- meter readings ----
      // One row per room per month. POST creates it, PUT corrects it, and each
      // meter is written on its own so a wrong water figure cannot discard a
      // correct electricity figure beside it.
      createReading: async row => { await post('/readings', row); await after(['readings']); },
      patchReading: async (id, patch) => { await put(`/readings/${id}`, patch); await after(['readings']); },

      // ---- fee types ----
      addFeeType: async f => { await post('/fees/types', f); await after(['feeTypes']); },
      updateFeeType: async (id, patch) => { await put(`/fees/types/${id}`, patch); await after(['feeTypes']); },
      deleteFeeType: async id => { await del(`/fees/types/${id}`); await after(['feeTypes']); },

      // ---- recurring fees and one-time charges ----
      // Scoped to one lease, so the screen that shows them fetches them and
      // reloads itself; nothing global changes except the bills they affect.
      addLeaseFee: f => post('/fees/lease', f),
      updateLeaseFee: (id, patch) => put(`/fees/lease/${id}`, patch),
      deleteLeaseFee: id => del(`/fees/lease/${id}`),
      addCharge: c => post('/fees/onetime', c),
      deleteCharge: id => del(`/fees/onetime/${id}`),

      // ---- bills ----
      generateBills: async body => { const r = await post('/bills/batch', body); await after(['bills']); return r; },
      generateBill: async body => { const r = await post('/bills', body); await after(['bills']); return r; },
      deleteBill: async id => { await del(`/bills/${id}`); await after(['bills']); },

      // ---- settings ----
      patchSettings: async patch => { await put('/settings', patch); await after(['settings']); },
      setApplyMinimum: async (p, on) => {
        const r = await put(`/settings/period/${p}`, { apply_minimum: on });
        await after(['period']);
        return r;
      },
      makeBackup: () => post('/backups', {}),
    };

    // Helpers bound to the current data, so a screen reads
    // `h.activeLease(unitId)` the way the prototype did.
    // Who is in a room today is the server's answer, not a second calculation
    // here. GET /units decides it with date('now','localtime') and the same
    // `end_date > date` rule POST /leases guards with — so a card can never
    // show a room the move-in form would then refuse, or the other way round.
    const unitById = id => units.find(u => u.id === id);

    const h = {
      today: () => TODAY,
      floors: () => floors(units),
      leaseOn: (unitId, date) => leaseOn(leases, unitId, date),
      activeLease: unitId => {
        const u = unitById(unitId);
        return u && u.lease_id ? leases.find(l => l.id === u.lease_id) : undefined;
      },
      // A move-out already entered for a future date. The room is still
      // occupied, but it is about to come free and that is worth seeing.
      leavingOn: unitId => { const u = unitById(unitId); return (u && u.leaving_on) || null; },
      tenantOf: leaseId => tenantOf(tenants, leases, leaseId),
      // The most recent completed month for this room, as the API works it out
      // — the last month actually finished, not simply the month before.
      previousReading: unitId => previousReadings[unitId] || { water: 0, elec: 0, from: null },
      // No endpoint answers "which leases were in this room during a month",
      // so the screens work it out from the lease list with the same rule
      // POST /bills/batch uses when it actually bills them.
      leasesInPeriod: (unitId, p) => leasesInPeriod(leases, unitId, p),
      metered: (unitId, p) => metered(readings, unitId, p),
      billed: (unitId, p) => {
        const u = unitById(unitId);
        return !!(u && u.lease_id && bills.some(b => b.lease_id === u.lease_id && b.period === p));
      },
      appliesMinimum: () => applyMinimum,
      roomsOf: tenantId => roomsOf(leases, units, tenantId, TODAY),
    };

    const guarded = Object.fromEntries(
      Object.entries(actions).map(([name, fn]) => [name, guard(fn)]));

    return { ...state, loading, down, reload: () => load(), h, ...guarded };
  }, [state, loading, down, load]);

  // Nothing renders against a null settings object; the first load fills it.
  if(!state.settings){
    return (
      <DataContext.Provider value={value}>
        <FirstLoad down={down} onRetry={() => load()} />
      </DataContext.Provider>
    );
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function FirstLoad({ down, onRetry }){
  return (
    <div className="app">
      <main className="main">
        {down ? <>
          <h1>ติดต่อเซิร์ฟเวอร์ไม่ได้</h1>
          <p className="sub">โปรแกรมส่วนหลังยังไม่ได้เปิด เปิดแล้วกดลองใหม่</p>
          <div className="actions"><button className="btn" onClick={onRetry}>ลองใหม่</button></div>
        </> : <p className="sub">กำลังโหลด…</p>}
      </main>
    </div>
  );
}

export function useData(){
  const v = useContext(DataContext);
  if(!v) throw new Error('useData outside DataProvider');
  return v;
}
