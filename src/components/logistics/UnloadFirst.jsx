import React from 'react';
import { parseDateSafe } from '../../utils/dateHelpers';
import { groupItems } from '../../utils/logistics/fieldViews';

// "Take off first" box for a truck's first trip: what is still on the truck
// from its last route (carryoverByLoad in fieldViews.js). Lines the new load
// also needs are listed as "leave on" so they aren't unloaded and reloaded.
//   carryover: { fromRun, takeOff, keepOn }
//   renderLine(item, { accessory, list }) draws one line (checkbox style differs
//   between the printed sheet and the warehouse screen).
export default function UnloadFirst({ carryover, renderLine }) {
  if (!carryover || (!carryover.takeOff.length && !carryover.keepOn.length)) return null;
  const from = parseDateSafe(carryover.fromRun.run_date)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const lines = (items, list) => groupItems(items).map(item => (
    <div key={item.key}>
      {renderLine(item, { accessory: false, list })}
      {item.accessories.map(acc => <div key={acc.key} className="pl-6">{renderLine(acc, { accessory: true, list })}</div>)}
    </div>
  ));
  return (
    <div className="mb-3 border-2 border-orange-300 bg-orange-50 rounded-lg p-3 break-inside-avoid print:bg-white">
      {carryover.takeOff.length > 0 ? (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-900">
            Take off first — still on the truck from its last route ({from})
          </p>
          <div className="mt-1">{lines(carryover.takeOff, 'takeOff')}</div>
        </>
      ) : (
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-900">
          Nothing to take off — everything left from the last route ({from}) is needed again
        </p>
      )}
      {carryover.keepOn.length > 0 && (
        <div className="mt-2 pt-2 border-t border-orange-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">Already on the truck — leave on (it's part of this load)</p>
          <div className="mt-1">{lines(carryover.keepOn, 'keepOn')}</div>
        </div>
      )}
    </div>
  );
}
