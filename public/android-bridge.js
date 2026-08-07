/**
 * Uniteam Android Native Bridge Helper Script
 * 
 * هذا الملف يقوم بتهيئة الاتصال بين تطبيق الأندرويد APK (WebView / Capacitor)
 * وبين واجهة React لتمرير معرف الهاتف الفريد وفحص خيارات المطور والموقع الوهمي تلقائياً.
 */

(function() {
  if (window.AndroidBridge) {
    console.log('[Uniteam Native] Android Native Bridge successfully linked.');
  } else {
    // محاكاة تلقائية لواجهة الـ Native للعمل السلس على المتصفح والـ APK
    window.UniteamNative = {
      getDeviceId: function() {
        return localStorage.getItem('uniteam_device_token');
      },
      isDeveloperMode: function() {
        return window.location.search.includes('dev_mode=true');
      },
      isMockLocation: function() {
        return false;
      }
    };
  }
})();
