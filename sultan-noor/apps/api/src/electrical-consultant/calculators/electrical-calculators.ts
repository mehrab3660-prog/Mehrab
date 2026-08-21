// Deterministic, unit-testable electrical estimation rules (Sprint 7 §11).
// These are standard residential-wiring rule-of-thumb heuristics, not a
// substitute for a code calculation — every quantity/cost this module
// produces must be shown to the customer together with the safety
// disclaimer defined in electrical-safety.ts. The AI layer never invents or
// overrides these formulas; it only collects the inputs they need.

export type ConsultantTier = 'ECONOMIC' | 'STANDARD' | 'PROFESSIONAL';

export interface RoomBreakdown {
  areaSqm: number;
  bedrooms: number;
  livingRooms: number;
  kitchens: number;
  bathrooms: number;
  otherRooms: number; // hallway, storage, balcony, etc.
  hasStaircase: boolean; // multi-floor unit needing a two-way stair switch
}

function nonNegative(value: number): number {
  return Math.max(0, Math.round(value));
}

// ~1 lighting point per 12 sqm of general floor area, floored against a
// fixed minimum per real room so a very large single room and several small
// rooms both get a sane count — whichever rule implies more points wins,
// since under-lighting is the unsafe direction to round toward.
export function calculateLightingPoints(rooms: RoomBreakdown): number {
  const areaBased = Math.ceil(rooms.areaSqm / 12);
  const roomBased = rooms.bedrooms * 1 + rooms.livingRooms * 2 + rooms.kitchens * 1 + rooms.bathrooms * 1 + rooms.otherRooms * 1;
  return nonNegative(Math.max(areaBased, roomBased));
}

const OUTLETS_PER_ROOM: Record<ConsultantTier, { bedroom: number; living: number; kitchen: number; bathroom: number; other: number }> = {
  ECONOMIC: { bedroom: 2, living: 4, kitchen: 3, bathroom: 1, other: 1 },
  STANDARD: { bedroom: 3, living: 5, kitchen: 4, bathroom: 1, other: 1 },
  PROFESSIONAL: { bedroom: 4, living: 6, kitchen: 5, bathroom: 2, other: 2 },
};

export function calculateOutlets(rooms: RoomBreakdown, tier: ConsultantTier): number {
  const per = OUTLETS_PER_ROOM[tier];
  return nonNegative(
    rooms.bedrooms * per.bedroom + rooms.livingRooms * per.living + rooms.kitchens * per.kitchen + rooms.bathrooms * per.bathroom + rooms.otherRooms * per.other,
  );
}

// Kitchen and bathroom outlets are always earthed — a fixed safety rule
// (wet/high-load areas), not a per-tier guess.
export function calculateEarthedOutlets(rooms: RoomBreakdown): number {
  return nonNegative(rooms.kitchens * 2 + rooms.bathrooms * 1);
}

export function calculateAntennaOutlets(rooms: RoomBreakdown, tier: ConsultantTier): number {
  if (tier === 'ECONOMIC') return 0;
  return nonNegative(rooms.livingRooms + (tier === 'PROFESSIONAL' ? rooms.bedrooms : 0));
}

export function calculateNetworkOutlets(rooms: RoomBreakdown, tier: ConsultantTier): number {
  if (tier === 'ECONOMIC') return 0;
  if (tier === 'STANDARD') return nonNegative(rooms.livingRooms);
  return nonNegative(rooms.livingRooms + rooms.bedrooms);
}

// One single-gang switch per bedroom/kitchen/bathroom/other room, two per
// living room (main + secondary light group); professional tier adds one
// extra multi-way control point in the living room.
export function calculateSwitches(rooms: RoomBreakdown, tier: ConsultantTier): number {
  const base = rooms.bedrooms + rooms.livingRooms * 2 + rooms.kitchens + rooms.bathrooms + rooms.otherRooms;
  return nonNegative(tier === 'PROFESSIONAL' ? base + rooms.livingRooms : base);
}

