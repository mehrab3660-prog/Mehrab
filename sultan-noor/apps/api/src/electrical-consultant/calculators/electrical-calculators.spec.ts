import {
  calculateAntennaOutlets,
  calculateApproxCurrent,
  calculateApproxLightingCost,
  calculateApproxMonthlyEnergyCostToman,
  calculateCircuitCount,
  calculateDoorbellSet,
  calculateEarthedOutlets,
  calculateFuseCount,
  calculateLightingPoints,
  calculateLightingPowerWatts,
  calculateNetworkOutlets,
  calculateOutlets,
  calculateShoppingListQuantities,
  calculateStaircaseSwitches,
  calculateSurgeProtectorCount,
  calculateSwitches,
  RoomBreakdown,
} from './electrical-calculators';

const APARTMENT: RoomBreakdown = {
  areaSqm: 120,
  bedrooms: 2,
  livingRooms: 1,
  kitchens: 1,
  bathrooms: 2,
  otherRooms: 1,
  hasStaircase: false,
};

describe('electrical-calculators (deterministic, no AI)', () => {
  it('computes lighting points as the larger of area-based and room-based counts, never negative', () => {
    expect(calculateLightingPoints(APARTMENT)).toBe(Math.max(Math.ceil(120 / 12), 2 * 1 + 1 * 2 + 1 + 2 + 1));
    expect(calculateLightingPoints({ ...APARTMENT, areaSqm: 0, bedrooms: 0, livingRooms: 0, kitchens: 0, bathrooms: 0, otherRooms: 0 })).toBe(0);
  });

  it('scales outlet counts up with tier — professional always yields at least as many as economic', () => {
    const economic = calculateOutlets(APARTMENT, 'ECONOMIC');
    const standard = calculateOutlets(APARTMENT, 'STANDARD');
    const professional = calculateOutlets(APARTMENT, 'PROFESSIONAL');
    expect(economic).toBeLessThanOrEqual(standard);
    expect(standard).toBeLessThanOrEqual(professional);
  });

  it('always earths kitchen and bathroom outlets regardless of tier', () => {
    expect(calculateEarthedOutlets(APARTMENT)).toBe(APARTMENT.kitchens * 2 + APARTMENT.bathrooms * 1);
  });

  it('never suggests antenna/network outlets for the economic tier', () => {
    expect(calculateAntennaOutlets(APARTMENT, 'ECONOMIC')).toBe(0);
    expect(calculateNetworkOutlets(APARTMENT, 'ECONOMIC')).toBe(0);
  });

  it('only adds bedroom network/antenna points for the professional tier', () => {
    expect(calculateNetworkOutlets(APARTMENT, 'STANDARD')).toBe(APARTMENT.livingRooms);
    expect(calculateNetworkOutlets(APARTMENT, 'PROFESSIONAL')).toBe(APARTMENT.livingRooms + APARTMENT.bedrooms);
  });

  it('adds one extra multi-way control point in the living room only for the professional tier', () => {
    expect(calculateSwitches(APARTMENT, 'STANDARD')).toBe(APARTMENT.bedrooms + APARTMENT.livingRooms * 2 + APARTMENT.kitchens + APARTMENT.bathrooms + APARTMENT.otherRooms);
    expect(calculateSwitches(APARTMENT, 'PROFESSIONAL')).toBe(calculateSwitches(APARTMENT, 'STANDARD') + APARTMENT.livingRooms);
  });

  it('only counts a staircase switch pair when the unit actually has a staircase', () => {
    expect(calculateStaircaseSwitches({ ...APARTMENT, hasStaircase: false })).toBe(0);
    expect(calculateStaircaseSwitches({ ...APARTMENT, hasStaircase: true })).toBe(2);
  });

  it('always suggests exactly one doorbell button and one bell — never scaled by area', () => {
    expect(calculateDoorbellSet()).toEqual({ pushButton: 1, bell: 1 });
  });

  it('adds a dedicated bathroom circuit only when there is a bathroom, and a cooling circuit only for the professional tier', () => {
    const noBathroom = { ...APARTMENT, bathrooms: 0 };
    expect(calculateCircuitCount(noBathroom, 'STANDARD')).toBe(3);
    expect(calculateCircuitCount(APARTMENT, 'STANDARD')).toBe(4);
    expect(calculateCircuitCount(APARTMENT, 'PROFESSIONAL')).toBe(5);
  });

  it('fuse count always mirrors circuit count (one breaker per circuit)', () => {
    expect(calculateFuseCount(APARTMENT, 'STANDARD')).toBe(calculateCircuitCount(APARTMENT, 'STANDARD'));
  });

  it('never suggests a surge protector for the economic tier', () => {
    expect(calculateSurgeProtectorCount('ECONOMIC')).toBe(0);
    expect(calculateSurgeProtectorCount('STANDARD')).toBe(1);
  });

  it('computes approximate current with the real I = P / V relationship', () => {
    expect(calculateApproxCurrent(2200, 220)).toBe(10);
  });

  it('rejects a non-positive voltage rather than silently dividing by zero', () => {
    expect(() => calculateApproxCurrent(1000, 0)).toThrow();
  });

  it('computes lighting power from points and a real per-lamp wattage', () => {
    expect(calculateLightingPowerWatts(10, 9)).toBe(90);
  });

  it('computes an approximate lighting cost as points times real unit price — no invented markup', () => {
    expect(calculateApproxLightingCost(10, 150000)).toBe(1_500_000);
  });

  it('computes an approximate monthly energy cost from real wattage/usage/tariff inputs', () => {
    // 1000W, 5h/day, 30 days = 150 kWh; at 1000 toman/kWh = 150,000 toman
    expect(calculateApproxMonthlyEnergyCostToman(1000, 5, 1000)).toBe(150_000);
  });

  it('the shopping-list orchestrator returns a real quantity for every item key, never undefined', () => {
    const result = calculateShoppingListQuantities(APARTMENT, 'STANDARD');
    expect(result.LAMP).toBeGreaterThan(0);
    expect(result.FUSE_BOX).toBe(1);
    expect(result.PANEL).toBe(1);
    expect(result.SWITCH_STAIRCASE).toBe(0);
    expect(Object.values(result).every((v) => typeof v === 'number' && v >= 0)).toBe(true);
  });
});
