/**
 * Standard Downtime Catalog & Presets for PVC Pipe Extrusion Lines
 * Supports dual-mode entry (Presets vs Direct Manual) and true speed-loss decoupling.
 */

export const STANDARD_DOWNTIME_PRESETS = [
  {
    id: 'mold_change',
    name: 'Die / Mold Changeover',
    defaultDurationMin: 120,
    defaultStartSlot: 2, // 08:30 - 09:30
    category: 'Tooling & Setup'
  },
  {
    id: 'heater_failure',
    name: 'Heater / Thermocouple Failure',
    defaultDurationMin: 45,
    defaultStartSlot: 4, // 10:30 - 11:30
    category: 'Electrical'
  },
  {
    id: 'power_chiller',
    name: 'Power / Chiller Interruption',
    defaultDurationMin: 60,
    defaultStartSlot: 8, // 14:30 - 15:30
    category: 'Utility'
  },
  {
    id: 'purge_cleaning',
    name: 'Color / Material Purge & Cleaning',
    defaultDurationMin: 30,
    defaultStartSlot: 6, // 12:30 - 13:30
    category: 'Material & Color'
  },
  {
    id: 'mechanical_jam',
    name: 'Mechanical Jam / Puller Fix',
    defaultDurationMin: 45,
    defaultStartSlot: 10, // 16:30 - 17:30
    category: 'Mechanical'
  },
  {
    id: 'material_starvation',
    name: 'Raw Material Starvation / Vacuum Jam',
    defaultDurationMin: 30,
    defaultStartSlot: 12, // 18:30 - 19:30
    category: 'Material & Vacuum'
  },
  {
    id: 'startup_calibration',
    name: 'Routine Startup / Calibration',
    defaultDurationMin: 30,
    defaultStartSlot: 0, // 06:30 - 07:30
    category: 'Startup & Calibration'
  },
  {
    id: 'custom_breakdown',
    name: 'Unplanned Breakdown (Custom)',
    defaultDurationMin: 0,
    defaultStartSlot: 14, // 20:30 - 21:30
    category: 'Unplanned'
  }
];

export const STANDARD_DOWNTIME_REASONS = STANDARD_DOWNTIME_PRESETS.map((p) => p.name);

export function getDowntimePresetById(id) {
  if (!id) return null;
  return STANDARD_DOWNTIME_PRESETS.find((p) => p.id === id) || null;
}

export function getDowntimePresetByName(name) {
  if (!name) return null;
  const clean = String(name).trim().toLowerCase();
  return (
    STANDARD_DOWNTIME_PRESETS.find((p) => {
      const pName = p.name.toLowerCase();
      return pName === clean || clean.includes(pName) || pName.includes(clean);
    }) || null
  );
}