// A two-way ("رفت‌وبرگشت") switch pair for a staircase — exactly one pair
// per unit with a staircase, never scaled by area/room count.
export function calculateStaircaseSwitches(rooms: RoomBreakdown): number {
  return rooms.hasStaircase ? 2 : 0;
}

export function calculateDoorbellSet(): { pushButton: number; bell: number } {
  return { pushButton: 1, bell: 1 };
}

// Lighting + general sockets + a dedicated kitchen circuit are the fixed
// baseline; a dedicated bathroom circuit and (professional tier) a dedicated
// cooling/heating circuit are added only when that space/tier applies.
export function calculateCircuitCount(rooms: RoomBreakdown, tier: ConsultantTier): number {
  let circuits = 1 + 1 + (rooms.kitchens > 0 ? 1 : 0);
  if (rooms.bathrooms > 0) circuits += 1;
  if (tier === 'PROFESSIONAL') circuits += 1;
  return circuits;
}

// One breaker (فیوز) per circuit — the main breaker is part of the fuse-box
// product itself, not counted separately here.
export function calculateFuseCount(rooms: RoomBreakdown, tier: ConsultantTier): number {
  return calculateCircuitCount(rooms, tier);
}

export function calculateSurgeProtectorCount(tier: ConsultantTier): number {
  return tier === 'ECONOMIC' ? 0 : 1;
}

export function calculateLightingPowerWatts(lightingPoints: number, wattPerLamp = 9): number {
  return nonNegative(lightingPoints * wattPerLamp);
}

// I = P / V, single-phase, simplified — a standard textbook relationship,
// not something the AI is allowed to derive itself.
export function calculateApproxCurrent(powerWatts: number, voltage = 220): number {
  if (voltage <= 0) throw new Error('ولتاژ باید مثبت باشد');
  return Math.round((powerWatts / voltage) * 100) / 100;
}

export function calculateApproxLightingCost(lightingPoints: number, pricePerLampToman: number): number {
  return nonNegative(lightingPoints * pricePerLampToman);
}

export function calculateApproxMonthlyEnergyCostToman(totalWatts: number, hoursPerDay: number, pricePerKwhToman: number): number {
  const kwhPerMonth = (totalWatts / 1000) * hoursPerDay * 30;
  return nonNegative(kwhPerMonth * pricePerKwhToman);
}

export type ConsultantItemKey =
  | 'LAMP'
  | 'SWITCH'
  | 'SWITCH_STAIRCASE'
  | 'SOCKET'
  | 'SOCKET_EARTHED'
  | 'SOCKET_ANTENNA'
  | 'SOCKET_NETWORK'
  | 'DOORBELL_BUTTON'
  | 'DOORBELL_BELL'
  | 'FUSE_BOX'
  | 'FUSE'
  | 'PANEL'
  | 'SURGE_PROTECTOR';

// The one orchestrating "شمارش" step of the Shopping Calculator (§2/§11):
// turns real, customer-given room counts into a real quantity per item
// type. Purely deterministic — no catalog lookup and no AI happens here;
// matching these quantities against real, in-stock products is the
// ElectricalConsultantService's job.
export function calculateShoppingListQuantities(rooms: RoomBreakdown, tier: ConsultantTier): Record<ConsultantItemKey, number> {
  const doorbell = calculateDoorbellSet();
  return {
    LAMP: calculateLightingPoints(rooms),
    SWITCH: calculateSwitches(rooms, tier),
    SWITCH_STAIRCASE: calculateStaircaseSwitches(rooms),
    SOCKET: calculateOutlets(rooms, tier),
    SOCKET_EARTHED: calculateEarthedOutlets(rooms),
    SOCKET_ANTENNA: calculateAntennaOutlets(rooms, tier),
    SOCKET_NETWORK: calculateNetworkOutlets(rooms, tier),
    DOORBELL_BUTTON: doorbell.pushButton,
    DOORBELL_BELL: doorbell.bell,
    FUSE_BOX: 1,
    FUSE: calculateFuseCount(rooms, tier),
    PANEL: 1,
    SURGE_PROTECTOR: calculateSurgeProtectorCount(tier),
  };
}
