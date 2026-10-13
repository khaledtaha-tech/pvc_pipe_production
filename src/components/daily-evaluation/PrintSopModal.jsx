import { useState, useEffect, useMemo } from 'react';
import { Sparkles, Bookmark } from 'lucide-react';
import { MACHINES, matchMachine, sanitizeMachineMaster } from '../../config/machines.js';
import {
  formatFullMachineName,
  findPreviousRunForMachine,
  findExactDayRunForMachine,
  getPreviousDay,
  extractMachineSpecsFromRun,
  getAvailableProductsCatalog,
  calculateBenchmarkSpeedForProduct,
  buildMorningSopModel,
  isCompoundingLineOrProduct,
  resolveStdWeightFromSpecs,
  getLatestHistoricalRunDetails,
  addDays,
  buildMultiDayMorningSopModels
} from '../../logic/legacySopHelper.js';
import { getMachineNominalCapacity, MACHINE_SETTINGS_CHANGED_EVENT } from '../../logic/machineSettingsConfig.js';
import {
  getBaselineRate,
  saveBaselineRate,
  getBaselineEntry,
  syncBaselinesWithServer,
  BASELINE_CATALOG_UPDATED_EVENT
} from '../../logic/standardCatalogHelper.js';
import {
  loadLatestExcelLoggedRun,
  getNextDay
} from '../../logic/excelLogParser.js';

const SOP_CONFIG_STORAGE_KEY = 'sop_operational_config';

function loadPersistedSopConfig() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(SOP_CONFIG_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.warn('Failed to load SOP operational config:', err);
    return {};
  }
}

function savePersistedSopConfig(configByMachineId) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const existing = loadPersistedSopConfig();
    const merged = { ...existing, ...configByMachineId };
    window.localStorage.setItem(SOP_CONFIG_STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Failed to save SOP operational config:', err);
  }
}

/**
 * Intelligent Morning Blank SOP (DOC-Ext.-03) Print & Export Configuration Modal
 * Features:
 * - Scope selection: All Operating Lines vs. Previous Day Active Lines
 * - Target Date selection with auto-lookup of previous operational run
 * - Strict Previous Day inheritance for immediate preceding operating lines
 * - Auto-inheritance of Line No, Product Specs, Speed, Cut Length & Benchmark Pcs/h
 * - Manual product override dropdown with instant speed/hourly pieces recalculation
 * - Batch print and multi-page PDF generation triggers
 */
