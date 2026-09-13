/**
 * Health & Activity Manager
 * سیستم جامع مدیریت فعالیت‌ها، گام‌شمار زنده سنسوری، ورود سریع و ایمپورت گزارش‌های سلامت
 * جایگزین روش‌های پیچیده و دشوار گذشته
 */

import { db } from './db.js';

class HealthActivityManager {
  constructor() {
    this.isPedometerActive = false;
    this.sessionSteps = 0;
    this.lastAcceleration = { x: 0, y: 0, z: 0 };
    this.threshold = 11.5; // آستانه تشخیص گام از شتاب گرانش
    this.lastStepTime = 0;
    this.motionHandler = null;
    this.onStepCallback = null;
  }

  async init() {
    return true;
  }

  async getStoredClientId() {
    return null;
  }

  /**
   * محاسبه کالری علمی به ازای هر گام متناسب با وزن کاربر
   */
  calculateStepCalories(steps, weightKg = 70) {
    const baseCalPerStep = 0.04;
    const weightFactor = weightKg / 70;
    return Math.round(steps * baseCalPerStep * weightFactor);
  }

  /**
   * ثبت سریع تعداد گام‌ها و محاسبه خودکار کالری در دیتابیس
   */
  async logSteps(stepsCount, dateStr, weightKg = 70) {
    const steps = Math.max(0, parseInt(stepsCount) || 0);
    if (steps === 0) return null;

    const caloriesBurned = this.calculateStepCalories(steps, weightKg);
    const durationMin = Math.round(steps / 100); // به طور میانگین هر ۱۰۰ گام حدود ۱ دقیقه

    const logItem = {
      date: dateStr,
      type: 'steps',
      name: `پیاده‌روی و گام‌های روزانه (${steps.toLocaleString('fa-IR')} گام)`,
      durationMin: Math.max(5, durationMin),
      caloriesBurned,
      steps
    };

    const logId = await db.addExerciseLog(logItem);
    logItem.id = logId;
    return logItem;
  }

  // =========================================================================
  // سنسور زنده شتاب‌سنج و قدم‌شمار گوشی (Live Motion Pedometer)
  // بدون نیاز به اینترنت و بدون نیاز به اکانت گوگل
  // =========================================================================

