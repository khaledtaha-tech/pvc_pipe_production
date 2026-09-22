import React, { useState } from 'react';
import { X, PlusCircle, Check } from 'lucide-react';

export default function ManualEntryModal({ isOpen, onClose, onAddRow, lang }) {
  const isAr = lang === 'ar';

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    itemCode: '',
    product: '',
    machine: 'KTS-350',
    qty: '',
    unitWeight: '',
    totalWeight: '',
    scrap: '0',
    operatingHours: '24',
    reasonOfStop: ''
  });

  if (!isOpen) return null;

  const handleChange = (field, val) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: val };
      // If qty and unitWeight change, auto compute totalWeight if empty or updated
      if (field === 'qty' || field === 'unitWeight') {
        const q = parseFloat(field === 'qty' ? val : updated.qty) || 0;
        const u = parseFloat(field === 'unitWeight' ? val : updated.unitWeight) || 0;
        if (q > 0 && u > 0) {
          updated.totalWeight = (q * u).toFixed(2);
        }
      }
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.product || !formData.machine) return;

    onAddRow({
      "Date": formData.date,
      "Item Code": formData.itemCode,
      "Product Description & Specs": formData.product,
      "Machine": formData.machine,
      "Production Qty (FG)": parseFloat(formData.qty) || 0,
      "Unit Weight (kg)": parseFloat(formData.unitWeight) || 0,
      "Total Weight (kg)": parseFloat(formData.totalWeight) || 0,
      "Scrap / Rejection (kg)": parseFloat(formData.scrap) || 0,
      "Operating Hours": parseFloat(formData.operatingHours) || 24,
      "Reason of Stop": formData.reasonOfStop
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-emerald-400" />
            <h3 className="font-bold text-sm text-white">
              {isAr ? 'إضافة سجل إنتاج جديد يدوياً' : 'Add Production Record Manually'}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'التاريخ' : 'Date'}
              </label>
              <input
                type="date"
                required
                value={formData.date}
                onChange={(e) => handleChange('date', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'كود الصنف' : 'Item Code'}
              </label>
              <input
                type="text"
                placeholder="249, 991..."
                value={formData.itemCode}
                onChange={(e) => handleChange('itemCode', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              {isAr ? 'بيان ومواصفات الماسورة' : 'Product Description & Specs'}
            </label>
            <input
              type="text"
              required
              placeholder='e.g. uPVC PIPE 110x5.3 PN-12.5 SASO-ISO'
              value={formData.product}
              onChange={(e) => handleChange('product', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'الماكينة / الخط' : 'Machine / Line'}
              </label>
              <select
                value={formData.machine}
                onChange={(e) => handleChange('machine', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              >
                <option value="KTS-350">KTS-350</option>
                <option value="KABRA-90">KABRA-90</option>
                <option value="KTS-350 TDH">KTS-350 TDH</option>
                <option value="KTS-170">KTS-170</option>
                <option value="KTS-200">KTS-200</option>
                <option value="OTHER">خط آخر (Other)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'الكمية التامة (حبة)' : 'Production Qty (FG)'}
              </label>
              <input
                type="number"
                required
                min="0"
                placeholder="392, 400..."
                value={formData.qty}
                onChange={(e) => handleChange('qty', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'وزن الحبة (كجم)' : 'Unit Weight (kg)'}
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="17.30, 8.20..."
                value={formData.unitWeight}
                onChange={(e) => handleChange('unitWeight', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'إجمالي الوزن (كجم)' : 'Total Weight (kg)'}
              </label>
              <input
                type="number"
                step="0.01"
                placeholder={isAr ? 'يتم حسابه تلقائياً' : 'Auto-calculated'}
                value={formData.totalWeight}
                onChange={(e) => handleChange('totalWeight', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-cyan-300 font-bold focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'الهالك / السكراب (كجم)' : 'Scrap (kg)'}
              </label>
              <input
                type="number"
                step="0.1"
                placeholder="0, 15, 40..."
                value={formData.scrap}
                onChange={(e) => handleChange('scrap', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {isAr ? 'ساعات التشغيل (0 - 24)' : 'Operating Hours (0-24)'}
              </label>
              <input
                type="number"
                min="0"
                max="24"
                value={formData.operatingHours}
                onChange={(e) => handleChange('operatingHours', e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1">
              {isAr ? 'سبب التوقف / ملاحظات (إن وجد)' : 'Reason of Stop / Notes'}
            </label>
            <input
              type="text"
              placeholder={isAr ? 'تغيير مقاس، صيانة، انقطاع كهرباء...' : 'Mold changeover, Maintenance, etc.'}
              value={formData.reasonOfStop}
              onChange={(e) => handleChange('reasonOfStop', e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg transition"
            >
              <Check className="w-4 h-4" />
              <span>{isAr ? 'إضافة وتدقيق' : 'Save & Clean'}</span>
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