export default function PrintSopModal({
  isOpen,
  onClose,
  records = [],
  selectedDate = '',
  latestLoggedDate = null,
  latestDateLines = [],
  currentMachineId = 'L-01',
  machineMaster = MACHINES,
  onConfirmPrint,
  onConfirmPdf,
  onOpenUniversalBlank,
  isGenerating = false,
  lang = 'en'
}) {
  const isAr = lang === 'ar';
  const [scope, setScope] = useState('all'); // 'all' | 'previousDay'
  const [targetDate, setTargetDate] = useState(() => {
    const cached = loadLatestExcelLoggedRun();
    const lDate = latestLoggedDate || cached?.latestDate;
    if (lDate) {
      return getNextDay(lDate);
    }
    return selectedDate || new Date().toISOString().slice(0, 10);
  });
  const [linesState, setLinesState] = useState([]);
  const [historicalFeedback, setHistoricalFeedback] = useState({});
  const [printAheadDays, setPrintAheadDays] = useState(1);

  const daysCount = Math.max(1, Math.min(14, parseInt(printAheadDays, 10) || 1));
  const endDate = useMemo(() => {
    return daysCount > 1 ? addDays(targetDate, daysCount - 1) : targetDate;
  }, [targetDate, daysCount]);

  // Compute immediate previous calendar day (YYYY-MM-DD)
  const previousDate = useMemo(() => getPreviousDay(targetDate), [targetDate]);

  // Active machine master list sanitized to official canonical mapping
  const activeMaster = useMemo(() => {
    return sanitizeMachineMaster(machineMaster);
  }, [machineMaster]);

  // Consolidated operational run data from latest uploaded Excel log
  const effectiveLatestRun = useMemo(() => {
    if (Array.isArray(latestDateLines) && latestDateLines.length > 0) {
      const lineMap = {};
      latestDateLines.forEach((l) => {
        if (l.lineId) lineMap[l.lineId] = l;
      });
      return {
        latestDate: latestLoggedDate || latestDateLines[0]?.date || null,
        lines: latestDateLines,
        lineMap
      };
    }
    const cached = loadLatestExcelLoggedRun();
    if (cached && Array.isArray(cached.lines) && cached.lines.length > 0) {
      const lineMap = {};
      cached.lines.forEach((l) => {
        if (l.lineId) lineMap[l.lineId] = l;
      });
      return {
        latestDate: cached.latestDate || null,
        lines: cached.lines,
        lineMap
      };
    }
    return {
      latestDate: latestLoggedDate || null,
      lines: [],
      lineMap: {}
    };
  }, [latestLoggedDate, latestDateLines]);

  // Count of machines strictly running on immediate previous day
  const prevDayActiveCount = useMemo(() => {
    if (effectiveLatestRun?.latestDate && (previousDate === effectiveLatestRun.latestDate || !previousDate)) {
      if (effectiveLatestRun.lines.length > 0) {
        return activeMaster.filter((m) => {
          const l = effectiveLatestRun.lineMap[m?.id];
          return Boolean(l && (l.isOperating || l.itemCode || l.actualRatePcsH > 0));
        }).length;
      }
    }
    if (!previousDate) return 0;
    return activeMaster.filter((m) => Boolean(findExactDayRunForMachine(records, m?.id, previousDate))).length;
  }, [activeMaster, records, previousDate, effectiveLatestRun]);

  // Catalog of distinct products from history and factory standards
  const productCatalog = useMemo(() => {
    return getAvailableProductsCatalog(records, machineMaster);
  }, [records, machineMaster]);

  // Distinct unique list of product codes for dropdown
  const distinctCodes = useMemo(() => {
    const set = new Set();
    productCatalog.forEach((p) => {
      if (p.itemCode) set.add(p.itemCode);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [productCatalog]);

  const [settingsVersion, setSettingsVersion] = useState(0);
  const [baselineVersion, setBaselineVersion] = useState(0);

  useEffect(() => {
    const handleSettingsChanged = () => setSettingsVersion((v) => v + 1);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(MACHINE_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
      return () => window.removeEventListener(MACHINE_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    }
  }, []);

  useEffect(() => {
    const handleBaselineChanged = () => setBaselineVersion((v) => v + 1);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener(BASELINE_CATALOG_UPDATED_EVENT, handleBaselineChanged);
      return () => window.removeEventListener(BASELINE_CATALOG_UPDATED_EVENT, handleBaselineChanged);
    }
  }, []);

  // Fetch and merge fresh standards from central MySQL database when modal opens
  useEffect(() => {
    if (isOpen) {
      syncBaselinesWithServer().catch(() => {});
    }
  }, [isOpen]);

  // Synchronize target date when modal opens, selectedDate changes, or latestLoggedDate updates
  useEffect(() => {
    if (isOpen) {
      const lDate = effectiveLatestRun?.latestDate;
      if (lDate) {
        if (selectedDate && selectedDate !== lDate) {
          setTargetDate(selectedDate);
        } else {
          setTargetDate(getNextDay(lDate));
        }
      } else if (selectedDate) {
        setTargetDate(selectedDate);
      }
    }
  }, [isOpen, selectedDate, effectiveLatestRun?.latestDate]);

  // Build line configuration list when modal opens, targetDate changes, scope changes, or records change
  useEffect(() => {
    if (!isOpen) return;

    const list = activeMaster.map((m) => {
      const lineId = m?.id;
      const excelLine = effectiveLatestRun?.lineMap?.[lineId];
      const hasExcelRun = Boolean(
        excelLine && (excelLine.isOperating || excelLine.itemCode || excelLine.actualRatePcsH > 0)
      );

      // Search exact previous date run from loaded records
      const exactPrevRun = previousDate ? findExactDayRunForMachine(records, lineId, previousDate) : null;
      const hadRunOnPrevious = Boolean(exactPrevRun);

      // Fallback past run for machine
      const pastRun = findPreviousRunForMachine(records, lineId, targetDate);
      const prevRun = exactPrevRun || pastRun;

      const specs = extractMachineSpecsFromRun(prevRun, lineId, activeMaster);
      const isComp = Boolean(
        excelLine?.isCompounding ||
        specs?.isCompounding ||
        isCompoundingLineOrProduct({
          lineId,
          fullMachineName: excelLine?.fullMachineName || specs?.fullMachineName || m?.name || lineId,
          itemCode: excelLine?.itemCode || specs?.itemCode,
          productDescription: excelLine?.description || specs?.productDescription
        }, activeMaster)
      );

      const configuredCap = getMachineNominalCapacity(lineId, activeMaster);
      const nominalCapacity = configuredCap > 0
        ? configuredCap
        : (Number(excelLine?.nominalCapacityKgH) || Number(prevRun?.nominalCapacityKgH) || Number(m?.nominalCapacity) || Number(m?.capacityKgH) || Number(specs?.nominalCapacity) || (isComp ? 400 : 200));

      const persistedConfig = loadPersistedSopConfig();
      const savedForMachine = persistedConfig[lineId];

      const hadRun = hasExcelRun || hadRunOnPrevious || Boolean(prevRun);
      const hadRunOnLatest = hasExcelRun || hadRunOnPrevious;

      let isSelected = false;
      if (effectiveLatestRun?.lines?.length > 0) {
        if (scope === 'previousDay') {
          isSelected = hadRunOnLatest;
        } else {
          // In 'all' lines mode, pre-check lines active on latest date, uncheck stopped lines
          isSelected = hadRunOnLatest;
        }
      } else {
        if (scope === 'previousDay') {
          isSelected = hadRunOnPrevious;
        } else {
          isSelected = hadRun;
        }
      }

      // Pre-populate Item Code: prioritize latest Excel record (Col B), then saved, then specs
      const itemCode = (excelLine?.itemCode !== undefined && excelLine?.itemCode !== '')
        ? excelLine.itemCode
        : (savedForMachine?.itemCode || specs?.itemCode || '');

      // Pre-populate Product Description: prioritize latest Excel record (Col C), then specs
      const productDescription = (excelLine?.description !== undefined && excelLine?.description !== '')
        ? excelLine.description
        : (excelLine?.productDescription || specs?.productDescription || '');

      // Cut Length: default 6.0m for extrusion, 0 for compounding
      const pipeLength = isComp
        ? 0
        : (Number(excelLine?.pipeLength) > 0
            ? Number(excelLine.pipeLength)
            : (Number(savedForMachine?.pipeLength) > 0
                ? Number(savedForMachine.pipeLength)
                : (Number(specs?.pipeLength) > 0 ? Number(specs.pipeLength) : 6.0)));

      // Std Weight (unit weight)
      let unitWeight = '';
      if (isComp) {
        unitWeight = 25.0;
      } else if (savedForMachine && Number(savedForMachine.unitWeight) > 0) {
        unitWeight = Number(savedForMachine.unitWeight);
      } else if (excelLine && Number(excelLine.unitWeight) > 0) {
        unitWeight = Number(excelLine.unitWeight);
      } else if (Number(specs?.unitWeight) > 0) {
        unitWeight = Number(specs.unitWeight);
      } else if (Number(specs?.stdWeight) > 0) {
        unitWeight = Number(specs.stdWeight);
      } else {
        unitWeight = (hadRun || nominalCapacity > 0) ? 1.0 : '';
      }

      // Baseline Operating Standard lookup for machine-mold combination
      const baselineEntry = (!isComp && itemCode) ? getBaselineEntry(lineId, itemCode) : null;
      const hasBaseline = Boolean(baselineEntry && Number(baselineEntry.baselinePcsH) > 0);
      const baselineRate = hasBaseline ? Math.round(Number(baselineEntry.baselinePcsH)) : null;

      // Calculated rate (Target pcs/h for extrusion, kg/h for compounding)
      let calculatedRate = '';
      if (isComp) {
        calculatedRate = nominalCapacity;
      } else if (hasBaseline) {
        calculatedRate = baselineRate;
      } else if (savedForMachine && Number(savedForMachine.calculatedRate) > 0) {
        calculatedRate = Math.round(Number(savedForMachine.calculatedRate));
      } else if (excelLine && Number(excelLine.actualRatePcsH) > 0) {
        calculatedRate = Math.round(Number(excelLine.actualRatePcsH));
      } else if (excelLine && Number(excelLine.targetPcsH) > 0) {
        calculatedRate = Math.round(Number(excelLine.targetPcsH));
      } else if (specs?.calculatedRate !== undefined && specs?.calculatedRate !== null && specs?.calculatedRate !== '') {
        calculatedRate = Math.round(Number(specs.calculatedRate));
      } else if (Number(specs?.speed) > 0 && pipeLength > 0) {
        calculatedRate = Math.round((Number(specs.speed) * 60) / pipeLength);
      } else if (nominalCapacity > 0 && Number(unitWeight) > 0) {
        calculatedRate = Math.round(nominalCapacity / Number(unitWeight));
      }

      // Linear Speed (m/min)
      let speed = '';
      if (isComp) {
        speed = '';
      } else if (savedForMachine && Number(savedForMachine.speed) > 0) {
        speed = Number(savedForMachine.speed);
      } else if (Number(specs?.speed) > 0) {
        speed = Number(specs.speed);
      } else if (calculatedRate > 0 && pipeLength > 0) {
        speed = Math.round(((calculatedRate * pipeLength) / 60) * 10) / 10;
      }

      // Output Rate in Kg/h
      const calculatedRateKgH = isComp
        ? (Number(calculatedRate) || nominalCapacity)
        : (calculatedRate && unitWeight ? Math.round(Number(calculatedRate) * Number(unitWeight) * 10) / 10 : '');

      const previousRunDate = excelLine?.date || (hadRunOnPrevious ? previousDate : specs?.previousRunDate) || null;

      return {
        machineId: lineId,
        machineName: m?.name || '',
        fullMachineName: excelLine?.fullMachineName || specs?.fullMachineName || m?.name || lineId,
        isSelected,
        previousRunDate,
        hadRunOnLatest,
        productDescription,
        itemCode,
        od: specs?.od || '',
        wt: specs?.wt || '',
        speed,
        pipeLength,
        calculatedRate,
        unitWeight,
        nominalCapacity,
        calculatedRateKgH,
        isCompounding: isComp,
        isIdle: Boolean(!isComp && !hasExcelRun && !hadRunOnPrevious && (!specs || specs.isIdle)),
        isBaseline: hasBaseline,
        baselineRate
      };
    });

    setLinesState(list);
  }, [isOpen, targetDate, activeMaster, records, scope, previousDate, settingsVersion, baselineVersion, effectiveLatestRun]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  // Toggle selection for a machine in batch mode
  const handleToggleSelect = (machineId) => {
    setLinesState((prev) =>
      prev.map((item) =>
        item.machineId === machineId ? { ...item, isSelected: !item.isSelected } : item
      )
    );
  };

  // Toggle select all lines
  const handleSelectAll = (select) => {
    setLinesState((prev) =>
      prev.map((item) => {
        if (scope === 'previousDay') {
          const isPrevActive = Boolean(item.hadRunOnLatest || item.previousRunDate === previousDate);
          if (isPrevActive) {
            return { ...item, isSelected: select };
          }
          return item;
        }
        return { ...item, isSelected: select };
      })
    );
  };

  // Change product code and auto-resolve description, benchmark speed & standard pcs/h
  const handleProductCodeChange = (machineId, newCode) => {
    setHistoricalFeedback((prev) => {
      if (!prev[machineId]) return prev;
      const next = { ...prev };
      delete next[machineId];
      return next;
    });
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;

        if (!newCode) {
          return {
            ...item,
            itemCode: '',
            productDescription: '',
            unitWeight: item.isCompounding ? 25.0 : '',
            speed: '',
            calculatedRate: item.isCompounding ? (item.nominalCapacity || 400) : '',
            calculatedRateKgH: item.isCompounding ? (item.nominalCapacity || 400) : '',
            isIdle: !item.isCompounding
          };
        }

        const matchedProduct = productCatalog.find(
          (p) => String(p.itemCode).trim().toUpperCase() === String(newCode).trim().toUpperCase()
        );

        const newDesc = matchedProduct?.description || item.productDescription;
        const isComp = Boolean(
          matchedProduct?.isCompounding ||
          isCompoundingLineOrProduct({
            lineId: machineId,
            itemCode: newCode,
            productDescription: newDesc
          }, activeMaster)
        );

        if (isComp) {
          const cap = Number(item.nominalCapacity) || 400;
          return {
            ...item,
            itemCode: newCode,
            productDescription: newDesc,
            unitWeight: 25.0,
            pipeLength: 0,
            speed: '',
            calculatedRate: cap,
            calculatedRateKgH: cap,
            isCompounding: true,
            isIdle: false
          };
        }

        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;
        const unitWeight = resolveStdWeightFromSpecs(matchedProduct, pipeLen) || matchedProduct?.unitWeight || matchedProduct?.stdWeight || (Number(item.unitWeight) > 0 ? item.unitWeight : 1.0);

        const benchmark = calculateBenchmarkSpeedForProduct(
          { unitWeight },
          machineId,
          machineMaster,
          pipeLen
        );

        // Check if there is an approved baseline in catalog
        const bEntry = getBaselineEntry(machineId, newCode);
        const hasB = Boolean(bEntry && Number(bEntry.baselinePcsH) > 0);
        const effectiveRate = hasB ? Math.round(Number(bEntry.baselinePcsH)) : benchmark.calculatedRate;
        const effectiveSpeed = hasB
          ? (pipeLen > 0 ? Math.round(((effectiveRate * pipeLen) / 60) * 10) / 10 : benchmark.speed)
          : benchmark.speed;

        return {
          ...item,
          itemCode: newCode,
          productDescription: newDesc,
          unitWeight,
          pipeLength: pipeLen,
          speed: effectiveSpeed,
          calculatedRate: effectiveRate,
          calculatedRateKgH: Math.round(effectiveRate * unitWeight),
          isCompounding: false,
          isIdle: false,
          isBaseline: hasB,
          baselineRate: hasB ? effectiveRate : null
        };
      })
    );
  };

  // Change product description and auto-synchronize item code, benchmark speed & pcs/h
  const handleProductChange = (machineId, newDesc) => {
    setHistoricalFeedback((prev) => {
      if (!prev[machineId]) return prev;
      const next = { ...prev };
      delete next[machineId];
      return next;
    });
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;

        if (!newDesc) {
          return {
            ...item,
            itemCode: '',
            productDescription: '',
            unitWeight: item.isCompounding ? 25.0 : '',
            speed: '',
            calculatedRate: item.isCompounding ? (item.nominalCapacity || 400) : '',
            calculatedRateKgH: item.isCompounding ? (item.nominalCapacity || 400) : '',
            isIdle: !item.isCompounding,
            isBaseline: false,
            baselineRate: null
          };
        }

        const matchedProduct = productCatalog.find(
          (p) => p.description.toUpperCase() === newDesc.toUpperCase()
        );
        const itemCode = matchedProduct?.itemCode || item.itemCode || '';
        const isComp = Boolean(
          matchedProduct?.isCompounding ||
          isCompoundingLineOrProduct({
            lineId: machineId,
            itemCode,
            productDescription: newDesc
          }, activeMaster)
        );

        if (isComp) {
          const cap = Number(item.nominalCapacity) || 400;
          return {
            ...item,
            itemCode,
            productDescription: newDesc,
            unitWeight: 25.0,
            pipeLength: 0,
            speed: '',
            calculatedRate: cap,
            calculatedRateKgH: cap,
            isCompounding: true,
            isIdle: false,
            isBaseline: false,
            baselineRate: null
          };
        }

        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;
        const unitWeight = resolveStdWeightFromSpecs(matchedProduct, pipeLen) || matchedProduct?.unitWeight || matchedProduct?.stdWeight || (Number(item.unitWeight) > 0 ? item.unitWeight : 1.0);

        const benchmark = calculateBenchmarkSpeedForProduct(
          { unitWeight },
          machineId,
          machineMaster,
          pipeLen
        );

        // Check if there is an approved baseline in catalog
        const bEntry = itemCode ? getBaselineEntry(machineId, itemCode) : null;
        const hasB = Boolean(bEntry && Number(bEntry.baselinePcsH) > 0);
        const effectiveRate = hasB ? Math.round(Number(bEntry.baselinePcsH)) : benchmark.calculatedRate;
        const effectiveSpeed = hasB
          ? (pipeLen > 0 ? Math.round(((effectiveRate * pipeLen) / 60) * 10) / 10 : benchmark.speed)
          : benchmark.speed;

        return {
          ...item,
          itemCode,
          productDescription: newDesc,
          unitWeight,
          pipeLength: pipeLen,
          speed: effectiveSpeed,
          calculatedRate: effectiveRate,
          calculatedRateKgH: Math.round(effectiveRate * unitWeight),
          isCompounding: false,
          isIdle: false,
          isBaseline: hasB,
          baselineRate: hasB ? effectiveRate : null
        };
      })
    );
  };

  // Update target rate (pcs/h for extrusion, kg/h for compounding) and live-recalculate metrics
  const handleRateChange = (machineId, rateVal) => {
    const rawVal = rateVal === '' ? '' : Number(rateVal);
    const num = typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0 ? rawVal : '';
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        if (num === '') {
          return {
            ...item,
            calculatedRate: '',
            calculatedRateKgH: '',
            speed: '',
            isIdle: !item.productDescription,
            isBaseline: false
          };
        }
        if (item.isCompounding) {
          const intCompRate = Math.round(num);
          return {
            ...item,
            calculatedRate: intCompRate,
            calculatedRateKgH: intCompRate,
            isIdle: false,
            isBaseline: false
          };
        }
        const intRate = Math.round(num);
        const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;
        const calcKgH = Math.round(intRate * unitWeight * 10) / 10;
        const harmonizedSpeed = pipeLen > 0 ? Math.round(((intRate * pipeLen) / 60) * 100) / 100 : item.speed;
        const isMatch = Boolean(item.baselineRate && intRate === Number(item.baselineRate));
        return {
          ...item,
          calculatedRate: intRate,
          calculatedRateKgH: calcKgH,
          speed: harmonizedSpeed,
          isIdle: false,
          isBaseline: isMatch
        };
      })
    );
  };

  // Update linear speed (m/min) and recalculate standard pcs/h and output rate (kg/h)
  const handleSpeedChange = (machineId, speedVal) => {
    const rawVal = speedVal === '' ? '' : Number(speedVal);
    const num = typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0 ? rawVal : '';
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        if (num === '') {
          return {
            ...item,
            speed: '',
            calculatedRate: '',
            calculatedRateKgH: '',
            isIdle: !item.productDescription
          };
        }
        const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : 6.0;
        const rate = Math.round((num * 60) / pipeLen);
        const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
        return {
          ...item,
          speed: num,
          calculatedRate: Math.round(rate),
          calculatedRateKgH: Math.round(rate * unitWeight * 10) / 10,
          isIdle: false
        };
      })
    );
  };

  // Update target capacity (kg/h) for compounding lines
  const handleCapacityChange = (machineId, capVal) => {
    const rawVal = capVal === '' ? '' : Number(capVal);
    const num = typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0 ? Math.round(rawVal) : '';
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        return {
          ...item,
          calculatedRate: num,
          calculatedRateKgH: num,
          isIdle: num === '' && !item.productDescription
        };
      })
    );
  };

  // Update pipe cut length (m) and recalculate standard pcs/h and output rate (kg/h)
  const handlePipeLengthChange = (machineId, lenVal) => {
    const num = Math.max(0.5, Number(lenVal) || 6.0);
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        const speedNum = Number(item.speed) || 0;
        const rate = speedNum > 0 ? Math.round((speedNum * 60) / num) : '';
        const unitWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : 1.0;
        return {
          ...item,
          pipeLength: num,
          calculatedRate: rate !== '' ? Math.round(rate) : '',
          calculatedRateKgH: rate ? Math.round(rate * unitWeight * 10) / 10 : ''
        };
      })
    );
  };

  // Update pipe standard weight (kg/pipe) and dynamically recalculate output rate (kg/h) and utilization (%)
  const handleUnitWeightChange = (machineId, weightVal) => {
    const rawVal = weightVal === '' ? '' : Number(weightVal);
    const num = typeof rawVal === 'number' && !isNaN(rawVal) && rawVal > 0 ? rawVal : '';
    setLinesState((prev) =>
      prev.map((item) => {
        if (item.machineId !== machineId) return item;
        if (num === '') {
          return {
            ...item,
            unitWeight: '',
            calculatedRateKgH: item.isCompounding ? item.calculatedRate : ''
          };
        }
        const calcRate = Number(item.calculatedRate) || 0;
        const calcKgH = item.isCompounding
          ? calcRate
          : (calcRate > 0 ? Math.round(calcRate * num * 10) / 10 : '');
        return {
          ...item,
          unitWeight: num,
          calculatedRateKgH: calcKgH
        };
      })
    );
    if (num !== '') {
      savePersistedSopConfig({ [machineId]: { unitWeight: num } });
    }
  };

  // Lookup latest historical realized pace for line and product
  const handleFetchHistoricalRate = (machineId, itemCode) => {
    const details = getLatestHistoricalRunDetails(machineId, itemCode, records, { machineMaster: activeMaster });
    if (details && Number(details.rate) > 0) {
      const intRate = Math.round(Number(details.rate));
      handleRateChange(machineId, intRate);
      setHistoricalFeedback((prev) => ({
        ...prev,
        [machineId]: {
          status: 'found',
          rate: intRate,
          date: details.date || ''
        }
      }));
    } else {
      setHistoricalFeedback((prev) => ({
        ...prev,
        [machineId]: {
          status: 'not_found'
        }
      }));
    }
  };

  // Save typed rate as permanent baseline standard in catalog
  const handleSaveBaseline = (machineId, itemCode, currentRate) => {
    if (!machineId || !itemCode) return;
    const numRate = Math.round(Number(currentRate));
    if (isNaN(numRate) || numRate <= 0) return;

    saveBaselineRate(machineId, itemCode, numRate);
    setLinesState((prev) =>
      prev.map((item) =>
        item.machineId === machineId
          ? { ...item, isBaseline: true, baselineRate: numRate, calculatedRate: numRate }
          : item
      )
    );
    setHistoricalFeedback((prev) => ({
      ...prev,
      [machineId]: {
        status: 'baseline_saved',
        rate: numRate
      }
    }));
  };

  // Compile active models for print or PDF export (supports multi-day batch)
  const compileModels = () => {
    const targets = linesState.filter((l) => l.isSelected);

    const baseConfigs = targets.map((item) => {
      const calcRateInt = item.calculatedRate !== '' && item.calculatedRate !== null && !isNaN(item.calculatedRate)
        ? Math.round(Number(item.calculatedRate))
        : '';
      const pipeLen = Number(item.pipeLength) > 0 ? Number(item.pipeLength) : (Number(item.cutLength) > 0 ? Number(item.cutLength) : 6.0);
      const speedVal = Number(item.speed) > 0 ? Number(item.speed) : '';
      const uWeight = Number(item.unitWeight) > 0 ? Number(item.unitWeight) : (Number(item.stdWeight) > 0 ? Number(item.stdWeight) : 1.0);
      const nomCap = getMachineNominalCapacity(item.machineId, machineMaster) || Number(item.nominalCapacity) || 200;

      let effectiveRate = calcRateInt;
      if (!effectiveRate && !item.isCompounding && item.itemCode) {
        const baseRate = getBaselineRate(item.machineId, item.itemCode, records, { machineMaster });
        if (baseRate && Number(baseRate) > 0) {
          effectiveRate = Math.round(Number(baseRate));
        }
      }
      if (!effectiveRate && !item.isCompounding) {
        if (speedVal > 0 && pipeLen > 0) {
          effectiveRate = Math.round((speedVal * 60) / pipeLen);
        } else if (nomCap > 0 && uWeight > 0) {
          effectiveRate = Math.round(nomCap / uWeight);
        }
      }

      const hasContent = Boolean(item.productDescription || item.itemCode || effectiveRate || speedVal || item.isCompounding);

      return {
        lineId: item.machineId,
        fullMachineName: item.fullMachineName,
        itemCode: item.itemCode,
        productDescription: item.productDescription,
        speed: speedVal || item.speed,
        pipeLength: pipeLen,
        cutLength: pipeLen,
        unitWeight: uWeight,
        stdWeight: uWeight,
        nominalCapacity: nomCap,
        targetRate: effectiveRate,
        targetPcsH: effectiveRate,
        calculatedRate: effectiveRate,
        rate: effectiveRate,
        calculatedRateKgH: item.calculatedRateKgH,
        targetCapacity: effectiveRate,
        isCompounding: item.isCompounding,
        isIdle: !hasContent,
        machineMaster
      };
    });

    return buildMultiDayMorningSopModels(baseConfigs, targetDate, daysCount);
  };

  const persistCurrentLines = () => {
    const updates = {};
    linesState.forEach((item) => {
      if (item.machineId) {
        updates[item.machineId] = {
          unitWeight: item.unitWeight,
          speed: item.speed,
          pipeLength: item.pipeLength,
          calculatedRate: item.calculatedRate,
          itemCode: item.itemCode,
          productDescription: item.productDescription
        };
      }
    });
    savePersistedSopConfig(updates);
  };

  const handlePrint = () => {
    persistCurrentLines();
    const models = compileModels();
    if (models.length === 0) return;
    if (typeof onConfirmPrint === 'function') {
      onConfirmPrint(models);
    }
  };

  const handlePdf = () => {
    persistCurrentLines();
    const models = compileModels();
    if (models.length === 0) return;
    if (typeof onConfirmPdf === 'function') {
      onConfirmPdf(models);
    }
  };

  const activeLines = linesState.filter((l) => l.isSelected);
  const activeLinesCount = activeLines.length;
  const totalSheets = activeLinesCount * daysCount;

  return (
    <div className="export-modal-backdrop no-print" onClick={!isGenerating ? onClose : undefined}>
      <div
        className="export-modal-dialog print-sop-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-sop-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="export-modal-header">
          <div>
            <div className="print-sop-title-wrap">
              <span className="print-sop-badge-sop">DOC-Ext.-03</span>
              <h3 id="print-sop-modal-title" className="export-modal-title">
                Configured Machine Lines (Batch Mode)
              </h3>
            </div>
            <p className="export-modal-subtitle">
              Pre-populate operational specifications, inherit previous runs, and calculate standard pieces per hour.
            </p>
            {onOpenUniversalBlank && (
              <div className="print-sop-switch-banner">
                <span className="switch-hint">Prefer a single blank sheet?</span>
                <button
                  type="button"
                  className="btn-link-action"
                  onClick={onOpenUniversalBlank}
                  disabled={isGenerating}
                >
                  Switch to Option A: Universal Blank (1 Page) &rarr;
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            disabled={isGenerating}
            aria-label="Close morning SOP dialog"
          >
            &times;
          </button>
        </div>

        {/* Scope Tabs & Date Controls */}
        <div className="export-scope-tabs">
          <button
            type="button"
            className={`export-scope-tab ${scope === 'all' ? 'active' : ''}`}
            onClick={() => setScope('all')}
            disabled={isGenerating}
          >
            <span className="export-scope-tab-title">All Lines</span>
            <span className="export-scope-tab-badge">
              {activeMaster.length} Lines
            </span>
          </button>
          <button
            type="button"
            className={`export-scope-tab ${scope === 'previousDay' ? 'active' : ''}`}
            onClick={() => setScope('previousDay')}
            disabled={isGenerating}
          >
            <span className="export-scope-tab-title">Previous Day Active Lines</span>
            <span className="export-scope-tab-badge">
              {prevDayActiveCount} Active ({previousDate || effectiveLatestRun?.latestDate || 'N/A'})
            </span>
          </button>
        </div>

        {/* Target Date Bar */}
        <div className="export-target-info-bar print-sop-date-bar">
          <div className="export-target-item print-sop-date-item">
            <span className="export-target-lbl">Target Production Date:</span>
            <input
              type="date"
              className="sheet-select print-sop-date-input"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              disabled={isGenerating}
            />
          </div>
          <div className="export-target-item print-sop-days-item">
            <span className="export-target-lbl">Days to Print:</span>
            <select
              className="sheet-select print-sop-days-select"
              value={daysCount}
              onChange={(e) => setPrintAheadDays(Math.max(1, Math.min(14, parseInt(e.target.value, 10) || 1)))}
              disabled={isGenerating}
              title="Consecutive Days to Print Ahead (DOC-Ext.-03)"
            >
              <option value={1}>1 Day (Default)</option>
              <option value={2}>2 Days</option>
              <option value={3}>3 Days</option>
              <option value={4}>4 Days</option>
              <option value={5}>5 Days</option>
              <option value={6}>6 Days</option>
              <option value={7}>7 Days (Full Week)</option>
              <option value={8}>8 Days</option>
              <option value={9}>9 Days</option>
              <option value={10}>10 Days</option>
              <option value={14}>14 Days (Max)</option>
            </select>
          </div>
          <div className="export-target-item">
            <span className="export-target-lbl">Inheritance Source:</span>
            <span className="export-target-val">
              {scope === 'previousDay'
                ? `Strict Previous Day (${previousDate || effectiveLatestRun?.latestDate || 'N/A'})`
                : 'Latest Logged Operational Run'}
            </span>
          </div>
          <div className="print-sop-batch-actions">
            <button
              type="button"
              className="btn-link-action"
              onClick={() => handleSelectAll(true)}
              disabled={isGenerating}
            >
              Select All
            </button>
            <span className="sep">|</span>
            <button
              type="button"
              className="btn-link-action"
              onClick={() => handleSelectAll(false)}
              disabled={isGenerating}
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Machine Specifications List */}
        <div className="print-sop-list-container">
          {linesState
            .filter((l) => (scope === 'previousDay' ? (l.hadRunOnLatest || l.previousRunDate === previousDate || l.isSelected) : true))
            .map((line) => {
              const isLineComp = Boolean(
                line.isCompounding ||
                isCompoundingLineOrProduct({
                  lineId: line.machineId,
                  fullMachineName: line.fullMachineName,
                  itemCode: line.itemCode,
                  productDescription: line.productDescription
                }, activeMaster)
              );

              // Defensive machine lookup with fallback
              const machineSetting = (typeof matchMachine === 'function' && line?.machineId)
                ? (matchMachine(line.machineId, activeMaster) || activeMaster.find((m) => m?.id === line.machineId))
                : (activeMaster.find((m) => m?.id === line?.machineId) || null);

              const nominalKgH = getMachineNominalCapacity(line?.machineId, activeMaster) || Number(line?.nominalCapacity) || Number(machineSetting?.nominalCapacity) || Number(machineSetting?.capacityKgH) || (isLineComp ? 400 : 200);

              const unitWeight = isLineComp ? 25.0 : (Number(line?.unitWeight) > 0 ? Number(line.unitWeight) : 1.0);
              const speed = Number(line?.speed) || 0;
              const pipeLength = isLineComp ? 0 : (Number(line?.pipeLength) > 0 ? Number(line.pipeLength) : 6.0);
              const pcsPerHour = Number(line?.calculatedRate) > 0
                ? Number(line.calculatedRate)
                : (!isLineComp && speed > 0 && pipeLength > 0 ? Math.round((speed * 60) / pipeLength) : 0);
              const calculatedKgH = isLineComp
                ? (Number(line?.calculatedRate) || nominalKgH)
                : (line?.calculatedRateKgH !== undefined && line?.calculatedRateKgH !== null && line?.calculatedRateKgH !== ''
                    ? Number(line.calculatedRateKgH)
                    : Math.round(pcsPerHour * unitWeight * 10) / 10);

              const utilizationPct = nominalKgH > 0 ? Math.round((calculatedKgH / nominalKgH) * 100) : 0;

              return (
                <div
                  key={line.machineId}
                  className={`print-sop-line-card${line.isSelected ? ' active' : ' disabled'}`}
                >
                  <div className="print-sop-line-header">
                    <div className="print-sop-line-title-row">
                      <input
                        type="checkbox"
                        className="print-sop-checkbox"
                        checked={line.isSelected}
                        onChange={() => handleToggleSelect(line.machineId)}
                        disabled={isGenerating}
                      />
                      <span className="print-sop-line-name">{line.fullMachineName}</span>
                    </div>

                    <div className="print-sop-badges">
                      {line.previousRunDate ? (
                        <span className="print-sop-badge-run">
                          {scope === 'previousDay' ? `Active: ${line.previousRunDate}` : `Inherited: ${line.previousRunDate}`}
                        </span>
                      ) : (
                        <span className="print-sop-badge-default idle">
                          {scope === 'previousDay' ? `Stopped on ${previousDate || 'Previous Day'}` : 'Stopped / No Run'}
                        </span>
                      )}
                      {isLineComp ? (
                        <>
                          <div className="print-sop-badge-rate print-sop-badge-rate-editable" title="Target Capacity (Kg/hr)">
                            <input
                              type="number"
                              step="10"
                              min="10"
                              max="2000"
                              className="print-sop-inline-rate-input"
                              value={line.calculatedRate !== undefined && line.calculatedRate !== null ? line.calculatedRate : ''}
                              placeholder="0"
                              onChange={(e) => handleCapacityChange(line.machineId, e.target.value)}
                              disabled={isGenerating || !line.isSelected}
                            />
                            <span className="print-sop-inline-rate-unit">Kg / hr</span>
                          </div>
                          <span className="print-sop-badge-nominal">
                            Bag Packaging: 25 Kg / Bag
                          </span>
                          <span className="print-sop-badge-nominal">
                            Nominal Target: {nominalKgH.toLocaleString()} kg/h
                          </span>
                          <span className="print-sop-badge-util">
                            Utilization: {nominalKgH > 0 ? Math.round((Number(line.calculatedRate || nominalKgH) / nominalKgH) * 100) : 100}%
                          </span>
                        </>
                      ) : (
                        line.calculatedRate ? (
                          <>
                            <div className="print-sop-badge-rate print-sop-badge-rate-editable" title="Live-editable Target Rate (Pcs/hr)">
                              <input
                                type="number"
                                step="1"
                                min="1"
                                max="10000"
                                className="print-sop-inline-rate-input"
                                value={line.calculatedRate}
                                onChange={(e) => handleRateChange(line.machineId, e.target.value)}
                                disabled={isGenerating || !line.isSelected}
                              />
                              <span className="print-sop-inline-rate-unit">Pcs / hr</span>
                            </div>
                            <span className="print-sop-badge-kgh">
                              Calculated: {calculatedKgH.toLocaleString()} kg/h
                            </span>
                            <span className="print-sop-badge-nominal">
                              Nominal Target: {nominalKgH.toLocaleString()} kg/h
                            </span>
                            <span className="print-sop-badge-util">
                              Utilization: {utilizationPct}%
                            </span>
                          </>
                        ) : (
                          <>
                            <div className="print-sop-badge-rate print-sop-badge-rate-editable" title="Enter Target Rate (Pcs/hr)">
                              <input
                                type="number"
                                step="1"
                                min="1"
                                max="10000"
                                className="print-sop-inline-rate-input"
                                value=""
                                placeholder="--"
                                onChange={(e) => handleRateChange(line.machineId, e.target.value)}
                                disabled={isGenerating || !line.isSelected}
                              />
                              <span className="print-sop-inline-rate-unit">Pcs / hr</span>
                            </div>
                            <span className="print-sop-badge-rate idle">
                              Idle / Blank Sheet
                            </span>
                            <span className="print-sop-badge-nominal">
                              Nominal Target: {nominalKgH.toLocaleString()} kg/h
                            </span>
                          </>
                        )
                      )}
                    </div>
                  </div>

                  <div className="print-sop-line-body">
                    {/* Dual Product Selection: Product Code & Product Description */}
                    <div className="print-sop-products-row">
                      {/* 1. Product Code Dropdown */}
                      <div className="print-sop-form-group print-sop-code-group">
                        <label className="print-sop-label">
                          Product Code:
                        </label>
                        <select
                          className="print-sop-select print-sop-code-select"
                          value={line.itemCode || ''}
                          onChange={(e) => handleProductCodeChange(line.machineId, e.target.value)}
                          disabled={isGenerating || !line.isSelected}
                        >
                          <option value="">-- No Product (Blank Sheet) --</option>
                          {line.itemCode && !distinctCodes.some((c) => c === line.itemCode) && (
                            <option value={line.itemCode}>
                              {line.itemCode} (Current)
                            </option>
                          )}
                          {distinctCodes.map((code) => {
                            const p = productCatalog.find((x) => x.itemCode === code);
                            return (
                              <option key={code} value={code}>
                                {code} {p?.description ? `— ${p.description.slice(0, 26)}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      {/* 2. Product Specification Dropdown */}
                      <div className="print-sop-form-group print-sop-desc-group">
                        <label className="print-sop-label">
                          Product Specification (Mold / Size):
                        </label>
                        <select
                          className="print-sop-select"
                          value={line.productDescription || ''}
                          onChange={(e) => handleProductChange(line.machineId, e.target.value)}
                          disabled={isGenerating || !line.isSelected}
                        >
                          <option value="">-- Manual Pen Entry (Blank) --</option>
                          {/* Ensure currently selected product is represented */}
                          {line.productDescription && !productCatalog.some((p) => p.description === line.productDescription) && (
                            <option value={line.productDescription}>
                              {line.itemCode ? `[${line.itemCode}] ` : ''}{line.productDescription} (Recorded)
                            </option>
                          )}
                          {productCatalog.map((prod) => (
                            <option key={`${prod.itemCode}_${prod.description}`} value={prod.description}>
                              {prod.itemCode ? `[${prod.itemCode}] ` : ''}{prod.description}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Speed & Cut Length Controls OR Compounding Target Controls */}
                    {isLineComp ? (
                      <div className="print-sop-params-row">
                        <div className="print-sop-param">
                          <label className="print-sop-label">Target Capacity (Kg/h):</label>
                          <input
                            type="number"
                            step="10"
                            min="50"
                            max="2000"
                            className="print-sop-input"
                            value={line.calculatedRate !== undefined && line.calculatedRate !== null ? line.calculatedRate : ''}
                            placeholder="Target (Kg/h)"
                            onChange={(e) => handleCapacityChange(line.machineId, e.target.value)}
                            disabled={isGenerating || !line.isSelected}
                          />
                        </div>

                        <div className="print-sop-param">
                          <label className="print-sop-label">Packaging Standard:</label>
                          <input
                            type="text"
                            className="print-sop-input"
                            value="25 Kg / Bag"
                            readOnly
                            disabled
                          />
                        </div>

                        <div className="print-sop-param print-sop-calc-summary">
                          {line.calculatedRate ? (
                            <>
                              <div className="print-sop-calc-pcs-box">
                                <span className="print-sop-calc-formula">
                                  Target Rate
                                </span>
                                <span className="print-sop-calc-val">
                                  = <strong>{Number(line.calculatedRate).toLocaleString()}</strong> kg/h
                                </span>
                              </div>
                              <span className="print-sop-calc-divider">|</span>
                              <div className="print-sop-calc-kgh-box">
                                <span className="print-sop-calc-item print-sop-calc-output">
                                  Output: <strong>{Math.round(Number(line.calculatedRate) / 25)} Bags/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-nominal">
                                  Nominal Target: <strong>{nominalKgH.toLocaleString()} kg/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-util" title="Calculated / Nominal">
                                  Line Type: <strong>Pelletizing / Compounding</strong>
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="print-sop-calc-idle-box">
                              <span className="print-sop-calc-idle">
                                No active capacity set &bull; Blank sheet for floor pen recording
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="print-sop-params-row">
                        <div className="print-sop-param print-sop-param-target">
                          <div className="print-sop-param-header">
                            <label className="print-sop-label">Target (Pcs/h):</label>
                            <div className="print-sop-btn-group">
                              <button
                                type="button"
                                className="print-sop-fetch-btn"
                                title="Fetch latest realized pace from historical logs"
                                onClick={() => handleFetchHistoricalRate(line.machineId, line.itemCode)}
                                disabled={isGenerating || !line.isSelected}
                              >
                                <Sparkles size={11} className="print-sop-fetch-icon" />
                                <span>Fetch Historical Rate</span>
                              </button>
                              <button
                                type="button"
                                className={`print-sop-baseline-btn ${line.isBaseline ? 'print-sop-baseline-active' : ''}`}
                                title="Save current rate as permanent baseline standard in catalog"
                                onClick={() => handleSaveBaseline(line.machineId, line.itemCode, line.calculatedRate)}
                                disabled={isGenerating || !line.isSelected || !line.itemCode || !line.calculatedRate || Number(line.calculatedRate) <= 0}
                              >
                                <Bookmark size={11} className="print-sop-fetch-icon" />
                                <span>Save as Baseline</span>
                              </button>
                            </div>
                          </div>

                          {line.isBaseline && Number(line.baselineRate || line.calculatedRate) > 0 && (
                            <div className="print-sop-baseline-badge">
                              <span className="print-sop-baseline-badge-dot" />
                              <span>Baseline Standard: {Number(line.baselineRate || line.calculatedRate).toLocaleString()} pcs/h</span>
                            </div>
                          )}

                          {historicalFeedback[line.machineId] && (
                            <div className={`print-sop-hist-badge ${historicalFeedback[line.machineId].status === 'found' ? 'print-sop-hist-found' : (historicalFeedback[line.machineId].status === 'baseline_saved' ? 'print-sop-hist-found' : 'print-sop-hist-missing')}`}>
                              {historicalFeedback[line.machineId].status === 'found' ? (
                                <>
                                  <span className="print-sop-hist-dot" />
                                  <span>
                                    Last Realized: {historicalFeedback[line.machineId].rate} pcs/h
                                    {historicalFeedback[line.machineId].date ? ` (${historicalFeedback[line.machineId].date})` : ''}
                                  </span>
                                </>
                              ) : historicalFeedback[line.machineId].status === 'baseline_saved' ? (
                                <>
                                  <span className="print-sop-hist-dot" />
                                  <span>Saved as Baseline Standard ({historicalFeedback[line.machineId].rate} pcs/h)</span>
                                </>
                              ) : (
                                <span>No Historical Run Found</span>
                              )}
                            </div>
                          )}

                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="10000"
                            className="print-sop-input"
                            value={line.calculatedRate !== undefined && line.calculatedRate !== null ? line.calculatedRate : ''}
                            placeholder="Target (Pcs/h)"
                            onChange={(e) => handleRateChange(line.machineId, e.target.value)}
                            disabled={isGenerating || !line.isSelected}
                          />

                          {Number(line.calculatedRate) > 0 && (
                            <div className="print-sop-target-caption">
                              Printed target will scale to 85% efficiency target (~{Math.round(Number(line.calculatedRate) / 0.85)} pcs/h on sheet)
                            </div>
                          )}
                        </div>

                        <div className="print-sop-param">
                          <label className="print-sop-label">Speed (M/Min):</label>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            className="print-sop-input"
                            value={line.speed !== undefined && line.speed !== null ? line.speed : ''}
                            placeholder="Manual (Blank)"
                            onChange={(e) => handleSpeedChange(line.machineId, e.target.value)}
                            disabled={isGenerating || !line.isSelected}
                          />
                        </div>

                        <div className="print-sop-param">
                          <label className="print-sop-label">Cut Length (M):</label>
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="30"
                            className="print-sop-input"
                            value={line.pipeLength}
                            onChange={(e) => handlePipeLengthChange(line.machineId, e.target.value)}
                            disabled={isGenerating || !line.isSelected}
                          />
                        </div>

                        <div className="print-sop-param">
                          <label className="print-sop-label">Std Weight (kg/pipe):</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max="500"
                            className="print-sop-input"
                            value={line.unitWeight !== undefined && line.unitWeight !== null ? line.unitWeight : ''}
                            placeholder="kg/pipe"
                            onChange={(e) => handleUnitWeightChange(line.machineId, e.target.value)}
                            disabled={isGenerating || !line.isSelected}
                          />
                        </div>

                        <div className="print-sop-param print-sop-calc-summary">
                          {line.calculatedRate ? (
                            <>
                              <div className="print-sop-calc-pcs-box">
                                <span className="print-sop-calc-formula">
                                  {line.speed > 0
                                    ? (unitWeight > 0
                                        ? `(${line.speed} \u00d7 60) / ${line.pipeLength}m = ${line.calculatedRate} pcs/h \u00d7 ${unitWeight} kg/pc`
                                        : `(${line.speed} \u00d7 60) / ${line.pipeLength}m = ${line.calculatedRate} pcs/h`)
                                    : (unitWeight > 0
                                        ? `${line.calculatedRate} pcs/h \u00d7 ${unitWeight} kg/pc`
                                        : 'Target Standard')}
                                </span>
                                <span className="print-sop-calc-val">
                                  = <strong>{calculatedKgH.toLocaleString()}</strong> kg/h
                                </span>
                              </div>
                              <span className="print-sop-calc-divider">|</span>
                              <div className="print-sop-calc-kgh-box">
                                <span className="print-sop-calc-item print-sop-calc-nominal">
                                  Nominal Target: <strong>{nominalKgH.toLocaleString()} kg/h</strong>
                                </span>
                                <span className="print-sop-calc-bullet">&bull;</span>
                                <span className="print-sop-calc-item print-sop-calc-util" title="Calculated / Nominal">
                                  Utilization: <strong>{utilizationPct}%</strong>
                                </span>
                              </div>
                            </>
                          ) : (
                            <div className="print-sop-calc-idle-box">
                              <span className="print-sop-calc-idle">
                                No active speed / product set &bull; Blank sheet for floor pen recording
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>

        {/* Footer Actions */}
        <div className="export-modal-footer print-sop-footer">
          <div className="print-sop-summary-text" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>
              {daysCount === 1 ? (
                <>Target: <strong>{totalSheets}</strong> {totalSheets === 1 ? 'Sheet' : 'Sheets'} ({targetDate})</>
              ) : (
                <>Target: <strong>{totalSheets}</strong> Sheets ({daysCount} Days: {targetDate} to {endDate})</>
              )}
            </span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.25)', fontWeight: 600 }}>
              A4 Portrait &bull; 5mm Margin
            </span>
          </div>

          <div className="export-footer-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              disabled={isGenerating}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sop-pdf"
              onClick={handlePdf}
              disabled={isGenerating || activeLinesCount === 0}
              title="Download single or multi-page PDF"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="18" x2="12" y2="12" />
                <line x1="9" y1="15" x2="12" y2="18" />
                <line x1="15" y1="15" x2="12" y2="18" />
              </svg>
              Download PDF {totalSheets > 1 ? `(${totalSheets} Sheets)` : ''}
            </button>

            <button
              type="button"
              className="btn btn-primary btn-sop-print"
              onClick={handlePrint}
              disabled={isGenerating || activeLinesCount === 0}
              title="Print via system dialog with automatic page breaks"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 6 }}>
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print SOP {totalSheets > 1 ? `(${totalSheets} Sheets)` : 'Sheet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
