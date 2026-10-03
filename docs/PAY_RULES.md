# Pay rules

Business rules for how worker pay is calculated. Code: `calculatePay` in `src/App.jsx`,
shared helpers in `src/utils/payHelpers.js`.

## Base pay

hours × hourly rate (the worker's home-market rate, else the base rate in Settings → Pay Rates),
or the event's flat pay amount when one is set. Then travel pay (mileage tier), Lake Geneva bonus,
and the holiday multiplier.

## Minimum paid hours (2026-10-03)

Settings → Pay Rates → **Minimum Paid Hours**. Decided with Dylan:

- A shift pays at least the minimum (3 hours), even when the event is shorter. A 2-hour party pays a
  dealer 3 hours.
- Applies only to the positions ticked in the setting. The suggested set is every dealer position
  plus Host. Set Up, Set Up Driver and Warehouse are not included.
- Applies to contractors (1099) only. Workers marked **employee** (W-2, paid through QuickBooks
  Payroll) are paid their actual hours. A worker with no pay type yet is treated as a contractor.
- Flat-pay events aren't affected.
- Off until an admin saves it. Stored as one `settings` row (`minimum_paid_hours`, JSON
  `{ hours, positions }`; hours 0 = off).

Every place that turns hours into pay uses `paidHours()`, so these always agree:

- the Payment Calculator (fills in 3 and notes "3-hour minimum applied (event is 2h)")
- the worker's Available Events estimate ("Craps · 3h min × $45/hr")
- invite cards and invite/re-invite emails

The admin can still type a different number of hours in the calculator for a single assignment.
Assignments recorded before the setting was saved keep the pay they were recorded with.
