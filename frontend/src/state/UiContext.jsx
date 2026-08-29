/* UiContext — the prototype's other module-level state: which view is showing,
 * the shared working month, and the per-screen bits that survive navigation.
 *
 * These were `let` at module scope, so leaving บิล for one bill and coming
 * back kept the selection and the switches. That is preserved: they live here
 * rather than inside a page component, which would reset them on every mount.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { shiftPeriod } from '../lib/helpers.js';
import { thisMonth } from './DataContext.jsx';

const UiContext = createContext(null);

export function UiProvider({ children }){
  const [view, setView] = useState({ name: 'board' });
  const [period, setPeriodRaw] = useState(thisMonth());
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

  const go = useCallback(v => setView(v), []);

  // The working month never goes past the current one. Nothing can be read or
  // billed for a month that has not happened, and a reading typed into next
  // month is a data error that surfaces weeks later. Going back is unlimited.
  const setPeriod = useCallback(next => {
    if(next > thisMonth()) return;
    setPeriodRaw(next);
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
    modal, openModal: setModal, closeModal: () => setModal(null),
  }), [view, go, period, setPeriod, shiftMonth, monthOpen, editMode, filter,
       meterFilter, showVacant, tenantSearch, tenantFilter, picked, prorateOn,
       prorateDays, lastResult, exampleUnits, meterRevision, bumpMeter, modal]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi(){
  const v = useContext(UiContext);
  if(!v) throw new Error('useUi outside UiProvider');
  return v;
}
