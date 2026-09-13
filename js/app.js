/**
 * HealthPal - Main Application Logic
 * مدیریت کامل حالت برنامه، دیتابیس لوکال، PWA و رویدادها
 */

import { db } from './db.js';
import { DEFAULT_FOODS, FOOD_CATEGORIES } from './food-database.js';
import { googleFit } from './google-fit.js';
import { gemini } from './gemini.js';

class HealthApp {
  constructor() {
    this.currentDate = this.getTodayDateString();
    this.profile = null;
    this.allFoods = [...DEFAULT_FOODS];
    this.currentMeals = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: []
    };
    this.currentExercises = [];
    this.currentWater = { glasses: 0, ml: 0 };
    this.selectedFoodForModal = null;
    this.targetMealForModal = 'breakfast';
    this.deferredPrompt = null;
  }

  async init() {
    this.setupPWA();
    await this.loadProfile();
    await this.loadCustomFoods();
    this.bindEvents();
    await this.loadDateData(this.currentDate);
    await this.loadWeightHistory();
    await googleFit.init();
    await gemini.init();
    
    const storedGfitId = await googleFit.getStoredClientId();
    if (storedGfitId) {
      const gfitInput = document.getElementById('input-gfit-client-id');
      if (gfitInput) gfitInput.value = storedGfitId;
    }

    const storedGeminiKey = await gemini.getApiKey();
    if (storedGeminiKey) {
      const geminiInput = document.getElementById('input-gemini-api-key');
      if (geminiInput) geminiInput.value = storedGeminiKey;
    }
  }

  // --- Helper: Date Formatting ---
  getTodayDateString() {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }

  formatPersianDate(dateStr) {
    try {
      const parts = dateStr.split('-');
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const formatter = new Intl.DateTimeFormat('fa-IR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
      });
      return formatter.format(d);
    } catch {
      return dateStr;
    }
  }

  // --- PWA Service Worker & Install Prompt ---
  setupPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('[PWA] Service Worker registered:', reg.scope))
          .catch(err => console.warn('[PWA] Service Worker registration failed:', err));
      });
    }

    const btnInstall = document.getElementById('btn-install-pwa');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (btnInstall) {
        btnInstall.style.display = 'inline-flex';
      }
    });

    if (btnInstall) {
      btnInstall.addEventListener('click', async () => {
        if (this.deferredPrompt) {
          this.deferredPrompt.prompt();
          const { outcome } = await this.deferredPrompt.userChoice;
          console.log('[PWA] Install prompt outcome:', outcome);
          this.deferredPrompt = null;
          btnInstall.style.display = 'none';
        }
      });
    }
  }

  // --- Profile & BMR/TDEE Calculations ---
  async loadProfile() {
    this.profile = await db.getProfile();
    this.populateProfileForm();
    this.updateDashboardHeader();
  }

  populateProfileForm() {
    if (!this.profile) return;
    document.getElementById('prof-name').value = this.profile.name || '';
    document.getElementById('prof-gender').value = this.profile.gender || 'male';
    document.getElementById('prof-age').value = this.profile.age || 28;
    document.getElementById('prof-height').value = this.profile.height || 175;
    document.getElementById('prof-weight').value = this.profile.weight || 75;
    document.getElementById('prof-target-weight').value = this.profile.targetWeight || 70;
    document.getElementById('prof-activity').value = this.profile.activityLevel || 'moderate';
    document.getElementById('prof-goal').value = this.profile.goal || 'lose';
    document.getElementById('prof-calorie-target').value = this.profile.dailyCalorieTarget || 2000;
    document.getElementById('prof-water-target').value = this.profile.waterTargetMl || 2500;
    document.getElementById('prof-ratio-carbs').value = this.profile.carbsRatio || 50;
    document.getElementById('prof-ratio-protein').value = this.profile.proteinRatio || 25;
    document.getElementById('prof-ratio-fat').value = this.profile.fatRatio || 25;

    // Weight tab stats
    document.getElementById('stat-current-weight').textContent = this.profile.weight || '--';
    document.getElementById('stat-target-weight').textContent = this.profile.targetWeight || '--';
    
    // BMI
    if (this.profile.height && this.profile.weight) {
      const hM = this.profile.height / 100;
      const bmi = (this.profile.weight / (hM * hM)).toFixed(1);
      document.getElementById('stat-bmi-val').textContent = bmi;
    }
  }

  calculateTDEE() {
    const gender = document.getElementById('prof-gender').value;
    const age = Number(document.getElementById('prof-age').value);
    const height = Number(document.getElementById('prof-height').value);
    const weight = Number(document.getElementById('prof-weight').value);
    const activity = document.getElementById('prof-activity').value;
    const goal = document.getElementById('prof-goal').value;

    if (!age || !height || !weight) {
      this.showToast('لطفاً سن، قد و وزن را وارد کنید', 'error');
      return;
    }

    // فرمول Mifflin-St Jeor
    let bmr = (10 * weight) + (6.25 * height) - (5 * age);
    bmr += (gender === 'male' ? 5 : -161);

    const activityMultipliers = {
      sedentary: 1.2,
      light: 1.375,
      moderate: 1.55,
      active: 1.725,
      very_active: 1.9
    };

    const multiplier = activityMultipliers[activity] || 1.375;
    let tdee = Math.round(bmr * multiplier);

    if (goal === 'lose') {
      tdee -= 450; // کسر ۴۵۰ کالری برای کاهش وزن حدود نیم کیلو در هفته
      tdee = Math.max(gender === 'male' ? 1500 : 1200, tdee);
    } else if (goal === 'gain') {
      tdee += 400; // افزایش ۴۰۰ کالری برای عضله‌سازی
    }

    document.getElementById('prof-calorie-target').value = tdee;
    
    // پیشنهاد هدف آب بر اساس وزن (۳۵ میلی‌لیتر به ازای هر کیلوگرم)
    const suggestedWater = Math.round((weight * 35) / 100) * 100;
    document.getElementById('prof-water-target').value = Math.max(2000, suggestedWater);

    this.showToast(`کالری هدف هوشمند محاسبه شد: ${tdee} کیلوکالری`, 'success');
  }

  updateDashboardHeader() {
    if (!this.profile) return;
    const goalLabels = {
      lose: 'هدف: کاهش وزن',
      maintain: 'هدف: تثبیت وزن',
      gain: 'هدف: افزایش وزن'
    };
    document.getElementById('tdee-mode-label').textContent = goalLabels[this.profile.goal] || 'مدیریت وزن';
    document.getElementById('dash-cal-target').textContent = this.profile.dailyCalorieTarget || 2000;
  }

  // --- Foods Management ---
  async loadCustomFoods() {
    const custom = await db.getAllCustomFoods();
    this.allFoods = [...DEFAULT_FOODS, ...custom];
    this.renderFoodDiaryList(this.allFoods);
  }

  renderFoodDiaryList(foods) {
    const container = document.getElementById('diary-foods-list');
    if (!container) return;

    if (foods.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 20px;">غذایی یافت نشد.</div>';
      return;
    }

    container.innerHTML = foods.map(food => `
      <div class="food-result-card" data-id="${food.id}">
        <div>
          <div style="font-weight: 700; color: var(--text-primary);">${food.name} ${food.isCustom ? '<span style="font-size:0.7rem; color:var(--accent-primary); border:1px solid var(--accent-primary); padding:1px 4px; border-radius:4px;">سفارشی</span>' : ''}</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary);">
            ${food.unit} • کربوهیدرات: ${food.carbs}g • پروتئین: ${food.protein}g • چربی: ${food.fat}g
          </div>
        </div>
        <div style="text-align: left;">
          <div style="font-weight: 800; color: var(--accent-primary); font-size: 0.95rem;">${food.calories} kcal</div>
          <button class="btn btn-secondary btn-diary-add-to-meal" data-id="${food.id}" style="padding: 4px 8px; font-size: 0.72rem; margin-top: 4px;">
            + ثبت وعده
          </button>
        </div>
      </div>
    `).join('');

    // اتصال دکمه‌های ثبت سریع
    container.querySelectorAll('.btn-diary-add-to-meal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.getAttribute('data-id');
        const food = this.allFoods.find(f => f.id == id);
        if (food) {
          this.openAddFoodModal('lunch', food);
        }
      });
    });
  }

  // --- Loading Daily Data ---
  async loadDateData(dateStr) {
    this.currentDate = dateStr;
    
    // آپدیت لیبل تاریخ
    const isToday = dateStr === this.getTodayDateString();
    document.getElementById('label-current-date').textContent = this.formatPersianDate(dateStr);
    document.getElementById('badge-is-today').style.display = isToday ? 'inline-block' : 'none';

    // ۱. دریافت لاگ غذاها
    const foodLogs = await db.getFoodLogsByDate(dateStr);
    this.currentMeals = {
      breakfast: foodLogs.filter(f => f.mealType === 'breakfast'),
      lunch: foodLogs.filter(f => f.mealType === 'lunch'),
      dinner: foodLogs.filter(f => f.mealType === 'dinner'),
      snack: foodLogs.filter(f => f.mealType === 'snack')
    };
    this.renderMealSections();

    // ۲. دریافت لاگ ورزش‌ها
    this.currentExercises = await db.getExerciseLogsByDate(dateStr);
    this.renderExerciseSection();

    // ۳. دریافت لاگ آب
    this.currentWater = await db.getWaterLog(dateStr);
    this.renderWaterSection();

    // ۴. محاسبه و نمایش کارت بالانس کالری و ماکروها
    this.updateDailyCalculations();
  }

  renderMealSections() {
    const mealTypes = ['breakfast', 'lunch', 'dinner', 'snack'];
    
    mealTypes.forEach(meal => {
      const items = this.currentMeals[meal] || [];
      const listContainer = document.getElementById(`meal-items-${meal}`);
      const calBadge = document.getElementById(`meal-cal-${meal}`);

      const totalMealCals = items.reduce((sum, item) => sum + item.calories, 0);
      calBadge.textContent = `${totalMealCals} کالری`;

      if (items.length === 0) {
        listContainer.innerHTML = `
          <div style="padding: 10px 0; font-size: 0.8rem; color: var(--text-muted); text-align: center;">
            هنوز غذایی در این وعده ثبت نشده است.
          </div>
        `;
      } else {
        listContainer.innerHTML = items.map(item => `
          <div class="food-log-item">
            <div class="food-item-meta">
              <span class="food-item-name">${item.name}</span>
              <span class="food-item-detail">${item.amount} ${item.unit} • (C:${item.carbs}g P:${item.protein}g F:${item.fat}g)</span>
            </div>
            <div class="food-item-right">
              <span class="food-item-cal">${item.calories} kcal</span>
              <button class="btn-delete-item btn-delete-food" data-id="${item.id}" title="حذف">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
        `).join('');

        listContainer.querySelectorAll('.btn-delete-food').forEach(btn => {
          btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            await db.deleteFoodLog(id);
            this.showToast('آیتم غذایی حذف شد');
            await this.loadDateData(this.currentDate);
          });
        });
      }
    });
  }

  renderExerciseSection() {
    const container = document.getElementById('exercises-list-today');
    const totalBurned = this.currentExercises.reduce((sum, ex) => sum + ex.caloriesBurned, 0);
    const totalSteps = this.currentExercises.reduce((sum, ex) => sum + (ex.steps || 0), 0);

    // به‌روزرسانی کارت داشبورد
    document.getElementById('dash-steps-count').textContent = totalSteps.toLocaleString('fa-IR');
    document.getElementById('dash-steps-cals').textContent = totalBurned;

    if (!container) return;

    if (this.currentExercises.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.85rem;">
          امروز ورزشی ثبت نشده است. برای ثبت گام‌ها یا تمرین دکمه زیر را لمس کنید.
        </div>
      `;
      return;
    }

    container.innerHTML = this.currentExercises.map(ex => `
      <div class="food-log-item">
        <div class="food-item-meta">
          <span class="food-item-name">${ex.name}</span>
          <span class="food-item-detail">${ex.durationMin} دقیقه ${ex.steps ? `• ${ex.steps.toLocaleString('fa-IR')} گام` : ''}</span>
        </div>
        <div class="food-item-right">
          <span class="food-item-cal" style="color: var(--accent-exercise);">${ex.caloriesBurned} kcal</span>
          <button class="btn-delete-item btn-delete-exercise" data-id="${ex.id}" title="حذف">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.btn-delete-exercise').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        await db.deleteExerciseLog(id);
        this.showToast('ورزش حذف شد');
        await this.loadDateData(this.currentDate);
      });
    });
  }

  renderWaterSection() {
    const container = document.getElementById('water-cups-container');
    const label = document.getElementById('water-stat-label');
    const targetMl = this.profile?.waterTargetMl || 2500;
    const totalGlasses = Math.max(8, Math.ceil(targetMl / 250));
    const currentGlasses = this.currentWater.glasses || 0;
    const currentMl = currentGlasses * 250;

    label.textContent = `${currentMl} / ${targetMl} میلی‌لیتر (${currentGlasses} لیوان)`;

    let cupsHtml = '';
    for (let i = 1; i <= totalGlasses; i++) {
      const isFilled = i <= currentGlasses;
      cupsHtml += `<div class="water-cup ${isFilled ? 'filled' : ''}" data-index="${i}" title="${i * 250} میلی‌لیتر"></div>`;
    }
    container.innerHTML = cupsHtml;

    container.querySelectorAll('.water-cup').forEach(cup => {
      cup.addEventListener('click', async () => {
        const idx = Number(cup.getAttribute('data-index'));
        // اگر روی آخرین لیوان پر کلیک کند، یکی کم می‌شود؛ در غیر اینصورت تا آن لیوان پر می‌شود
        let newGlasses = idx;
        if (idx === currentGlasses) {
          newGlasses = idx - 1;
        }
        await this.updateWaterIntake(newGlasses);
      });
    });
  }

  async updateWaterIntake(glasses) {
    glasses = Math.max(0, glasses);
    this.currentWater = {
      date: this.currentDate,
      glasses,
      ml: glasses * 250,
      targetMl: this.profile?.waterTargetMl || 2500
    };
    await db.saveWaterLog(this.currentWater);
    this.renderWaterSection();
  }

  // --- Daily Calorie Equation & Macros ---
  updateDailyCalculations() {
    const targetCal = this.profile?.dailyCalorieTarget || 2000;
    
    // محاسبه مجموع کالری خورده شده
    let totalFoodCal = 0;
    let totalCarbs = 0;
    let totalProtein = 0;
    let totalFat = 0;

    Object.values(this.currentMeals).forEach(mealList => {
      mealList.forEach(item => {
        totalFoodCal += item.calories || 0;
        totalCarbs += item.carbs || 0;
        totalProtein += item.protein || 0;
        totalFat += item.fat || 0;
      });
    });

    // کالری سوزانده شده در ورزش
    const totalExerciseCal = this.currentExercises.reduce((sum, ex) => sum + (ex.caloriesBurned || 0), 0);
    
    // کالری باقی‌مانده (معادله MyFitnessPal)
    const remainingCal = targetCal - totalFoodCal + totalExerciseCal;

    // آپدیت مقادیر در رابط کاربری
    document.getElementById('dash-cal-target').textContent = targetCal;
    document.getElementById('dash-cal-food').textContent = totalFoodCal;
    document.getElementById('dash-cal-exercise').textContent = totalExerciseCal;
    
    const remEl = document.getElementById('dash-cal-remaining');
    remEl.textContent = remainingCal;
    remEl.style.color = remainingCal >= 0 ? 'var(--accent-primary)' : 'var(--accent-protein)';

    // اهداف ماکروها بر اساس درصد تنظیم شده در پروفایل
    const carbsTargetGrams = Math.round((targetCal * ((this.profile?.carbsRatio || 50) / 100)) / 4);
    const proteinTargetGrams = Math.round((targetCal * ((this.profile?.proteinRatio || 25) / 100)) / 4);
    const fatTargetGrams = Math.round((targetCal * ((this.profile?.fatRatio || 25) / 100)) / 9);

    document.getElementById('dash-cur-carbs').textContent = Math.round(totalCarbs);
    document.getElementById('dash-target-carbs').textContent = carbsTargetGrams;
    document.getElementById('dash-fill-carbs').style.width = `${Math.min(100, (totalCarbs / carbsTargetGrams) * 100)}%`;

    document.getElementById('dash-cur-protein').textContent = Math.round(totalProtein);
    document.getElementById('dash-target-protein').textContent = proteinTargetGrams;
    document.getElementById('dash-fill-protein').style.width = `${Math.min(100, (totalProtein / proteinTargetGrams) * 100)}%`;

    document.getElementById('dash-cur-fat').textContent = Math.round(totalFat);
    document.getElementById('dash-target-fat').textContent = fatTargetGrams;
    document.getElementById('dash-fill-fat').style.width = `${Math.min(100, (totalFat / fatTargetGrams) * 100)}%`;
  }

  // --- Weight History & Chart Rendering ---
  async loadWeightHistory() {
    const logs = await db.getAllWeightLogs();
    const listContainer = document.getElementById('weight-history-list');
    
    if (logs.length === 0) {
      listContainer.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 10px;">هنوز وزنی ثبت نشده است.</div>';
    } else {
      listContainer.innerHTML = logs.slice().reverse().map(item => `
        <div class="food-log-item">
          <div>
            <span style="font-weight: 700; color: var(--text-primary);">${item.weight} کیلوگرم</span>
            <div style="font-size: 0.75rem; color: var(--text-secondary);">${this.formatPersianDate(item.date)} ${item.notes ? `• ${item.notes}` : ''}</div>
          </div>
          <button class="btn-delete-item btn-delete-weight" data-id="${item.id}" title="حذف">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `).join('');

      listContainer.querySelectorAll('.btn-delete-weight').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-id');
          await db.deleteWeightLog(id);
          this.showToast('رکورد وزن حذف شد');
          await this.loadWeightHistory();
        });
      });
    }

    this.renderWeightChart(logs);
  }

  renderWeightChart(logs) {
    const svg = document.getElementById('weight-chart-svg');
    if (!svg) return;

    if (logs.length < 2) {
      svg.innerHTML = `
        <text x="250" y="90" text-anchor="middle" fill="#64748b" font-size="14">
          برای نمایش نمودار حداقل دو رکورد وزن ثبت کنید
        </text>
      `;
      return;
    }

    const width = 500;
    const height = 180;
    const padding = 35;

    const weights = logs.map(l => l.weight);
    const minW = Math.floor(Math.min(...weights) - 1);
    const maxW = Math.ceil(Math.max(...weights) + 1);

    const getX = (index) => padding + (index / (logs.length - 1)) * (width - 2 * padding);
    const getY = (val) => height - padding - ((val - minW) / (maxW - minW)) * (height - 2 * padding);

    // ساخت مسیر خط
    const points = logs.map((l, i) => `${getX(i)},${getY(l.weight)}`).join(' ');

    let svgContent = `
      <defs>
        <linearGradient id="chartGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.3"/>
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      
      <!-- Grid lines -->
      <line x1="${padding}" y1="${getY(minW)}" x2="${width - padding}" y2="${getY(minW)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${getY((minW + maxW)/2)}" x2="${width - padding}" y2="${getY((minW + maxW)/2)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4"/>
      <line x1="${padding}" y1="${getY(maxW)}" x2="${width - padding}" y2="${getY(maxW)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4"/>
      
      <!-- Area under line -->
      <polygon points="${getX(0)},${height - padding} ${points} ${getX(logs.length - 1)},${height - padding}" fill="url(#chartGrad)" />

      <!-- Main Line -->
      <polyline fill="none" stroke="#10b981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${points}"/>
    `;

    // اضافه کردن نقاط و برچسب‌ها
    logs.forEach((l, i) => {
      const x = getX(i);
      const y = getY(l.weight);
      svgContent += `
        <circle cx="${x}" cy="${y}" r="4" fill="#10b981" stroke="#0f172a" stroke-width="2"/>
        <text x="${x}" y="${y - 8}" text-anchor="middle" fill="#f8fafc" font-size="11" font-weight="bold">${l.weight}</text>
      `;
    });

    svg.innerHTML = svgContent;
  }

  // --- Modals Management ---
  openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('open');
  }

  closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('open');
  }

  openAddFoodModal(mealType = 'breakfast', preselectedFood = null) {
    this.targetMealForModal = mealType;
    const mealNamesFa = {
      breakfast: 'صبحانه',
      lunch: 'ناهار',
      dinner: 'شام',
      snack: 'میان‌وعده'
    };
    document.getElementById('modal-meal-name-label').textContent = mealNamesFa[mealType] || 'وعده';
    
    // رندر کتگوری‌های فیلتر در مدال
    this.renderModalCategories();
    this.renderModalFoodResults(this.allFoods);

    if (preselectedFood) {
      this.selectFoodForPortion(preselectedFood);
    } else {
      document.getElementById('modal-portion-box').style.display = 'none';
      this.selectedFoodForModal = null;
    }

    this.openModal('modal-add-food');
  }

  renderModalCategories() {
    const container = document.getElementById('modal-food-categories');
    if (!container) return;

    container.innerHTML = FOOD_CATEGORIES.map((cat, i) => `
      <button class="cat-pill ${i === 0 ? 'active' : ''}" data-cat="${cat}">${cat}</button>
    `).join('');

    container.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const cat = btn.getAttribute('data-cat');
        const filtered = cat === 'همه' 
          ? this.allFoods 
          : this.allFoods.filter(f => f.category === cat);
        this.renderModalFoodResults(filtered);
      });
    });
  }

  renderModalFoodResults(foods) {
    const container = document.getElementById('modal-food-results');
    if (!container) return;

    if (foods.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 16px;">غذایی یافت نشد.</div>';
      return;
    }

    container.innerHTML = foods.slice(0, 30).map(f => `
      <div class="food-result-card modal-food-item" data-id="${f.id}">
        <div>
          <div style="font-weight: 700;">${f.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-secondary);">${f.unit} • ${f.calories} kcal</div>
        </div>
        <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 0.75rem;">انتخاب</button>
      </div>
    `).join('');

    container.querySelectorAll('.modal-food-item').forEach(card => {
      card.addEventListener('click', () => {
        container.querySelectorAll('.modal-food-item').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const id = card.getAttribute('data-id');
        const food = this.allFoods.find(f => f.id == id);
        if (food) this.selectFoodForPortion(food);
      });
    });
  }

  selectFoodForPortion(food) {
    this.selectedFoodForModal = food;
    const box = document.getElementById('modal-portion-box');
    box.style.display = 'block';

    document.getElementById('selected-food-title').textContent = food.name;
    document.getElementById('selected-food-unit').value = food.unit;
    document.getElementById('selected-food-amount').value = 1;

    this.recalcModalPortion();
    box.scrollIntoView({ behavior: 'smooth' });
  }

  recalcModalPortion() {
    if (!this.selectedFoodForModal) return;
    const amount = parseFloat(document.getElementById('selected-food-amount').value) || 1;
    const f = this.selectedFoodForModal;

    const totalCals = Math.round(f.calories * amount);
    const totalCarbs = (f.carbs * amount).toFixed(1);
    const totalProtein = (f.protein * amount).toFixed(1);
    const totalFat = (f.fat * amount).toFixed(1);

    document.getElementById('selected-food-cal-badge').textContent = `${totalCals} کالری`;
    document.getElementById('portion-carbs').textContent = totalCarbs;
    document.getElementById('portion-protein').textContent = totalProtein;
    document.getElementById('portion-fat').textContent = totalFat;
  }

  // --- Toast Notifications ---
  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- Event Bindings ---
  bindEvents() {
    // Navigation Tabs
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.main-view').forEach(v => v.classList.remove('active'));

        btn.classList.add('active');
        const viewId = btn.getAttribute('data-view');
        const viewEl = document.getElementById(viewId);
        if (viewEl) viewEl.classList.add('active');
      });
    });

    // Date Navigation
    document.getElementById('btn-prev-day').addEventListener('click', () => {
      const d = new Date(this.currentDate);
      d.setDate(d.getDate() - 1);
      this.loadDateData(d.toISOString().split('T')[0]);
    });

    document.getElementById('btn-next-day').addEventListener('click', () => {
      const d = new Date(this.currentDate);
      d.setDate(d.getDate() + 1);
      this.loadDateData(d.toISOString().split('T')[0]);
    });

    // Quick Action Buttons
    document.getElementById('quick-action-food').addEventListener('click', () => {
      this.openAddFoodModal('lunch');
    });

    document.getElementById('quick-action-exercise').addEventListener('click', () => {
      this.openModal('modal-add-exercise');
    });

    document.getElementById('quick-action-water').addEventListener('click', async () => {
      await this.updateWaterIntake((this.currentWater.glasses || 0) + 1);
      this.showToast('+۱ لیوان آب ثبت شد (۲۵۰ میلی‌لیتر)');
    });

    document.getElementById('quick-action-weight').addEventListener('click', () => {
      document.getElementById('input-weight-date').value = this.currentDate;
      this.openModal('modal-add-weight');
    });

    // Meal header '+' buttons
    document.querySelectorAll('.btn-add-food-mini').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const meal = btn.getAttribute('data-meal');
        this.openAddFoodModal(meal);
      });
    });

    // Modal Close buttons
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-close');
        this.closeModal(modalId);
      });
    });

    // Close on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
      });
    });

    // Modal portion amount change
    document.getElementById('selected-food-amount').addEventListener('input', () => {
      this.recalcModalPortion();
    });

    // Confirm add food to meal
    document.getElementById('btn-confirm-add-food').addEventListener('click', async () => {
      if (!this.selectedFoodForModal) return;
      const amount = parseFloat(document.getElementById('selected-food-amount').value) || 1;
      const f = this.selectedFoodForModal;

      const logItem = {
        date: this.currentDate,
        mealType: this.targetMealForModal,
        foodId: f.id,
        name: f.name,
        amount,
        unit: f.unit,
        calories: Math.round(f.calories * amount),
        carbs: Math.round(f.carbs * amount * 10) / 10,
        protein: Math.round(f.protein * amount * 10) / 10,
        fat: Math.round(f.fat * amount * 10) / 10
      };

      await db.addFoodLog(logItem);
      this.closeModal('modal-add-food');
      this.showToast(`${f.name} به وعده اضافه شد`);
      await this.loadDateData(this.currentDate);
    });

    // Modal food search live
    document.getElementById('food-modal-search').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = this.allFoods.filter(f => 
        f.name.toLowerCase().includes(q) || (f.nameEn && f.nameEn.toLowerCase().includes(q))
      );
      this.renderModalFoodResults(filtered);
    });

    // Diary search live
    document.getElementById('diary-search-input').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = this.allFoods.filter(f => 
        f.name.toLowerCase().includes(q) || (f.nameEn && f.nameEn.toLowerCase().includes(q))
      );
      this.renderFoodDiaryList(filtered);
    });

    // Create Custom Food Modal
    document.getElementById('btn-open-create-food').addEventListener('click', () => {
      this.openModal('modal-create-food');
    });

    document.getElementById('form-create-food').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newFood = {
        name: document.getElementById('new-food-name').value.trim(),
        category: document.getElementById('new-food-cat').value,
        unit: document.getElementById('new-food-unit').value.trim(),
        calories: Number(document.getElementById('new-food-calories').value),
        protein: Number(document.getElementById('new-food-protein').value),
        carbs: Number(document.getElementById('new-food-carbs').value),
        fat: Number(document.getElementById('new-food-fat').value)
      };

      await db.addCustomFood(newFood);
      this.closeModal('modal-create-food');
      document.getElementById('form-create-food').reset();
      this.showToast('غذای سفارشی با موفقیت به بانک اطلاعاتی اضافه شد');
      await this.loadCustomFoods();
    });

    // Add Exercise
    document.getElementById('btn-open-add-exercise').addEventListener('click', () => {
      this.openModal('modal-add-exercise');
    });

    document.getElementById('form-add-exercise').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ex = {
        date: this.currentDate,
        type: document.getElementById('ex-type').value,
        name: document.getElementById('ex-name').value.trim(),
        durationMin: Number(document.getElementById('ex-duration').value),
        caloriesBurned: Number(document.getElementById('ex-calories').value),
        steps: Number(document.getElementById('ex-steps').value) || 0
      };

      await db.addExerciseLog(ex);
      this.closeModal('modal-add-exercise');
      document.getElementById('form-add-exercise').reset();
      this.showToast('ورزش با موفقیت ثبت شد');
      await this.loadDateData(this.currentDate);
    });

    // Add Weight
    document.getElementById('btn-open-add-weight').addEventListener('click', () => {
      document.getElementById('input-weight-date').value = this.currentDate;
      this.openModal('modal-add-weight');
    });

    document.getElementById('form-add-weight').addEventListener('submit', async (e) => {
      e.preventDefault();
      const weightVal = Number(document.getElementById('input-weight-val').value);
      const dateVal = document.getElementById('input-weight-date').value;
      const notes = document.getElementById('input-weight-notes').value.trim();

      await db.addWeightLog({
        date: dateVal,
        weight: weightVal,
        notes
      });

      // به‌روزرسانی وزن جاری در پروفایل
      if (this.profile) {
        this.profile.weight = weightVal;
        await db.saveProfile(this.profile);
        this.populateProfileForm();
      }

      this.closeModal('modal-add-weight');
      document.getElementById('form-add-weight').reset();
      this.showToast('رکورد وزن با موفقیت ثبت شد');
      await this.loadWeightHistory();
    });

    // Profile Calculation & Submission
    document.getElementById('btn-calc-tdee').addEventListener('click', () => {
      this.calculateTDEE();
    });

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const updatedProfile = {
        name: document.getElementById('prof-name').value.trim(),
        gender: document.getElementById('prof-gender').value,
        age: Number(document.getElementById('prof-age').value),
        height: Number(document.getElementById('prof-height').value),
        weight: Number(document.getElementById('prof-weight').value),
        targetWeight: Number(document.getElementById('prof-target-weight').value),
        activityLevel: document.getElementById('prof-activity').value,
        goal: document.getElementById('prof-goal').value,
        dailyCalorieTarget: Number(document.getElementById('prof-calorie-target').value),
        waterTargetMl: Number(document.getElementById('prof-water-target').value),
        carbsRatio: Number(document.getElementById('prof-ratio-carbs').value),
        proteinRatio: Number(document.getElementById('prof-ratio-protein').value),
        fatRatio: Number(document.getElementById('prof-ratio-fat').value)
      };

      await db.saveProfile(updatedProfile);
      this.profile = updatedProfile;
      this.updateDashboardHeader();
      this.updateDailyCalculations();
      this.renderWaterSection();
      this.showToast('اطلاعات پروفایل با موفقیت ذخیره شد');
    });

    // Google Fit Integration Events
    document.getElementById('btn-gfit-guide').addEventListener('click', () => {
      this.openModal('modal-gfit-guide');
    });

    document.getElementById('btn-save-gfit-client-id').addEventListener('click', async () => {
      const clientId = document.getElementById('input-gfit-client-id').value.trim();
      if (!clientId) {
        this.showToast('لطفاً Client ID را وارد کنید', 'error');
        return;
      }
      await googleFit.setClientId(clientId);
      this.showToast('Client ID با موفقیت ذخیره شد');
    });

    const syncFitHandler = async () => {
      try {
        const badge = document.getElementById('gfit-sync-badge');
        badge.className = 'status-pill syncing';
        badge.textContent = 'در حال ارتباط...';

        const fitData = await googleFit.fetchDailyActivity(this.currentDate);
        
        // ثبت در لاگ فعالیت روزانه
        if (fitData.steps > 0 || fitData.calories > 0) {
          await db.addExerciseLog({
            date: this.currentDate,
            type: 'steps',
            name: 'همگام‌سازی خودکار Google Fit',
            durationMin: fitData.activeMinutes || 30,
            caloriesBurned: fitData.calories || Math.round(fitData.steps * 0.04),
            steps: fitData.steps
          });

          await this.loadDateData(this.currentDate);
          this.showToast(`اطلاعات با موفقیت دریافت شد: ${fitData.steps} گام`);
        } else {
          this.showToast('اطلاعات جدیدی در حساب گوگل یافت نشد');
        }

        badge.className = 'status-pill success';
        badge.textContent = 'همگام‌سازی شد';
      } catch (err) {
        console.error('Fit sync error:', err);
        this.showToast(err.message || 'خطا در ارتباط با گوگل', 'error');
        const badge = document.getElementById('gfit-sync-badge');
        badge.className = 'status-pill error';
        badge.textContent = 'خطای اتصال';
      }
    };

    document.getElementById('btn-auth-gfit').addEventListener('click', syncFitHandler);
    document.getElementById('btn-manual-sync-gfit').addEventListener('click', syncFitHandler);
    document.getElementById('btn-sync-gfit-dash').addEventListener('click', syncFitHandler);

    // Backup & Restore Events
    document.getElementById('btn-export-backup').addEventListener('click', async () => {
      const data = await db.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `healthpal-backup-${this.getTodayDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('فایل پشتیبان با موفقیت دانلود شد');
    });

    document.getElementById('btn-trigger-import').addEventListener('click', () => {
      document.getElementById('input-import-file').click();
    });

    document.getElementById('input-import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target.result);
          await db.importAllData(json);
          this.showToast('داده‌ها با موفقیت بازیابی شدند');
          await this.loadProfile();
          await this.loadCustomFoods();
          await this.loadDateData(this.currentDate);
          await this.loadWeightHistory();
        } catch (err) {
          console.error('Import error:', err);
          this.showToast('خطا در خواندن فایل پشتیبان', 'error');
        }
      };
      reader.readAsText(file);
    });

    // --- Gemini AI Assistant Events ---
    document.getElementById('btn-save-gemini-api-key').addEventListener('click', async () => {
      const key = document.getElementById('input-gemini-api-key').value.trim();
      if (!key) {
        this.showToast('لطفاً کلید API را وارد کنید', 'error');
        return;
      }
      await gemini.saveApiKey(key);
      this.showToast('✨ کلید هوش مصنوعی Gemini با موفقیت ذخیره شد');
    });

    document.getElementById('btn-diary-ask-gemini').addEventListener('click', () => {
      this.handleGeminiFoodSearch('diary');
    });

    document.getElementById('btn-modal-ask-gemini').addEventListener('click', () => {
      this.handleGeminiFoodSearch('modal');
    });

    // Enter key triggers AI search in search inputs
    document.getElementById('diary-search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleGeminiFoodSearch('diary');
      }
    });

    document.getElementById('food-modal-search').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleGeminiFoodSearch('modal');
      }
    });
  }

  // --- Gemini AI Search Execution Method ---
  async handleGeminiFoodSearch(context = 'diary') {
    const isModal = context === 'modal';
    const inputEl = document.getElementById(isModal ? 'food-modal-search' : 'diary-search-input');
    const btnEl = document.getElementById(isModal ? 'btn-modal-ask-gemini' : 'btn-diary-ask-gemini');
    const resultBox = document.getElementById(isModal ? 'modal-ai-result' : 'diary-ai-result');

    const query = inputEl.value.trim();
    if (!query) {
      this.showToast('لطفاً نام یا توصیف غذا را در کادر جستجو بنویسید', 'error');
      inputEl.focus();
      return;
    }

    const originalBtnText = btnEl.innerHTML;
    btnEl.innerHTML = '<span class="ai-spinner"></span> در حال استعلام...';
    btnEl.disabled = true;

    try {
      const food = await gemini.analyzeFood(query);
      
      let badgeHtml = '<div class="ai-badge">✨ برآورد هوشمند Gemini</div>';
      if (food.source === 'openfoodfacts') {
        badgeHtml = '<div class="ai-badge" style="background: linear-gradient(135deg, #0284c7, #06b6d4);">🌍 دیتابیس جهانی OpenFoodFacts (رایگان)</div>';
      } else if (food.source === 'smart_local') {
        badgeHtml = '<div class="ai-badge" style="background: linear-gradient(135deg, #10b981, #059669);">⚡ موتور هوشمند تغذیه (بدون نیاز به API)</div>';
      }

      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div class="ai-result-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <div>
              ${badgeHtml}
              <h3 style="font-size: 1.05rem; font-weight: 800; color: #fff; margin-bottom: 2px;">${food.name}</h3>
              <span style="font-size: 0.78rem; color: var(--text-secondary);">${food.unit} • دسته‌بندی: ${food.category}</span>
            </div>
            <div style="text-align: left;">
              <span style="font-size: 1.35rem; font-weight: 800; color: #c084fc;">${food.calories}</span>
              <span style="font-size: 0.72rem; color: var(--text-secondary); display: block;">کیلوکالری</span>
            </div>
          </div>

          ${food.description ? `<p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 10px; line-height: 1.5; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 6px;">💡 ${food.description}</p>` : ''}

          <div style="display: flex; justify-content: space-around; background: rgba(0,0,0,0.25); padding: 8px; border-radius: var(--radius-md); margin-bottom: 12px;">
            <div style="text-align: center;"><span style="font-size: 0.72rem; color: var(--accent-carbs);">کربوهیدرات</span><div style="font-weight: 700; font-size: 0.9rem;">${food.carbs}g</div></div>
            <div style="text-align: center;"><span style="font-size: 0.72rem; color: var(--accent-protein);">پروتئین</span><div style="font-weight: 700; font-size: 0.9rem;">${food.protein}g</div></div>
            <div style="text-align: center;"><span style="font-size: 0.72rem; color: var(--accent-fat);">چربی</span><div style="font-weight: 700; font-size: 0.9rem;">${food.fat}g</div></div>
          </div>

          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-save-ai-food" style="flex: 2; font-size: 0.8rem; padding: 8px;">
              💾 ذخیره در دیتابیس لوکال ${isModal ? 'و ثبت در وعده' : ''}
            </button>
            <button class="btn btn-secondary btn-close-ai-result" style="flex: 1; font-size: 0.8rem; padding: 8px;">
              بستن
            </button>
          </div>
        </div>
      `;

      resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

      // ذخیره غذای هوش مصنوعی
      resultBox.querySelector('.btn-save-ai-food').addEventListener('click', async () => {
        const customItem = {
          name: food.name,
          category: food.category,
          unit: food.unit,
          unitWeight: food.unitWeight,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          description: food.description,
          isAiGenerated: true
        };

        const addedId = await db.addCustomFood(customItem);
        customItem.id = addedId;
        await this.loadCustomFoods();

        if (isModal) {
          // افزودن مستقیم به وعده جاری
          await db.addFoodLog({
            date: this.currentDate,
            mealType: this.targetMealForModal,
            foodId: addedId,
            name: food.name,
            amount: 1,
            unit: food.unit,
            calories: food.calories,
            carbs: food.carbs,
            protein: food.protein,
            fat: food.fat
          });
          this.closeModal('modal-add-food');
          await this.loadDateData(this.currentDate);
          this.showToast(`✨ ${food.name} به وعده اضافه و در دیتابیس ذخیره شد`);
        } else {
          this.showToast(`✨ ${food.name} در دیتابیس لوکال ذخیره شد و همیشه در دسترس است`);
        }

        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
      });

      // دکمه بستن
      resultBox.querySelector('.btn-close-ai-result').addEventListener('click', () => {
        resultBox.style.display = 'none';
        resultBox.innerHTML = '';
      });

    } catch (err) {
      console.error('Gemini error:', err);
      this.showToast(err.message || 'خطا در ارتباط با جمینای', 'error');
    } finally {
      btnEl.innerHTML = originalBtnText;
      btnEl.disabled = false;
    }
  }
}

// راه‌اندازی برنامه پس از لود صفحه
window.addEventListener('DOMContentLoaded', () => {
  const app = new HealthApp();
  app.init();
});
