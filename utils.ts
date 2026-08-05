
/**
 * Calculates the distance between two points in meters using Haversine formula
 */
export const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

export const formatDate = (dateStr: string) => {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateStr));
};

/**
 * يحصل على معرف الجهاز من التخزين المحلي أو ينشئ واحداً جديداً
 */
export const getDeviceFingerprint = (): string => {
  let deviceId = localStorage.getItem('uniteam_device_token');
  if (!deviceId) {
    deviceId = 'dev_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
    localStorage.setItem('uniteam_device_token', deviceId);
  }
  return deviceId;
};

// ==========================================
// نظام مزامنة الوقت الحقيقي وحمايته من التلاعب (Anti-Clock Tampering System)
// ==========================================

let syncBaseTimeMs = Date.now();
let syncBasePerfMs = performance.now();
let lastSavedTimeMs = 0;
let hasSyncedWithServer = false;

// 1. تحميل الفرق المخزن مسبقاً من التخزين المحلي لتسهيل العمل فوراً
const savedOffsetStr = localStorage.getItem('uniteam_time_offset');
let initialOffset = 0;
if (savedOffsetStr) {
  initialOffset = parseInt(savedOffsetStr, 10) || 0;
}

// 2. حساب الوقت الافتراضي عند بدء التشغيل
let initialTimeMs = Date.now() + initialOffset;

// 3. التحقق من تلاعب الساعة وإعادتها للوراء عند بدء التشغيل
const lastKnownStr = localStorage.getItem('uniteam_last_known_real_time');
if (lastKnownStr) {
  const lastKnown = parseInt(lastKnownStr, 10) || 0;
  if (initialTimeMs < lastKnown) {
    console.warn('Clock tampering/rewinding detected on startup.');
    // نجبر التطبيق على البدء من آخر وقت حقيقي موثق + ثانية واحدة
    initialTimeMs = lastKnown + 1000;
    // تعديل الفارق لمنع التلاعب
    initialOffset = initialTimeMs - Date.now();
    localStorage.setItem('uniteam_time_offset', initialOffset.toString());
  }
}

// تثبيت نقطة الأساس للوقت والمؤقت عالي الدقة (Monotonic Clock)
syncBaseTimeMs = initialTimeMs;
syncBasePerfMs = performance.now();

/**
 * مزامنة وقت التطبيق مع خوادم موثوقة (خادم التطبيق أو API عامة)
 */
export const syncTimeWithServer = async () => {
  const startTime = performance.now();
  
  // المحاولة 1: جلب الوقت من خادم التطبيق المحلي (سريع وموثوق جداً ومحمي من جدار الحماية)
  try {
    const res = await fetch('/server-config.json?t=' + Date.now(), { method: 'HEAD' });
    const serverDateHeader = res.headers.get('date');
    if (serverDateHeader) {
      const serverTime = new Date(serverDateHeader).getTime();
      const endTime = performance.now();
      const rtt = endTime - startTime; // زمن الرحلة ذهاباً وإياباً
      const adjustedServerTime = serverTime + (rtt / 2); // تصحيح الوقت بإضافة نصف الـ RTT

      const offset = adjustedServerTime - Date.now();
      localStorage.setItem('uniteam_time_offset', offset.toString());
      
      // تحديث نقاط الأساس في الذاكرة
      syncBaseTimeMs = adjustedServerTime;
      syncBasePerfMs = endTime;
      hasSyncedWithServer = true;
      console.log('Time synced with app server. Base:', new Date(syncBaseTimeMs).toISOString());
      return;
    }
  } catch (e) {
    console.warn('App server sync failed, attempting fallbacks...', e);
  }

  // المحاولة 2: جلب الوقت من WorldTimeAPI لجمهورية مصر العربية
  try {
    const res = await fetch('https://worldtimeapi.org/api/timezone/Africa/Cairo');
    if (res.ok) {
      const data = await res.json();
      if (data && data.unixtime) {
        const serverTime = data.unixtime * 1000;
        const endTime = performance.now();
        const rtt = endTime - startTime;
        const adjustedServerTime = serverTime + (rtt / 2);

        const offset = adjustedServerTime - Date.now();
        localStorage.setItem('uniteam_time_offset', offset.toString());

        // تحديث نقاط الأساس في الذاكرة
        syncBaseTimeMs = adjustedServerTime;
        syncBasePerfMs = endTime;
        hasSyncedWithServer = true;
        console.log('Time synced with WorldTimeAPI (Egypt). Base:', new Date(syncBaseTimeMs).toISOString());
        return;
      }
    }
  } catch (e) {
    console.warn('WorldTimeAPI sync failed.', e);
  }
};

/**
 * الحصول على الوقت الحقيقي الموثق (UTC) غير القابل للتلاعب
 * يعتمد على مؤقت المتصفح الأحادي (performance.now) لضمان زيادة بمعدل 1 ثانية في الثانية مهما حصل من تلاعب في ساعة الهاتف أثناء الجلسة
 */
export const getRealNetworkTime = (): Date => {
  const elapsedMs = performance.now() - syncBasePerfMs;
  const currentRealTimeMs = syncBaseTimeMs + elapsedMs;

  // حفظ آخر وقت حقيقي معروف في التخزين المحلي بحد أقصى مرة كل 5 ثوانٍ لتجنب الحلقات اللانهائية السريعة وحماية الأداء
  const nowPerf = performance.now();
  if (nowPerf - lastSavedTimeMs > 5000) {
    localStorage.setItem('uniteam_last_known_real_time', Math.round(currentRealTimeMs).toString());
    lastSavedTimeMs = nowPerf;
  }

  return new Date(currentRealTimeMs);
};

/**
 * استخراج تفاصيل التاريخ والوقت لجمهورية مصر العربية بالتحديد (توقيت القاهرة) بغض النظر عن لغة ونطاق الهاتف
 */
export function getEgyptDateTimeComponents(date: Date) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const components: { [key: string]: number } = {};
  parts.forEach(p => {
    if (p.type !== 'literal') {
      components[p.type] = parseInt(p.value, 10);
    }
  });
  return components;
}

/**
 * تحويل أي تاريخ إلى كائن تاريخ يعمل بالتوقيت المحلي لجمهورية مصر العربية (قاهرية)
 */
export function getEgyptTime(dateInput?: Date | number | string): Date {
  const baseDate = dateInput ? new Date(dateInput) : getRealNetworkTime();
  const comps = getEgyptDateTimeComponents(baseDate);
  
  // إنشاء كائن تاريخ يعكس قيم الوقت الخاصة بمصر محلياً
  const d = new Date(baseDate.getTime());
  d.setFullYear(comps.year, comps.month - 1, comps.day);
  d.setHours(comps.hour, comps.minute, comps.second, 0);
  return d;
}

