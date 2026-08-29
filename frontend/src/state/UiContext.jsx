/* UiContext — the prototype's other module-level state: which view is showing,
 * the shared working month, and the per-screen bits that survive navigation.
 *
 * These were `let` at module scope, so leaving บิล for one bill and coming
 * back kept the selection and the switches. That is preserved: they live here
 * rather than inside a page component, which would reset them on every mount.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { shiftPeriod, thisMonth } from '../lib/helpers.js';

const UiContext = createContext(null);

export function UiProvider({ children }){
  const [view, setView] = useState({ name: 'board' });
  // The working month survives a reload. It is clamped on the way back in,
  // because a stored month can be in the past but must never be in the future
  // — the browser could have been left open across a month boundary.
  const [period, setPeriodRaw] = useState(() => {
    try {
      const saved = window.localStorage.getItem('workingMonth');
      if(saved && /^\d{4}-\d{2}$/.test(saved) && saved <= thisMonth()) return saved;
    } catch { /* private mode, or storage disabled */ }
    return thisMonth();
  });
  const [monthOpen, setMonthOpen] = useState(false);

  // board
  const [editMode, setEditMode] = useState(false);
  const [filter, setFilter] = useState('all');
  // meter
  const [meterFilter, setMeterFilter] = useState('all');
  const [showVacant, setShowVacant] = useState(false);
  // tenants
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  // bills
  const [picked, setPicked] = useState(() => new Set());
  const [prorateOn, setProrateOn] = useState(false);
  const [prorateDays, setProrateDays] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  // settings
  const [exampleUnits, setExampleUnits] = useState({ water: 8, electricity: 8 });

  const [modal, setModal] = useState(null);

  // The prototype called render() after any write to a reading that did not
  // come from typing — a rollover, a replaced meter, a corrected previous
  // figure — which threw away whatever was in the inputs and redrew them from
  // the data. Bumping this does the same thing: บันทึกมิเตอร์ remounts its rows,
  // so the boxes show what is actually stored rather than what was typed.
  const [meterRevision, setMeterRevision] = useState(0);
  const bumpMeter = useCallback(() => setMeterRevision(n => n + 1), []);

  // Detail that belongs to one lease — its recurring fees, its charges for the
  // month — is fetched by the screen that shows it, but written from a modal
  // that the screen does not own. Bumping this tells the screen to fetch again.
  const [detailRevision, setDetailRevision] = useState(0);
  const bumpDetail = useCallback(() => setDetailRevision(n => n + 1), []);

  const go = useCallback(v => setView(v), []);

  // The working month never goes past the current one. Nothing can be read or
  // billed for a month that has not happened, and a reading typed into next
  // month is a data error that surfaces weeks later. Going back is unlimited.
  const setPeriod = useCallback(next => {
    if(next > thisMonth()) return;
    setPeriodRaw(next);
    try { window.localStorage.setItem('workingMonth', next); } catch { /* not worth failing over */ }
    // Anything scoped to the old month is meaningless in the new one.
    setPicked(new Set());
    setLastResult(null);
    setMonthOpen(false);
  }, []);

  const shiftMonth = useCallback(by => setPeriod(shiftPeriod(period, by)), [period, setPeriod]);

  const value = useMemo(() => ({
    view, go,
    period, setPeriod, shiftMonth,
    monthOpen, setMonthOpen,
    editMode, setEditMode, filter, setFilter,
    meterFilter, setMeterFilter, showVacant, setShowVacant,
    tenantSearch, setTenantSearch, tenantFilter, setTenantFilter,
    picked, setPicked, prorateOn, setProrateOn, prorateDays, setProrateDays,
    lastResult, setLastResult,
    exampleUnits, setExampleUnits,
    meterRevision, bumpMeter,
    detailRevision, bumpDetail,
    modal, openModal: setModal, closeModal: () => setModal(null),
  }), [view, go, period, setPeriod, shiftMonth, monthOpen, editMode, filter,
       meterFilter, showVacant, tenantSearch, tenantFilter, picked, prorateOn,
       prorateDays, lastResult, exampleUnits, meterRevision, bumpMeter, detailRevision, bumpDetail, modal]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(){
  const v = useContext(UiContext);
  if(!v) throw new Error('useUi outside UiProvider');
  return v;
}
