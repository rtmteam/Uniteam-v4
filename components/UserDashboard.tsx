
import React, { useState, useEffect, useRef } from 'react';
import { User, Branch, AttendanceRecord, VisitPlan } from '../types';
import { MapPin, Clock, CheckCircle, AlertCircle, RotateCcw, Cloud, FileText, Navigation, Calendar } from 'lucide-react';
import { calculateDistance, getDeviceFingerprint, getEgyptTime, getRealNetworkTime } from '../utils';

interface UserDashboardProps {
  user: User;
  branches: Branch[];
  records: AttendanceRecord[];
  setRecords: React.Dispatch<React.SetStateAction<AttendanceRecord[]>>;
  googleSheetLink: string;
  onRefresh: () => void;
  isSyncing: boolean;
  lastUpdated?: string;
  logAction: (action: string, details?: string) => void;
  visitPlans: VisitPlan[];
}

const UserDashboard: React.FC<UserDashboardProps> = ({ 
  user, 
  branches, 
  records, 
  setRecords, 
  googleSheetLink, 
  onRefresh, 
  isSyncing, 
  lastUpdated,
  logAction,
  visitPlans
}) => {
  const findInitialBranchId = () => {
    if (!user.defaultBranchId) return '';
    const branchById = branches.find(b => b.id === user.defaultBranchId);
    if (branchById) return branchById.id;
    const branchByName = branches.find(b => b.name === user.defaultBranchId);
    if (branchByName) return branchByName.id;
    return '';
  };

  const [selectedBranchId, setSelectedBranchId] = useState(findInitialBranchId());
  
  // Continuous Location State (Working in background)
  const [liveLocation, setLiveLocation] = useState<{ lat: number, lng: number, accuracy: number, timestamp: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'none', msg: string }>({ type: 'none', msg: '' });
  const [reasonText, setReasonText] = useState('');

  const [currentTime, setCurrentTime] = useState(getEgyptTime());

  // Clock Interval
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getEgyptTime()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Continuous Location Watching (Hidden Background Process)
  useEffect(() => {
    if (!navigator.geolocation) return;

    const startWatching = () => {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          setLiveLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp
          });
        },
        (err) => {
          // Silent error handling in background
          console.debug("Background GPS Error", err);
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 }
      );
    };

    startWatching();

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedBranchId && user.defaultBranchId) {
      setSelectedBranchId(findInitialBranchId());
    }
  }, [branches, user.defaultBranchId]);

  const formatTimeDisplay = (timeStr: string | undefined) => {
    if (!timeStr) return '--:--';
    if (timeStr.includes('GMT') || timeStr.includes('1899')) {
      try {
        const d = new Date(timeStr);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString('en-US', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: true });
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

  const calculateTimeDiffDetails = (type: 'check-in' | 'check-out') => {
    let scheduledTimeStr = type === 'check-in' ? (user.checkInTime || "09:00") : (user.checkOutTime || "17:00");
    let schedH = 9, schedM = 0;

    if (scheduledTimeStr.includes('GMT') || scheduledTimeStr.includes('1899')) {
       const d = getEgyptTime(scheduledTimeStr);
       if (!isNaN(d.getTime())) {
          schedH = d.getHours();
          schedM = d.getMinutes();
       }
    } else {
       const parts = scheduledTimeStr.split(':').map(Number);
       schedH = parts[0] || 0;
       schedM = parts[1] || 0;
    }

    const now = getEgyptTime();
    const schedDate = new Date(now);
    schedDate.setHours(schedH, schedM, 0, 0);

    const diffMs = now.getTime() - schedDate.getTime();
    const diffMinsTotal = Math.floor(diffMs / 60000);
    const absMins = Math.abs(diffMinsTotal);
    const h = Math.floor(absMins / 60);
    const m = absMins % 60;
    
    let timeStr = `${h > 0 ? h + ' ساعة و ' : ''}${m} دقيقة`;
    let isLate = false;
    let resultString = "";

    if (type === 'check-in') {
      isLate = diffMinsTotal > 0;
      resultString = isLate ? `حضور متأخر ${timeStr}` : `حضور مبكر ${timeStr}`;
    } else {
      isLate = diffMinsTotal < 0; 
      resultString = diffMinsTotal < 0 ? `انصراف مبكر ${timeStr}` : `انصراف متأخر ${timeStr}`;
    }

    return { resultString, isLate, diffMinsTotal };
  };

  const handleAttendance = async (type: 'check-in' | 'check-out') => {
    // 1. Connectivity Check
    if (!navigator.onLine) { 
      const msg = 'عذراً، يجب أن يكون الهاتف متصلاً بالإنترنت لإرسال التسجيل.';
      setStatus({ type: 'error', msg }); 
      logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${msg}`);
      return; 
    }

    if (!selectedBranchId) { 
      const msg = 'يرجى اختيار الفرع أولاً';
      setStatus({ type: 'error', msg }); 
      logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${msg}`);
      return; 
    }

    setIsVerifying(true);
    setStatus({ type: 'none', msg: '' });

    // 2. Location Confirmation Logic
    let lat = 0;
    let lng = 0;

    // Check if we have a fresh background location (less than 60 seconds old)
    const isBackgroundLocationFresh = liveLocation && (Date.now() - liveLocation.timestamp < 60000);

    if (isBackgroundLocationFresh && liveLocation) {
        lat = liveLocation.lat;
        lng = liveLocation.lng;
    } else {
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                });
            });
            lat = position.coords.latitude;
            lng = position.coords.longitude;
            setLiveLocation({
                lat, lng, accuracy: position.coords.accuracy, timestamp: position.timestamp
            });
        } catch (error) {
            setIsVerifying(false);
            const msg = 'تعذر تحديد الموقع الحالي بدقة. تأكد من تفعيل GPS والمحاولة مرة أخرى.';
            setStatus({ type: 'error', msg });
            logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${msg}`);
            return;
        }
    }

    // 3. Client-Side Checks
    const branch = branches.find(b => b.id === selectedBranchId);
    if (!branch) {
      logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: لم يتم اختيار فرع | الإحداثيات: ${lat}, ${lng}`);
      setIsVerifying(false);
      return;
    }

    if (branch.name.trim().toLowerCase() === 'out door' && reasonText.trim() === "") {
        const msg = 'تنبيه: عند اختيار Out Door يجب كتابة تفاصيل المكان أو السبب في خانة الملاحظات.';
        setStatus({ type: 'error', msg });
        logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${msg} | الإحداثيات: ${lat}, ${lng}`);
        setIsVerifying(false);
        return;
    }

    const distance = calculateDistance(lat, lng, branch.latitude, branch.longitude);
    if (distance > branch.radius) { 
        const msg = `بعيد عن الفرع بمسافة ${Math.round(distance)}م. الحد المسموح ${branch.radius}م.`;
        setStatus({ type: 'error', msg }); 
        logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${msg} | الإحداثيات: ${lat}, ${lng}`);
        setIsVerifying(false);
        return; 
    }

    const timeInfo = calculateTimeDiffDetails(type);

    if (type === 'check-in' && timeInfo.isLate && reasonText.trim() === "") {
        const msg = 'تنبيه: أنت متأخر عن الموعد الافتراضي، يجب كتابة سبب التأخير في خانة الملاحظات قبل الإرسال.';
        setStatus({ type: 'error', msg });
        logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${msg} | الإحداثيات: ${lat}, ${lng}`);
        setIsVerifying(false);
        return;
    }

    const newRecord: AttendanceRecord = {
        id: Math.random().toString(36).substr(2, 9),
        userId: user.id, 
        userName: user.fullName, 
        userJob: user.jobTitle,
        serialNumber: user.serialNumber, 
        branchId: branch.id, 
        branchName: branch.name, 
        type: type,
        timestamp: getRealNetworkTime().toISOString(), 
        latitude: lat, 
        longitude: lng,
        reason: reasonText.trim(), 
        timeDiff: timeInfo.resultString
    };

    try {
        let activeLink = googleSheetLink;
        
        // جلب أحدث رابط من السيرفر قبل التسجيل مباشرة لضمان عدم استخدام رابط قديم
        try {
            const configRes = await fetch('./server-config.json?t=' + Date.now());
            if (configRes.ok) {
                const configData = await configRes.json();
                if (configData && configData.googleSheetLink && configData.googleSheetLink.startsWith('http')) {
                    activeLink = configData.googleSheetLink;
                    // تحديث التخزين المحلي بصمت
                    const savedConfig = localStorage.getItem('attendance_config');
                    if (savedConfig) {
                        const parsed = JSON.parse(savedConfig);
                        let changed = false;
                        if (parsed.googleSheetLink !== activeLink) {
                            parsed.googleSheetLink = activeLink;
                            parsed.syncUrl = activeLink;
                            changed = true;
                        }
                        if (configData.auditLogUrl !== undefined && parsed.auditLogUrl !== configData.auditLogUrl) {
                            parsed.auditLogUrl = configData.auditLogUrl;
                            changed = true;
                        }
                        if (changed) {
                            localStorage.setItem('attendance_config', JSON.stringify(parsed));
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Could not verify latest link, proceeding with current.");
        }

        if (!activeLink) {
            logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: NO_LINK (التطبيق غير مربوط بالسحابة) | الإحداثيات: ${lat}, ${lng}`);
            throw new Error("NO_LINK");
        }

        // 4. STRICT Server Check - Ensure Code Exists & Valid
        // Removed 'no-cors' to allow reading status and body. 
        // Apps Script MUST be deployed as "Anyone" for this to work.
        const response = await fetch(activeLink, {
          method: 'POST', 
          // mode: 'cors', // Implicit default
          headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // Use text/plain to avoid preflight issues
          body: JSON.stringify({ 
            action: 'saveAttendance', 
            ...newRecord, 
            nationalId: user.nationalId,
            serialNumber: user.serialNumber,
            deviceId: getDeviceFingerprint()
          })
        });

          // A) Check for 404 (Script Deleted/Wrong URL)
          if (response.status === 404) {
             throw new Error("SERVER_404");
          }

          if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
          }

          const responseText = await response.text();
          
          // B) Check content validity (Avoid HTML/Google Login pages)
          if (!responseText || responseText.trim().startsWith("<")) {
             throw new Error("INVALID_RESPONSE_FORMAT");
          }

          // C) Logic Validation
          if (responseText.includes("Error") || responseText.includes("Security Alert")) {
             // Logic Error (User deleted, Distance, etc.)
             logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'} (خطأ منطقي)`, `السبب: ${responseText} | الإحداثيات: ${lat}, ${lng}`);
             setStatus({ type: 'error', msg: responseText });
             setIsVerifying(false);
             return;
          }

          // D) Code Freshness Check
          // Only proceed if server specifically confirms recording.
          // This prevents "Old Code" that might respond with success: true but do nothing, or different text.
          if (!responseText.includes("Attendance Recorded")) {
             throw new Error("OLD_OR_INVALID_CODE");
          }
        
        logAction(`تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `الفرع: ${branch.name}, المسافة: ${Math.round(distance)}م, الحالة: ${timeInfo.resultString}`);
        // Only update local state if all checks passed
        setRecords(prev => [...prev, newRecord]);
        setStatus({ type: 'success', msg: `تم تسجيل ${type === 'check-in' ? 'الحضور' : 'الانصراف'} بنجاح. (${timeInfo.resultString})` });
        setReasonText('');

    } catch (err: any) {
        console.error("Attendance Error:", err);
        
        let errorMsg = 'فشل الاتصال بالنظام. تأكد من الإنترنت.';
        
        if (err.message === "NO_LINK") {
            errorMsg = 'التطبيق غير مربوط بالسحابة - يرجى تحديث الصفحة أو مراجعة الإدارة.';
        } else if (err.message === "SERVER_404") {
            errorMsg = 'رابط الشركة غير صحيح أو تم حذفه من السيرفر (404).';
        } else if (err.message === "INVALID_RESPONSE_FORMAT") {
            errorMsg = 'الرابط المسجل لا يؤدي إلى كود النظام. يرجى مراجعة المسؤول.';
        } else if (err.message === "OLD_OR_INVALID_CODE") {
            errorMsg = 'كود السيرفر قديم أو غير متوافق. لن يتم تسجيل الحضور.';
        } else if (err.message === "Failed to fetch") {
            errorMsg = 'تعذر الوصول للسيرفر. تأكد من اتصال الإنترنت أو صحة الرابط.';
        }

        logAction(`فشل تسجيل ${type === 'check-in' ? 'حضور' : 'انصراف'}`, `السبب: ${errorMsg}${err.message ? ' | تفاصيل: ' + err.message : ''} | الإحداثيات: ${lat}, ${lng}`);
        setStatus({ type: 'error', msg: errorMsg });
    } finally {
        setIsVerifying(false);
    }
  };

  const myRecords = records.filter(r => r.userId === user.id).slice(-5).reverse();

  // Find today's plan for this user
  const getTodayStr = () => {
    const d = getEgyptTime();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const todayStr = getTodayStr();
  const todayPlan = visitPlans.find(p => {
    if (!p.userId || !user.id) return false;
    if (p.userId !== user.id) return false;
    
    let planDate = (p.date || "").toString().trim();
    if (!planDate) return false;

    // If planDate is in long format, normalize it
    if (planDate.includes('GMT') || planDate.length > 15) {
      const d = getEgyptTime(planDate);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        planDate = `${year}-${month}-${day}`;
      }
    }

    // Direct match after normalization
    if (planDate === todayStr) return true;

    // Flexible match (contains today's components)
    const d = getEgyptTime();
    const y = d.getFullYear().toString();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    
    // Check for common formats: YYYY-MM-DD, DD-MM-YYYY, YYYY/MM/DD, DD/MM/YYYY
    const formats = [
      `${y}-${m}-${day}`,
      `${day}-${m}-${y}`,
      `${y}/${m}/${day}`,
      `${day}/${m}/${y}`,
      `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
      `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    ];
    
    return formats.some(f => planDate.includes(f));
  });

  // Find tomorrow's plan for this user
  const getTomorrowStr = () => {
    const d = getEgyptTime();
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  const tomorrowStr = getTomorrowStr();
  const tomorrowPlan = visitPlans.find(p => {
    if (!p.userId || !user.id) return false;
    if (p.userId !== user.id) return false;
    
    let planDate = (p.date || "").toString().trim();
    if (!planDate) return false;

    if (planDate.includes('GMT') || planDate.length > 15) {
      const d = getEgyptTime(planDate);
      if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        planDate = `${year}-${month}-${day}`;
      }
    }

    if (planDate === tomorrowStr) return true;

    const d = getEgyptTime();
    d.setDate(d.getDate() + 1);
    const y = d.getFullYear().toString();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    
    const formats = [
      `${y}-${m}-${day}`,
      `${day}-${m}-${y}`,
      `${y}/${m}/${day}`,
      `${day}/${m}/${y}`,
      `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`,
      `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
    ];
    
    return formats.some(f => planDate.includes(f));
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="bg-slate-800 rounded-3xl shadow-xl border border-slate-700 p-8 text-white relative overflow-hidden">
          <div className="absolute left-2 top-6 flex flex-col items-end gap-2">
            <button onClick={() => { onRefresh(); logAction('تحديث البيانات', 'مزامنة البيانات مع السحابة'); }} disabled={isSyncing} className="p-2.5 bg-slate-900 rounded-xl border border-slate-700 text-slate-400 hover:text-blue-400 transition-all shadow-lg active:scale-95">
              <RotateCcw size={20} className={isSyncing ? 'animate-spin text-blue-400' : ''} />
            </button>
            <div className="h-12"></div>
            {lastUpdated && (<div className="flex items-center gap-1 text-[8px] font-black text-slate-500 bg-slate-900 px-2 py-1 rounded-md border border-slate-800 uppercase"><Cloud size={8} /> Updated: {new Date(lastUpdated).toLocaleTimeString('en-US')}</div>)}
          </div>
          <div className="text-center mb-8 pt-4">
             <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">أهلاً، {user.fullName.split(' ')[0]}</h2>
             <div className="bg-blue-900/30 px-5 py-1.5 rounded-xl text-blue-400 border border-blue-800/40 font-black text-[10px] inline-block uppercase tracking-widest">{user.jobTitle || 'موظف'} | SN: {user.serialNumber || '---'}</div>
             <div className="text-5xl font-black text-white mt-10 mb-2 tracking-tighter drop-shadow-2xl">{currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</div>
             <div className="text-slate-500 font-bold text-xs uppercase tracking-widest">{currentTime.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
             
             {(todayPlan || tomorrowPlan) && (
                <div className="mt-6 bg-slate-900/50 border border-slate-700/50 rounded-3xl overflow-hidden max-w-4xl mx-auto shadow-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse divide-slate-700/30">
                    {/* Today's Plan */}
                    <div 
                      onClick={() => {
                        if (!todayPlan || todayPlan.branchName === 'Holiday') return;
                        // Robust branch finding: check by ID first, then by name
                        const targetBranch = branches.find(b => b.id === todayPlan.branchId || b.name === todayPlan.branchName);
                        if (targetBranch) {
                          setSelectedBranchId(targetBranch.id);
                          logAction('اختيار فرع الخطة', `تم اختيار فرع ${targetBranch.name} من خطة اليوم عبر الرسالة التنبيهية`);
                        }
                      }}
                      className={`p-5 flex items-center justify-between gap-4 transition-all group ${!todayPlan ? 'opacity-40 cursor-default' : todayPlan.branchName === 'Holiday' ? 'bg-orange-600/5 cursor-default' : 'bg-blue-600/5 cursor-pointer hover:bg-blue-600/10'}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl shadow-lg transition-transform ${!todayPlan ? 'bg-slate-800' : todayPlan.branchName === 'Holiday' ? 'bg-orange-600' : 'bg-blue-600 group-hover:scale-105'}`}>
                          {!todayPlan ? <Clock size={20} className="text-slate-500" /> : todayPlan.branchName === 'Holiday' ? <FileText size={20} className="text-white" /> : <Navigation size={20} className="text-white" />}
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="relative flex h-2 w-2">
                              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${!todayPlan ? 'bg-slate-500' : todayPlan.branchName === 'Holiday' ? 'bg-orange-400' : 'bg-blue-400'}`}></span>
                              <span className={`relative inline-flex rounded-full h-2 w-2 ${!todayPlan ? 'bg-slate-600' : todayPlan.branchName === 'Holiday' ? 'bg-orange-500' : 'bg-blue-500'}`}></span>
                            </span>
                            <div className={`text-[9px] font-black uppercase tracking-widest ${!todayPlan ? 'text-slate-500' : todayPlan.branchName === 'Holiday' ? 'text-orange-400' : 'text-blue-400'}`}>الفرع المطلوب زيارته اليوم</div>
                          </div>
                          <div className="text-xs font-black text-white leading-tight">
                            {!todayPlan ? 'لا توجد خطة مسجلة' : todayPlan.branchName === 'Holiday' ? 'إجازة (Holiday) - نتمنى لك وقتاً ممتعاً' : todayPlan.branchName}
                          </div>
                        </div>
                      </div>
                      {todayPlan && todayPlan.branchName !== 'Holiday' && (
                        <div className="px-3 py-1.5 bg-blue-600 group-hover:bg-blue-500 text-white rounded-lg text-[9px] font-black transition-all shadow-md whitespace-nowrap">تحديد الفرع</div>
                      )}
                    </div>

                    {/* Tomorrow's Plan */}
                    <div 
                      className={`p-5 flex items-center gap-4 transition-all ${!tomorrowPlan ? 'opacity-40 cursor-default' : tomorrowPlan.branchName === 'Holiday' ? 'bg-orange-600/5 cursor-default' : 'bg-indigo-600/5 cursor-default'}`}
                    >
                      <div className={`p-3 rounded-2xl shadow-lg ${!tomorrowPlan ? 'bg-slate-800' : tomorrowPlan.branchName === 'Holiday' ? 'bg-orange-600' : 'bg-indigo-600'}`}>
                        {!tomorrowPlan ? <Clock size={20} className="text-slate-500" /> : tomorrowPlan.branchName === 'Holiday' ? <FileText size={20} className="text-white" /> : <Calendar size={20} className="text-white" />}
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`text-[9px] font-black uppercase tracking-widest ${!tomorrowPlan ? 'text-slate-500' : tomorrowPlan.branchName === 'Holiday' ? 'text-orange-400' : 'text-indigo-400'}`}>الفرع المطلوب زيارته غداً</div>
                        </div>
                        <div className="text-xs font-black text-white leading-tight">{!tomorrowPlan ? 'لا توجد خطة مسجلة' : tomorrowPlan.branchName === 'Holiday' ? 'إجازة (Holiday)' : tomorrowPlan.branchName}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
             <div className="mt-4 flex justify-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <span className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">موعد الحضور: {formatTimeDisplay(user.checkInTime || '09:00')}</span>
                <span className="bg-slate-900 px-3 py-1 rounded-lg border border-slate-700">موعد الانصراف: {formatTimeDisplay(user.checkOutTime || '17:00')}</span>
             </div>
          </div>
          
          <div className="space-y-6 max-w-md mx-auto">
            {!googleSheetLink && (
              <div className="p-3 bg-red-900/40 border border-red-500/50 rounded-2xl flex items-center gap-3 text-red-200 text-[10px] font-black uppercase">
                <Cloud size={16} /> التطبيق غير مربوط بالسحابة - لن يتم الإرسال
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 mr-2 uppercase tracking-tighter">موقع التسجيل</label>
              <div className="relative">
                <select value={selectedBranchId} onChange={e => setSelectedBranchId(e.target.value)} className="w-full bg-slate-900 border border-slate-700 text-white px-6 py-4 rounded-2xl font-bold outline-none cursor-pointer appearance-none shadow-inner focus:border-blue-500 transition-all text-right">
                  <option value="">-- اختر الفرع للتسجيل --</option>
                  {branches.map(b => (<option key={b.id} value={b.id}>{b.name} {(b.id === user.defaultBranchId || b.name === user.defaultBranchId) ? '(الأساسي)' : ''}</option>))}
                </select>
                <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 mr-2 uppercase tracking-tighter flex items-center gap-1"><FileText size={12} /> ملاحظات / سبب التأخير (إلزامي عند التأخير)</label>
              <textarea value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="اكتب السبب هنا في حال وجود تأخير أو انصراف مبكر..." className="w-full bg-slate-900 border border-slate-700 text-white px-4 py-3 rounded-2xl font-bold outline-none focus:border-blue-500 transition-all text-right h-24 resize-none shadow-inner text-xs placeholder:text-slate-600" />
            </div>
            
            {status.type !== 'none' && (<div className={`p-4 rounded-2xl text-[10px] font-black border flex items-center gap-3 ${status.type === 'success' ? 'bg-green-900/20 text-green-400 border-green-800/50' : 'bg-red-900/20 text-red-400 border-red-800/50'}`}>{status.type === 'error' ? <AlertCircle size={20} className="shrink-0" /> : <CheckCircle size={20} className="shrink-0" />}<span className="leading-relaxed">{status.msg}</span></div>)}
            
            <div className="grid grid-cols-2 gap-4">
              <button disabled={isVerifying} onClick={() => handleAttendance('check-in')} className="py-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-2xl font-black text-lg shadow-xl shadow-blue-900/20 active:scale-95 transition-all flex flex-col items-center justify-center gap-1">
                <span>حضور</span>
                {isVerifying && <span className="text-[9px] animate-pulse">جاري التحقق مع السيرفر...</span>}
              </button>
              <button disabled={isVerifying} onClick={() => handleAttendance('check-out')} className="py-6 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-900/20 active:scale-95 transition-all border border-slate-600 flex flex-col items-center justify-center gap-1">
                <span>انصراف</span>
                {isVerifying && <span className="text-[9px] animate-pulse">جاري التحقق مع السيرفر...</span>}
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-slate-800 rounded-3xl p-6 border border-slate-700 shadow-xl text-white">
        <h3 className="font-black mb-6 border-b border-slate-700 pb-4 flex items-center gap-2 text-blue-400 text-[10px] uppercase tracking-widest">السجل الأخير</h3>
        <div className="space-y-4">
          {myRecords.length === 0 ? (<div className="text-center py-10 opacity-20"><Clock size={40} className="mx-auto" /></div>) : (
            myRecords.map(r => (
              <div key={r.id} className="p-4 bg-slate-900 rounded-2xl border border-slate-700/50 group hover:border-blue-500 transition-all text-right">
                <div className="flex justify-between font-black text-[10px] mb-1 uppercase tracking-tighter"><span className="text-slate-300">{r.branchName}</span><span className={r.type === 'check-in' ? 'text-green-400' : 'text-orange-400'}>{r.type === 'check-in' ? 'حضور' : 'انصراف'}</span></div>
                <div className="text-[9px] text-slate-500 font-bold mb-1">{new Date(r.timestamp).toLocaleTimeString('en-US')}</div>
                <div className="text-[8px] text-blue-400 font-black mb-1 italic uppercase">{r.timeDiff}</div>
                {r.reason && (<div className="text-[8px] text-slate-400 font-bold bg-slate-800 p-2 rounded-lg border border-slate-700">السبب: {r.reason}</div>)}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
