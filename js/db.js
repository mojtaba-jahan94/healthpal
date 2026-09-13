/**
 * IndexedDB Database Manager - مدیریت پایگاه داده آفلاین محلی
 * ذخیره‌سازی داده‌های سلامت، غذاها، فعالیت و وزن به صورت ۱۰۰٪ لوکال
 */

const DB_NAME = 'HealthPalDB';
const DB_VERSION = 1;

class HealthDB {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // ذخیره پروفایل کاربر و اهداف
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }

        // لاگ وعده‌های غذایی روزانه
        if (!db.objectStoreNames.contains('food_logs')) {
          const foodStore = db.createObjectStore('food_logs', { keyPath: 'id', autoIncrement: true });
          foodStore.createIndex('date', 'date', { unique: false });
          foodStore.createIndex('mealType', 'mealType', { unique: false });
          foodStore.createIndex('date_mealType', ['date', 'mealType'], { unique: false });
        }

        // غذاهای سفارشی ایجاد شده توسط کاربر
        if (!db.objectStoreNames.contains('custom_foods')) {
          const customStore = db.createObjectStore('custom_foods', { keyPath: 'id', autoIncrement: true });
          customStore.createIndex('name', 'name', { unique: false });
        }

        // لاگ فعالیت‌ها و ورزش‌ها
        if (!db.objectStoreNames.contains('exercise_logs')) {
          const exerciseStore = db.createObjectStore('exercise_logs', { keyPath: 'id', autoIncrement: true });
          exerciseStore.createIndex('date', 'date', { unique: false });
        }

        // لاگ آب مصرفی
        if (!db.objectStoreNames.contains('water_logs')) {
          db.createObjectStore('water_logs', { keyPath: 'date' });
        }

        // تاریخچه وزن
        if (!db.objectStoreNames.contains('weight_logs')) {
          const weightStore = db.createObjectStore('weight_logs', { keyPath: 'id', autoIncrement: true });
          weightStore.createIndex('date', 'date', { unique: false });
        }

        // تنظیمات و توکن‌های اتصال به Google Fit
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  async getStore(storeName, mode = 'readonly') {
    await this.initPromise;
    const transaction = this.db.transaction([storeName], mode);
    return transaction.objectStore(storeName);
  }

  // --- Profile Operations ---
  async getProfile() {
    const store = await this.getStore('profile', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get('user');
      request.onsuccess = () => {
        // پروفایل پیش‌فرض اگر مقداری وجود نداشت
        resolve(request.result || {
          id: 'user',
          name: 'کاربر عزیز',
          gender: 'male',
          age: 28,
          height: 175,
          weight: 75,
          targetWeight: 72,
          activityLevel: 'moderate', // sedentary, light, moderate, active, very_active
          goal: 'lose', // lose, maintain, gain
          dailyCalorieTarget: 2000,
          carbsRatio: 50, // درصد
          proteinRatio: 25, // درصد
          fatRatio: 25, // درصد
          waterTargetMl: 2500,
          stepGoal: 8000
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveProfile(profileData) {
    const store = await this.getStore('profile', 'readwrite');
    profileData.id = 'user';
    return new Promise((resolve, reject) => {
      const request = store.put(profileData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Food Logs Operations ---
  async addFoodLog(log) {
    const store = await this.getStore('food_logs', 'readwrite');
    log.createdAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const request = store.add(log);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteFoodLog(id) {
    const store = await this.getStore('food_logs', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getFoodLogsByDate(dateStr) {
    const store = await this.getStore('food_logs', 'readonly');
    const index = store.index('date');
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(dateStr));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Custom Foods Operations ---
  async addCustomFood(food) {
    const store = await this.getStore('custom_foods', 'readwrite');
    food.isCustom = true;
    return new Promise((resolve, reject) => {
      const request = store.add(food);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllCustomFoods() {
    const store = await this.getStore('custom_foods', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteCustomFood(id) {
    const store = await this.getStore('custom_foods', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Exercise Logs Operations ---
  async addExerciseLog(log) {
    const store = await this.getStore('exercise_logs', 'readwrite');
    log.createdAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const request = store.add(log);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteExerciseLog(id) {
    const store = await this.getStore('exercise_logs', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async getExerciseLogsByDate(dateStr) {
    const store = await this.getStore('exercise_logs', 'readonly');
    const index = store.index('date');
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(dateStr));
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Water Logs Operations ---
  async getWaterLog(dateStr) {
    const store = await this.getStore('water_logs', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(dateStr);
      request.onsuccess = () => {
        resolve(request.result || { date: dateStr, glasses: 0, ml: 0 });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async saveWaterLog(waterData) {
    const store = await this.getStore('water_logs', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(waterData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Weight History Operations ---
  async addWeightLog(log) {
    const store = await this.getStore('weight_logs', 'readwrite');
    log.createdAt = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const request = store.add(log);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllWeightLogs() {
    const store = await this.getStore('weight_logs', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const sorted = (request.result || []).sort((a, b) => new Date(a.date) - new Date(b.date));
        resolve(sorted);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteWeightLog(id) {
    const store = await this.getStore('weight_logs', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.delete(Number(id));
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Settings & Integrations ---
  async getSettings(id) {
    const store = await this.getStore('settings', 'readonly');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async saveSettings(data) {
    const store = await this.getStore('settings', 'readwrite');
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // --- Backup & Restore (JSON Export/Import) ---
  async exportAllData() {
    const profile = await this.getProfile();
    const customFoods = await this.getAllCustomFoods();
    const weightLogs = await this.getAllWeightLogs();
    
    // گرفتن لاگ غذاها
    const foodLogsStore = await this.getStore('food_logs', 'readonly');
    const foodLogs = await new Promise(r => {
      const req = foodLogsStore.getAll();
      req.onsuccess = () => r(req.result || []);
    });

    // گرفتن فعالیت‌ها
    const exerciseStore = await this.getStore('exercise_logs', 'readonly');
    const exerciseLogs = await new Promise(r => {
      const req = exerciseStore.getAll();
      req.onsuccess = () => r(req.result || []);
    });

    // لاگ آب
    const waterStore = await this.getStore('water_logs', 'readonly');
    const waterLogs = await new Promise(r => {
      const req = waterStore.getAll();
      req.onsuccess = () => r(req.result || []);
    });

    return {
      version: 1,
      exportDate: new Date().toISOString(),
      profile,
      customFoods,
      foodLogs,
      exerciseLogs,
      waterLogs,
      weightLogs
    };
  }

  async importAllData(data) {
    if (!data || !data.version) {
      throw new Error('فرمت فایل پشتیبان معتبر نیست.');
    }

    if (data.profile) await this.saveProfile(data.profile);

    if (Array.isArray(data.customFoods)) {
      const store = await this.getStore('custom_foods', 'readwrite');
      for (const item of data.customFoods) {
        delete item.id;
        await store.add(item);
      }
    }

    if (Array.isArray(data.foodLogs)) {
      const store = await this.getStore('food_logs', 'readwrite');
      for (const item of data.foodLogs) {
        delete item.id;
        await store.add(item);
      }
    }

    if (Array.isArray(data.exerciseLogs)) {
      const store = await this.getStore('exercise_logs', 'readwrite');
      for (const item of data.exerciseLogs) {
        delete item.id;
        await store.add(item);
      }
    }

    if (Array.isArray(data.waterLogs)) {
      const store = await this.getStore('water_logs', 'readwrite');
      for (const item of data.waterLogs) {
        await store.put(item);
      }
    }

    if (Array.isArray(data.weightLogs)) {
      const store = await this.getStore('weight_logs', 'readwrite');
      for (const item of data.weightLogs) {
        delete item.id;
        await store.add(item);
      }
    }

    return true;
  }
}

export const db = new HealthDB();