  async startLivePedometer(onStep) {
    this.onStepCallback = onStep;
    this.sessionSteps = 0;

    // بررسی درخواست دسترسی برای دستگاه‌های دارای امنیت حسگر (مانند iOS یا برخی مرورگرها)
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const permissionState = await DeviceMotionEvent.requestPermission();
        if (permissionState !== 'granted') {
          throw new Error('دسترسی به حسگر حرکتی گوشی داده نشد.');
        }
      } catch (err) {
        throw new Error('برای استفاده از قدم‌شمار زنده، لطفاً دسترسی به حسگر حرکت را تایید کنید.');
      }
    }

    if (!window.DeviceMotionEvent) {
      throw new Error('حسگر حرکتی شتاب‌سنج در این مرورگر یا دستگاه پشتیبانی نمی‌شود.');
    }

    this.motionHandler = (event) => {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      if (!acc || acc.x === null) return;

      const currentTime = Date.now();
      // محاسبه بزرگی بردار شتاب
      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);

      // تشخیص قله شتاب و حداقل فاصله زمانی بین دو قدم (حداقل ۳۰۰ میلی‌ثانیه برای جلوگیری از ثبت مضاعف)
      if (magnitude > this.threshold && (currentTime - this.lastStepTime) > 320) {
        this.sessionSteps++;
        this.lastStepTime = currentTime;
        if (this.onStepCallback) {
          this.onStepCallback(this.sessionSteps);
        }
      }
    };

    window.addEventListener('devicemotion', this.motionHandler, true);
    this.isPedometerActive = true;
    return true;
  }

  stopLivePedometer() {
    if (this.motionHandler) {
      window.removeEventListener('devicemotion', this.motionHandler, true);
      this.motionHandler = null;
    }
    this.isPedometerActive = false;
    const finalSteps = this.sessionSteps;
    this.sessionSteps = 0;
    return finalSteps;
  }

  // =========================================================================
  // ایمپورت فایل گزارش Google Fit / Health Connect / ساعت هوشمند (JSON / CSV)
  // =========================================================================

  async importHealthFile(fileContent, fileName) {
    const isJson = fileName.toLowerCase().endsWith('.json');
    const isCsv = fileName.toLowerCase().endsWith('.csv');

    if (isJson) {
      return this.parseJsonHealthData(fileContent);
    } else if (isCsv) {
      return this.parseCsvHealthData(fileContent);
    } else {
      throw new Error('لطفاً یک فایل خروجی با فرمت JSON یا CSV انتخاب کنید.');
    }
  }

  parseJsonHealthData(content) {
    try {
      const data = JSON.parse(content);
      const results = [];

      // اگر فرمت Google Takeout Daily Activity باشد
      if (Array.isArray(data)) {
        data.forEach(item => {
          const date = item.date || (item.startTime ? item.startTime.split('T')[0] : null);
          const steps = parseInt(item.steps || item.step_count || 0);
          const calories = parseInt(item.calories || item.calories_burned || 0);
          if (date && (steps > 0 || calories > 0)) {
            results.push({
              date,
              type: 'steps',
              name: `همگام‌سازی از گزارش سلامت (${steps.toLocaleString('fa-IR')} گام)`,
              durationMin: parseInt(item.active_minutes || 30),
              caloriesBurned: calories || this.calculateStepCalories(steps),
              steps
            });
          }
        });
      } else if (data.Data && Array.isArray(data.Data)) {
        // فرمت Samsung Health یا ساعت‌های هوشمند
        data.Data.forEach(item => {
          const date = item.date || item.day;
          const steps = parseInt(item.step_count || item.steps || 0);
          const calories = parseInt(item.calorie || 0);
          if (date && (steps > 0 || calories > 0)) {
            results.push({
              date,
              type: 'steps',
              name: 'گام‌ها و فعالیت ساعت هوشمند',
              durationMin: 30,
              caloriesBurned: calories || this.calculateStepCalories(steps),
              steps
            });
          }
        });
      }

      if (results.length === 0) {
        throw new Error('داده‌های گام یا کالری معتبری در این فایل JSON یافت نشد.');
      }

      return results;
    } catch (e) {
      throw new Error('خطا در خواندن فایل JSON: ' + e.message);
    }
  }

  parseCsvHealthData(content) {
    const lines = content.split('\n');
    if (lines.length < 2) throw new Error('فایل CSV خالی است.');

    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('day') || h.includes('time'));
    const stepIdx = headers.findIndex(h => h.includes('step') || h.includes('count'));
    const calIdx = headers.findIndex(h => h.includes('cal') || h.includes('energy'));

    if (dateIdx === -1 || stepIdx === -1) {
      throw new Error('ستون‌های تاریخ و گام در فایل CSV یافت نشدند.');
    }

    const results = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(r => r.trim());
      if (row.length <= dateIdx || row.length <= stepIdx) continue;

      let date = row[dateIdx].split(' ')[0].split('T')[0];
      const steps = parseInt(row[stepIdx]) || 0;
      const calories = calIdx !== -1 ? (parseInt(row[calIdx]) || 0) : this.calculateStepCalories(steps);

      if (date && steps > 0) {
        results.push({
          date,
          type: 'steps',
          name: `گزارش سلامت CSV (${steps.toLocaleString('fa-IR')} گام)`,
          durationMin: Math.round(steps / 100),
          caloriesBurned: calories,
          steps
        });
      }
    }

    if (results.length === 0) {
      throw new Error('هیچ داده ورزشی معتبری در این فایل CSV پیدا نشد.');
    }

    return results;
  }
}

export const healthActivity = new HealthActivityManager();
// جهت سازگاری
export const googleFit = healthActivity;
