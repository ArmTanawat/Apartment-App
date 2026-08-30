// fee-basis.js — what a percentage fee can be a percentage OF.
//
// A fee type is either a fixed amount or a share of something else on the same
// bill: a service charge that moves with the electricity, say. The list lives
// here rather than in a route because two of them need it — routes/fees.js to
// refuse a basis it does not know, and routes/bills.js to work the amount out.
// Two copies of it would drift, and the second one to drift would be the one
// that prices a bill.
//
// The Thai label is what gets frozen into bill_items.detail, so the tenant can
// see where the number came from. Changing a label later does not alter a bill
// already generated — which is correct, and means getting the wording right
// matters more than it looks.
const FEE_BASIS = {
  water:       'ค่าน้ำ',
  electricity: 'ค่าไฟ',
  rent:        'ค่าเช่า',
  utilities:   'ค่าน้ำและค่าไฟ',
  // Everything else on the bill — rent, both utilities, the fixed recurring
  // fees and this month's one-time charges — but never another percentage fee.
  //
  // That exclusion is the whole reason this is well defined. If one share
  // counted another, two of them on one bill would each depend on the other
  // and the answer would come out differently depending on which was worked
  // out first. Excluding them means every share on a bill is a share of the
  // same figure, whatever order they happen to be in.
  subtotal:    'ยอดก่อนคิดรายการนี้',
};

const FEE_BASIS_KEYS = Object.keys(FEE_BASIS);

module.exports = { FEE_BASIS, FEE_BASIS_KEYS };
