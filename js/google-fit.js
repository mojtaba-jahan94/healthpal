/**
 * Google Fit & Health Integration Module
 * همگام‌سازی فعالیت‌ها، گام‌ها و کالری مصرفی از طریق Google Fit REST API
 */

import { db } from './db.js';

class GoogleFitManager {
  constructor() {
    this.tokenClient = null;
    this.accessToken = null;
    this.clientId = null;
  }

  async init() {
    const settings = await db.getSettings('google_fit');
    if (settings && settings.clientId) {
      this.clientId = settings.clientId;
    }
  }

  setClientId(clientId) {
    this.clientId = clientId.trim();
    return db.saveSettings({ id: 'google_fit', clientId: this.clientId });
  }

  async getStoredClientId() {
    const settings = await db.getSettings('google_fit');
    return settings?.clientId || '';
  }

  /**
   * درخواست احراز هویت از طریق Google Identity Services
   */
  async requestAuth() {
    return new Promise((resolve, reject) => {
      if (!this.clientId) {
        return reject(new Error('لطفاً ابتدا Client ID گوگل خود را در بخش تنظیمات وارد کنید.'));
      }

      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        return reject(new Error('کتابخانه Google Identity Services هنوز بارگذاری نشده است. لطفاً اتصال اینترنت خود را بررسی کنید.'));
      }

      try {
        this.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: this.clientId,
          scope: 'https://www.googleapis.com/auth/fitness.activity.read',
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            this.accessToken = response.access_token;
            resolve(this.accessToken);
          },
        });

        this.tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * دریافت گام‌ها و کالری سوزانده شده برای یک روز مشخص
   * @param {string} dateStr فرمت YYYY-MM-DD
   */
  async fetchDailyActivity(dateStr) {
    if (!this.accessToken) {
      await this.requestAuth();
    }

    const startOfDay = new Date(dateStr);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateStr);
    endOfDay.setHours(23, 59, 59, 999);

    const startTimeMillis = startOfDay.getTime();
    const endTimeMillis = endOfDay.getTime();

    const requestBody = {
      aggregateBy: [
        {
          dataTypeName: 'com.google.step_count.delta',
          dataSourceId: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps'
        },
        {
          dataTypeName: 'com.google.calories.expended',
          dataSourceId: 'derived:com.google.calories.expended:com.google.android.gms:merge_step_deltas'
        },
        {
          dataTypeName: 'com.google.active_minutes'
        }
      ],
      bucketByTime: { durationMillis: 86400000 },
      startTimeMillis,
      endTimeMillis
    };

    const response = await fetch('https://fitness.googleapis.com/fitness/v1/users/me/dataset:aggregate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || 'خطا در ارتباط با سرور Google Fit');
    }

    const data = await response.json();
    return this.parseFitData(data, dateStr);
  }

  parseFitData(data, dateStr) {
    let steps = 0;
    let calories = 0;
    let activeMinutes = 0;

    if (data.bucket && data.bucket.length > 0) {
      const dataset = data.bucket[0].dataset;
      dataset.forEach(ds => {
        const type = ds.dataTypeName;
        ds.point.forEach(pt => {
          if (type.includes('step_count') && pt.value && pt.value[0]) {
            steps += pt.value[0].intVal || 0;
          } else if (type.includes('calories') && pt.value && pt.value[0]) {
            calories += Math.round(pt.value[0].fpVal || 0);
          } else if (type.includes('active_minutes') && pt.value && pt.value[0]) {
            activeMinutes += pt.value[0].intVal || 0;
          }
        });
      });
    }

    return {
      date: dateStr,
      steps,
      calories,
      activeMinutes
    };
  }
}

export const googleFit = new GoogleFitManager();
