import React from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export const STATUS_STYLES = {
  green: { badge: 'bg-green-100 text-green-800 border-green-200', bar: 'bg-green-500', icon: CheckCircle, label: 'Fits' },
  yellow: { badge: 'bg-yellow-100 text-yellow-800 border-yellow-200', bar: 'bg-yellow-500', icon: AlertTriangle, label: 'Tight' },
  red: { badge: 'bg-red-100 text-red-800 border-red-200', bar: 'bg-red-500', icon: XCircle, label: "Won't fit" }
};

export function TruckSwatch({ color, size = 12 }) {
  return (
    <span
      className="inline-block rounded-full border border-gray-400 flex-shrink-0"
      style={{ backgroundColor: color || '#9CA3AF', width: size, height: size }}
    />
  );
}

const COUNT_LABELS = [
  ['blackjack', 'Blackjack'],
  ['craps', 'Craps'],
  ['roulette', 'Roulette'],
  ['poker', 'Poker'],
  ['chairs', 'Chairs'],
  ['archway', 'Archway'],
  ['decor', 'Decor']
];

// "3 Blackjack · 1 Craps · 1 Roulette · 1 Poker"
export function equipmentSummaryText(counts) {
  const parts = COUNT_LABELS.filter(([k]) => counts[k] > 0).map(([k, label]) => `${counts[k]} ${label}`);
  return parts.length ? parts.join(' · ') : 'No tables';
}

// One compact badge per truck, suggested truck outlined.
export function FitsOnBadges({ results, suggestion }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {results.map(r => {
        const style = STATUS_STYLES[r.status];
        const Icon = style.icon;
        const isSuggested = suggestion && suggestion.truck.id === r.truck.id;
        return (
          <span
            key={r.truck.id || r.truck.name}
            title={r.reasons.join('\n') || `Fits on ${r.truck.name}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${style.badge} ${
              isSuggested ? 'ring-2 ring-offset-1 ring-red-900' : ''
            }`}
          >
            <TruckSwatch color={r.truck.color} size={10} />
            {r.truck.name}
            <Icon size={12} />
          </span>
        );
      })}
    </div>
  );
}

export function ZoneBar({ label, used, capacity, stretch, detail }) {
  const max = Math.max(stretch || capacity, used, 1);
  const pct = Math.min(100, (used / max) * 100);
  const capPct = (capacity / max) * 100;
  const barColor = used > (stretch || capacity) ? 'bg-red-500' : used > capacity ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div>
      <div className="flex justify-between text-xs text-gray-600 mb-0.5">
        <span>{label}</span>
        <span className="font-medium text-gray-800">
          {used}/{capacity}{stretch > capacity ? ` (stretch ${stretch})` : ''}
        </span>
      </div>
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
        {stretch > capacity && (
          <div className="absolute top-0 bottom-0 w-px bg-gray-500" style={{ left: `${capPct}%` }} />
        )}
      </div>
      {detail && <div className="text-[11px] text-gray-500 mt-0.5">{detail}</div>}
    </div>
  );
}

// Per-zone breakdown for one truck.
export function CapacityBreakdown({ result }) {
  const { zones, status, reasons, truck } = result;
  const style = STATUS_STYLES[status];
  const crapsDetail = [
    zones.craps.breakdown.tables && `${zones.craps.breakdown.tables} craps`,
    zones.craps.breakdown.chairUnits && `${zones.craps.breakdown.chairUnits} chair unit${zones.craps.breakdown.chairUnits === 1 ? '' : 's'}`,
    zones.craps.breakdown.blackjackUnits && `${zones.craps.breakdown.blackjackUnits} blackjack overflow unit${zones.craps.breakdown.blackjackUnits === 1 ? '' : 's'}`
  ].filter(Boolean).join(' + ');
  const bjDetail = [
    zones.blackjack.breakdown.fromRoulette && `+${zones.blackjack.breakdown.fromRoulette} roulette overflow`,
    zones.blackjack.breakdown.fromPoker && `+${zones.blackjack.breakdown.fromPoker} poker overflow`
  ].filter(Boolean).join(', ');

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-semibold text-sm text-gray-900">
          <TruckSwatch color={truck.color} />
          {truck.name}
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${style.badge}`}>{style.label}</span>
      </div>
      <div className="space-y-2">
        <ZoneBar label="Craps zone" used={zones.craps.used} capacity={zones.craps.capacity} stretch={zones.craps.stretch} detail={crapsDetail} />
        <ZoneBar label="Roulette" used={zones.roulette.used} capacity={zones.roulette.capacity} />
        <ZoneBar label="Poker" used={zones.poker.used} capacity={zones.poker.capacity} />
        <ZoneBar label="Blackjack zone" used={zones.blackjack.used} capacity={zones.blackjack.capacity} detail={bjDetail} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {reasons.map(r => (
            <li key={r} className={`text-xs ${status === 'red' ? 'text-red-700' : 'text-yellow-800'}`}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
