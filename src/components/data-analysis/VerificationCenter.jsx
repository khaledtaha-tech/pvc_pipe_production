import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, 
  Sparkles, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  FileText, 
  Search, 
  Filter, 
  Layers, 
  Eye, 
  Save, 
  ChevronDown, 
  ChevronUp, 
  Database,
  Share2,
  Cpu,
  ArrowRight
} from 'lucide-react';

import { registry } from '../../verification/capabilityRegistry';
import { ScenarioGenerator } from '../../verification/scenarioGenerator';
import { runner } from '../../verification/scenarioRunner';
import { 
  loadStoredProgress, 
  saveScenarioUpdate, 
  applyRetestIntelligence, 
  clearVerificationProgress,
  recordCapabilityFingerprints 
} from '../../verification/retestIntelligence';
import { buildTraceabilityMatrix } from '../../verification/rulesMatrix';

export default function VerificationCenter({ lang, onInjectTestData }) {
  const isAr = lang === 'ar';

  const [plan, setPlan] = useState(null);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('scenarios'); // 'scenarios' | 'coverage' | 'traceability'
  const [expandedScenarios, setExpandedScenarios] = useState({});
  const [userNotes, setUserNotes] = useState({});
  const [isRunningAuto, setIsRunningAuto] = useState(false);
  const [verificationResults, setVerificationResults] = useState(new Map());

  // Auto-generate verification plan on mount
  useEffect(() => {
    handleGeneratePlan();
  }, []);

  const handleGeneratePlan = () => {
    const generator = new ScenarioGenerator(registry);
    let rawPlan = generator.generatePlan();
    // Apply retest intelligence and load stored user progress
    let intelligentPlan = applyRetestIntelligence(rawPlan);

    // Save capability fingerprints
    recordCapabilityFingerprints(registry.getAll());

    setPlan(intelligentPlan);

    // Restore user notes
    const { scenarios: stored } = loadStoredProgress();
    const notesMap = {};
    Object.keys(stored).forEach(id => {
      if (stored[id].notes) notesMap[id] = stored[id].notes;
    });
    setUserNotes(notesMap);
  };

  const handleRunAllAuto = () => {
    if (!plan) return;
    setIsRunningAuto(true);

    setTimeout(() => {
      const execSummary = runner.runAllAutomated(plan);
      setVerificationResults(execSummary.results);

      // Update plan scenarios with execution results
      const updatedScenarios = plan.scenarios.map(sc => {
        const res = execSummary.results.get(sc.id);
        if (res) {
          saveScenarioUpdate(sc.id, {
            status: res.status,
            testedAt: res.testedAt,
            actualResult: res.actualResult
          });
          return {
            ...sc,
            status: res.status,
            actualResult: res.actualResult,
            mismatches: res.mismatches,
            crossSystemResults: res.crossSystemResults
          };
        }
        return sc;
      });

      setPlan(prev => ({
        ...prev,
        scenarios: updatedScenarios
      }));

      setIsRunningAuto(false);
    }, 200);
  };

  const handleRunSingleScenario = (sc) => {
    const res = runner.runScenario(sc);
    const newResults = new Map(verificationResults);
    newResults.set(sc.id, res);
    setVerificationResults(newResults);

    saveScenarioUpdate(sc.id, {
      status: res.status,
      testedAt: res.testedAt,
      actualResult: res.actualResult
    });

    setPlan(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === sc.id ? {
        ...s,
        status: res.status,
        actualResult: res.actualResult,
        mismatches: res.mismatches,
        crossSystemResults: res.crossSystemResults
      } : s)
    }));
  };

  const handleManualStatusChange = (scId, newStatus) => {
    saveScenarioUpdate(scId, {
      status: newStatus,
      notes: userNotes[scId] || ""
    });

    setPlan(prev => ({
      ...prev,
      scenarios: prev.scenarios.map(s => s.id === scId ? {
        ...s,
        status: newStatus
      } : s)
    }));
  };

  const handleSaveNotes = (scId) => {
    saveScenarioUpdate(scId, {
      notes: userNotes[scId] || ""
    });
  };

  const handleResetVerification = () => {
    if (window.confirm(isAr ? 'هل أنت متأكد من إعادة تعيين كافة نتائج الفحص المخزنة؟' : 'Are you sure you want to reset all stored verification progress?')) {
      clearVerificationProgress();
      handleGeneratePlan();
      setVerificationResults(new Map());
    }
  };

  const toggleExpand = (scId) => {
    setExpandedScenarios(prev => ({ ...prev, [scId]: !prev[scId] }));
  };

  // Filtered scenarios
  const filteredScenarios = useMemo(() => {
    if (!plan) return [];
    return plan.scenarios.filter(sc => {
      if (filterStatus !== 'ALL' && sc.status !== filterStatus) return false;
      if (filterType !== 'ALL' && sc.verificationType !== filterType) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches = 
          sc.name.toLowerCase().includes(term) ||
          sc.businessContext.toLowerCase().includes(term) ||
          sc.capabilitiesCovered.some(c => c.toLowerCase().includes(term)) ||
          sc.id.toLowerCase().includes(term);
        if (!matches) return false;
      }
      return true;
    });
  }, [plan, filterStatus, filterType, searchTerm]);

  // Overall counts
  const stats = useMemo(() => {
    if (!plan) return { total: 0, passed: 0, needsFix: 0, notTested: 0, retest: 0 };
    const scenarios = plan.scenarios;
    return {
      total: scenarios.length,
      passed: scenarios.filter(s => s.status === 'PASSED').length,
      needsFix: scenarios.filter(s => s.status === 'NEEDS_FIX').length,
      notTested: scenarios.filter(s => s.status === 'NOT_TESTED').length,
      retest: scenarios.filter(s => s.status === 'RETEST_RECOMMENDED').length
    };
  }, [plan]);

  // Traceability matrix
  const traceabilityMatrix = useMemo(() => {
    if (!plan) return [];
    return buildTraceabilityMatrix(plan, verificationResults);
  }, [plan, verificationResults]);

  return (
    <div className="space-y-6">

      {/* Header Banner & Core Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                  {isAr ? 'مركز التحقق الذكي للقدرات والسيناريوهات التشغيلية' : 'Self-Aware Capability & Scenario Verification Center'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isAr 
                    ? 'نظام ذاتي الوعي يقرأ قدرات التطبيق الحالية ويولد خطط فحص تشغيلية واقعية ومستقلة'
                    : 'Introspects current registered capabilities and generates operational verification plans dynamically'}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleGeneratePlan}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-cyan-900/30 transition transform active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isAr ? '🎯 إنشاء خطة التحقق الشاملة' : '🎯 Generate Verification Plan'}</span>
            </button>

            <button
              onClick={handleRunAllAuto}
              disabled={isRunningAuto}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/30 transition transform active:scale-95 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              <span>{isRunningAuto ? (isAr ? 'جاري الفحص...' : 'Running...') : (isAr ? '▶️ تشغيل الفحص الآلي' : '▶️ Run Auto Scenarios')}</span>
            </button>

            <button
              onClick={handleResetVerification}
              className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
              title={isAr ? 'إعادة تعيين نتائج الفحص' : 'Reset Progress'}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

        </div>

        {/* Coverage Warnings Bar (Requirement 2 & 8) */}
        {plan && (plan.coverageReport.uncoveredCount > 0 || plan.coverageReport.partiallyCoveredCount > 0) && (
          <div className="mt-4 p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-amber-300 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>
                {isAr 
                  ? `تنبيه تغطية: تم اكتشاف ${plan.coverageReport.uncoveredCount + plan.coverageReport.partiallyCoveredCount} قدرة تفتقر لمعايير الفحص الكاملة!`
                  : `Coverage Alert: Detected ${plan.coverageReport.uncoveredCount + plan.coverageReport.partiallyCoveredCount} capabilities requiring verification metadata!`}
              </span>
            </div>
            <button 
              onClick={() => setActiveTab('coverage')}
              className="underline text-[11px] hover:text-white"
            >
              {isAr ? 'فحص النواقص' : 'Inspect Missing Metadata'}
            </button>
          </div>
        )}

      </div>

      {/* KPI Stats Overview (Requirement 11) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            {isAr ? 'القدرات المسجلة' : 'Total Capabilities'}
          </span>
          <div className="text-xl font-mono font-black text-white mt-1">
            {plan?.capabilitiesCount || 0}
          </div>
          <span className="text-[10px] text-emerald-400 font-medium">
            {plan?.coveredCapabilitiesCount || 0} {isAr ? 'مغطاة بالكامل' : 'Fully Covered'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            {isAr ? 'السيناريوهات المولدة' : 'Generated Scenarios'}
          </span>
          <div className="text-xl font-mono font-black text-cyan-400 mt-1">
            {stats.total}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {plan?.autoCount || 0} {isAr ? 'آلي' : 'Auto'} / {plan?.manualCount || 0} {isAr ? 'يدوي' : 'Manual'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            {isAr ? 'ناجحة (PASSED)' : 'Passed Scenarios'}
          </span>
          <div className="text-xl font-mono font-black text-emerald-400 mt-1">
            {stats.passed}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0}% {isAr ? 'معدل النجاح' : 'Success Rate'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            {isAr ? 'بحاجة لإصلاح' : 'Needs Fix'}
          </span>
          <div className={`text-xl font-mono font-black mt-1 ${stats.needsFix > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            {stats.needsFix}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {isAr ? 'انحرافات حسابية/منطقية' : 'Logic mismatches'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            {isAr ? 'لم تُفحص بعد' : 'Not Tested'}
          </span>
          <div className="text-xl font-mono font-black text-amber-400 mt-1">
            {stats.notTested}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {isAr ? 'بانتظار التشغيل' : 'Pending execution'}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
            {isAr ? 'إعادة فحص موصى بها' : 'Retest Recommended'}
          </span>
          <div className={`text-xl font-mono font-black mt-1 ${stats.retest > 0 ? 'text-purple-400' : 'text-slate-400'}`}>
            {stats.retest}
          </div>
          <span className="text-[10px] text-slate-400 font-medium">
            {isAr ? 'تغيرت قدراتها' : 'Capability updated'}
          </span>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('scenarios')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'scenarios' 
                ? 'bg-cyan-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isAr ? 'السيناريوهات التشغيلية' : 'Operational Scenarios'}</span>
            <span className="px-1.5 py-0.2 bg-slate-800 rounded text-[10px]">{stats.total}</span>
          </button>

          <button
            onClick={() => setActiveTab('coverage')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'coverage' 
                ? 'bg-cyan-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>{isAr ? 'سجل القدرات والتغطية' : 'Capability Registry & Coverage'}</span>
            <span className="px-1.5 py-0.2 bg-slate-800 rounded text-[10px]">{plan?.capabilitiesCount || 0}</span>
          </button>

          <button
            onClick={() => setActiveTab('traceability')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'traceability' 
                ? 'bg-cyan-600 text-white shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>{isAr ? 'مصفوفة التتبع والقواعد' : 'Traceability Matrix'}</span>
          </button>
        </div>

        <div className="text-xs text-slate-500 font-mono hidden sm:inline">
          Plan Generated: {plan?.generatedAt ? new Date(plan.generatedAt).toLocaleTimeString() : '-'}
        </div>
      </div>

      {/* VIEW 1: SCENARIOS LIST */}
      {activeTab === 'scenarios' && (
        <div className="space-y-4">
          
          {/* Filter and Search Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 rtl:left-auto rtl:right-3 top-2.5" />
              <input
                type="text"
                placeholder={isAr ? 'بحث في السيناريو، السياق، الكود...' : 'Search scenario, context, rule, ID...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 rtl:pl-3 rtl:pr-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <Filter className="w-3.5 h-3.5" />
                <span>{isAr ? 'الحالة:' : 'Status:'}</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="ALL">{isAr ? 'الكل (All)' : 'All Statuses'}</option>
                  <option value="PASSED">✅ {isAr ? 'ناجح' : 'Passed'}</option>
                  <option value="NEEDS_FIX">⚠️ {isAr ? 'بحاجة لإصلاح' : 'Needs Fix'}</option>
                  <option value="NOT_TESTED">⏳ {isAr ? 'لم يُفحص' : 'Not Tested'}</option>
                  <option value="RETEST_RECOMMENDED">🔄 {isAr ? 'إعادة فحص' : 'Retest Recommended'}</option>
                </select>
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-400">
                <span>{isAr ? 'النوع:' : 'Type:'}</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-200"
                >
                  <option value="ALL">{isAr ? 'الكل' : 'All Types'}</option>
                  <option value="AUTO VERIFY">AUTO VERIFY</option>
                  <option value="MANUAL VERIFY">MANUAL VERIFY</option>
                  <option value="HYBRID VERIFY">HYBRID VERIFY</option>
                </select>
              </div>
            </div>

          </div>

          {/* Scenario Cards */}
          <div className="space-y-3">
            {filteredScenarios.map((sc) => {
              const isExpanded = expandedScenarios[sc.id];
              const isPassed = sc.status === 'PASSED';
              const isNeedsFix = sc.status === 'NEEDS_FIX';
              const isRetest = sc.status === 'RETEST_RECOMMENDED';

              return (
                <div
                  key={sc.id}
                  className={`bg-slate-900 border rounded-xl overflow-hidden transition-all duration-150 ${
                    isPassed 
                      ? 'border-emerald-800/40 hover:border-emerald-700/60' 
                      : isNeedsFix 
                        ? 'border-rose-800/50 bg-rose-950/10 hover:border-rose-700' 
                        : isRetest
                          ? 'border-purple-800/50 bg-purple-950/10'
                          : 'border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {/* Card Header Row */}
                  <div className="p-4 flex items-center justify-between gap-4">
                    
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${
                        isPassed 
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' 
                          : isNeedsFix 
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-800/60' 
                            : isRetest
                              ? 'bg-purple-950/80 text-purple-400 border border-purple-800/60'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}>
                        {isPassed ? <CheckCircle2 className="w-5 h-5" /> : isNeedsFix ? <AlertTriangle className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-white truncate">
                            {sc.name}
                          </h4>
                          <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                            sc.verificationType === 'AUTO VERIFY' 
                              ? 'bg-cyan-950 text-cyan-400 border border-cyan-800/60' 
                              : sc.verificationType === 'MANUAL VERIFY'
                                ? 'bg-amber-950 text-amber-300 border border-amber-800/60'
                                : 'bg-purple-950 text-purple-300 border border-purple-800/60'
                          }`}>
                            {sc.verificationType}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">
                            {sc.scenarioCategory}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                          {sc.businessContext}
                        </p>
                      </div>
                    </div>

                    {/* Quick Action & Status Controls */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      
                      {sc.verificationType !== 'MANUAL VERIFY' && (
                        <button
                          onClick={() => handleRunSingleScenario(sc)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
                          title={isAr ? 'فحص هذا السيناريو آلياً' : 'Run Auto Verify'}
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">{isAr ? 'فحص' : 'Run'}</span>
                        </button>
                      )}

                      {/* Manual Status Buttons */}
                      <div className="flex items-center rounded-lg bg-slate-950 border border-slate-800 p-0.5 text-xs">
                        <button
                          onClick={() => handleManualStatusChange(sc.id, 'PASSED')}
                          className={`px-2 py-1 rounded transition ${isPassed ? 'bg-emerald-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => handleManualStatusChange(sc.id, 'NEEDS_FIX')}
                          className={`px-2 py-1 rounded transition ${isNeedsFix ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:text-white'}`}
                        >
                          ✕
                        </button>
                      </div>

                      <button
                        onClick={() => toggleExpand(sc.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>

                    </div>

                  </div>

                  {/* Expanded Detail Panel (Requirements 4, 5, 11) */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 bg-slate-950/50 space-y-4 text-xs">
                      
                      {/* Real-World Context */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                          🏢 {isAr ? 'السياق التشغيلي الواقعي (Business Context)' : 'Real-World Business Context'}
                        </span>
                        <p className="text-slate-300 leading-relaxed">
                          {sc.businessContext}
                        </p>
                      </div>

                      {/* Explicit Test Data & Execution Steps Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        {/* Test Data */}
                        <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block mb-1">
                            📊 {isAr ? 'بيانات الاختبار الصريحة (Explicit Test Data)' : 'Explicit Test Data'}
                          </span>
                          <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-slate-300 overflow-x-auto">
                            {JSON.stringify(sc.testData, null, 2)}
                          </pre>
                        </div>

                        {/* Execution Steps */}
                        <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider block mb-1">
                            👣 {isAr ? 'خطوات التنفيذ المتسلسلة (Execution Steps)' : 'Execution Steps'}
                          </span>
                          <ol className="list-decimal list-inside space-y-1 text-slate-300">
                            {sc.executionSteps.map((step, idx) => (
                              <li key={idx} className="leading-snug">{step}</li>
                            ))}
                          </ol>
                        </div>

                      </div>

                      {/* Independent Expected Results vs Actual Output */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        
                        <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                            🎯 {isAr ? 'النتائج المتوقعة المستقلة (Independent Expected Results)' : 'Independent Expected Results'}
                          </span>
                          <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto">
                            {JSON.stringify(sc.expectedResults, null, 2)}
                          </pre>
                        </div>

                        <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                          <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block mb-1">
                            ⚙️ {isAr ? 'المخرجات الفعلية من التطبيق (Actual Results)' : 'Actual Production Output'}
                          </span>
                          <pre className={`bg-slate-950 p-2.5 rounded border font-mono text-[11px] overflow-x-auto ${
                            isPassed ? 'border-emerald-800 text-slate-200' : isNeedsFix ? 'border-rose-800 text-rose-300' : 'border-slate-800 text-slate-400'
                          }`}>
                            {sc.actualResult ? JSON.stringify(sc.actualResult, null, 2) : (isAr ? '// لم يتم التشغيل بعد' : '// Not executed yet')}
                          </pre>
                        </div>

                      </div>

                      {/* Mismatches Alert if any */}
                      {sc.mismatches && sc.mismatches.length > 0 && (
                        <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-rose-300 space-y-1">
                          <span className="font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4" />
                            {isAr ? 'فروقات وانحرافات مكتشفة:' : 'Detected Mismatches:'}
                          </span>
                          <ul className="list-disc list-inside space-y-0.5">
                            {sc.mismatches.map((m, i) => (
                              <li key={i}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Cross-System / Cross-View Checks */}
                      <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                          🔗 {isAr ? 'فحص الاتساق عبر الشاشات والأنظمة (Cross-System Consistency)' : 'Cross-System Consistency Checks'}
                        </span>
                        <div className="space-y-1">
                          {sc.crossSystemChecks.map((chk, i) => (
                            <div key={i} className="flex items-center gap-2 text-slate-300">
                              <span className="text-emerald-400">✓</span>
                              <span>{chk}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Success Criteria */}
                      <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                        <div>
                          <strong>{isAr ? 'معيار النجاح:' : 'Pass Criteria:'}</strong> {sc.successCriteria.passed}
                        </div>
                        {sc.relatedRules && sc.relatedRules.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span>{isAr ? 'القواعد المرتبطة:' : 'Rules:'}</span>
                            {sc.relatedRules.map(r => (
                              <span key={r} className="font-mono text-cyan-400 bg-slate-900 px-1 py-0.2 rounded border border-slate-800">
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* User Verification Notes (Requirement 11) */}
                      <div className="border-t border-slate-800 pt-3">
                        <label className="block text-slate-400 font-bold mb-1">
                          📝 {isAr ? 'ملاحظات المستخدم / المهندس للفحص اليدوي:' : 'Operator / Verification Notes:'}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder={isAr ? 'سجل ملاحظتك عن السلوك الميداني أو المشكلة المكتشفة...' : 'Document operational observations or failure details...'}
                            value={userNotes[sc.id] || ""}
                            onChange={(e) => setUserNotes({ ...userNotes, [sc.id]: e.target.value })}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          />
                          <button
                            onClick={() => handleSaveNotes(sc.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition"
                          >
                            <Save className="w-3.5 h-3.5" />
                            <span>{isAr ? 'حفظ' : 'Save'}</span>
                          </button>
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* VIEW 2: CAPABILITY REGISTRY & COVERAGE REPORT (Requirements 1, 2, 8) */}
      {activeTab === 'coverage' && (
        <div className="space-y-4">
          
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="font-bold text-sm text-white mb-2">
              {isAr ? 'سجل القدرات المسجلة ومؤشر التغطية' : 'Registered Capability Definitions & Verification Coverage'}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {isAr 
                ? 'أي قدرة جديدة تضاف للتطبيق يجب أن تسجل بيانات الفحص الخاصة بها هنا وإلا ستظهر كتغطية مفقودة.'
                : 'Any application feature must register its verification metadata. Incomplete definitions are flagged below.'}
            </p>

            <div className="space-y-3">
              {plan?.coverageReport.covered.concat(plan?.coverageReport.partiallyCovered, plan?.coverageReport.uncovered).map((cap) => {
                const isFullyCovered = cap.coverageStatus === 'COVERED';
                const isMissing = cap.coverageStatus === 'UNCOVERED';

                return (
                  <div
                    key={cap.capabilityId}
                    className={`p-4 rounded-xl border ${
                      isFullyCovered 
                        ? 'bg-slate-950/60 border-slate-800' 
                        : isMissing 
                          ? 'bg-rose-950/20 border-rose-800/80' 
                          : 'bg-amber-950/20 border-amber-800/80'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-cyan-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          {cap.capabilityId}
                        </span>
                        <h4 className="font-bold text-sm text-white">{cap.name}</h4>
                        <span className={`text-[10px] px-2 py-0.2 rounded-full font-bold uppercase ${
                          isFullyCovered ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-300'
                        }`}>
                          {cap.statusMessage || cap.coverageStatus}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Priority: <strong className="text-white">{cap.verificationPriority}</strong> • v{cap.version}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-2">
                      {cap.businessPurpose}
                    </p>

                    <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-800/60">
                      <div>
                        <strong>Possible States:</strong> {cap.possibleStates?.length || 0}
                      </div>
                      <div>
                        <strong>Rules:</strong> {cap.businessRules?.length || 0}
                      </div>
                      <div>
                        <strong>Invariants:</strong> {cap.invariants?.length || 0}
                      </div>
                      <div>
                        <strong>Edge Cases:</strong> {cap.edgeCases?.length || 0}
                      </div>
                      <div>
                        <strong>Affected Views:</strong> {cap.affectedViews?.join(', ') || '-'}
                      </div>
                    </div>

                    {cap.missingFields && cap.missingFields.length > 0 && (
                      <div className="mt-2 text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded">
                        <strong>Missing required verification fields:</strong> {cap.missingFields.join(', ')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

          </div>

        </div>
      )}

      {/* VIEW 3: TRACEABILITY MATRIX (Requirement 13 & 14) */}
      {activeTab === 'traceability' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="p-5 border-b border-slate-800 bg-slate-950/60">
            <h3 className="font-bold text-sm text-white">
              {isAr ? 'مصفوفة التتبع والامتثال للقواعد التشغيلية (Traceability Matrix)' : 'Operational Rules Traceability Matrix'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isAr 
                ? 'تتبع كامل: القاعدة التشغيلية ➔ القدرة البرمجية ➔ السيناريو الواقعي ➔ حالة التحقق'
                : 'Traceability path: Operational Rule ➔ Capability ➔ Scenario ➔ Verification Status'}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left rtl:text-right text-slate-200">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">{isAr ? 'كود القاعدة' : 'Rule ID'}</th>
                  <th className="py-3 px-4">{isAr ? 'عنوان ومواصفة القاعدة' : 'Rule Title & Standard'}</th>
                  <th className="py-3 px-4">{isAr ? 'القدرات المنفذة' : 'Capabilities'}</th>
                  <th className="py-3 px-4">{isAr ? 'السيناريوهات المغطاة' : 'Covering Scenarios'}</th>
                  <th className="py-3 px-4 text-center">{isAr ? 'حالة التغطية' : 'Coverage Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {traceabilityMatrix.map(row => (
                  <tr key={row.ruleId} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-cyan-400 whitespace-nowrap">
                      {row.ruleId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{row.title}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{row.statement}</div>
                      <span className="inline-block mt-1 text-[10px] text-purple-300 bg-purple-950/60 border border-purple-800/40 px-1.5 rounded">
                        {row.standard}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="space-y-1">
                        {row.capabilities.map(c => (
                          <span key={c.id} className="block font-mono text-[11px] text-slate-300">
                            • {c.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {row.scenarios.length > 0 ? (
                        <div className="space-y-1">
                          {row.scenarios.map(s => (
                            <span key={s.scenarioId} className="block text-[11px]">
                              {s.status === 'PASSED' ? '✅' : s.status === 'NEEDS_FIX' ? '⚠️' : '⏳'} {s.scenarioName}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-rose-400 italic">No scenario covering</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        row.coverageStatus === 'VERIFIED'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : row.coverageStatus === 'FAILING'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}>
                        {row.coverageStatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

    </div>
  );
}
