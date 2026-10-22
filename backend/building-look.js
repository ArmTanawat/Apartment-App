// building-look.js — the colours and icons a building's card on เลือกตึก can have.
//
// Ids only. What each one looks like is in frontend/src/pages/BuildingsPage.jsx
// (LOOK_COLORS, LOOK_ICONS), and the two lists must name the same ids. An id the
// screen does not know draws as the default, so a mismatch is ugly, not broken.
//
// Stored in the building's own file, as settings rows building_color and
// building_icon, so the look goes with the building — deleted with it, restored
// with it — and no file outside the buildings holds anything about them.
// Not seeded: a building that has never been given a look reads as the default.

const COLORS = ['none', 'ink', 'blue', 'green', 'amber', 'orange', 'red', 'purple'];
const ICONS = ['building', 'house', 'towers', 'shop', 'tree', 'star'];

const DEFAULT = { color: 'none', icon: 'building' };

module.exports = { COLORS, ICONS, DEFAULT };
