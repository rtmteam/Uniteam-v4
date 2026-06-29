
import React, { useState, useRef, useEffect } from 'react';
import { Branch, AttendanceRecord, AppConfig, User, Job, ReportAccount, VisitPlan } from '../types';
import { MapPin, Table, Trash2, Shield, CloudUpload, Briefcase, RotateCcw, Globe, Users, Plus, FileSpreadsheet, Download, Share2, Smartphone, RefreshCw, Edit2, Check, X, Unlink, Key, Lock, Eye, EyeOff, Clock, Monitor, UserCheck, Calendar, Navigation } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AdminDashboardProps {
  branches: Branch[];
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
  jobs: Job[];
  setJobs: React.Dispatch<React.SetStateAction<Job[]>>;
  records: AttendanceRecord[];
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  allUsers: User[];
  setAllUsers: React.Dispatch<React.SetStateAction<User[]>>;
  reportAccounts?: ReportAccount[];
  setReportAccounts?: React.Dispatch<React.SetStateAction<ReportAccount[]>>;
  visitPlans: VisitPlan[];
  setVisitPlans: React.Dispatch<React.SetStateAction<VisitPlan[]>>;
  onRefresh: () => void;
  isSyncing: boolean;
  logAction: (action: string, details?: string) => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  branches, setBranches, jobs, setJobs, records, config, setConfig, allUsers, setAllUsers, 
  reportAccounts = [], setReportAccounts, visitPlans, setVisitPlans, onRefresh, isSyncing, logAction
}) => {
  const [activeTab, setActiveTab] = useState<'branches' | 'jobs' | 'users' | 'plans' | 'report-access' | 'holidays' | 'settings'>('branches');
  const [newBranch, setNewBranch] = useState<Partial<Branch>>({ name: '', latitude: 0, longitude: 0, radius: 100 });
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newHoliday, setNewHoliday] = useState('');
  const [isPushing, setIsPushing] = useState(false);
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editUserData, setEditUserData] = useState<Partial<User>>({});

  const [newRepUser, setNewRepUser] = useState('');
  const [newRepPass, setNewRepPass] = useState('');
  const [selectedJobsForAcc, setSelectedJobsForAcc] = useState<string[]>([]);
  const [selectedUsersForAcc, setSelectedUsersForAcc] = useState<string[]>([]); // New state for selected employees
  
  const [newPlanUserId, setNewPlanUserId] = useState('');
  const [newPlanBranchId, setNewPlanBranchId] = useState('');
  const [newPlanDate, setNewPlanDate] = useState('');

  const [showPass, setShowPass] = useState<string | null>(null);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editReportData, setEditReportData] = useState<Partial<ReportAccount>>({});
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);
  const [editBranchData, setEditBranchData] = useState<Partial<Branch>>({});
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [editPlanData, setEditPlanData] = useState<Partial<VisitPlan>>({});
  const [syncUrl, setSyncUrl] = useState(config.syncUrl || '');
  
  // State for Branch Bulk Delete
  const [selectedBranches, setSelectedBranches] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jobFileInputRef = useRef<HTMLInputElement>(null);
  const userFileInputRef = useRef<HTMLInputElement>(null);
  const planFileInputRef = useRef<HTMLInputElement>(null);

  // وظيفة لتنسيق الوقت للعرض (AM/PM)
  const formatTimeDisplay = (timeStr: string | undefined) => {
    if (!timeStr) return '--:--';
    if (timeStr.includes('GMT') || timeStr.includes('1899')) {
      try {
        const d = new Date(timeStr);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
      } catch(e) {}
    }
    if (/^\d{2}:\d{2}$/.test(timeStr)) {
      const [h, m] = timeStr.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const displayH = h % 12 || 12;
      return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${suffix}`;
    }
    return timeStr;
  };

  const normalizeToTimeInput = (timeStr: string | undefined): string => {
    if (!timeStr) return "09:00";
    if (timeStr.includes('GMT') || timeStr.includes('1899')) {
      const d = new Date(timeStr);
      if (!isNaN(d.getTime())) {
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
      }
    }
    const match = timeStr.match(/(\d{2}:\d{2})/);
    return match ? match[1] : timeStr;
  };

  const pushToCloud = async (dataType?: string) => {
    if (!config.syncUrl) return alert("يرجى ضبط رابط المزامنة أولاً");
    setIsPushing(true);
    try {
      const payload: any = {
        action: 'updateSystem',
        adminUsername: config.adminUsername,
        adminPassword: config.adminPassword,
      };

      // تحديث انتقائي بناءً على نوع البيانات
      // Selective update based on dataType
      if (!dataType || dataType === 'branches' || dataType === 'jobs' || dataType === 'holidays') {
        payload.branches = branches;
        payload.jobs = jobs;
        payload.holidays = config.holidays || [];
      }
      
      if (!dataType || dataType === 'users') {
        payload.users = allUsers;
      }
      
      if (!dataType || dataType === 'reportAccounts') {
        payload.reportAccounts = reportAccounts;
      }
      
      if (!dataType || dataType === 'visitPlans') {
        payload.visitPlans = visitPlans;
      }

      await fetch(config.syncUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      logAction('حفظ في السحابة', `تحديث بيانات ${dataType || 'النظام'} في جوجل شيت`);
      alert("تم إرسال البيانات للسحابة بنجاح!");
    } catch (err) { 
      logAction('فشل الحفظ في السحابة', `الخطأ: ${err instanceof Error ? err.message : String(err)}`);
      alert("حدث خطأ أثناء الاتصال بالسحابة"); 
    }
    finally { setIsPushing(false); }
  };

  const saveEditUser = (id: string) => {
    const user = allUsers.find(u => u.id === id);
    setAllUsers(prev => prev.map(u => u.id === id ? { ...u, ...editUserData } as User : u));
    logAction('تعديل بيانات موظف', `الموظف: ${user?.fullName}`);
    setEditingUserId(null);
  };

  const inputClasses = "px-4 py-3 rounded-xl border border-slate-600 bg-slate-900 text-white font-bold outline-none focus:border-blue-500 w-full transition-all";

  const downloadTemplate = (type: 'branches' | 'jobs' | 'users' | 'plans') => {
    let data: any[] = [];
    let fileName = "";
    
    if (type === 'branches') {
      data = [{ "اسم الفرع": "الفرع الرئيسي", "خط العرض": 30.05, "خط الطول": 31.23, "النطاق بالمتر": 100 }];
      fileName = "template_branches.xlsx";
    } else if (type === 'jobs') {
      data = [{ "اسم الوظيفة": "مهندس", "زيارة فروع متعددة": "نعم" }];
      fileName = "template_jobs.xlsx";
    } else if (type === 'users') {
      data = [{
        "الاسم بالكامل": "محمد احمد",
        "الرقم القومي": "29010101234567",
        "كلمة المرور": "123456",
        "الوظيفة": "مهندس",
        "الفرع الافتراضي": "الفرع الرئيسي",
        "موعد الحضور": "09:00",
        "موعد الانصراف": "17:00",
        "عدد الاجهزة": 1
      }];
      fileName = "template_users.xlsx";
    } else if (type === 'plans') {
      data = [{
        "الرقم التسلسلي للموظف": "2024001",
        "اسم الفرع": "فرع المعادي",
        "التاريخ": "2026-03-30"
      }];
      fileName = "template_plans.xlsx";
    }
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, fileName);
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>, type: 'branches' | 'jobs' | 'users' | 'plans') => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result; const wb = XLSX.read(bstr, { type: 'binary' }); const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        
        if (type === 'branches') { 
          setBranches(prev => [...prev, ...data.map((item: any) => ({ id: Math.random().toString(36).substr(2, 9), name: item["اسم الفرع"] || 'فرع جديد', latitude: parseFloat(item["خط العرض"] || 0), longitude: parseFloat(item["خط الطول"] || 0), radius: parseInt(item["النطاق بالمتر"] || 100) }))]); 
          logAction('استيراد فروع', `تم استيراد ${data.length} فرع من ملف إكسل`);
        } else if (type === 'jobs') { 
          setJobs(prev => [...prev, ...data.map((item: any) => ({ id: Math.random().toString(36).substr(2, 9), title: item["اسم الوظيفة"] || 'موظف', canVisitMultipleBranches: item["زيارة فروع متعددة"] === "نعم" }))]); 
          logAction('استيراد وظائف', `تم استيراد ${data.length} وظيفة من ملف إكسل`);
        } else if (type === 'plans') {
          const newPlans = data.map((item: any) => {
            const serial = (item["الرقم التسلسلي للموظف"] || "").toString().trim();
            const user = allUsers.find(u => u.serialNumber === serial || u.id === serial);
            const branchName = (item["اسم الفرع"] || "").toString().trim();
            const isHoliday = branchName.toLowerCase() === 'holiday';
            const branch = branches.find(b => b.name === branchName);
            
            let dateVal = (item["التاريخ"] || "").toString().trim();
            // Normalize date to YYYY-MM-DD
            if (dateVal) {
              const d = new Date(dateVal);
              if (!isNaN(d.getTime())) {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                dateVal = `${year}-${month}-${day}`;
              }
            } else {
              const d = new Date();
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              dateVal = `${year}-${month}-${day}`;
            }

            if (user && (branch || isHoliday)) {
              return {
                id: Math.random().toString(36).substr(2, 9),
                userId: user.id,
                userName: user.fullName,
                userSerial: user.serialNumber,
                branchId: branch ? branch.id : 'holiday',
                branchName: branch ? branch.name : 'Holiday',
                date: dateVal
              };
            }
            return null;
          }).filter(p => p !== null) as VisitPlan[];
          setVisitPlans(prev => [...prev, ...newPlans]);
          logAction('استيراد خطط زيارات', `تم استيراد ${newPlans.length} خطة زيارة`);
          alert(`تم استيراد ${newPlans.length} خطة زيارة بنجاح. يرجى النقر على 'حفظ في السحابة' لتأكيد التغييرات.`);
        } else if (type === 'users') {
          const existingNids = new Set(allUsers.map(u => u.nationalId));
          let duplicateCount = 0;

          const newUsers = data.map((item: any) => {
             const nid = (item["الرقم القومي"] || "").toString();
             if (existingNids.has(nid)) {
               duplicateCount++;
               return null;
             }
             existingNids.add(nid);

             const newUser: User = {
              id: Math.random().toString(36).substr(2, 9),
              fullName: item["الاسم بالكامل"] || "موظف جديد",
              nationalId: nid,
              password: (item["كلمة المرور"] || "123456").toString(),
              jobTitle: item["الوظيفة"] || "موظف",
              defaultBranchId: item["الفرع الافتراضي"] || "",
              role: 'employee',
              deviceId: "",
              deviceIds: [],
              allowedDeviceCount: parseInt(item["عدد الاجهزة"] || "1"),
              checkInTime: item["موعد الحضور"] || "09:00",
              checkOutTime: item["موعد الانصراف"] || "17:00",
              registrationDate: new Date().toISOString()
            };
            return newUser;
          }).filter((u) => u !== null) as User[];

          if (newUsers.length > 0) {
            setAllUsers(prev => [...prev, ...newUsers]);
            logAction('استيراد موظفين', `تم استيراد ${newUsers.length} موظف بنجاح`);
            let msg = `تم استيراد ${newUsers.length} موظف بنجاح.`;
            if (duplicateCount > 0) msg += ` تم تجاهل ${duplicateCount} موظف لوجودهم مسبقاً.`;
            msg += " يرجى النقر على 'حفظ في السحابة' لتأكيد التغييرات.";
            alert(msg);
          } else {
            alert("لم يتم استيراد أي موظف. جميع البيانات موجودة مسبقاً أو الملف فارغ.");
          }
        } else {
           logAction('استيراد بيانات', 'تم استيراد بيانات من ملف إكسل');
           alert("تم استيراد البيانات بنجاح! يرجى النقر على 'حفظ في السحابة' لتأكيد التغييرات.");
        }
      } catch (err) { 
        logAction('فشل استيراد إكسل', `النوع: ${type}, الخطأ: ${err instanceof Error ? err.message : String(err)}`);
        alert("خطأ في قراءة ملف الإكسل. تأكد من صحة البيانات."); 
      }
      if(e.target) e.target.value = '';
    }; reader.readAsBinaryString(file);
  };

  const addManualPlan = () => {
    if (!newPlanUserId || !newPlanBranchId || !newPlanDate) return alert("يرجى اختيار الموظف والفرع والتاريخ");
    const user = allUsers.find(u => u.id === newPlanUserId);
    const branch = branches.find(b => b.id === newPlanBranchId);
    
    const newPlan: VisitPlan = {
      id: Math.random().toString(36).substr(2, 9),
      userId: newPlanUserId,
      userName: user?.fullName || 'N/A',
      userSerial: user?.serialNumber || 'N/A',
      branchId: newPlanBranchId,
      branchName: newPlanBranchId === 'holiday' ? 'Holiday' : (branch?.name || 'N/A'),
      date: newPlanDate
    };

    setVisitPlans(prev => [newPlan, ...prev]);
    logAction('إضافة زيارة يدوية', `الموظف: ${newPlan.userName}, الفرع: ${newPlan.branchName}, التاريخ: ${newPlanDate}`);
    setNewPlanUserId('');
    setNewPlanBranchId('');
    setNewPlanDate('');
    alert("تم إضافة الزيارة بنجاح. يرجى النقر على 'حفظ في السحابة' لتأكيد التغييرات.");
  };

  const saveEditPlan = (id: string) => {
    const user = allUsers.find(u => u.id === editPlanData.userId);
    const branch = branches.find(b => b.id === editPlanData.branchId);
    
    setVisitPlans(visitPlans.map(p => p.id === id ? {
      ...p,
      ...editPlanData,
      userName: user?.fullName || p.userName,
      userSerial: user?.serialNumber || p.userSerial,
      branchName: editPlanData.branchId === 'holiday' ? 'Holiday' : (branch?.name || p.branchName)
    } : p));
    
    setEditingPlanId(null);
    setEditPlanData({});
    logAction('تعديل خطة زيارة', `المعرف: ${id}`);
  };

  const saveEditBranch = (id: string) => { 
    const branch = branches.find(b => b.id === id);
    setBranches(prev => prev.map(b => b.id === id ? { ...b, ...editBranchData } as Branch : b)); 
    logAction('تعديل فرع', `الفرع: ${branch?.name}`);
    setEditingBranchId(null); 
  };

  const addReportAccount = () => {
    if (!newRepUser || !newRepPass || (selectedJobsForAcc.length === 0 && selectedUsersForAcc.length === 0)) return alert("يرجى ملء كافة البيانات واختيار وظيفة أو موظف واحد على الأقل");
    const newAcc: ReportAccount = { 
      id: Math.random().toString(36).substr(2, 9), 
      username: newRepUser, 
      password: newRepPass, 
      allowedJobs: selectedJobsForAcc,
      allowedEmployees: selectedUsersForAcc 
    };
    setReportAccounts?.([...reportAccounts, newAcc]); 
    logAction('إضافة حساب تقارير', `المستخدم: ${newRepUser}`);
    setNewRepUser(''); setNewRepPass(''); setSelectedJobsForAcc([]); setSelectedUsersForAcc([]);
  };

  const saveEditReportAcc = (id: string) => {
    if (!editReportData.username || !editReportData.password) { alert("يرجى التأكد من اسم المستخدم وكلمة المرور"); return; }
    // Ensure arrays are initialized if they were undefined in the edit state
    const updatedAcc = {
      ...editReportData,
      allowedJobs: editReportData.allowedJobs || [],
      allowedEmployees: editReportData.allowedEmployees || []
    };
    setReportAccounts?.(prev => prev.map(acc => acc.id === id ? { ...acc, ...updatedAcc } as ReportAccount : acc)); 
    logAction('تعديل حساب تقارير', `المستخدم: ${editReportData.username}`);
    setEditingReportId(null);
  };

  // Branch Bulk Actions
  const toggleSelectBranch = (id: string) => {
    const newSelected = new Set(selectedBranches);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedBranches(newSelected);
  };

  const toggleSelectAllBranches = () => {
    if (selectedBranches.size === branches.length) setSelectedBranches(new Set());
    else setSelectedBranches(new Set(branches.map(b => b.id)));
  };

  const deleteSelectedBranches = () => {
    if (window.confirm(`هل أنت متأكد من حذف ${selectedBranches.size} فرع؟`)) {
      setBranches(branches.filter(b => !selectedBranches.has(b.id)));
      logAction('حذف فروع (بالجملة)', `تم حذف ${selectedBranches.size} فرع`);
      setSelectedBranches(new Set());
    }
  };

  return (
    <div className="space-y-6">
      <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleExcelImport(e, 'branches')} />
      <input type="file" ref={jobFileInputRef} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleExcelImport(e, 'jobs')} />
      <input type="file" ref={userFileInputRef} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleExcelImport(e, 'users')} />
      <input type="file" ref={planFileInputRef} className="hidden" accept=".xlsx, .xls" onChange={(e) => handleExcelImport(e, 'plans')} />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-800 p-6 rounded-3xl border border-slate-700 shadow-xl">
        <div className="text-white">
          <h2 className="text-2xl font-black italic uppercase tracking-tighter text-blue-400 flex items-center gap-2">
            <Shield size={24} /> Uniteam Admin
          </h2>
          <p className="text-slate-500 text-[10px] font-black uppercase">لوحة إدارة السحابة</p>
        </div>
        <div className="flex flex-wrap gap-2">
           <button onClick={() => { onRefresh(); logAction('تحديث البيانات', 'مزامنة البيانات مع السحابة'); }} disabled={isSyncing} className="flex items-center gap-2 px-5 py-3.5 rounded-2xl font-black bg-slate-900 text-blue-400 border border-blue-900/30 text-xs hover:bg-slate-800 transition-all">
             <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} /> تحديث البيانات
           </button>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {[
          { id: 'branches', label: 'الفروع', icon: MapPin },
          { id: 'jobs', label: 'الوظائف', icon: Briefcase },
          { id: 'users', label: 'الموظفين', icon: Users },
          { id: 'plans', label: 'خطط الزيارات', icon: Navigation },
          { id: 'holidays', label: 'الإجازات', icon: Calendar },
          { id: 'report-access', label: 'صلاحيات التقارير', icon: Key },
          { id: 'settings', label: 'الإعدادات', icon: Monitor }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black transition-all border shrink-0 ${
              activeTab === tab.id ? 'bg-blue-600 text-white border-blue-500 shadow-xl' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden p-6 text-white min-h-[400px]">
        {activeTab === 'users' && (
           <div className="space-y-6">
             <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
               <div className="flex items-center gap-3">
                 <Users size={20} className="text-blue-400" />
                 <h3 className="text-sm font-black text-white uppercase tracking-tighter">سجل الموظفين</h3>
               </div>
               <div className="flex gap-2">
                  <button onClick={() => { downloadTemplate('users'); logAction('تحميل نموذج', 'نموذج استيراد الموظفين'); }} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-black"><Download size={14}/> نموذج استيراد</button>
                  <button onClick={() => userFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-[10px] font-black"><FileSpreadsheet size={14}/> استيراد موظفين</button>
                  <button onClick={() => { onRefresh(); logAction('تحديث البيانات', 'مزامنة بيانات الموظفين مع السحابة'); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 text-blue-400 border border-blue-900/30 rounded-xl text-[10px] font-black"><RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} /> تحديث</button>
                  <button onClick={() => pushToCloud('users')} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                    {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ في السحابة
                  </button>
               </div>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full text-right min-w-[1000px]">
                 <thead>
                    <tr className="border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                      <th className="py-4 px-2 text-right">الموظف والوظيفة</th>
                      <th className="py-4 px-2">الرقم القومي</th>
                      <th className="py-4 px-2">الفرع الافتراضي</th>
                      <th className="py-4 px-2">الحضور (Default)</th>
                      <th className="py-4 px-2">الانصراف (Default)</th>
                      <th className="py-4 px-2">الأجهزة المرتبطة</th>
                      <th className="py-4 px-2">إجراءات</th>
                    </tr>
                 </thead>
                 <tbody>
                  {allUsers.map(user => {
                   // Calculate device count properly considering both legacy and new array
                   const deviceCount = user.deviceIds ? user.deviceIds.length : (user.deviceId ? 1 : 0);
                   const allowedCount = user.allowedDeviceCount || 1;

                   return (
                   <tr key={user.id} className="border-b border-slate-700/50 hover:bg-slate-900/30 transition-all text-center">
                     <td className="py-4 px-2 text-right">
                        {editingUserId === user.id ? (
                          <div className="space-y-1">
                            <input className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-full text-white" value={editUserData.fullName || ''} onChange={e => setEditUserData({...editUserData, fullName: e.target.value})} />
                            <select className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-[10px] w-full text-white" value={editUserData.jobTitle || ''} onChange={e => setEditUserData({...editUserData, jobTitle: e.target.value})}>
                              {jobs.map(j => <option key={j.id} value={j.title}>{j.title}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="flex flex-col">
                            <span className="font-bold text-sm text-white">{user.fullName}</span>
                            <span className="text-blue-400 text-[10px] font-black uppercase">{user.jobTitle}</span>
                          </div>
                        )}
                     </td>
                     <td className="py-4 px-2 text-slate-400 text-xs font-mono">
                        {editingUserId === user.id ? (
                          <input className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-full text-center text-white" value={editUserData.nationalId || ''} onChange={e => setEditUserData({...editUserData, nationalId: e.target.value})} />
                        ) : user.nationalId}
                     </td>
                     <td className="py-4 px-2">
                        {editingUserId === user.id ? (
                          <select className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-[10px] w-full text-white" value={editUserData.defaultBranchId || ''} onChange={e => setEditUserData({...editUserData, defaultBranchId: e.target.value})}>
                            {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                          </select>
                        ) : (
                          <span className="text-xs text-slate-300 font-bold">{user.defaultBranchId || 'غير محدد'}</span>
                        )}
                     </td>
                     <td className="py-4 px-2">
                        {editingUserId === user.id ? (
                          <input type="time" className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-full text-center text-white" value={editUserData.checkInTime || ''} onChange={e => setEditUserData({...editUserData, checkInTime: e.target.value})} />
                        ) : (
                          <div className="flex items-center justify-center gap-1 text-green-400 font-bold text-xs"><Clock size={12}/> {formatTimeDisplay(user.checkInTime || '09:00')}</div>
                        )}
                     </td>
                     <td className="py-4 px-2">
                        {editingUserId === user.id ? (
                          <input type="time" className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-full text-center text-white" value={editUserData.checkOutTime || ''} onChange={e => setEditUserData({...editUserData, checkOutTime: e.target.value})} />
                        ) : (
                          <div className="flex items-center justify-center gap-1 text-orange-400 font-bold text-xs"><Clock size={12}/> {formatTimeDisplay(user.checkOutTime || '17:00')}</div>
                        )}
                     </td>
                     <td className="py-4 px-2">
                        {editingUserId === user.id ? (
                           <div className="flex items-center gap-1 justify-center">
                             <span className="text-[10px] text-slate-500">الحد:</span>
                             <input type="number" min="1" max="10" className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-12 text-center text-white" value={editUserData.allowedDeviceCount || 1} onChange={e => setEditUserData({...editUserData, allowedDeviceCount: parseInt(e.target.value) || 1})} />
                           </div>
                        ) : (
                           <div className={`flex items-center justify-center gap-1 px-3 py-1 rounded-full text-[9px] font-black border mx-auto w-fit ${deviceCount > 0 ? 'bg-green-600/10 text-green-400 border-green-900/30' : 'bg-slate-900 text-slate-500 border-slate-700'}`}>
                             <Smartphone size={10} /> {deviceCount} / {allowedCount}
                           </div>
                        )}
                     </td>
                     <td className="py-4 px-2">
                        <div className="flex justify-center gap-2">
                           {editingUserId === user.id ? (
                             <>
                               <button onClick={() => saveEditUser(user.id)} className="text-green-500 hover:bg-green-900/20 p-1.5 rounded"><Check size={18}/></button>
                               <button onClick={() => setEditingUserId(null)} className="text-red-500 hover:bg-red-900/20 p-1.5 rounded"><X size={18}/></button>
                             </>
                           ) : (
                             <>
                               <button onClick={() => { 
                                 setEditingUserId(user.id); 
                                 setEditUserData({
                                   ...user,
                                   checkInTime: normalizeToTimeInput(user.checkInTime),
                                   checkOutTime: normalizeToTimeInput(user.checkOutTime),
                                   allowedDeviceCount: user.allowedDeviceCount || 1
                                 }); 
                               }} className="text-blue-400 hover:bg-blue-900/20 p-1.5 rounded"><Edit2 size={16}/></button>
                               
                               {deviceCount > 0 && (
                                 <button onClick={() => {
                                   if(confirm('هل أنت متأكد من فك ارتباط جميع الأجهزة لهذا الموظف؟')) {
                                     setAllUsers(allUsers.map(u => u.id === user.id ? {...u, deviceId: "", deviceIds: []} : u));
                                     logAction('فك ارتباط أجهزة', `الموظف: ${user.fullName}`);
                                   }
                                 }} className="text-orange-400 hover:bg-orange-900/20 p-1.5 rounded" title="فك ارتباط جميع الأجهزة"><Unlink size={16}/></button>
                               )}
                               
                               <button onClick={() => { 
                                 if(confirm('حذف الموظف؟')) {
                                   setAllUsers(allUsers.filter(u => u.id !== user.id));
                                   logAction('حذف موظف', `الموظف: ${user.fullName}`);
                                 }
                               }} className="text-slate-500 hover:text-red-400 p-1.5"><Trash2 size={16}/></button>
                             </>
                           )}
                        </div>
                     </td>
                   </tr>
                  );
                  })}</tbody>
               </table>
             </div>
           </div>
        )}
        {activeTab === 'branches' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-3">
                <MapPin size={20} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">إدارة الفروع والمواقع</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { downloadTemplate('branches'); logAction('تحميل نموذج', 'نموذج استيراد الفروع'); }} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-black"><Download size={14}/> نموذج استيراد</button>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-[10px] font-black"><FileSpreadsheet size={14}/> استيراد فروع</button>
                <button onClick={() => pushToCloud('branches')} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                  {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ في السحابة
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
               <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">الفروع الحالية</h4>
               <div className="flex gap-2">
                  {selectedBranches.size > 0 && (
                     <button onClick={deleteSelectedBranches} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-black animate-pulse">
                        <Trash2 size={14}/> حذف المحدد ({selectedBranches.size})
                     </button>
                  )}
               </div>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-700 grid grid-cols-1 md:grid-cols-5 gap-4">
               <input type="text" placeholder="الاسم" className={inputClasses} value={newBranch.name} onChange={e => setNewBranch({...newBranch, name: e.target.value})} />
               <input type="number" placeholder="Lat" className={inputClasses} value={newBranch.latitude || ''} onChange={e => setNewBranch({...newBranch, latitude: parseFloat(e.target.value)})} />
               <input type="number" placeholder="Lng" className={inputClasses} value={newBranch.longitude || ''} onChange={e => setNewBranch({...newBranch, longitude: parseFloat(e.target.value)})} />
               <input type="number" placeholder="المسافة" className={inputClasses} value={newBranch.radius || ''} onChange={e => setNewBranch({...newBranch, radius: parseInt(e.target.value)})} />
               <button onClick={() => {
                 if (newBranch.name) {
                   setBranches([...branches, { ...newBranch, id: Math.random().toString(36).substr(2, 9), radius: newBranch.radius || 100 } as Branch]);
                   logAction('إضافة فرع جديد', `الفرع: ${newBranch.name}`);
                   setNewBranch({ name: '', latitude: 0, longitude: 0, radius: 100 });
                 }
               }} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black py-3 flex items-center justify-center gap-2 transition-all">
                 <Plus size={18}/> إضافة
               </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right min-w-[700px]">
                <thead><tr className="border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  <th className="py-4 px-2 w-10 text-center"><input type="checkbox" checked={selectedBranches.size === branches.length && branches.length > 0} onChange={toggleSelectAllBranches} className="accent-blue-600 cursor-pointer" /></th>
                  <th className="py-4 px-2">اسم الفرع</th><th className="py-4 px-2">إحداثيات (Lat, Lng)</th><th className="py-4 px-2 text-center">النطاق</th><th className="py-4 px-2 text-center">إجراءات</th></tr></thead>
                <tbody>{branches.map(b => (
                  <tr key={b.id} className="border-b border-slate-700/50 hover:bg-slate-900/30 transition-colors">
                    <td className="py-4 px-2 text-center"><input type="checkbox" checked={selectedBranches.has(b.id)} onChange={() => toggleSelectBranch(b.id)} className="accent-blue-600 cursor-pointer" /></td>
                    <td className="py-4 px-2 font-black">{editingBranchId === b.id ? (<input className="bg-slate-900 border border-blue-500 rounded px-3 py-1.5 text-xs w-full outline-none text-white" value={editBranchData.name || ''} onChange={e => setEditBranchData({...editBranchData, name: e.target.value})} />) : (<span className="text-emerald-400">{b.name}</span>)}</td>
                    <td className="py-4 px-2">{editingBranchId === b.id ? (<div className="flex gap-1"><input type="number" step="0.000001" className="bg-slate-900 border border-blue-500 rounded px-2 py-1.5 text-[10px] w-full font-mono outline-none text-white" placeholder="Lat" value={editBranchData.latitude || ''} onChange={e => setEditBranchData({...editBranchData, latitude: parseFloat(e.target.value)})} /><input type="number" step="0.000001" className="bg-slate-900 border border-blue-500 rounded px-2 py-1.5 text-[10px] w-full font-mono outline-none text-white" placeholder="Lng" value={editBranchData.longitude || ''} onChange={e => setEditBranchData({...editBranchData, longitude: parseFloat(e.target.value)})} /></div>) : (<span className="text-[10px] text-slate-400 font-mono">{b.latitude.toFixed(6)}, {b.longitude.toFixed(6)}</span>)}</td>
                    <td className="py-4 px-2 text-center">{editingBranchId === b.id ? (<input type="number" className="bg-slate-900 border border-blue-500 rounded px-2 py-1.5 text-xs w-20 text-center outline-none text-white" value={editBranchData.radius || ''} onChange={e => setEditBranchData({...editBranchData, radius: parseInt(e.target.value)})} />) : (<span className="text-blue-400 font-black text-xs">{b.radius}م</span>)}</td>
                    <td className="py-4 px-2 text-center"><div className="flex justify-center gap-2">{editingBranchId === b.id ? (<><button onClick={() => saveEditBranch(b.id)} className="text-green-500 hover:bg-green-500/10 p-2 rounded-lg transition-all"><Check size={18}/></button><button onClick={() => setEditingBranchId(null)} className="text-red-500 hover:bg-red-500/10 p-2 rounded-lg transition-all"><X size={18}/></button></>) : (<><button onClick={() => { setEditingBranchId(b.id); setEditBranchData(b); }} className="text-blue-400 hover:bg-blue-400/10 p-2 rounded-lg transition-all"><Edit2 size={16}/></button><button onClick={() => { if(confirm('حذف الفرع؟')) { setBranches(branches.filter(x => x.id !== b.id)); logAction('حذف فرع', `الفرع: ${b.name}`); } }} className="text-slate-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-all"><Trash2 size={16}/></button></>)}</div></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'jobs' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-3">
                <Briefcase size={20} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">المسميات الوظيفية</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { downloadTemplate('jobs'); logAction('تحميل نموذج', 'نموذج استيراد الوظائف'); }} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-black"><Download size={14}/> نموذج استيراد</button>
                <button onClick={() => jobFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-[10px] font-black"><FileSpreadsheet size={14}/> استيراد وظائف</button>
                <button onClick={() => pushToCloud('jobs')} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                  {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ في السحابة
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
               <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest">الوظائف المتاحة</h4>
            </div>
            <div className="flex gap-4 bg-slate-900/50 p-6 rounded-3xl border border-slate-700">
               <input type="text" placeholder="عنوان الوظيفة" className={inputClasses} value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} />
               <button onClick={() => { if(newJobTitle.trim()) { setJobs([...jobs, { id: Math.random().toString(36).substr(2, 9), title: newJobTitle, workingDays: [0, 1, 2, 3, 4, 6] }]); logAction('إضافة وظيفة جديدة', `الوظيفة: ${newJobTitle}`); setNewJobTitle(''); } }} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-8 font-black flex items-center gap-2 transition-all"><Plus size={20}/> إضافة</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {jobs.map(j => {
                 const DAYS = [{id:0, label:'ح'}, {id:1, label:'ن'}, {id:2, label:'ث'}, {id:3, label:'ر'}, {id:4, label:'خ'}, {id:5, label:'ج'}, {id:6, label:'س'}];
                 const toggleJobDay = (jobId: string, dayId: number) => {
                   setJobs(jobs.map(job => {
                     if (job.id === jobId) {
                       const currentDays = job.workingDays || [0, 1, 2, 3, 4, 6];
                       const newDays = currentDays.includes(dayId) ? currentDays.filter(d => d !== dayId) : [...currentDays, dayId];
                        logAction('تعديل أيام عمل الوظيفة', `الوظيفة: ${job.title}, اليوم: ${DAYS.find(d => d.id === dayId)?.label}`);
                        return { ...job, workingDays: newDays };
                     }
                     return job;
                   }));
                 };
                 return (
                 <div key={j.id} className="p-4 bg-slate-900 rounded-2xl border border-slate-700 flex flex-col gap-3 hover:border-blue-500 transition-all">
                   <div className="flex justify-between items-center">
                     <span className="text-xs font-bold">{j.title}</span>
                     <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setJobs(jobs.map(job => job.id === j.id ? { ...job, canVisitMultipleBranches: !job.canVisitMultipleBranches } : job));
                            logAction('تعديل صلاحية التنقل', `الوظيفة: ${j.title}`);
                          }}
                          className={`p-1.5 rounded-lg transition-all ${j.canVisitMultipleBranches ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}
                          title="السماح بزيارة فروع متعددة"
                        >
                          <Navigation size={14} />
                        </button>
                        <button onClick={() => { if(confirm('حذف الوظيفة؟')) { setJobs(jobs.filter(x => x.id !== j.id)); logAction('حذف وظيفة', `الوظيفة: ${j.title}`); } }} className="text-slate-600 hover:text-red-500"><Trash2 size={14}/></button>
                      </div>
                   </div>
                   <div className="flex justify-between gap-1 mt-1 border-t border-slate-700/50 pt-3">
                     {DAYS.map(d => {
                       const isSelected = (j.workingDays || [0, 1, 2, 3, 4, 6]).includes(d.id);
                       return (
                         <button key={d.id} onClick={() => toggleJobDay(j.id, d.id)} className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all ${isSelected ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-800 text-slate-500 border border-slate-700 hover:bg-slate-700'}`}>{d.label}</button>
                       );
                     })}
                   </div>
                 </div>
               )})}
            </div>
          </div>
        )}
        {activeTab === 'plans' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-3">
                <Navigation size={20} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">خطط زيارات الفروع</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { downloadTemplate('plans'); logAction('تحميل نموذج', 'نموذج استيراد خطط الزيارات'); }} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-[10px] font-black"><Download size={14}/> نموذج استيراد</button>
                <button onClick={() => planFileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-[10px] font-black"><FileSpreadsheet size={14}/> استيراد الخطط</button>
                <button onClick={() => { setVisitPlans([]); logAction('مسح جميع الخطط', 'تم مسح كافة خطط الزيارات'); }} className="flex items-center gap-2 px-4 py-2 bg-red-600/10 text-red-400 border border-red-900/30 rounded-xl text-[10px] font-black"><Trash2 size={14}/> مسح الكل</button>
                <button onClick={() => pushToCloud('visitPlans')} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                  {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ في السحابة
                </button>
              </div>
            </div>
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-700 space-y-4">
               <h4 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-2">إضافة زيارة يدوية</h4>
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <select className={inputClasses} value={newPlanUserId} onChange={e => setNewPlanUserId(e.target.value)}>
                    <option value="">اختر الموظف</option>
                    {allUsers.filter(u => u.role !== 'admin').map(u => <option key={u.id} value={u.id}>{u.fullName} ({u.serialNumber})</option>)}
                  </select>
                  <select className={inputClasses} value={newPlanBranchId} onChange={e => setNewPlanBranchId(e.target.value)}>
                    <option value="">اختر الفرع</option>
                    <option value="holiday">إجازة (Holiday)</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <input type="date" className={inputClasses} value={newPlanDate} onChange={e => setNewPlanDate(e.target.value)} />
                  <button onClick={addManualPlan} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black py-3 flex items-center justify-center gap-2 transition-all">
                    <Plus size={18}/> إضافة زيارة
                  </button>
               </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
                    <th className="py-4 px-2 text-right">الموظف</th>
                    <th className="py-4 px-2">الرقم التسلسلي</th>
                    <th className="py-4 px-2">الفرع المستهدف</th>
                    <th className="py-4 px-2">التاريخ</th>
                    <th className="py-4 px-2">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {visitPlans.sort((a,b) => b.date.localeCompare(a.date)).map(plan => {
                    const user = allUsers.find(u => u.id === plan.userId);
                    const branch = branches.find(b => b.id === plan.branchId);
                    const isEditing = editingPlanId === plan.id;

                    return (
                      <tr key={plan.id} className="border-b border-slate-700/50 hover:bg-slate-900/30 transition-all text-center">
                        <td className="py-4 px-2 text-right">
                          {isEditing ? (
                            <select 
                              className={inputClasses} 
                              value={editPlanData.userId || plan.userId} 
                              onChange={e => setEditPlanData({ ...editPlanData, userId: e.target.value })}
                            >
                              {allUsers.filter(u => u.role !== 'admin').map(u => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                            </select>
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-bold text-sm text-white">{user?.fullName || plan.userName || 'موظف محذوف'}</span>
                              <span className="text-blue-400 text-[10px] font-black uppercase">{user?.jobTitle}</span>
                            </div>
                          )}
                        </td>
                        <td className="py-4 px-2">
                          <span className="text-xs text-slate-400 font-mono">{user?.serialNumber || plan.userSerial || 'N/A'}</span>
                        </td>
                        <td className="py-4 px-2">
                          {isEditing ? (
                            <select 
                              className={inputClasses} 
                              value={editPlanData.branchId || plan.branchId} 
                              onChange={e => setEditPlanData({ ...editPlanData, branchId: e.target.value })}
                            >
                              <option value="holiday">إجازة (Holiday)</option>
                              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                            </select>
                          ) : (
                            <span className={`text-xs font-bold ${plan.branchName === 'Holiday' ? 'text-orange-400' : 'text-emerald-400'}`}>
                              {branch?.name || plan.branchName || 'فرع محذوف'}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-2 text-slate-400 text-xs font-mono">
                          {isEditing ? (
                            <input 
                              type="date" 
                              className={inputClasses} 
                              value={editPlanData.date || plan.date} 
                              onChange={e => setEditPlanData({ ...editPlanData, date: e.target.value })}
                            />
                          ) : plan.date}
                        </td>
                        <td className="py-4 px-2">
                          <div className="flex items-center justify-center gap-1">
                            {isEditing ? (
                              <>
                                <button onClick={() => saveEditPlan(plan.id)} className="text-green-500 hover:text-green-400 p-1.5"><Check size={16}/></button>
                                <button onClick={() => { setEditingPlanId(null); setEditPlanData({}); }} className="text-slate-500 hover:text-slate-400 p-1.5"><X size={16}/></button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => { setEditingPlanId(plan.id); setEditPlanData(plan); }} className="text-blue-500 hover:text-blue-400 p-1.5"><Edit2 size={16}/></button>
                                <button onClick={() => { if(confirm('حذف هذه الخطة؟')) { setVisitPlans(visitPlans.filter(p => p.id !== plan.id)); logAction('حذف خطة زيارة', `الموظف: ${user?.fullName || plan.userName}, الفرع: ${branch?.name || plan.branchName}`); } }} className="text-slate-500 hover:text-red-400 p-1.5"><Trash2 size={16}/></button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'holidays' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-3">
                <Calendar size={20} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">إجازات الموظفين</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => pushToCloud('holidays')} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                  {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ في السحابة
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center">
               <h4 className="text-sm font-black text-blue-400 uppercase tracking-widest flex items-center gap-2"><Calendar size={18}/> الإجازات الرسمية</h4>
            </div>
            <div className="flex gap-4 bg-slate-900/50 p-6 rounded-3xl border border-slate-700">
               <input type="date" className={inputClasses} value={newHoliday} onChange={e => setNewHoliday(e.target.value)} />
               <button onClick={() => { if(newHoliday && !config.holidays?.includes(newHoliday)) { const newConfig = {...config, holidays: [...(config.holidays||[]), newHoliday]}; setConfig(newConfig); localStorage.setItem('attendance_config', JSON.stringify(newConfig)); logAction('إضافة إجازة رسمية', `التاريخ: ${newHoliday}`); setNewHoliday(''); } }} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-8 font-black flex items-center gap-2 transition-all shrink-0"><Plus size={20}/> إضافة إجازة</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {(config.holidays || []).sort().map(h => (
                 <div key={h} className="p-4 bg-slate-900 rounded-2xl border border-slate-700 flex justify-between items-center hover:border-blue-500 transition-all">
                   <span className="text-xs font-bold font-mono text-blue-400">{h}</span>
                   <button onClick={() => { if(confirm('حذف الإجازة؟')) { const newConfig = {...config, holidays: config.holidays!.filter(x => x !== h)}; setConfig(newConfig); localStorage.setItem('attendance_config', JSON.stringify(newConfig)); logAction('حذف إجازة رسمية', `التاريخ: ${h}`); } }} className="text-slate-600 hover:text-red-500"><Trash2 size={14}/></button>
                 </div>
               ))}
            </div>
          </div>
        )}
        {activeTab === 'report-access' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-3">
                <Key size={20} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">حسابات متابعة التقارير</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => pushToCloud('reportAccounts')} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                  {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ في السحابة
                </button>
              </div>
            </div>
            <h4 className="text-sm font-black text-blue-400 flex items-center gap-2 uppercase tracking-widest"><Key size={20}/> حسابات متابعي التقارير</h4>
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-700 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="text" placeholder="اسم المستخدم" className={inputClasses} value={newRepUser} onChange={e => setNewRepUser(e.target.value)} /><input type="password" placeholder="كلمة المرور" className={inputClasses} value={newRepPass} onChange={e => setNewRepPass(e.target.value)} /></div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center mr-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1"><Briefcase size={12}/> الوظائف المسموح بمتابعتها</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedJobsForAcc(jobs.map(j => j.title))} className="text-[9px] text-blue-400 hover:text-blue-300 font-black">تحديد الكل</button>
                    <button onClick={() => setSelectedJobsForAcc([])} className="text-[9px] text-slate-500 hover:text-slate-400 font-black">إلغاء الكل</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 p-4 bg-slate-900 border border-slate-700 rounded-xl h-24 overflow-y-auto scrollbar-hide">
                  {jobs.map(j => (
                    <button key={j.id} onClick={() => { if (selectedJobsForAcc.includes(j.title)) { setSelectedJobsForAcc(selectedJobsForAcc.filter(t => t !== j.title)); } else { setSelectedJobsForAcc([...selectedJobsForAcc, j.title]); } }} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${selectedJobsForAcc.includes(j.title) ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}>
                      {j.title}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center mr-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1"><UserCheck size={12}/> الموظفين المسموح بمتابعتهم (تحديد خاص)</label>
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedUsersForAcc(allUsers.filter(u => u.role !== 'admin').map(u => u.fullName))} className="text-[9px] text-green-400 hover:text-green-300 font-black">تحديد الكل</button>
                    <button onClick={() => setSelectedUsersForAcc([])} className="text-[9px] text-slate-500 hover:text-slate-400 font-black">إلغاء الكل</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 p-4 bg-slate-900 border border-slate-700 rounded-xl h-24 overflow-y-auto scrollbar-hide">
                  {allUsers.filter(u => u.role !== 'admin').map(u => (
                    <button key={u.id} onClick={() => { if (selectedUsersForAcc.includes(u.fullName)) { setSelectedUsersForAcc(selectedUsersForAcc.filter(t => t !== u.fullName)); } else { setSelectedUsersForAcc([...selectedUsersForAcc, u.fullName]); } }} className={`px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border ${selectedUsersForAcc.includes(u.fullName) ? 'bg-green-600 text-white border-green-500' : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'}`}>
                      {u.fullName}
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={addReportAccount} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"><Plus size={20} /> إنشاء الحساب</button>
            </div>
            <div className="overflow-x-auto mt-6">
              <table className="w-full text-right">
                <thead>
                  <tr className="border-b border-slate-700 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <th className="py-4 px-2">اسم المستخدم</th>
                    <th className="py-4 px-2">كلمة المرور</th>
                    <th className="py-4 px-2">الوظائف المسموح بها</th>
                    <th className="py-4 px-2">الموظفين المسموح بهم</th>
                    <th className="py-4 px-2 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {reportAccounts.map(acc => (
                    <tr key={acc.id} className="border-b border-slate-700/50 hover:bg-slate-900/30 transition-all">
                      <td className="py-4 px-2 font-bold text-sm text-white">
                        {editingReportId === acc.id ? (
                          <input className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-full text-white" value={editReportData.username || ''} onChange={e => setEditReportData({...editReportData, username: e.target.value})} />
                        ) : acc.username}
                      </td>
                      <td className="py-4 px-2 font-mono text-xs text-slate-400">
                        {editingReportId === acc.id ? (
                          <input type="text" className="bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs w-full text-white" value={editReportData.password || ''} onChange={e => setEditReportData({...editReportData, password: e.target.value})} />
                        ) : (
                          <div className="flex items-center gap-2">
                            {showPass === acc.id ? acc.password : '••••••••'}
                            <button onClick={() => setShowPass(showPass === acc.id ? null : acc.id)} className="text-slate-600 hover:text-blue-400">
                              {showPass === acc.id ? <EyeOff size={14}/> : <Eye size={14}/>}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-2">
                        {editingReportId === acc.id ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                              <button onClick={() => setEditReportData({...editReportData, allowedJobs: jobs.map(j => j.title)})} className="text-[8px] text-blue-400 font-black">الكل</button>
                              <button onClick={() => setEditReportData({...editReportData, allowedJobs: []})} className="text-[8px] text-slate-500 font-black">إلغاء</button>
                            </div>
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {jobs.map(j => (
                                <button key={j.id} onClick={() => { 
                                  const current = editReportData.allowedJobs || []; 
                                  if (current.includes(j.title)) { 
                                    setEditReportData({...editReportData, allowedJobs: current.filter(t => t !== j.title)}); 
                                  } else { 
                                    setEditReportData({...editReportData, allowedJobs: [...current, j.title]}); 
                                  } 
                                }} className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${editReportData.allowedJobs?.includes(j.title) ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                  {j.title}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {acc.allowedJobs.map((j, i) => <span key={i} className="px-2 py-0.5 bg-blue-900/30 text-blue-400 text-[9px] font-black rounded border border-blue-800/30">{j}</span>)}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-2">
                        {editingReportId === acc.id ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center px-1">
                              <button onClick={() => setEditReportData({...editReportData, allowedEmployees: allUsers.filter(u => u.role !== 'admin').map(u => u.fullName)})} className="text-[8px] text-green-400 font-black">الكل</button>
                              <button onClick={() => setEditReportData({...editReportData, allowedEmployees: []})} className="text-[8px] text-slate-500 font-black">إلغاء</button>
                            </div>
                            <div className="flex flex-wrap gap-1 max-w-[200px] max-h-32 overflow-y-auto">
                              {allUsers.filter(u => u.role !== 'admin').map(u => (
                                <button key={u.id} onClick={() => { 
                                  const current = editReportData.allowedEmployees || []; 
                                  if (current.includes(u.fullName)) { 
                                    setEditReportData({...editReportData, allowedEmployees: current.filter(t => t !== u.fullName)}); 
                                  } else { 
                                    setEditReportData({...editReportData, allowedEmployees: [...current, u.fullName]}); 
                                  } 
                                }} className={`px-1.5 py-0.5 rounded text-[8px] font-black border ${editReportData.allowedEmployees?.includes(u.fullName) ? 'bg-green-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                                  {u.fullName}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
                            {acc.allowedEmployees && acc.allowedEmployees.length > 0 ? acc.allowedEmployees.map((e, i) => <span key={i} className="px-2 py-0.5 bg-green-900/30 text-green-400 text-[9px] font-black rounded border border-green-800/30">{e}</span>) : <span className="text-[9px] text-slate-600">الكل (حسب الوظيفة)</span>}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-2 text-center">
                        <div className="flex justify-center gap-2">
                          {editingReportId === acc.id ? (
                            <>
                              <button onClick={() => saveEditReportAcc(acc.id)} className="text-green-500"><Check size={18}/></button>
                              <button onClick={() => setEditingReportId(null)} className="text-red-500"><X size={18}/></button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingReportId(acc.id); setEditReportData(acc); }} className="text-blue-400 hover:bg-blue-900/20 p-1.5 rounded"><Edit2 size={16}/></button>
                              <button onClick={() => { if(confirm('حذف حساب التقارير؟')) { setReportAccounts?.(reportAccounts.filter(x => x.id !== acc.id)); logAction('حذف حساب تقارير', `المستخدم: ${acc.username}`); } }} className="text-slate-500 hover:text-red-400 p-1.5"><Trash2 size={16}/></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-2xl border border-slate-700">
              <div className="flex items-center gap-3">
                <Monitor size={20} className="text-blue-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-tighter">إعدادات النظام</h3>
              </div>
              <div className="flex gap-2">
                <button onClick={() => pushToCloud()} disabled={isPushing} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-xl text-[10px] font-black shadow-lg transition-all">
                  {isPushing ? <RotateCcw size={14} className="animate-spin" /> : <CloudUpload size={14} />} حفظ الكل في السحابة
                </button>
              </div>
            </div>
            <h4 className="text-sm font-black text-blue-400 flex items-center gap-2 uppercase tracking-widest"><Monitor size={20}/> إعدادات النظام المتقدمة</h4>
            <div className="bg-slate-900/50 p-6 rounded-3xl border border-slate-700 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">رابط ملف سجل المراقبة (Audit Log Sheet ID)</label>
                <input 
                  type="text" 
                  placeholder="اتركه فارغاً لاستخدام نفس الملف الحالي، أو ضع ID لملف آخر" 
                  className={inputClasses} 
                  value={config.auditLogUrl || ''} 
                  onChange={e => setConfig({...config, auditLogUrl: e.target.value})} 
                />
                <p className="text-[9px] text-slate-500 font-bold italic">ملاحظة: إذا كنت تريد استخدام ملف منفصل، قم بإنشاء ملف Google Sheet جديد وانسخ الـ ID الخاص به وضعه هنا.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-700">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">اسم مستخدم المسؤول (Admin Username)</label>
                  <input 
                    type="text" 
                    className={inputClasses} 
                    value={config.adminUsername || ''} 
                    onChange={e => setConfig({...config, adminUsername: e.target.value})} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-1">كلمة مرور المسؤول (Admin Password)</label>
                  <input 
                    type="text" 
                    className={inputClasses} 
                    value={config.adminPassword || ''} 
                    onChange={e => setConfig({...config, adminPassword: e.target.value})} 
                  />
                </div>
              </div>
              
              <div className="pt-4 border-t border-slate-700">
                <button 
                  onClick={() => {
                    localStorage.setItem('attendance_config', JSON.stringify(config));
                    alert('تم حفظ الإعدادات بنجاح');
                    logAction('تحديث إعدادات النظام', 'تغيير إعدادات سجل المراقبة');
                  }} 
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition-all"
                >
                  <Check size={20} /> حفظ الإعدادات
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
