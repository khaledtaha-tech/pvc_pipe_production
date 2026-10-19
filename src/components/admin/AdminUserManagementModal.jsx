import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, 
  UserPlus, 
  Shield, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Trash2, 
  Calendar, 
  Clock, 
  RefreshCw, 
  X, 
  AlertCircle,
  KeyRound,
  Lock,
  ChevronDown,
  Sparkles,
  CreditCard,
  Ban,
  Check,
  Mail,
  Phone,
  User as UserIcon,
  Crown,
  Pencil
} from 'lucide-react';

function getApiUrl(endpoint = 'users.php') {
  if (typeof window !== 'undefined' && window.location) {
    return `./api/${endpoint}`;
  }
  return `/api/${endpoint}`;
}

function getAuthHeaders(extraHeaders = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pvc_auth_token') : null;
  const headers = {
    Accept: 'application/json',
    ...extraHeaders
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function formatDateDisplay(dtString, isArabic = false) {
  if (!dtString) return isArabic ? 'وصول دائم' : 'Unlimited';
  const d = new Date(dtString);
  if (Number.isNaN(d.getTime())) return dtString;
  return d.toLocaleString(isArabic ? 'ar-EG' : undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function isDateExpired(dtString) {
  if (!dtString) return false;
  const t = new Date(dtString).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
}

export default function AdminUserManagementModal({ isOpen, onClose, currentUser, theme = 'dark', lang = 'en' }) {
  const isArabic = lang === 'ar' || (typeof document !== 'undefined' && document.documentElement.dir === 'rtl');

  const txt = {
    title: isArabic ? 'إدارة المستخدمين وباقات الاشتراك (المشرف العام)' : 'Super Admin User & Tier Management',
    badge: isArabic ? 'تحكم كامل بالصلاحيات والاشتراكات' : 'Full RBAC & Tiers',
    subtitle: isArabic 
      ? 'تفعيل أو إيقاف الحسابات، منح الأدوار والصلاحيات، تعيين باقات الاشتراك، وإدارة سياسات كلمات المرور.' 
      : 'Allow or suspend accounts, grant roles, assign subscription tiers, and control password policies.',
    refresh: isArabic ? 'تحديث' : 'Refresh',
    registerUser: isArabic ? 'تسجيل مستخدم جديد' : 'Register New User',
    closeForm: isArabic ? 'إغلاق النموذج' : 'Close Form',
    closeModal: isArabic ? 'إغلاق النافذة' : 'Close modal',
    accessRestricted: isArabic ? 'الوصول مقيّد' : 'Access Restricted',
    accessRestrictedDesc: isArabic 
      ? 'يقتصر الوصول إلى لوحة إدارة المستخدمين على المشرف العام ومدراء المنظومة فقط.' 
      : 'Only users with Administrator or Super Administrator roles can access the User Management panel.',
    allUsers: isArabic ? 'كافة المستخدمين' : 'All Users',
    pendingApproval: isArabic ? 'بانتظار الموافقة' : 'Pending Approval',
    active: isArabic ? 'نشط' : 'Active',
    suspended: isArabic ? 'موقوف' : 'Suspended',
    awaitingApproval: (n) => isArabic ? `${n} طلب تسجيل بانتظار موافقتك` : `${n} registration${n > 1 ? 's' : ''} awaiting your approval`,
    userDetails: isArabic ? 'بيانات المستخدم' : 'User Details',
    roleRbac: isArabic ? 'الدور والصلاحية' : 'Role (RBAC)',
    subscriptionTier: isArabic ? 'باقة الاشتراك' : 'Subscription Tier',
    accountStatus: isArabic ? 'حالة الحساب (تفعيل / إيقاف)' : 'Account Status (Allow / Suspend)',
    firstTimeSetup: isArabic ? 'الإعداد الأولي' : 'First-Time Setup',
    accessExpiration: isArabic ? 'صلاحية الوصول' : 'Access Expiration',
    actions: isArabic ? 'الإجراءات' : 'Actions',
    rootSuperAdmin: isArabic ? 'المشرف العام الأساسي' : 'Root Super Admin',
    you: isArabic ? 'حسابك' : 'You',
    newSignUp: isArabic ? 'تسجيل جديد' : 'New Sign-up',
    noEmailAttached: isArabic ? 'لا يوجد بريد مسجل' : 'No email attached',
    addEmail: isArabic ? '+ إضافة بريد' : '+ Add Email',
    editProfileTitle: isArabic ? 'تعديل الملف الشخصي' : 'Edit User Profile',
    editProfileDesc: (u) => isArabic ? `تحديث بيانات الاتصال والصلاحيات للمستخدم ${u}` : `Update contact details for ${u}`,
    username: isArabic ? 'اسم المستخدم' : 'Username',
    rootCannotRename: isArabic ? 'لا يمكن تعديل اسم المستخدم لحساب المشرف الأساسي.' : 'Root administrator username cannot be renamed.',
    emailAddress: isArabic ? 'البريد الإلكتروني' : 'Email Address',
    fullName: isArabic ? 'الاسم الكامل' : 'Full Name',
    phoneNumber: isArabic ? 'رقم الهاتف' : 'Phone Number',
    tempPassword: isArabic ? 'كلمة المرور المؤقتة *' : 'Temporary Password *',
    accessDuration: isArabic ? 'مدة الصلاحية' : 'Access Duration',
    initialStatus: isArabic ? 'الحالة الأولية' : 'Initial Status',
    activeImmediate: isArabic ? 'نشط (وصول فوري كامل)' : 'Active (Immediate Full Access)',
    pendingApprovalOption: isArabic ? 'معلق (بانتظار موافقة المشرف)' : 'Pending Administrator Approval',
    forcePasswordOnFirstLogin: isArabic ? 'إلزام المستخدم بتغيير كلمة المرور وتحديث بياناته عند أول تسجيل دخول' : 'Force Password Update on First Login',
    saveAndRegister: isArabic ? 'حفظ وتسجيل المستخدم' : 'Save & Register User',
    registering: isArabic ? 'جاري التسجيل...' : 'Registering User...',
    registerFormHeading: isArabic ? 'تسجيل مستخدم جديد في المنظومة (مع إلزام الإعداد الأولي)' : 'Register New System User (With First-Time Setup Enforcement)',
    unlimited: isArabic ? 'وصول دائم' : 'Unlimited',
    expired: isArabic ? '(منتهي)' : '(Expired)',
    approve: isArabic ? 'موافقة' : 'Approve',
    allowedActive: isArabic ? 'مفعل (نشط)' : 'Allowed (Active)',
    suspendedBanned: isArabic ? 'موقوف (محظور)' : 'Suspended (Banned)',
    required: isArabic ? 'مطلوب' : 'Required',
    completed: isArabic ? 'مكتمل' : 'Completed',
    save: isArabic ? 'حفظ' : 'Save',
    cancel: isArabic ? 'إلغاء' : 'Cancel',
    saveProfileChanges: isArabic ? 'حفظ تعديلات الملف' : 'Save Profile Changes',
    saving: isArabic ? 'جاري الحفظ...' : 'Saving...',
    resetPassword: isArabic ? 'إعادة تعيين كلمة المرور' : 'Reset Password',
    deleteUser: isArabic ? 'حذف المستخدم' : 'Delete User',
    newPasswordFor: (u) => isArabic ? `كلمة مرور جديدة لـ ${u}:` : `New Password for ${u}:`,
    min4Chars: isArabic ? '4 خانات كحد أدنى' : 'Min 4 chars',
    reset: isArabic ? 'تعيين' : 'Reset',
    totalRegistered: (n) => isArabic ? `إجمالي الحسابات المسجلة: ${n}` : `Total Registered Accounts: ${n}`,
    securityFooter: isArabic 
      ? 'أمان وصلاحيات RBAC: تشفير Bcrypt · حماية المشرف العام · تفعيل حدود باقات الاشتراك' 
      : 'Security & RBAC: Bcrypt · Super Admin Protected · Tier Feature Gating Active',
    loadingUsers: isArabic ? 'جاري تحميل قاعدة بيانات المستخدمين...' : 'Loading user database...',
    noPendingUsers: isArabic ? 'لا توجد طلبات تسجيل مستخدمين معلقة حالياً.' : 'No user registrations currently pending approval.',
    noSuspendedUsers: isArabic ? 'لا توجد حسابات موقوفة.' : 'No suspended accounts found.',
    noUsersFound: isArabic ? 'لم يتم العثور على مستخدمين يطابقون التصفية الحالية.' : 'No users found matching current filter.',
    // Tiers
    tierBasic: isArabic ? 'الأساسية' : 'Basic',
    tierPro: isArabic ? 'الاحترافية' : 'Professional',
    tierEnterprise: isArabic ? 'المؤسسات' : 'Enterprise',
    tierPremium: isArabic ? 'الشاملة' : 'Premium',
    // Form Tiers
    tierFormBasic: isArabic ? 'الباقة الأساسية (حتى 3 خطوط إنتاج)' : 'Basic Tier (Up to 3 Lines)',
    tierFormPro: isArabic ? 'الباقة الاحترافية (حتى 7 خطوط إنتاج)' : 'Professional Tier (Up to 7 Lines)',
    tierFormEnterprise: isArabic ? 'باقة المؤسسات (تخطيط متقدم وربط ERP)' : 'Enterprise Tier (Multi-Hall & ERP)',
    tierFormPremium: isArabic ? 'الباقة الشاملة (كافة مزايا المنظومة)' : 'Premium Tier (Full Factory Suite)',
    // Roles
    roleSuperAdmin: isArabic ? 'مشرف عام (Super Admin)' : 'Super Admin',
    roleAdmin: isArabic ? 'مدير نظام (Admin)' : 'Admin',
    roleSupervisor: isArabic ? 'مشرف وردية (Supervisor)' : 'Supervisor',
    roleOperator: isArabic ? 'مشغل خط (Operator)' : 'Operator',
    roleViewer: isArabic ? 'مشاهد فقط (Viewer)' : 'Viewer',
    // Months
    duration12MoPrompt: isArabic ? 'تحديد الصلاحية (1-12 شهر)...' : 'Duration (1-12 Mo)...',
    mo1: isArabic ? '+ شهر واحد' : '+1 Month',
    mo2: isArabic ? '+ شهرين' : '+2 Months',
    mo3: isArabic ? '+ 3 أشهر' : '+3 Months',
    mo4: isArabic ? '+ 4 أشهر' : '+4 Months',
    mo5: isArabic ? '+ 5 أشهر' : '+5 Months',
    mo6: isArabic ? '+ 6 أشهر' : '+6 Months',
    mo7: isArabic ? '+ 7 أشهر' : '+7 Months',
    mo8: isArabic ? '+ 8 أشهر' : '+8 Months',
    mo9: isArabic ? '+ 9 أشهر' : '+9 Months',
    mo10: isArabic ? '+ 10 أشهر' : '+10 Months',
    mo11: isArabic ? '+ 11 شهراً' : '+11 Months',
    mo12: isArabic ? '+ 12 شهراً (سنة)' : '+12 Months (1 Year)',
    unlimitedInfinity: isArabic ? 'وصول دائم (&infin;)' : 'Unlimited (&infin;)',
    pickCustomDate: isArabic ? 'تاريخ مخصص...' : 'Pick Custom Date...',
    keepCurrent: (exp) => isArabic ? `الإبقاء على المدة الحالية (${exp})` : `Keep Current (${exp})`,
    setMonthsFromNow: (m) => isArabic ? `تحديد المدة إلى ${m} شهر من الآن` : `Set to ${m} Month${m > 1 ? 's' : ''} from now`,
    customDateTime: isArabic ? 'تاريخ ووقت مخصص' : 'Custom Date & Time',
  };

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', message: string }
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'pending' | 'active' | 'suspended'

  // New user form state
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [newTier, setNewTier] = useState('basic');
  const [newStatus, setNewStatus] = useState('active');
  const [newIsActive, setNewIsActive] = useState(true);
  const [newMustChangePassword, setNewMustChangePassword] = useState(true); // Default to true per requirement
  const [newExpiryPreset, setNewExpiryPreset] = useState('1month');
  const [newCustomExpiry, setNewCustomExpiry] = useState('');
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Active custom expiry picker target
  const [customExpiryUserId, setCustomExpiryUserId] = useState(null);
  const [customExpiryValue, setCustomExpiryValue] = useState('');

  // Password reset target
  const [passwordResetUserId, setPasswordResetUserId] = useState(null);
  const [newResetPassword, setNewResetPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);

  // Edit user profile state (to add/update email, full name, phone, access duration)
  const [editingUser, setEditingUser] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDurationPreset, setEditDurationPreset] = useState('unchanged');
  const [editCustomExpiry, setEditCustomExpiry] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin' || currentUser?.username === 'admin';
  const isAdmin = isSuperAdmin || currentUser?.role === 'admin';

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3800);
  }, []);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'GET',
        headers: getAuthHeaders()
      });
      const data = await resp.json().catch(() => null);

      let userList = [];
      if (Array.isArray(data)) {
        userList = data;
      } else if (data && Array.isArray(data.users)) {
        userList = data.users;
      } else if (data && data.data && Array.isArray(data.data.users)) {
        userList = data.data.users;
      } else if (data && Array.isArray(data.data)) {
        userList = data.data;
      }

      if (resp.ok && data && data.success !== false) {
        setUsers(userList);
      } else {
        const errorMsg = data?.message || (data?.code ? `Database Error: ${data.code}` : `Failed to load user list (HTTP ${resp.status})`);
        showToast(errorMsg, 'error');
      }
    } catch (err) {
      showToast(err.message || 'Network error fetching users', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchUsers();
    }
  }, [isOpen, isAdmin, fetchUsers]);

  if (!isOpen) return null;

  // Access control safeguard
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className={`p-6 rounded-2xl max-w-sm w-full border ${theme === 'light' ? 'bg-white border-stone-200' : 'bg-slate-900 border-slate-800 text-white'}`}>
          <div className="flex items-center gap-3 text-rose-500 mb-3">
            <AlertCircle className="w-6 h-6" />
            <h3 className="font-bold text-base">{txt.accessRestricted}</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            {txt.accessRestrictedDesc}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            {txt.closeModal}
          </button>
        </div>
      </div>
    );
  }

  // Handle 1-Click User Approval (Active & Allowed)
  const handleApproveUser = async (user) => {
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          action: 'approve',
          status: 'active',
          is_active: 1
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? `تمت الموافقة وتفعيل حساب "${user.username}" بنجاح!`
            : `User "${user.username}" approved and activated successfully!`
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشلت الموافقة على المستخدم' : 'Failed to approve user'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة أثناء الموافقة' : 'Network error approving user'), 'error');
    }
  };

  // Handle Starting User Profile Edit
  const handleStartEdit = (user) => {
    setEditingUser(user);
    setEditUsername(user.username || '');
    setEditEmail(user.email || '');
    setEditFullName(user.full_name || '');
    setEditPhone(user.phone || '');
    setEditDurationPreset('unchanged');
    setEditCustomExpiry(user.access_expires_at ? user.access_expires_at.slice(0, 16) : '');
  };

  // Handle Saving User Profile Edit (Email, Name, Phone, Access Duration)
  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editingUser) return;

    let accessExpiresAtPayload = undefined;
    if (editDurationPreset !== 'unchanged') {
      if (editDurationPreset === 'unlimited') {
        accessExpiresAtPayload = null;
      } else if (editDurationPreset.endsWith('month') || editDurationPreset.endsWith('months')) {
        const m = parseInt(editDurationPreset, 10) || 1;
        const d = new Date();
        d.setMonth(d.getMonth() + m);
        accessExpiresAtPayload = d.toISOString().slice(0, 19).replace('T', ' ');
      } else if (editDurationPreset === 'custom' && editCustomExpiry) {
        accessExpiresAtPayload = editCustomExpiry.replace('T', ' ') + ':00';
      }
    }

    setIsSubmittingEdit(true);
    try {
      const payload = {
        id: editingUser.id,
        username: editingUser.username === 'admin' ? undefined : editUsername.trim(),
        email: editEmail.trim(),
        full_name: editFullName.trim(),
        phone: editPhone.trim()
      };
      if (editDurationPreset !== 'unchanged') {
        payload.access_expires_at = accessExpiresAtPayload;
      }

      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => null);

      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? `تم تحديث الملف الشخصي للمستخدم "${editingUser.username}" بنجاح!`
            : `User "${editingUser.username}" profile updated successfully!`
        );
        setEditingUser(null);
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث ملف المستخدم' : 'Failed to update user profile'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error updating user profile'), 'error');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Quick Allow / Suspend (Ban) Toggle
  const handleToggleStatus = async (user) => {
    if (user.username === 'admin') {
      showToast(
        isArabic
          ? 'لا يمكن إيقاف حساب المشرف العام الأساسي.'
          : 'The primary Super Admin account cannot be suspended.',
        'error'
      );
      return;
    }

    const currentStatus = user.status || (user.is_active ? 'active' : 'suspended');
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const actionName = nextStatus === 'active' 
      ? (isArabic ? 'مفعل (نشط)' : 'Allowed (Active)') 
      : (isArabic ? 'موقوف (محظور)' : 'Suspended (Banned)');

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          status: nextStatus,
          is_active: nextStatus === 'active' ? 1 : 0
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? `حالة المستخدم ${user.username} الآن: ${actionName}`
            : `User ${user.username} is now ${actionName}`
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث حالة المستخدم' : 'Failed to update user status'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error updating user'), 'error');
    }
  };

  // Handle Role Change
  const handleRoleChange = async (user, newRoleValue) => {
    if (user.role === newRoleValue) return;
    if (user.username === 'admin' && newRoleValue !== 'super_admin') {
      showToast(
        isArabic
          ? 'لا يمكن خفض رتبة المشرف العام الأساسي.'
          : 'Primary Super Admin role cannot be demoted.',
        'error'
      );
      return;
    }

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          role: newRoleValue
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? `تم تحديث دور ${user.username} بنجاح`
            : `Updated role for ${user.username} to ${newRoleValue}`
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث الدور' : 'Failed to update role'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error updating role'), 'error');
    }
  };

  // Handle Subscription Tier Change
  const handleTierChange = async (user, newTierValue) => {
    if (user.subscription_tier === newTierValue) return;

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          subscription_tier: newTierValue
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        const tierName = newTierValue === 'premium' ? txt.tierPremium
          : newTierValue === 'enterprise' ? txt.tierEnterprise
          : newTierValue === 'pro' ? txt.tierPro
          : txt.tierBasic;
        showToast(
          isArabic
            ? `تم تحديث باقة اشتراك ${user.username} إلى ${tierName}`
            : `Updated subscription tier for ${user.username} to ${newTierValue.toUpperCase()}`
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث باقة الاشتراك' : 'Failed to update subscription tier'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error updating tier'), 'error');
    }
  };

  // Handle First-Time Password Reset Flag Toggle
  const handleToggleMustChangePassword = async (user) => {
    const nextFlag = user.must_change_password ? 0 : 1;
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          must_change_password: nextFlag
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          nextFlag
            ? (isArabic ? `تم إلزام ${user.username} بتغيير كلمة المرور وتحديث بياناته عند أول تسجيل دخول` : `Forced password change on next login for ${user.username}`)
            : (isArabic ? `تم إعفاء ${user.username} من شرط الإعداد الأولي` : `Cleared password change requirement for ${user.username}`)
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث حالة الإعداد الأولي' : 'Failed to update password change flag'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error updating user'), 'error');
    }
  };

  // Handle Expiration Extension / Setting by Months (1 - 12 Months)
  const handleSetMonthDuration = async (user, months, fromNow = false) => {
    let formattedDate = null;
    if (months !== null && months !== undefined) {
      const m = parseInt(months, 10);
      if (!isNaN(m) && m > 0) {
        // Extend from current expiration date if in the future, or from now if already expired or not set
        const base = (!fromNow && user.access_expires_at && !isDateExpired(user.access_expires_at))
          ? new Date(user.access_expires_at)
          : new Date();
        base.setMonth(base.getMonth() + m);
        formattedDate = base.toISOString().slice(0, 19).replace('T', ' ');
      }
    }

    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: user.id,
          access_expires_at: formattedDate
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          formattedDate === null
            ? (isArabic ? `تم تعيين صلاحية وصول دائمة للمستخدم ${user.username}` : `Set ${user.username} to Unlimited Access`)
            : (isArabic ? `تم تحديد صلاحية ${user.username} إلى +${months} شهر` : `Set access for ${user.username} to +${months} month${parseInt(months, 10) > 1 ? 's' : ''}`)
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث مدة الصلاحية' : 'Failed to update access duration'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error updating expiry'), 'error');
    }
  };

  const handleExtendExpiry = (user, daysOrMonths) => {
    return handleSetMonthDuration(user, daysOrMonths === 7 ? 1 : daysOrMonths === 30 ? 1 : daysOrMonths);
  };

  // Handle Custom Expiry Submission
  const handleSaveCustomExpiry = async (userId) => {
    if (!customExpiryValue) return;
    const formatted = customExpiryValue.replace('T', ' ') + ':00';
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: userId,
          access_expires_at: formatted
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? 'تم تحديث تاريخ انتهاء الصلاحية بنجاح'
            : 'Access expiration updated successfully'
        );
        setCustomExpiryUserId(null);
        setCustomExpiryValue('');
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل تحديث التاريخ المخصص' : 'Failed to update custom expiry'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error'), 'error');
    }
  };

  // Handle Password Reset
  const handleResetPassword = async (userId) => {
    if (!newResetPassword || newResetPassword.trim().length < 4) {
      showToast(
        isArabic
          ? 'يجب ألا تقل كلمة المرور عن 4 أحرف'
          : 'Password must be at least 4 characters long',
        'error'
      );
      return;
    }
    setIsSubmittingReset(true);
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'PUT',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id: userId,
          password: newResetPassword.trim()
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? 'تمت إعادة تعيين كلمة المرور بنجاح'
            : 'Password reset successfully'
        );
        setPasswordResetUserId(null);
        setNewResetPassword('');
      } else {
        showToast(data?.message || (isArabic ? 'فشلت إعادة تعيين كلمة المرور' : 'Failed to reset password'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error resetting password'), 'error');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  // Handle User Deletion
  const handleDeleteUser = async (user) => {
    if (user.username === 'admin') {
      showToast(
        isArabic
          ? 'لا يمكن حذف حساب المشرف العام الأساسي.'
          : 'Primary Super Admin account cannot be deleted.',
        'error'
      );
      return;
    }

    const confirmed = window.confirm(
      isArabic
        ? `هل أنت متأكد من رغبتك في حذف المستخدم "${user.username}" نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.`
        : `Are you sure you want to permanently delete user "${user.username}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      const resp = await fetch(getApiUrl(`users.php?id=${user.id}`), {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? `تم حذف المستخدم ${user.username} بنجاح`
            : `User ${user.username} deleted successfully`
        );
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل حذف المستخدم' : 'Failed to delete user'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة' : 'Network error deleting user'), 'error');
    }
  };

  // Handle Add New User Submission
  const handleCreateUser = async (e) => {
    e.preventDefault();
    const cleanUsername = newUsername.trim();
    if (!cleanUsername) {
      showToast(
        isArabic ? 'اسم المستخدم مطلوب' : 'Username is required',
        'error'
      );
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      showToast(
        isArabic
          ? 'يجب ألا تقل كلمة المرور عن 4 أحرف'
          : 'Password must be at least 4 characters long',
        'error'
      );
      return;
    }

    let accessExpiresAt = null;
    if (newExpiryPreset.endsWith('month') || newExpiryPreset.endsWith('months')) {
      const months = parseInt(newExpiryPreset, 10) || 1;
      const d = new Date();
      d.setMonth(d.getMonth() + months);
      accessExpiresAt = d.toISOString().slice(0, 19).replace('T', ' ');
    } else if (newExpiryPreset === '7days') {
      accessExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    } else if (newExpiryPreset === '30days') {
      accessExpiresAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 19).replace('T', ' ');
    } else if (newExpiryPreset === 'custom' && newCustomExpiry) {
      accessExpiresAt = newCustomExpiry.replace('T', ' ') + ':00';
    }

    setIsSubmittingNew(true);
    try {
      const resp = await fetch(getApiUrl('users.php'), {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          username: cleanUsername,
          password: newPassword,
          email: newEmail.trim() || null,
          full_name: newFullName.trim() || null,
          phone: newPhone.trim() || null,
          role: newRole,
          subscription_tier: newTier,
          status: newStatus,
          is_active: newStatus === 'active' ? 1 : 0,
          must_change_password: newMustChangePassword ? 1 : 0,
          access_expires_at: accessExpiresAt
        })
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.success) {
        showToast(
          isArabic
            ? `تم إنشاء المستخدم ${cleanUsername} بنجاح`
            : `User ${cleanUsername} created successfully`
        );
        setNewUsername('');
        setNewPassword('');
        setNewEmail('');
        setNewFullName('');
        setNewPhone('');
        setNewRole('operator');
        setNewTier('basic');
        setNewStatus('active');
        setNewIsActive(true);
        setNewMustChangePassword(true);
        setNewExpiryPreset('1month');
        setNewCustomExpiry('');
        setIsAddFormOpen(false);
        fetchUsers();
      } else {
        showToast(data?.message || (isArabic ? 'فشل إنشاء المستخدم' : 'Failed to create user'), 'error');
      }
    } catch (err) {
      showToast(err.message || (isArabic ? 'خطأ في الاتصال بالشبكة أثناء إنشاء المستخدم' : 'Network error creating user'), 'error');
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const activeCount = users.filter((u) => u.status === 'active' || (!u.status && u.is_active)).length;
  const suspendedCount = users.filter((u) => u.status === 'suspended' || (!u.status && !u.is_active)).length;

  const filteredUsers = users.filter((u) => {
    const s = u.status || (u.is_active ? 'active' : 'suspended');
    if (filterStatus === 'pending') return s === 'pending';
    if (filterStatus === 'active') return s === 'active';
    if (filterStatus === 'suspended') return s === 'suspended';
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div
        dir={isArabic ? 'rtl' : 'ltr'}
        className={`w-full max-w-6xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
          theme === 'light'
            ? 'bg-white border-stone-200 text-stone-900 shadow-stone-300'
            : 'bg-slate-900 border-slate-800 text-slate-100 shadow-black'
        }`}
      >
        {/* Header Bar */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            theme === 'light' ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/60 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                theme === 'light' ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
              }`}
            >
              <Crown className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">{txt.title}</h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  {txt.badge}
                </span>
              </div>
              <p className={`text-xs ${theme === 'light' ? 'text-stone-500' : 'text-slate-400'}`}>
                {txt.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchUsers}
              disabled={isLoading}
              className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                theme === 'light'
                  ? 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
              }`}
              title={txt.refresh}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{txt.refresh}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddFormOpen((v) => !v)}
              className="px-3 py-1.5 brand-gradient text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>{isAddFormOpen ? txt.closeForm : txt.registerUser}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                theme === 'light' ? 'hover:bg-stone-200 text-stone-500' : 'hover:bg-slate-800 text-slate-400'
              }`}
              title={txt.closeModal}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toast Notification Banner */}
        {toast && (
          <div
            className={`px-6 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all ${
              toast.type === 'error'
                ? 'bg-rose-500/15 border-b border-rose-500/30 text-rose-400'
                : 'bg-emerald-500/15 border-b border-emerald-500/30 text-emerald-400'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        )}

        {/* Add User Drawer / Collapsible Form */}
        {isAddFormOpen && (
          <div
            className={`px-6 py-4 border-b transition-all ${
              theme === 'light' ? 'bg-stone-50 border-stone-200' : 'bg-slate-950/50 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-emerald-400">
              <UserPlus className="w-4 h-4" />
              <span>{txt.registerFormHeading}</span>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.username} *</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="e.g. eng_ahmed"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.tempPassword}</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Initial default password"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.emailAddress}</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@polymerops.com"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.fullName}</label>
                  <input
                    type="text"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. Eng. Ahmed Salem"
                    className={`w-full text-xs px-3 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.roleRbac}</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="operator">{txt.roleOperator}</option>
                    <option value="supervisor">{txt.roleSupervisor}</option>
                    <option value="admin">{txt.roleAdmin}</option>
                    <option value="super_admin">{txt.roleSuperAdmin}</option>
                    <option value="viewer">{txt.roleViewer}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.subscriptionTier}</label>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="basic">{txt.tierFormBasic}</option>
                    <option value="pro">{txt.tierFormPro}</option>
                    <option value="enterprise">{txt.tierFormEnterprise}</option>
                    <option value="premium">{txt.tierFormPremium}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.accessDuration}</label>
                  <select
                    value={newExpiryPreset}
                    onChange={(e) => setNewExpiryPreset(e.target.value)}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="1month">{txt.mo1}</option>
                    <option value="2months">{txt.mo2}</option>
                    <option value="3months">{txt.mo3}</option>
                    <option value="4months">{txt.mo4}</option>
                    <option value="5months">{txt.mo5}</option>
                    <option value="6months">{txt.mo6}</option>
                    <option value="7months">{txt.mo7}</option>
                    <option value="8months">{txt.mo8}</option>
                    <option value="9months">{txt.mo9}</option>
                    <option value="10months">{txt.mo10}</option>
                    <option value="11months">{txt.mo11}</option>
                    <option value="12months">{txt.mo12}</option>
                    <option value="unlimited">{txt.unlimited}</option>
                    <option value="custom">{txt.customDateTime}</option>
                  </select>
                  {newExpiryPreset === 'custom' && (
                    <input
                      type="datetime-local"
                      required
                      value={newCustomExpiry}
                      onChange={(e) => setNewCustomExpiry(e.target.value)}
                      className={`w-full mt-1.5 text-xs px-2.5 py-1.5 rounded-lg border outline-none ${
                        theme === 'light'
                          ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                          : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                      }`}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">{txt.initialStatus}</label>
                  <select
                    value={newStatus}
                    onChange={(e) => {
                      setNewStatus(e.target.value);
                      setNewIsActive(e.target.value === 'active');
                    }}
                    className={`w-full text-xs px-2.5 py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-white border-stone-300 text-stone-900 focus:border-emerald-600'
                        : 'bg-slate-900 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="active">{txt.activeImmediate}</option>
                    <option value="pending">{txt.pendingApprovalOption}</option>
                  </select>
                </div>

                <div className="flex items-center gap-3 pt-4 sm:col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newMustChangePassword}
                      onChange={(e) => setNewMustChangePassword(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-900 border-slate-700 cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold text-emerald-400">
                      {txt.forcePasswordOnFirstLogin}
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="py-2 px-5 brand-gradient hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition shadow-md shadow-emerald-500/20 cursor-pointer"
                >
                  {isSubmittingNew ? txt.registering : txt.saveAndRegister}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Status Filter Tabs & Counters Bar */}
        <div
          className={`px-6 py-2.5 border-b flex items-center justify-between gap-3 flex-wrap ${
            theme === 'light' ? 'bg-stone-100/70 border-stone-200' : 'bg-slate-950/70 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                filterStatus === 'all'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {txt.allUsers} ({users.length})
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterStatus === 'pending'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : pendingCount > 0
                  ? 'bg-amber-950/70 text-amber-300 border border-amber-700/80 hover:bg-amber-900/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{txt.pendingApproval}</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-black font-black">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterStatus === 'active'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>{txt.active} ({activeCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterStatus('suspended')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                filterStatus === 'suspended'
                  ? 'bg-rose-700 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Ban className="w-3.5 h-3.5 text-rose-400" />
              <span>{txt.suspended} ({suspendedCount})</span>
            </button>
          </div>

          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-950/50 px-3 py-1 rounded-lg border border-amber-800/60">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>{txt.awaitingApproval(pendingCount)}</span>
            </div>
          )}
        </div>

        {/* User Table Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="w-full overflow-x-auto rounded-xl border border-slate-800">
            <table className={`w-full ${isArabic ? 'text-right' : 'text-left'} border-collapse text-xs`}>
              <thead>
                <tr className={`${theme === 'light' ? 'bg-stone-100 text-stone-700' : 'bg-slate-950 text-slate-300'} font-semibold border-b border-slate-800`}>
                  <th className="py-3 px-4">{txt.userDetails}</th>
                  <th className="py-3 px-4">{txt.roleRbac}</th>
                  <th className="py-3 px-4">{txt.subscriptionTier}</th>
                  <th className="py-3 px-4">{txt.accountStatus}</th>
                  <th className="py-3 px-4">{txt.firstTimeSetup}</th>
                  <th className="py-3 px-4">{txt.accessExpiration}</th>
                  <th className={`py-3 px-4 ${isArabic ? 'text-left' : 'text-right'}`}>{txt.actions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">
                      {isLoading 
                        ? txt.loadingUsers 
                        : filterStatus === 'pending'
                        ? txt.noPendingUsers
                        : filterStatus === 'suspended'
                        ? txt.noSuspendedUsers
                        : txt.noUsersFound}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isExpired = isDateExpired(u.access_expires_at);
                    const isSelf = u.id === currentUser?.id;
                    const isRoot = u.username === 'admin';
                    const isPending = u.status === 'pending';

                    return (
                      <tr
                        key={u.id}
                        className={`transition-colors ${
                          isPending 
                            ? (theme === 'light' ? 'bg-amber-50/70 hover:bg-amber-100/60 text-stone-900' : 'bg-amber-950/20 hover:bg-amber-950/40 text-slate-100')
                            : (theme === 'light' ? 'hover:bg-stone-50 text-stone-800' : 'hover:bg-slate-800/40 text-slate-200')
                        }`}
                      >
                        {/* User Details */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg brand-gradient text-white flex items-center justify-center font-bold text-xs shrink-0">
                              {u.username.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-bold flex items-center gap-1.5">
                                <span>{u.username}</span>
                                {isRoot && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                    {txt.rootSuperAdmin}
                                  </span>
                                )}
                                {isSelf && !isRoot && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                                    {txt.you}
                                  </span>
                                )}
                                {isPending && (
                                  <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500 text-black animate-pulse">
                                    {txt.newSignUp}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                {u.email ? (
                                  <span className="flex items-center gap-1 text-slate-300">
                                    <Mail className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span>{u.email}</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(u)}
                                    className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 hover:underline cursor-pointer font-medium"
                                    title={isArabic ? 'انقر لإضافة بريد إلكتروني' : 'Click to add an email address'}
                                  >
                                    <Mail className="w-2.5 h-2.5" />
                                    <span>{txt.addEmail}</span>
                                  </button>
                                )}
                                {u.full_name && (
                                  <span className="text-slate-400 font-normal">
                                    &middot; {u.full_name}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Selector */}
                        <td className="py-3 px-4">
                          <select
                            value={u.role || 'operator'}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            disabled={isRoot}
                            className={`text-xs px-2 py-1 rounded-md border font-medium outline-none cursor-pointer ${
                              u.role === 'super_admin'
                                ? 'bg-amber-950/60 text-amber-300 border-amber-800/80 font-bold'
                                : u.role === 'admin'
                                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/80 font-bold'
                                : u.role === 'supervisor'
                                ? 'bg-teal-950/60 text-teal-300 border-teal-800/80'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            <option value="super_admin">{txt.roleSuperAdmin}</option>
                            <option value="admin">{txt.roleAdmin}</option>
                            <option value="supervisor">{txt.roleSupervisor}</option>
                            <option value="operator">{txt.roleOperator}</option>
                            <option value="viewer">{txt.roleViewer}</option>
                          </select>
                        </td>

                        {/* Subscription Tier Selector */}
                        <td className="py-3 px-4">
                          <select
                            value={u.subscription_tier || 'basic'}
                            onChange={(e) => handleTierChange(u, e.target.value)}
                            className={`text-xs px-2 py-1 rounded-md border font-semibold outline-none cursor-pointer ${
                              u.subscription_tier === 'premium'
                                ? 'bg-purple-950/60 text-purple-300 border-purple-800 font-bold'
                                : u.subscription_tier === 'enterprise'
                                ? 'bg-indigo-950/60 text-indigo-300 border-indigo-800'
                                : u.subscription_tier === 'pro'
                                ? 'bg-teal-950/60 text-teal-300 border-teal-800'
                                : 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                            }`}
                          >
                            <option value="basic">{txt.tierBasic}</option>
                            <option value="pro">{txt.tierPro}</option>
                            <option value="enterprise">{txt.tierEnterprise}</option>
                            <option value="premium">{txt.tierPremium}</option>
                          </select>
                        </td>

                        {/* Account Status (Allow / Suspend / Pending Approval) */}
                        <td className="py-3 px-4">
                          {isPending ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-600/80 animate-pulse">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>{txt.pendingApproval}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleApproveUser(u)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold brand-gradient text-white shadow-xs hover:opacity-95 transition cursor-pointer"
                                title={isArabic ? 'الموافقة وتفعيل الحساب فوراً' : 'Approve and activate this account immediately'}
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{txt.approve}</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(u)}
                              disabled={isRoot}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                u.is_active
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/60'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800 hover:bg-rose-900/60'
                              }`}
                              title={isRoot ? (isArabic ? 'لا يمكن إيقاف المشرف العام الأساسي' : 'Cannot suspend primary Super Admin') : (u.is_active ? (isArabic ? 'انقر لإيقاف (حظر) هذا الحساب' : 'Click to Suspend (Ban) this user') : (isArabic ? 'انقر لتفعيل هذا الحساب' : 'Click to Allow (Reactivate) this user'))}
                            >
                              {u.is_active ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{txt.allowedActive}</span>
                                </>
                              ) : (
                                <>
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>{txt.suspendedBanned}</span>
                                </>
                              )}
                            </button>
                          )}
                        </td>

                        {/* First-Time Setup Flag Toggle */}
                        <td className="py-3 px-4">
                          <button
                            type="button"
                            onClick={() => handleToggleMustChangePassword(u)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold transition cursor-pointer border ${
                              u.must_change_password
                                ? 'bg-amber-950/50 text-amber-300 border-amber-800/60'
                                : 'bg-slate-800/60 text-slate-400 border-slate-700'
                            }`}
                            title={isArabic ? 'انقر لتبديل إلزام المستخدم بتحديث الملف وكلمة المرور' : 'Click to toggle mandatory profile & password update requirement'}
                          >
                            {u.must_change_password ? txt.required : txt.completed}
                          </button>
                        </td>

                        {/* Access Expiration */}
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`font-mono text-xs font-semibold ${
                                isExpired
                                  ? 'text-rose-400'
                                  : u.access_expires_at
                                  ? 'text-amber-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {formatDateDisplay(u.access_expires_at, isArabic)}
                              {isExpired && (
                                <span className="ml-1 text-[10px] uppercase font-bold text-rose-500">
                                  {txt.expired}
                                </span>
                              )}
                            </span>

                            {/* Quick Month Extensions & Selection (1 to 12 Months) */}
                            <div className="flex items-center gap-1 flex-wrap">
                              <select
                                defaultValue=""
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (!val) return;
                                  if (val === 'custom') {
                                    setCustomExpiryUserId(u.id);
                                    setCustomExpiryValue(u.access_expires_at ? u.access_expires_at.slice(0, 16) : '');
                                  } else if (val === 'unlimited') {
                                    handleSetMonthDuration(u, null);
                                  } else {
                                    const m = parseInt(val, 10);
                                    handleSetMonthDuration(u, m);
                                  }
                                  e.target.value = '';
                                }}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 outline-none cursor-pointer"
                                title={isArabic ? 'تحديد الصلاحية من شهر حتى 12 شهراً' : 'Set duration from 1 to 12 months'}
                              >
                                <option value="" disabled>{txt.duration12MoPrompt}</option>
                                <option value="1">{txt.mo1}</option>
                                <option value="2">{txt.mo2}</option>
                                <option value="3">{txt.mo3}</option>
                                <option value="4">{txt.mo4}</option>
                                <option value="5">{txt.mo5}</option>
                                <option value="6">{txt.mo6}</option>
                                <option value="7">{txt.mo7}</option>
                                <option value="8">{txt.mo8}</option>
                                <option value="9">{txt.mo9}</option>
                                <option value="10">{txt.mo10}</option>
                                <option value="11">{txt.mo11}</option>
                                <option value="12">{txt.mo12}</option>
                                <option value="unlimited">{txt.unlimitedInfinity}</option>
                                <option value="custom">{txt.pickCustomDate}</option>
                              </select>

                              {/* Quick 1-click Buttons */}
                              <button
                                type="button"
                                onClick={() => handleSetMonthDuration(u, 1)}
                                className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-emerald-400 hover:border-emerald-700/60 transition cursor-pointer"
                                title={txt.mo1}
                              >
                                +1m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetMonthDuration(u, 3)}
                                className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-emerald-400 hover:border-emerald-700/60 transition cursor-pointer"
                                title={txt.mo3}
                              >
                                +3m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetMonthDuration(u, 6)}
                                className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-emerald-400 hover:border-emerald-700/60 transition cursor-pointer"
                                title={txt.mo6}
                              >
                                +6m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetMonthDuration(u, 12)}
                                className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-emerald-400 hover:border-emerald-700/60 transition cursor-pointer"
                                title={txt.mo12}
                              >
                                +12m
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetMonthDuration(u, null)}
                                className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title={isArabic ? 'صلاحية دائمة (غير محدودة)' : 'Clear Expiry (Unlimited Access)'}
                              >
                                &infin;
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomExpiryUserId(u.id);
                                  setCustomExpiryValue(u.access_expires_at ? u.access_expires_at.slice(0, 16) : '');
                                }}
                                className="p-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                title={txt.customDateTime}
                              >
                                <Calendar className="w-3 h-3 text-cyan-400" />
                              </button>
                            </div>

                            {/* Inline Custom Date Picker */}
                            {customExpiryUserId === u.id && (
                              <div className="mt-1 flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-lg border border-slate-700">
                                <input
                                  type="datetime-local"
                                  value={customExpiryValue}
                                  onChange={(e) => setCustomExpiryValue(e.target.value)}
                                  className="text-[11px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleSaveCustomExpiry(u.id)}
                                  className="px-2 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-bold hover:bg-emerald-500 cursor-pointer"
                                >
                                  {txt.save}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCustomExpiryUserId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white cursor-pointer"
                                >
                                  {txt.cancel}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className={`py-3 px-4 ${isArabic ? 'text-left' : 'text-right'}`}>
                          <div className={`flex items-center ${isArabic ? 'justify-start' : 'justify-end'} gap-1.5`}>
                            {/* Edit User Profile (Email, Full Name, Phone) */}
                            <button
                              type="button"
                              onClick={() => handleStartEdit(u)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:text-emerald-400 hover:border-emerald-700/60 transition cursor-pointer"
                              title={txt.editProfileTitle}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* Password Reset Trigger */}
                            <button
                              type="button"
                              onClick={() => {
                                setPasswordResetUserId(passwordResetUserId === u.id ? null : u.id);
                                setNewResetPassword('');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                              title={txt.resetPassword}
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                            </button>

                            {/* Delete User */}
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              disabled={isRoot || isSelf}
                              className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 border border-rose-800/60 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                              title={isRoot ? (isArabic ? 'لا يمكن حذف المشرف العام الأساسي' : 'Cannot delete Super Admin') : (isSelf ? (isArabic ? 'لا يمكنك حذف حسابك الشخصي' : 'Cannot delete your own account') : txt.deleteUser)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Inline Password Reset Box */}
                          {passwordResetUserId === u.id && (
                            <div className={`mt-2 p-2 bg-slate-950 rounded-lg border border-slate-700 ${isArabic ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
                              <label className="block text-[10px] text-slate-400 mb-1">
                                {txt.newPasswordFor(u.username)}
                              </label>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="password"
                                  placeholder={txt.min4Chars}
                                  value={newResetPassword}
                                  onChange={(e) => setNewResetPassword(e.target.value)}
                                  className="text-[11px] px-2 py-1 rounded bg-slate-900 border border-slate-700 text-white w-28"
                                />
                                <button
                                  type="button"
                                  disabled={isSubmittingReset}
                                  onClick={() => handleResetPassword(u.id)}
                                  className="px-2 py-1 text-[10px] bg-amber-600 hover:bg-amber-500 text-white rounded font-bold cursor-pointer"
                                >
                                  {isSubmittingReset ? '...' : txt.reset}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPasswordResetUserId(null)}
                                  className="text-[10px] text-slate-400 hover:text-white cursor-pointer px-1"
                                >
                                  X
                                </button>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer info */}
        <div
          className={`px-6 py-3 border-t flex items-center justify-between text-[11px] ${
            theme === 'light' ? 'bg-stone-50 border-stone-200 text-stone-500' : 'bg-slate-950/60 border-slate-800 text-slate-400'
          }`}
        >
          <span>{txt.totalRegistered(users.length)}</span>
          <span>{txt.securityFooter}</span>
        </div>
      </div>

      {/* Edit User Profile Modal Dialog */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div
            dir={isArabic ? 'rtl' : 'ltr'}
            className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden p-6 ${
              theme === 'light'
                ? 'bg-white border-stone-200 text-stone-900 shadow-stone-300'
                : 'bg-slate-900 border-slate-800 text-slate-100 shadow-black'
            }`}
          >
            <div
              className={`flex items-center justify-between pb-4 border-b mb-4 ${
                theme === 'light' ? 'border-stone-200' : 'border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg ${
                    theme === 'light'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                  }`}
                >
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">{txt.editProfileTitle}</h3>
                  <p className={`text-[11px] ${theme === 'light' ? 'text-stone-500' : 'text-slate-400'}`}>
                    {txt.editProfileDesc(editingUser.username)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className={`p-1 rounded-lg transition cursor-pointer ${
                  theme === 'light' ? 'hover:bg-stone-100 text-stone-500' : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title={txt.cancel}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                  {txt.username}
                </label>
                <input
                  type="text"
                  disabled={editingUser.username === 'admin'}
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className={`w-full text-xs px-3 py-2 rounded-lg border outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                    theme === 'light'
                      ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                      : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                  }`}
                />
                {editingUser.username === 'admin' && (
                  <span className="text-[10px] text-amber-400/90 mt-1 block font-medium">
                    {txt.rootCannotRename}
                  </span>
                )}
              </div>

              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                  {txt.emailAddress}
                </label>
                <div className="relative">
                  <Mail className={`w-3.5 h-3.5 absolute ${isArabic ? 'right-3' : 'left-3'} top-2.5 text-slate-400 pointer-events-none`} />
                  <input
                    type="email"
                    placeholder="e.g. admin@polymerops.com"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    className={`w-full text-xs ${isArabic ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                  {txt.fullName}
                </label>
                <div className="relative">
                  <UserIcon className={`w-3.5 h-3.5 absolute ${isArabic ? 'right-3' : 'left-3'} top-2.5 text-slate-400 pointer-events-none`} />
                  <input
                    type="text"
                    placeholder="e.g. Eng. Khaled Taha"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className={`w-full text-xs ${isArabic ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                  {txt.phoneNumber}
                </label>
                <div className="relative">
                  <Phone className={`w-3.5 h-3.5 absolute ${isArabic ? 'right-3' : 'left-3'} top-2.5 text-slate-400 pointer-events-none`} />
                  <input
                    type="tel"
                    placeholder="e.g. +20 100 000 0000"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className={`w-full text-xs ${isArabic ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold mb-1 ${theme === 'light' ? 'text-stone-600' : 'text-slate-400'}`}>
                  {txt.accessDuration}
                </label>
                <div className="relative">
                  <Clock className={`w-3.5 h-3.5 absolute ${isArabic ? 'right-3' : 'left-3'} top-2.5 text-slate-400 pointer-events-none`} />
                  <select
                    value={editDurationPreset}
                    onChange={(e) => setEditDurationPreset(e.target.value)}
                    className={`w-full text-xs ${isArabic ? 'pr-8 pl-3' : 'pl-8 pr-3'} py-2 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  >
                    <option value="unchanged">{txt.keepCurrent(formatDateDisplay(editingUser.access_expires_at, isArabic))}</option>
                    <option value="1month">{txt.setMonthsFromNow(1)}</option>
                    <option value="2months">{txt.setMonthsFromNow(2)}</option>
                    <option value="3months">{txt.setMonthsFromNow(3)}</option>
                    <option value="4months">{txt.setMonthsFromNow(4)}</option>
                    <option value="5months">{txt.setMonthsFromNow(5)}</option>
                    <option value="6months">{txt.setMonthsFromNow(6)}</option>
                    <option value="7months">{txt.setMonthsFromNow(7)}</option>
                    <option value="8months">{txt.setMonthsFromNow(8)}</option>
                    <option value="9months">{txt.setMonthsFromNow(9)}</option>
                    <option value="10months">{txt.setMonthsFromNow(10)}</option>
                    <option value="11months">{txt.setMonthsFromNow(11)}</option>
                    <option value="12months">{txt.setMonthsFromNow(12)}</option>
                    <option value="unlimited">{txt.unlimitedInfinity}</option>
                    <option value="custom">{txt.customDateTime}</option>
                  </select>
                </div>
                {editDurationPreset === 'custom' && (
                  <input
                    type="datetime-local"
                    required
                    value={editCustomExpiry}
                    onChange={(e) => setEditCustomExpiry(e.target.value)}
                    className={`w-full mt-1.5 text-xs px-2.5 py-1.5 rounded-lg border outline-none ${
                      theme === 'light'
                        ? 'bg-stone-50 border-stone-300 text-stone-900 focus:border-emerald-600 focus:bg-white'
                        : 'bg-slate-950 border-slate-700 text-white focus:border-emerald-500'
                    }`}
                  />
                )}
              </div>

              <div
                className={`flex items-center justify-end gap-2 pt-3 border-t ${
                  theme === 'light' ? 'border-stone-200' : 'border-slate-800'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    theme === 'light'
                      ? 'bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {txt.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEdit}
                  className="px-4 py-1.5 rounded-lg text-xs font-bold brand-gradient text-white shadow-md shadow-emerald-500/20 hover:opacity-95 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingEdit ? txt.saving : txt.saveProfileChanges}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
