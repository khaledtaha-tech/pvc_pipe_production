import { tDaily } from '../../utils/dailyEvaluationTranslations.js';

export default function KpiStrip({ derived, lang = 'en' }) {
  if (!derived) return null;

  const t = (k) => tDaily(k, lang);
  const eng = derived.engineering || {};
  const operatingHours = Number(derived.operatingHours) || 0;
  const totalWeightKg = Number(eng.totalWeightKg) || 0;
  const nominalCapacityKgH = Number(eng.nominalCapacityKgH) || 0;

  // True Actual Output Rate: operatingHours > 0 ? (totalOutputKg / operatingHours) : 0
  const actualRateKgH =
    operatingHours > 0 && totalWeightKg > 0
      ? Math.round((totalWeightKg / operatingHours) * 10) / 10
      : (Number(eng.actualRateKgH) || 0);

  // Percentage of nominal: nominalRateKgH > 0 ? (actualOutputRateKgH / nominalRateKgH) * 100 : 0
  const capacityUtilizationPct =
    nominalCapacityKgH > 0
      ? Math.round((actualRateKgH / nominalCapacityKgH) * 1000) / 10
      : (Number(eng.capacityUtilizationPct) || 0);

  const hasCapacity = nominalCapacityKgH > 0;

  return (
    <div className="kpi-section no-print">
      <div className="kpi-strip">
        <div className="kpi-card">
          <div className="kpi-value">
            {derived.operatingHours.toFixed(1)}
            <span className="kpi-unit">h</span>
          </div>
          <div className="kpi-label">{t('kpiOperatingHours')}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.totalDowntimeHours.toFixed(1)}
            <span className="kpi-unit">h</span>
          </div>
          <div className="kpi-label">{t('kpiTotalDowntime')}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {totalWeightKg ? totalWeightKg.toLocaleString() : (eng.totalWeightKg ? eng.totalWeightKg.toLocaleString() : '-')}
            <span className="kpi-unit">kg</span>
          </div>
          <div className="kpi-label">
            {t('kpiTotalOutput')} {derived.grandTotals?.actual ? `(${derived.grandTotals.actual.toLocaleString()} ${t('kpiPcs')})` : ''}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {actualRateKgH > 0 ? actualRateKgH : (eng.actualRateKgH ? eng.actualRateKgH : '-')}
            <span className="kpi-unit">kg/h</span>
          </div>
          <div className="kpi-label">
            {t('kpiActualRate')} {hasCapacity ? `(${capacityUtilizationPct}% of ${nominalCapacityKgH} kg/h)` : ''}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.aStr}
          </div>
          <div className="kpi-label">{t('kpiAvailability')}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.pStr}
          </div>
          <div className="kpi-label">{t('kpiPerformance')}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-value">
            {derived.qStr}
          </div>
          <div className="kpi-label">{t('kpiQuality')}</div>
        </div>

        <div className="kpi-card kpi-card-hl">
          <div className="kpi-value">
            {derived.oeeStr}
          </div>
          <div className="kpi-label">{t('kpiOee')}</div>
        </div>
      </div>

      <div className="kpi-formula-bar">
        <span className="formula-tag">{t('kpiFormulaTag')}</span>
        <span className="formula-text">
          <b>{t('kpiFormulaOverall')}</b> = <b>{t('kpiFormulaAvail')}</b> ({derived.aStr}) &times; <b>{t('kpiFormulaPerf')}</b> ({derived.pStr}) &times; <b>{t('kpiFormulaQual')}</b> ({derived.qStr}) = <b className="formula-res">{derived.oeeStr}</b>
        </span>
        {hasCapacity ? (
          <span className="capacity-badge">
            {t('kpiCapacityUtil')} <b>{capacityUtilizationPct}%</b> ({actualRateKgH} kg/h {t('kpiActual')} vs {nominalCapacityKgH} kg/h {t('kpiNominal')})
          </span>
        ) : null}
      </div>
    </div>
  );
}
